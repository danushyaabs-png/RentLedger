// Loads the contract's event history for the Activity page.
// Robust against flaky free RPC nodes:
//  - retries, then falls back to other public Sepolia nodes
//  - splits big block ranges if a node refuses them
//  - remembers already-loaded events in this browser, so later visits only fetch new blocks
//  - if the network fails but saved events exist, shows those instead of an error

import { JsonRpcProvider } from "ethers";
import { CHAIN_ID, CONTRACT_ADDRESS, DEPLOY_BLOCK, LOG_RPC_URLS } from "./config";

const CHUNK = 10_000; // blocks per eth_getLogs request
const REORG_MARGIN = 6; // re-check the newest few blocks next time
const CACHE_KEY = `rentledger-events-v1-${CHAIN_ID}-${CONTRACT_ADDRESS.toLowerCase()}`;

let extraProviders;
function providers(primary) {
  if (!extraProviders) extraProviders = LOG_RPC_URLS.map((u) => new JsonRpcProvider(u, CHAIN_ID, { staticNetwork: true }));
  return [primary, ...extraProviders];
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Run fn against each node in turn (with one retry each) until one works. */
async function withAnyNode(list, fn) {
  let last;
  for (const p of list) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await fn(p);
      } catch (e) {
        last = e;
        if (attempt === 0) await sleep(700);
      }
    }
  }
  throw last;
}

async function fetchRange(list, from, to) {
  const out = [];
  const getRange = async (a, b) => {
    try {
      return await withAnyNode(list, (p) => p.getLogs({ address: CONTRACT_ADDRESS, fromBlock: a, toBlock: b }));
    } catch (e) {
      if (b - a < 500) throw e;
      const mid = Math.floor((a + b) / 2);
      return [...(await getRange(a, mid)), ...(await getRange(mid + 1, b))];
    }
  };
  for (let start = from; start <= to; start += CHUNK) {
    const logs = await getRange(start, Math.min(start + CHUNK - 1, to));
    out.push(...logs);
  }
  return out;
}

const pack = (l) => ({ b: l.blockNumber, i: l.index, h: l.transactionHash, t: [...l.topics], d: l.data });

function readCache() {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
    if (c && Number.isInteger(c.to) && Array.isArray(c.logs)) return c;
  } catch {}
  return null;
}
function writeCache(c) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(c));
  } catch {}
}

/**
 * Returns { events, stale } where events look like ethers EventLogs:
 * { fragment: { name }, args, blockNumber, index, transactionHash }.
 */
export async function loadEvents(iface, primaryProvider, { fresh = false } = {}) {
  const list = providers(primaryProvider);
  const cache = fresh ? null : readCache();
  let packed = cache?.logs || [];
  let stale = false;
  try {
    const latest = await withAnyNode(list, (p) => p.getBlockNumber());
    const from = cache ? cache.to + 1 : Math.max(0, DEPLOY_BLOCK);
    if (latest >= from) {
      const got = (await fetchRange(list, from, latest)).map(pack);
      const seen = new Set();
      packed = [...packed, ...got].filter((l) => {
        const k = `${l.h}-${l.i}`;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      writeCache({ to: Math.max(from - 1, latest - REORG_MARGIN), logs: packed });
    }
  } catch (e) {
    if (!cache) throw e;
    stale = true; // network failed, but we can still show what we saved before
  }

  const events = [];
  for (const l of packed) {
    let parsed = null;
    try {
      parsed = iface.parseLog({ topics: l.t, data: l.d });
    } catch {}
    if (parsed) events.push({ fragment: { name: parsed.name }, args: parsed.args, blockNumber: l.b, index: l.i, transactionHash: l.h });
  }
  return { events, stale };
}
