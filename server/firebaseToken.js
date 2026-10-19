// Verifies a Firebase Authentication ID token (from "Sign in with Google") using Google's public keys.
// No service-account file is needed: only the Firebase project ID.

import { createRemoteJWKSet, jwtVerify } from "jose";
import { PublicError } from "./verifyCore.js";

const JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com")
);

export async function verifyFirebaseIdToken(idToken, projectId) {
  if (!projectId) throw new PublicError("Google sign-in isn't configured. Fill in shared/firebaseConfig.js.");
  const { payload } = await jwtVerify(idToken, JWKS, {
    issuer: `https://securetoken.google.com/${projectId}`,
    audience: projectId,
  });
  if (payload.firebase?.sign_in_provider !== "google.com") {
    throw new PublicError("Please sign in with a Google account.");
  }
  if (!payload.email || payload.email_verified !== true) {
    throw new PublicError("Your Google account's email isn't verified.");
  }
  return { email: String(payload.email) };
}
