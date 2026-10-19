// Vercel serverless function: POST /api/upload
// Needs the PINATA_JWT environment variable in Vercel.

import { createUploadHandler } from "../server/uploadCore.js";
import { verifyFirebaseIdToken } from "../server/firebaseToken.js";

export default createUploadHandler({
  verifyIdToken: verifyFirebaseIdToken,
  getEnv: () => process.env,
});
