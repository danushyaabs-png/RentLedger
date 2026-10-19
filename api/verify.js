// Vercel serverless function: POST /api/verify
// Needs these environment variables in Vercel: VERIFIER_PRIVATE_KEY, ID_SALT

import { createVerifyHandler } from "../server/verifyCore.js";
import { verifyFirebaseIdToken } from "../server/firebaseToken.js";

export default createVerifyHandler({
  verifyIdToken: verifyFirebaseIdToken,
  getEnv: () => process.env,
});
