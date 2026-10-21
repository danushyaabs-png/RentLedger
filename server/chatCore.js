// Chat between a tenant and a property owner, shared by the Vercel function (api/chat.js)
// and the local dev server (vite.config.js).
//
// Security: every request carries the user's Google sign-in token. We turn the email into the
// same identity hash the contract uses, then check ON THE BLOCKCHAIN that this person owns the
// tenant wallet or the landlord wallet of the conversation. Nobody else can read or write it.
// Messages are stored in Firestore (server-side only; browsers have no direct database access).

import { Contract, JsonRpcProvider, ZeroHash, getAddress, isAddress } from "ethers";
import { identityHash, PublicError } from "./verifyCore.js";
import { CHAIN_ID, CONTRACT_ADDRESS } from "../shared/deployment.js";
import { firebaseConfig } from "../shared/firebaseConfig.js";

const MAX_TEXT = 1000;
const MAX_MESSAGES = 300;
const DEFAULT_RPC = "https://ethereum-sepolia-rpc.publicnode.com";

const CHAIN_ABI = [
  "function identityOf(address) view returns (bytes32)",
  "function getProperty(uint256) view returns (tuple(uint256 id, address landlord, string name, string location, string metadataURI, uint256 rentPerMonth, uint256 securityDeposit, uint16 lateFeeBps, bool isAvailable, bool isRented, uint256 activeLeaseId, uint256 createdAt, uint256 approvedRequestId))",
];

/** Reads identities and property owners from the contract. */
export function contractChain(env) {
  const provider = new JsonRpcProvider(env.RPC_URL || env.VITE_RPC_URL || DEFAULT_RPC, CHAIN_ID, { staticNetwork: true });
  const address = env.VITE_CONTRACT_ADDRESS || CONTRACT_ADDRESS;
  const c = new Contract(address, CHAIN_ABI, provider);
  return {
    contract: getAddress(address),
    identityOf: async (a) => {
      const id = await c.identityOf(a);
      return id === ZeroHash ? null : id;
    },
    property: async (id) => {
      try {
        const p = await c.getProperty(id);
        return { landlord: getAddress(p.landlord), name: p.name };
      } catch {
        return null;
      }
    },
  };
}

/** Firestore storage through the Firebase Admin SDK (needs a service account). */
export function firestoreStore(env) {
  let db;
  const getDb = async () => {
    if (db) return db;
    let creds = env.FIREBASE_SERVICE_ACCOUNT;
    if (!creds && env.FIREBASE_SERVICE_ACCOUNT_FILE) {
      const { readFile } = await import("node:fs/promises");
      creds = await readFile(env.FIREBASE_SERVICE_ACCOUNT_FILE, "utf8");
    }
    if (!creds) throw new PublicError("Chat isn't set up yet. Add FIREBASE_SERVICE_ACCOUNT (see README).");
    let json;
    try {
      json = JSON.parse(creds);
    } catch {
      throw new PublicError("FIREBASE_SERVICE_ACCOUNT isn't valid JSON. Paste the whole service-account file.");
    }
    const { initializeApp, cert, getApps } = await import("firebase-admin/app");
    const { getFirestore } = await import("firebase-admin/firestore");
    const app = getApps().find((a) => a.name === "rentledger-chat") || initializeApp({ credential: cert(json) }, "rentledger-chat");
    db = getFirestore(app);
    return db;
  };
  const threads = async () => (await getDb()).collection("chatThreads");
  return {
    async getThread(id) {
      const snap = await (await threads()).doc(id).get();
      return snap.exists ? snap.data() : null;
    },
    async saveThread(id, data) {
      await (await threads()).doc(id).set(data, { merge: true });
    },
    async addMessage(id, msg) {
      await (await threads()).doc(id).collection("messages").add(msg);
    },
    async listMessages(id, since) {
      const snap = await (await threads())
        .doc(id)
        .collection("messages")
        .where("at", ">", since || 0)
        .orderBy("at", "desc")
        .limit(MAX_MESSAGES)
        .get();
      return snap.docs.map((d) => d.data()).reverse();
    },
    async listThreadsFor(identity) {
      const snap = await (await threads()).where("members", "array-contains", identity).get();
      return snap.docs.map((d) => d.data());
    },
  };
}

/** In-memory storage, used by the automated tests. */
export function memoryStore() {
  const t = new Map();
  const m = new Map();
  return {
    async getThread(id) {
      return t.get(id) || null;
    },
    async saveThread(id, data) {
      t.set(id, { ...(t.get(id) || {}), ...data, lastRead: { ...(t.get(id)?.lastRead || {}), ...(data.lastRead || {}) } });
    },
    async addMessage(id, msg) {
      m.set(id, [...(m.get(id) || []), msg]);
    },
    async listMessages(id, since) {
      return (m.get(id) || []).filter((x) => x.at > (since || 0)).slice(-MAX_MESSAGES);
    },
    async listThreadsFor(identity) {
      return [...t.values()].filter((x) => x.members?.includes(identity));
    },
  };
}

