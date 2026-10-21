// Live ETH -> INR price for showing rupee estimates next to ETH amounts.
// Source: CoinGecko public API (free, no key). Cached for 10 minutes.
// If the price can't be loaded, rupee estimates are simply hidden.

import { createElement, useEffect, useState } from "react";
import { formatEther } from "ethers";

const URL = "https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=inr";
const CACHE_KEY = "rentledger-eth-inr";
const TTL = 10 * 60 * 1000;

let current = readCache();
let pending = null;
const subs = new Set();

function readCache() {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY) || "null");
    if (c && typeof c.inr === "number") return c;
  } catch {}
  return null;
}

function load() {
  if (current && Date.now() - current.at < TTL) return;
  if (pending) return;
  pending = fetch(URL)
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error("price unavailable"))))
    .then((j) => {
      const inr = Number(j?.ethereum?.inr);
      if (!inr) throw new Error("price unavailable");
      current = { inr, at: Date.now() };
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(current));
      } catch {}
      subs.forEach((cb) => cb(current));
    })
    .catch(() => {})
    .finally(() => (pending = null));
}

/** Current ETH price in rupees, or null while unknown. */
export function useEthInr() {
  const [price, setPrice] = useState(current);
  useEffect(() => {
    subs.add(setPrice);
    load();
    const t = setInterval(load, TTL);
    return () => {
      subs.delete(setPrice);
      clearInterval(t);
    };
  }, []);
  return price?.inr ?? null;
}

export function formatInr(rupees) {
  if (!Number.isFinite(rupees)) return "";
  const digits = rupees >= 100 ? 0 : rupees >= 1 ? 2 : 4;
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  }).format(rupees);
}

/** "≈ ₹1,234" for an amount in wei (bigint) or an ETH string typed in a form. */
export function Inr({ wei, ethValue, prefix = "≈ ", suffix = "", className = "inr" }) {
  const inr = useEthInr();
  if (!inr) return null;
  let amount;
  try {
    amount = wei !== undefined && wei !== null ? Number(formatEther(wei)) : Number(ethValue);
  } catch {
    return null;
  }
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return createElement(
    "span",
    { className, title: `At ${formatInr(inr)} per ETH (live market price; Sepolia test ETH has no real value)` },
    `${prefix}${formatInr(amount * inr)}${suffix}`
  );
}
