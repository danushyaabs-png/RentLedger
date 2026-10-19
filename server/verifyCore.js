// Identity verification logic, shared by the Vercel function (api/verify.js)
// and the local dev server (vite.config.js).
//
// Flow:
//   1. The browser signs in with Google (Firebase) and sends us the Google ID token.
//   2. The browser asks MetaMask to sign a short message naming the wallet.
//   3. We check both, then sign a "verification pass" with the verifier key.
//   4. The user submits the pass to the contract's verifyIdentity(), which checks our signature.
//
// Only a salted hash of the email ever goes on-chain.

import { AbiCoder, Wallet, getAddress, getBytes, keccak256, toUtf8Bytes, verifyMessage } from "ethers";
import { CHAIN_ID, CONTRACT_ADDRESS } from "../shared/deployment.js";
import { firebaseConfig } from "../shared/firebaseConfig.js";

const MESSAGE_MAX_AGE_MS = 10 * 60 * 1000; // wallet signature must be fresh
const PASS_LIFETIME_S = 15 * 60; // pass must be used within 15 minutes

export class PublicError extends Error {}

/** The exact text the user signs in MetaMask. The website builds it with the same function. */
export function linkMessage(address, issuedAt) {
  return [
    "RentLedger: link this wallet to my Google account.",
    "",
    `Wallet: ${address}`,
    `Network: Ethereum Sepolia (${CHAIN_ID})`,
    `Issued at: ${issuedAt}`,
  ].join("\n");
}

export function identityHash(email, salt) {
  return keccak256(toUtf8Bytes(`${salt}:${email.trim().toLowerCase()}`));
}

export async function issuePass({ email, address, message, signature, env }) {
  if (!env.VERIFIER_PRIVATE_KEY || !env.ID_SALT) {
    throw new PublicError("The verifier isn't configured. Set VERIFIER_PRIVATE_KEY and ID_SALT.");
  }
  let wallet;
  try {
    wallet = getAddress(address);
  } catch {
    throw new PublicError("That isn't a valid wallet address.");
  }

  // The message must name this wallet and be recent.
  const named = /^Wallet: (0x[0-9a-fA-F]{40})$/m.exec(message || "");
  const issued = /^Issued at: (.+)$/m.exec(message || "");
  if (!named || getAddress(named[1]) !== wallet || !issued) {
    throw new PublicError("The signed message doesn't match this wallet.");
  }
  const age = Date.now() - Date.parse(issued[1]);
  if (!(age >= -60_000 && age <= MESSAGE_MAX_AGE_MS)) {
    throw new PublicError("The wallet signature has expired. Please try again.");
  }

  // The signature must come from that wallet.
  let signer;
  try {
    signer = verifyMessage(message, signature);
  } catch {
    throw new PublicError("The wallet signature is invalid.");
  }
  if (getAddress(signer) !== wallet) throw new PublicError("The wallet signature is from a different wallet.");

  const contract = getAddress(env.VITE_CONTRACT_ADDRESS || CONTRACT_ADDRESS);
  const identity = identityHash(email, env.ID_SALT);
  const expiry = Math.floor(Date.now() / 1000) + PASS_LIFETIME_S;
  const digest = keccak256(
    AbiCoder.defaultAbiCoder().encode(
      ["uint256", "address", "address", "bytes32", "uint256"],
      [CHAIN_ID, contract, wallet, identity, expiry]
    )
  );
  const pass = await new Wallet(env.VERIFIER_PRIVATE_KEY).signMessage(getBytes(digest));
  return { identity, expiry, signature: pass };
}

/** Build a Node/Vercel style (req, res) handler. `verifyIdToken(token, projectId)` returns { email }. */
export function createVerifyHandler({ verifyIdToken, getEnv }) {
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
      const { idToken, address, message, signature } = body;
      if (!idToken) throw new PublicError("Sign in with Google first.");
      const { email } = await verifyIdToken(idToken, env.VITE_FIREBASE_PROJECT_ID || firebaseConfig.projectId);
      if (body.action === "identity") {
        // Just tell the signed-in user which identity hash their Google account maps to.
        if (!env.ID_SALT) throw new PublicError("The verifier isn't configured. Set ID_SALT.");
        return send(200, { identity: identityHash(email, env.ID_SALT) });
      }
      const pass = await issuePass({ email, address, message, signature, env });
      return send(200, pass);
    } catch (e) {
      if (!(e instanceof PublicError)) console.error("verify failed:", e);
      return send(e instanceof PublicError ? 400 : 401, {
        error: e instanceof PublicError ? e.message : "Your Google sign-in couldn't be checked. Sign in again.",
      });
    }
  };
}
