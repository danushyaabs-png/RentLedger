// Uploads property photos and listing details to IPFS through Pinata.
// The Pinata key (PINATA_JWT) stays on the server; only signed-in users can upload.

import { PublicError } from "./verifyCore.js";
import { firebaseConfig } from "../shared/firebaseConfig.js";

const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
const MAX_JSON_BYTES = 20 * 1024;
const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export async function pinataPin({ jwt, bytes, mime, filename }) {
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: mime }), filename);
  form.append("network", "public");
  form.append("name", filename);
  const res = await fetch("https://uploads.pinata.cloud/v3/files", {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}` },
    body: form,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body?.data?.cid) {
    console.error("Pinata upload failed:", res.status, JSON.stringify(body).slice(0, 300));
    throw new PublicError(
      res.status === 401 || res.status === 403
        ? "Photo storage rejected the upload. Check the PINATA_JWT key."
        : "Photo upload failed. Please try again."
    );
  }
  return body.data.cid;
}

export function createUploadHandler({ verifyIdToken, getEnv, pin = pinataPin }) {
  return async function handler(req, res) {
    const send = (status, body) => {
      res.statusCode = status;
      res.setHeader("Content-Type", "application/json");
      res.setHeader("Cache-Control", "no-store");
      res.end(JSON.stringify(body));
    };
    if (req.method !== "POST") return send(405, { error: "Use POST." });
    try {
      const env = getEnv();
      const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
      if (!body.idToken) throw new PublicError("Sign in with Google first.");
      await verifyIdToken(body.idToken, env.VITE_FIREBASE_PROJECT_ID || firebaseConfig.projectId);
      if (!env.PINATA_JWT) throw new PublicError("Photo uploads aren't set up yet. Add PINATA_JWT to .env.");

      let bytes, mime, filename;
      if (body.kind === "json") {
        bytes = Buffer.from(JSON.stringify(body.json ?? {}));
        if (bytes.length > MAX_JSON_BYTES) throw new PublicError("Listing details are too large.");
        mime = "application/json";
        filename = "rentledger-listing.json";
      } else {
        const match = /^data:(image\/[a-z]+);base64,(.+)$/.exec(String(body.data || ""));
        if (!match || !IMAGE_TYPES.has(match[1])) throw new PublicError("Only JPEG, PNG or WebP photos can be uploaded.");
        mime = match[1];
        bytes = Buffer.from(match[2], "base64");
        if (bytes.length > MAX_IMAGE_BYTES) throw new PublicError("That photo is too large (max 3 MB).");
        filename = `rentledger-photo.${mime.split("/")[1]}`;
      }
      const cid = await pin({ jwt: env.PINATA_JWT, bytes, mime, filename });
      return send(200, { cid, uri: `ipfs://${cid}` });
    } catch (e) {
      if (!(e instanceof PublicError)) console.error("upload failed:", e);
      return send(e instanceof PublicError ? 400 : 401, {
        error: e instanceof PublicError ? e.message : "Your Google sign-in couldn't be checked. Sign in again.",
      });
    }
  };
}
