# RentLedger: Ethereum rental management dApp

A rental platform where leases, rent payments and security deposits are handled by a Solidity smart contract on Ethereum Sepolia. Users verify their identity with Google, and every wallet linked to the same Google account is treated as the same person.

- **Frontend:** React + Vite + ethers.js v6
- **Wallet:** MetaMask
- **Identity:** Google sign-in (Firebase Authentication) + a small verifier function (`api/verify.js`)
- **Contract:** `contracts/RentalManagement.sol`; address in `shared/deployment.js`

## How identity verification works

1. The user signs in with Google (Firebase).
2. The user signs a message in MetaMask, which proves they own the wallet (free, no gas).
3. The verifier function checks both and signs a short-lived pass. Only a **salted hash** of the email is used.
4. The user submits the pass to `verifyIdentity()`. The contract checks the verifier's signature and stores `wallet → identity hash`.
5. `listProperty` and `rentProperty` require a verified wallet. `rentProperty` rejects a tenant whose identity matches the landlord's (`SamePerson`), even from a different wallet.

## Features

| Who | Can do |
|---|---|
| Anyone | Browse, search, filter and sort homes without a wallet |
| Verified tenant | Rent, pay rent (late fee after a 5-day grace period), raise maintenance requests, see payment history, close the lease, claim the deposit if not returned in 14 days |
| Verified landlord | List/edit/hide properties, see leases and overdue tenants, handle maintenance, end a lease for non-payment, return the deposit with deductions, withdraw rent |
| Admin (deployer) | Stats, platform fee (0–5%), pause/resume, change verifier, revoke an identity |

## Setup

### 1. Install
```
npm install
```

### 2. Create the verifier key
```
node scripts/setup-verifier.js
```
This writes `VERIFIER_PRIVATE_KEY` and `ID_SALT` to `.env` and prints a **verifier address**.

### 3. Firebase (Google sign-in)
1. Go to https://console.firebase.google.com and create a project. Analytics isn't needed.
2. **Build → Authentication → Get started → Sign-in method → Google → Enable**, choose a support email, then **Save**.
3. **Settings → General → Your apps → Web (`</>`)**, register an app, and copy `apiKey`, `authDomain`, `projectId` and `appId` into `shared/firebaseConfig.js`.
4. Later, after deploying to Vercel: **Authentication → Settings → Authorized domains → Add domain**, for example `your-app.vercel.app`. `localhost` is already allowed.

### 3b. Photo storage (Pinata, free)
Property photos are stored on IPFS through Pinata. Your Pinata key stays on the server; the website never sees it.
1. Sign up at https://app.pinata.cloud (free plan).
2. **API Keys → New Key**. Turn on **Admin**, or give it Files write access, then name it and click **Create**. Copy the **JWT**, which is shown only once.
3. Open `.env` in Notepad and add one line: `PINATA_JWT=<the JWT>`.
4. Optional, for faster photo loading: **Gateways** → copy your gateway domain and add it as the first entry in `shared/storageConfig.js`, e.g. `"https://your-name.mypinata.cloud/ipfs/",`.

Locations open in Google Maps: landlords can paste a Google Maps share link when listing. No setup needed.

### 4. Deploy the contract (Remix)
1. Paste `contracts/RentalManagement.sol` into Remix and compile with optimization enabled (200 runs).
2. Deploy & Run → Browser Extension (MetaMask on Sepolia). In the **verifier_** box next to Deploy, paste the verifier address from step 2.
3. Copy the new contract address into `shared/deployment.js`. If you changed the contract, also replace `src/abi.json` with the ABI from Remix.

### 5. Run
```
npm run dev
```
The site runs at http://localhost:5173, and the verifier runs at `/api/verify` on the same server.

## Deploy online (Vercel)

1. Push the project to GitHub. `.env` is ignored, so your secrets are not uploaded.
2. In Vercel, import the repo. Under **Environment Variables**, add `VERIFIER_PRIVATE_KEY`, `ID_SALT` and `PINATA_JWT` from `.env`.
3. Deploy. Then add the Vercel domain to Firebase's authorized domains (step 3.4).

## Project structure

```
contracts/RentalManagement.sol   smart contract
shared/deployment.js             contract address + chain ID (site and verifier)
shared/firebaseConfig.js         Firebase web settings (public)
shared/storageConfig.js          IPFS gateways used to show photos (tried in order)
src/media.js                     photos, listing details, Google Maps links
api/verify.js                    Vercel serverless verifier endpoint
api/upload.js                    photo/listing-details upload to IPFS (Pinata)
server/verifyCore.js             verification + pass signing logic
server/firebaseToken.js          checks the Google ID token
scripts/setup-verifier.js        creates verifier key and salt
src/
  firebase.js                    Google sign-in
  web3.jsx                       wallet, transactions, identity state
  components/Verify.jsx          "Verify your account" window
  components/Browse.jsx          listings, search, filters, rent
  components/Tenant.jsx          my rentals
  components/Landlord.jsx        my properties
  components/Admin.jsx           admin page
```
