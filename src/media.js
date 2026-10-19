// Property photos, map pins and listing details.
//
// A listing's metadataURI on the contract points to a small JSON file on IPFS:
//   { "version": 1, "images": ["ipfs://…", …], "mapLink": "https://maps.app.goo.gl/…" }
// Older listings may hold a plain image URL instead; both are supported.

import { useEffect, useState } from "react";
import { IPFS_GATEWAYS } from "../shared/storageConfig.js";
import { getIdToken } from "./firebase";

const GATEWAYS = import.meta.env.VITE_IPFS_GATEWAY ? [import.meta.env.VITE_IPFS_GATEWAY] : IPFS_GATEWAYS;
const EMPTY = { images: [], lat: null, lng: null, mapLink: "" };

/** Accepts Google Maps links: google.com/maps/…, maps.google.com/…, maps.app.goo.gl/…, goo.gl/maps/… */
export function isMapsLink(url) {
  try {
    const u = new URL(String(url).trim());
    if (u.protocol !== "https:") return false;
    const host = u.hostname.replace(/^www\./, "");
    return (
      host === "maps.app.goo.gl" ||
      host === "maps.google.com" ||
      (host === "goo.gl" && u.pathname.startsWith("/maps")) ||
      (/^google\.[a-z.]+$/.test(host) && u.pathname.startsWith("/maps"))
    );
  } catch {
    return false;
  }
}

/** All URLs a file can be loaded from (one per gateway for ipfs:// links). */
export function candidateUrls(uri) {
  if (!uri) return [];
  return uri.startsWith("ipfs://") ? GATEWAYS.map((g) => g + uri.slice(7)) : [uri];
}

export function resolveUri(uri, attempt = 0) {
  const urls = candidateUrls(uri);
  return urls[Math.min(attempt, urls.length - 1)] || "";
}

async function fetchJsonFromGateways(uri) {
  let lastError;
  for (const url of candidateUrls(uri)) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      if (res.ok) return await res.json();
      lastError = new Error(`HTTP ${res.status}`);
    } catch (e) {
      lastError = e;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError || new Error("not found");
}

function normalize(j) {
  const num = (v) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
  return {
    images: Array.isArray(j?.images) ? j.images.filter((x) => typeof x === "string").slice(0, 10) : [],
    lat: num(j?.lat),
    lng: num(j?.lng),
    mapLink: isMapsLink(j?.mapLink) ? String(j.mapLink).trim() : "",
  };
}

const cache = new Map();
export function loadMetadata(uri) {
  if (!uri) return Promise.resolve(EMPTY);
  if (!uri.startsWith("ipfs://")) return Promise.resolve({ ...EMPTY, images: [uri] });
  if (!cache.has(uri)) {
    cache.set(
      uri,
      fetchJsonFromGateways(uri)
        .then(normalize)
        .catch(() => {
          cache.delete(uri);
          return EMPTY;
        })
    );
  }
  return cache.get(uri);
}

export function useMetadata(uri) {
  const [meta, setMeta] = useState(EMPTY);
  useEffect(() => {
    let alive = true;
    setMeta(EMPTY);
    loadMetadata(uri).then((m) => alive && setMeta(m));
    return () => {
      alive = false;
    };
  }, [uri]);
  return meta;
}

/** Where a location link should go: the landlord's Google Maps link, else a Google Maps search of the address. */
export function mapUrl({ mapLink, lat, lng, location }) {
  if (mapLink) return mapLink;
  if (lat !== null && lng !== null && lat !== undefined && lng !== undefined) {
    return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location || "")}`;
}

/** Shrink a photo in the browser so uploads stay small and fast. Returns a JPEG data URL. */
export async function compressImage(file, maxSide = 1600) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("That file isn't an image we can read."));
      i.src = url;
    });
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
    let quality = 0.82;
    let data = canvas.toDataURL("image/jpeg", quality);
    while (data.length > 2_400_000 && quality > 0.4) {
      quality -= 0.15;
      data = canvas.toDataURL("image/jpeg", quality);
    }
    return data;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function upload(user, payload) {
  const res = await fetch("/api/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken: await getIdToken(user), ...payload }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.uri) throw new Error(body.error || "Upload failed. Please try again.");
  return body.uri;
}

export const uploadImage = (user, dataUrl) => upload(user, { kind: "image", data: dataUrl });
export const uploadListingDetails = (user, json) => upload(user, { kind: "json", json });
