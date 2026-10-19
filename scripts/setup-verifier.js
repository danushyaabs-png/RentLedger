// Creates the verifier key and salt and writes them to .env.
// Run once:  node scripts/setup-verifier.js
// Then use the printed verifier address when deploying the contract in Remix.

import { Wallet, hexlify, randomBytes } from "ethers";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const path = new URL("../.env", import.meta.url);
let env = existsSync(path) ? readFileSync(path, "utf8") : "";

if (/^VERIFIER_PRIVATE_KEY=0x/m.test(env)) {
  const key = /^VERIFIER_PRIVATE_KEY=(0x[0-9a-fA-F]+)/m.exec(env)[1];
  console.log("A verifier key already exists in .env.");
  console.log("Verifier address (use this in Remix):", new Wallet(key).address);
  process.exit(0);
}

const wallet = Wallet.createRandom();
const salt = hexlify(randomBytes(32));
if (env && !env.endsWith("\n")) env += "\n";
env += `VERIFIER_PRIVATE_KEY=${wallet.privateKey}\nID_SALT=${salt}\n`;
writeFileSync(path, env);

console.log("Saved VERIFIER_PRIVATE_KEY and ID_SALT to .env (keep this file secret, it's in .gitignore).");
console.log("");
console.log("Verifier address (paste this into Remix when deploying):");
console.log(wallet.address);
