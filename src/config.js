import { CONTRACT_ADDRESS as DEPLOYED_ADDRESS, CHAIN_ID as DEPLOYED_CHAIN_ID, DEPLOY_BLOCK as DEPLOYED_BLOCK } from "../shared/deployment.js";

// The contract address lives in shared/deployment.js (the verifier server reads it too).
export const CONTRACT_ADDRESS = import.meta.env.VITE_CONTRACT_ADDRESS || DEPLOYED_ADDRESS;

export const CHAIN_ID = DEPLOYED_CHAIN_ID; // Sepolia
export const DEPLOY_BLOCK = Number(import.meta.env.VITE_DEPLOY_BLOCK ?? DEPLOYED_BLOCK ?? 0);
export const CHAIN_ID_HEX = "0x" + CHAIN_ID.toString(16);
export const CHAIN_NAME = "Sepolia";

// Public RPC used to read data, so people can browse without a wallet.
export const RPC_URL = import.meta.env.VITE_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com";
export const EXPLORER = "https://sepolia.etherscan.io";

export const CONTRACT_CONFIGURED = !/^0x0{40}$/.test(CONTRACT_ADDRESS);
