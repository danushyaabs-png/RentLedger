// Vercel serverless function: POST /api/chat
// Needs these environment variables in Vercel: ID_SALT, FIREBASE_SERVICE_ACCOUNT

import { createChatHandler } from "../server/chatCore.js";
import { verifyFirebaseIdToken } from "../server/firebaseToken.js";

export default createChatHandler({
  verifyIdToken: verifyFirebaseIdToken,
  getEnv: () => process.env,
});
