// Helpers for a Safe (multi-signature wallet) that owns the RentLedger contract.
import { Contract, getAddress, isAddress } from "ethers";

const SAFE_ABI = [
  "function getOwners() view returns (address[])",
  "function getThreshold() view returns (uint256)",
];

/** If `address` is a Safe on this network, return { address, owners, threshold }; otherwise null. */
export async function readSafe(provider, address) {
  if (!address || !isAddress(address)) return null;
  try {
    const code = await provider.getCode(address);
    if (!code || code === "0x") return null; // a normal wallet, not a contract
    const safe = new Contract(address, SAFE_ABI, provider);
    const [owners, threshold] = await Promise.all([safe.getOwners(), safe.getThreshold()]);
    return { address: getAddress(address), owners: Array.from(owners, (o) => getAddress(o)), threshold: Number(threshold) };
  } catch {
    return null;
  }
}

/** Link that opens this Safe on Sepolia in the Safe web app. */
export const safeAppUrl = (address) => `https://app.safe.global/home?safe=sep:${address}`;
