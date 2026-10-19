// Available listings + helpers shared by the Home and Find a home pages.

import { useCallback, useEffect, useState } from "react";
import { ZeroHash } from "ethers";
import { useWeb3, useContractData } from "./web3";
import { sameAddr, structs } from "./utils";

/** All available homes, newest first, with each landlord's identity (to spot your own listings). */
export function useListings() {
  const { readContract, account, identity } = useWeb3();
  const state = useContractData(async () => {
    const list = structs(await readContract.getAvailableProperties());
    const landlords = [...new Set(list.map((p) => p.landlord))];
    const ids = await Promise.all(landlords.map((a) => readContract.identityOf(a)));
    const idOf = Object.fromEntries(landlords.map((a, i) => [a, ids[i] === ZeroHash ? null : ids[i]]));
    return list.map((p) => ({ ...p, landlordIdentity: idOf[p.landlord] })).sort((a, b) => Number(b.id - a.id));
  }, []);
  const isMine = useCallback(
    (p) => sameAddr(account, p.landlord) || (!!identity && identity === p.landlordIdentity),
    [account, identity]
  );
  return { ...state, isMine };
}

/** Saved (hearted) homes, remembered in this browser per wallet. */
export function useFavorites() {
  const { account } = useWeb3();
  const key = `rentledger-saved-${(account || "").toLowerCase()}`;
  const [saved, setSaved] = useState(() => new Set());
  useEffect(() => {
    try {
      setSaved(new Set(JSON.parse(localStorage.getItem(key) || "[]")));
    } catch {
      setSaved(new Set());
    }
  }, [key]);
  const toggle = useCallback(
    (id) => {
      setSaved((cur) => {
        const next = new Set(cur);
        const k = String(id);
        next.has(k) ? next.delete(k) : next.add(k);
        try {
          localStorage.setItem(key, JSON.stringify([...next]));
        } catch {
          /* storage unavailable: keep in memory only */
        }
        return next;
      });
    },
    [key]
  );
  return { isSaved: (id) => saved.has(String(id)), toggle };
}