const threadId = (contract, propertyId, tenant) => `${contract.toLowerCase()}_${propertyId}_${tenant.toLowerCase()}`;

function summary(th, me) {
  const read = th.lastRead?.[me] || 0;
  return {
    id: th.id,
    propertyId: th.propertyId,
    propertyName: th.propertyName,
    tenant: th.tenant,
    landlord: th.landlord,
    role: th.tenantId === me ? "tenant" : "landlord",
    lastText: th.lastText || "",
    lastFrom: th.lastFrom || null,
    lastAt: th.lastAt || th.createdAt || 0,
    unread: !!th.lastAt && th.lastAt > read && th.lastFromId !== me,
  };
}

/** Build a Node/Vercel style (req, res) handler. */
export function createChatHandler({ verifyIdToken, getEnv, store, chain }) {
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
      if (!env.ID_SALT) throw new PublicError("The server isn't configured. Set ID_SALT.");
      const { email } = await verifyIdToken(body.idToken, env.VITE_FIREBASE_PROJECT_ID || firebaseConfig.projectId);
      const me = identityHash(email, env.ID_SALT);
      const db = store || firestoreStore(env);
      const ch = chain || contractChain(env);

      if (body.action === "threads") {
        const list = (await db.listThreadsFor(me)).filter((th) => th.contract === ch.contract);
        list.sort((a, b) => (b.lastAt || b.createdAt || 0) - (a.lastAt || a.createdAt || 0));
        return send(200, { threads: list.map((th) => summary(th, me)) });
      }

      // Everything else is about one conversation: (property, tenant wallet)
      const propertyId = Number(body.propertyId);
      if (!Number.isInteger(propertyId) || propertyId <= 0) throw new PublicError("Unknown property.");
      if (!isAddress(body.tenant || "")) throw new PublicError("Unknown tenant.");
      const tenant = getAddress(body.tenant);
      const id = threadId(ch.contract, propertyId, tenant);

      let th = await db.getThread(id);
      if (!th) {
        const prop = await ch.property(propertyId);
        if (!prop) throw new PublicError("This property doesn't exist.");
        const [tenantId, landlordId] = await Promise.all([ch.identityOf(tenant), ch.identityOf(prop.landlord)]);
        if (!tenantId) throw new PublicError("This wallet isn't verified yet.");
        if (!landlordId) throw new PublicError("The owner's wallet isn't verified.");
        if (tenantId === landlordId) throw new PublicError("You can't message yourself.");
        th = {
          id,
          contract: ch.contract,
          propertyId,
          propertyName: prop.name,
          tenant,
          landlord: prop.landlord,
          tenantId,
          landlordId,
          members: [tenantId, landlordId],
          createdAt: Date.now(),
          lastRead: {},
        };
        if (me !== tenantId && me !== landlordId) throw new PublicError("You're not part of this conversation.");
        await db.saveThread(id, th);
      }
      if (me !== th.tenantId && me !== th.landlordId) throw new PublicError("You're not part of this conversation.");
      const role = me === th.tenantId ? "tenant" : "landlord";

      if (body.action === "send") {
        const text = String(body.text || "").trim();
        if (!text) throw new PublicError("Type a message first.");
        if (text.length > MAX_TEXT) throw new PublicError(`Messages can be up to ${MAX_TEXT} characters.`);
        const at = Date.now();
        const msg = { from: role === "tenant" ? th.tenant : th.landlord, role, text, at };
        await db.addMessage(id, msg);
        await db.saveThread(id, { lastText: text.slice(0, 140), lastFrom: msg.from, lastFromId: me, lastAt: at, lastRead: { [me]: at } });
        return send(200, { message: msg });
      }

      if (body.action === "messages") {
        const messages = await db.listMessages(id, Number(body.since) || 0);
        await db.saveThread(id, { lastRead: { [me]: Date.now() } });
        return send(200, { thread: summary({ ...th, lastRead: { ...th.lastRead, [me]: Date.now() } }, me), messages });
      }

      throw new PublicError("Unknown action.");
    } catch (e) {
      if (e instanceof PublicError) return send(400, { error: e.message });
      console.error(e);
      const msg = String(e?.message || "");
      if (/firestore|NOT_FOUND|PERMISSION_DENIED|database/i.test(msg)) {
        return send(500, { error: "Chat storage isn't ready. Create the Firestore database in Firebase (see README)." });
      }
      return send(500, { error: "Chat is unavailable right now. Please try again." });
    }
  };
}
