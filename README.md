# RentLedger: Ethereum rental management dApp

A rental platform where leases, rent payments and security deposits are handled by a Solidity smart contract on Ethereum Sepolia. Users verify their identity with Google, and every wallet linked to the same Google account is treated as the same person.

- **Frontend:** React + Vite + ethers.js v6
- **Wallet:** MetaMask
- **Identity:** Google sign-in (Firebase Authentication) + a small verifier function (`api/verify.js`)
- **Contract:** `contracts/RentalManagement.sol`; address in `shared/deployment.js`
- **Chat:** `api/chat.js`, messages stored in Firestore and checked against on-chain identities

## How identity verification works

1. The user signs in with Google (Firebase).
2. The user signs a message in MetaMask, which proves they own the wallet (free, no gas).
3. The verifier function checks both and signs a short-lived pass. Only a **salted hash** of the email is used.
4. The user submits the pass to `verifyIdentity()`. The contract checks the verifier's signature and stores `wallet → identity hash`.
5. `listProperty`, `requestRental` and `rentProperty` require a verified wallet. A tenant whose identity matches the landlord's is rejected (`SamePerson`), even from a different wallet.

## Renting: request, approve, pay

1. The tenant sends `requestRental(propertyId, months)`. Nothing is paid yet, and they can message the owner.
2. The owner sees the request with the tenant's rating, then `approveRentalRequest` or `rejectRentalRequest`. Only one approved request per home at a time, and the price can't be edited while an approval is waiting.
3. Only after approval can the tenant call `rentProperty(requestId)` with exactly deposit + first month.

## Ratings

`rateLease(leaseId, stars, comment)`: 1 to 5 stars, once per lease per side. The tenant can rate the owner any time after moving in; the owner can rate the tenant only after the lease closes. Ratings belong to the person (Google identity), so all their wallets share one reputation.

## Chat

Tenant and owner chat per (property, tenant). Every `/api/chat` call carries the Google sign-in token; the server turns it into the identity hash and checks **on the blockchain** that it owns the tenant or owner wallet. Browsers never access the database directly.

## Features

| Who | Can do |
|---|---|
| Anyone | Browse, search, filter and sort homes without a wallet |
| Verified tenant | Request to rent, chat with the owner, pay after approval, rate the owner, pay rent (late fee after a 5-day grace period), raise maintenance requests, see payment history, close the lease, claim the deposit if not returned in 14 days |
| Verified landlord | Approve or decline rental requests (seeing the tenant's rating), chat with tenants, rate tenants after the lease, list/edit/hide properties, see leases and overdue tenants, handle maintenance, end a lease for non-payment, return the deposit with deductions, withdraw rent |
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

### 3c. Chat storage (Firestore, free)
1. Firebase console → **Build → Firestore Database → Create database**. Pick a location (e.g. `asia-south1`) and **production mode**. Production mode blocks browsers, which is what we want: only our server writes.
2. **Project settings (gear) → Service accounts → Generate new private key**. A `.json` file downloads. Keep it secret.
3. Move it into the project folder and rename it `service-account.json` (it's in `.gitignore`).
4. Add to `.env`: `FIREBASE_SERVICE_ACCOUNT_FILE=./service-account.json`
5. For Vercel, add an environment variable `FIREBASE_SERVICE_ACCOUNT` and paste the **whole contents** of the JSON file as its value.

Locations open in Google Maps: landlords can paste a Google Maps share link when listing. No setup needed.

### 4. Deploy the contract (Remix)
1. Paste `contracts/RentalManagement.sol` into Remix and compile with optimization enabled (200 runs) and EVM version **cancun**. If Remix warns the contract is too big, set runs to 1.
2. Deploy & Run → Browser Extension (MetaMask on Sepolia). In the **verifier_** box next to Deploy, paste the verifier address from step 2.
3. Copy the new contract address into `shared/deployment.js`, and set `DEPLOY_BLOCK` there to the block number of the deployment (from Etherscan). `src/abi.json` already matches this contract version.

### 5. Run
```
npm run dev
```
The site runs at http://localhost:5173, and the verifier runs at `/api/verify` on the same server.

## Deploy online (Vercel)

1. Push the project to GitHub. `.env` is ignored, so your secrets are not uploaded.
2. In Vercel, import the repo. Under **Environment Variables**, add `VERIFIER_PRIVATE_KEY`, `ID_SALT` and `PINATA_JWT` from `.env`, and `FIREBASE_SERVICE_ACCOUNT` (the JSON file's contents).
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
api/chat.js                      tenant/owner chat endpoint
server/chatCore.js               chat access checks + Firestore storage
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
  components/Chat.jsx            chat pop-up and Messages page
  components/Stars.jsx           star ratings and rating form
```
