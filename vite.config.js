import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { createVerifyHandler } from "./server/verifyCore.js";
import { createUploadHandler } from "./server/uploadCore.js";
import { createChatHandler } from "./server/chatCore.js";
import { verifyFirebaseIdToken } from "./server/firebaseToken.js";

// During `npm run dev`, serve the same /api endpoints that Vercel runs in production.
function devApi(env) {
  const opts = { verifyIdToken: verifyFirebaseIdToken, getEnv: () => env };
  const routes = {
    "/api/verify": createVerifyHandler(opts),
    "/api/upload": createUploadHandler(opts),
    "/api/chat": createChatHandler(opts),
  };
  return {
    name: "rentledger-dev-api",
    configureServer(server) {
      for (const [path, handler] of Object.entries(routes)) {
        server.middlewares.use(path, (req, res) => {
          let raw = "";
          req.on("data", (c) => (raw += c));
          req.on("end", () => {
            req.body = raw;
            handler(req, res);
          });
        });
      }
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ""), ...process.env };
  return { plugins: [react(), devApi(env)], build: { chunkSizeWarningLimit: 900 } };
});
