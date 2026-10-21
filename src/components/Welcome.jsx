import { useState } from "react";
import { BrowserProvider } from "ethers";
import { useWeb3 } from "../web3";
import { getIdToken, googleReady, signInWithGoogle } from "../firebase";
import { linkMessage } from "../../server/verifyCore.js";
import { shortAddr } from "../utils";

const POINTS = [
  { title: "Deposits held in escrow", text: "Security deposits sit in a smart contract, not with the landlord, until the lease ends." },
  { title: "Every payment on record", text: "Rent receipts are written to Ethereum, so there's never a dispute about what was paid." },
  { title: "Verified people only", text: "Every landlord and tenant is tied to a real Google account." },
];

/**
 * Sign-in and onboarding: Google account, then wallet, then link the wallet to the Google account.
 * Shown until all three are done.
 */
export default function Welcome() {
  const {
    googleUser,
    googleIdentity,
    retryGoogleIdentity,
    account,
    hasWallet,
    onRightChain,
    connect,
    switchNetwork,
    identity,
    identityReady,
    sendTx,
    signOutAll,
    needsName,
    saveUserName,
    displayName,
  } = useWeb3();
  const [nameInput, setNameInput] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const step = !googleUser ? 1 : needsName ? 2 : !account || !onRightChain ? 3 : 4;
  const mismatch = step === 4 && identityReady && identity && googleIdentity.id && identity !== googleIdentity.id;

  async function google() {
    setError("");
    try {
      setBusy("Waiting for Google…");
      await signInWithGoogle();
    } catch (e) {
      if (e?.code !== "auth/popup-closed-by-user" && e?.code !== "auth/cancelled-popup-request") {
        setError(
          e?.code === "auth/unauthorized-domain"
            ? "This website's domain isn't authorised in Firebase yet. Add it under Authentication → Settings → Authorized domains."
            : e?.code === "auth/popup-blocked"
              ? "Your browser blocked the Google window. Allow pop-ups for this site and try again."
              : "Google sign-in didn't complete. Please try again."
        );
      }
    } finally {
      setBusy("");
    }
  }

  async function linkWallet() {
    setError("");
    try {
      setBusy("Confirm the signature in MetaMask…");
      const signer = await new BrowserProvider(window.ethereum).getSigner();
      const message = linkMessage(account, new Date().toISOString());
      const signature = await signer.signMessage(message);

      setBusy("Checking your Google account…");
      const res = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken: await getIdToken(googleUser), address: account, message, signature }),
      });
      const pass = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(pass.error || "Verification failed. Please try again.");

      setBusy("Confirm the transaction in MetaMask…");
      await sendTx("Verify wallet", (c) => c.verifyIdentity(pass.identity, pass.expiry, pass.signature));
    } catch (e) {
      setError(
        e?.code === "ACTION_REJECTED" || e?.info?.error?.code === 4001
          ? "You cancelled the signature in MetaMask."
          : e?.message || "Verification failed. Please try again."
      );
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="welcome">
      <aside className="welcome-brand">
        <div className="welcome-logo">
          <img src="/key.svg" alt="" width="36" height="36" />
          <span>RentLedger</span>
        </div>
        <div className="welcome-pitch">
          <h1>Renting, settled on-chain.</h1>
          <p>
            List a home, sign a lease and pay rent in minutes. Deposits and payments are handled by a smart contract both
            sides can trust.
          </p>
          <ul>
            {POINTS.map((p) => (
              <li key={p.title}>
                <strong>{p.title}</strong>
                <span>{p.text}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="welcome-foot">Secured by Ethereum</p>
      </aside>

      <main className="welcome-main">
        <div className="welcome-card">
          <h2>
            {step === 1 ? "Sign in to RentLedger" : step === 2 ? "What should we call you?" : step === 3 ? "Connect your wallet" : "Verify your wallet"}
          </h2>
          <p className="muted">
            {step === 1
              ? "Use your Google account to get started."
              : step === 2
                ? "We'll use this name to greet you. You can change it later from the account menu."
                : step === 3
                  ? "Your wallet is how you pay rent and receive payments."
                  : "Link this wallet to your Google account. You only do this once per wallet."}
          </p>

          <ol className="progress" aria-label="Sign-in progress">
            {["Google", "Your name", "Wallet", "Verify"].map((label, i) => (
              <li key={label} className={i + 1 < step ? "done" : i + 1 === step ? "current" : ""}>
                {label}
              </li>
            ))}
          </ol>

          {googleUser && (
            <div className="signed-in-as">
              <Avatar user={googleUser} name={displayName} />
              <div>
                <strong>{displayName || googleUser.email}</strong>
                <span className="muted small">{googleUser.email}</span>
              </div>
              <button className="link-btn small" onClick={signOutAll}>
                Sign out
              </button>
            </div>
          )}

          {step === 1 && (
            <button className="btn btn-google btn-lg btn-block" onClick={google} disabled={!googleReady || !!busy || googleUser === undefined}>
              <GoogleIcon /> Continue with Google
            </button>
          )}

          {step === 2 && (
            <form
              className="form"
              onSubmit={async (e) => {
                e.preventDefault();
                const n = (nameInput ?? googleUser.displayName ?? "").trim();
                if (n.length < 2) return setError("Please enter at least 2 characters.");
                setError("");
                setBusy("Saving…");
                await saveUserName(n);
                setBusy("");
              }}
            >
              <label className="field">
                <span>Your name</span>
                <input
                  autoFocus
                  maxLength={40}
                  value={nameInput ?? googleUser.displayName ?? ""}
                  placeholder="e.g. Danush"
                  onChange={(e) => setNameInput(e.target.value)}
                />
              </label>
              <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={!!busy}>
                Continue
              </button>
            </form>
          )}

          {step === 3 &&
            (!hasWallet ? (
              <>
                <a className="btn btn-primary btn-lg btn-block" href="https://metamask.io/download/" target="_blank" rel="noreferrer">
                  Install MetaMask
                </a>
                <p className="muted small">After installing, refresh this page.</p>
              </>
            ) : !account ? (
              <button className="btn btn-primary btn-lg btn-block" onClick={connect}>
                <MetaMaskIcon /> Connect MetaMask
              </button>
            ) : (
              <button className="btn btn-warn btn-lg btn-block" onClick={() => switchNetwork().catch(() => {})}>
                Switch to the Sepolia network
              </button>
            ))}

          {step === 4 && (
            <>
              <div className="wallet-line">
                <span className="dot" aria-hidden="true" />
                Wallet {shortAddr(account)}
              </div>
              {!identityReady || (identity && !googleIdentity.id && !googleIdentity.error) ? (
                <p className="muted busy">
                  <span className="spinner" aria-hidden="true" /> Checking your wallet…
                </p>
              ) : googleIdentity.error ? (
                <>
                  <p className="error-text">{googleIdentity.error}</p>
                  <button className="btn btn-outline btn-block" onClick={retryGoogleIdentity}>
                    Try again
                  </button>
                </>
              ) : mismatch ? (
                <div className="mismatch">
                  <p>
                    <strong>This wallet belongs to a different Google account.</strong>
                  </p>
                  <p className="muted small">
                    Switch to another wallet in MetaMask, or sign out and sign in with the Google account this wallet
                    was verified with.
                  </p>
                  <button className="btn btn-outline btn-block" onClick={signOutAll}>
                    Sign out
                  </button>
                </div>
              ) : (
                <>
                  <button className="btn btn-primary btn-lg btn-block" onClick={linkWallet} disabled={!!busy}>
                    Verify wallet
                  </button>
                  <p className="muted small">
                    You'll sign a message (free), then confirm one small transaction. Only a scrambled fingerprint of
                    your email is stored on the blockchain, never the email itself.
                  </p>
                </>
              )}
            </>
          )}

          {busy && (
            <p className="small busy">
              <span className="spinner" aria-hidden="true" /> {busy}
            </p>
          )}
          {error && <p className="error-text">{error}</p>}
          {!googleReady && <p className="error-text">Google sign-in isn't configured for this website.</p>}
        </div>
      </main>
    </div>
  );
}

export function Avatar({ user, size = 36, name }) {
  const [broken, setBroken] = useState(false);
  const letter = (name || user.displayName || user.email || "?").trim()[0].toUpperCase();
  return user.photoURL && !broken ? (
    <img
      className="avatar"
      src={user.photoURL}
      alt=""
      width={size}
      height={size}
      referrerPolicy="no-referrer"
      onError={() => setBroken(true)}
    />
  ) : (
    <span className="avatar avatar-letter" style={{ width: size, height: size }} aria-hidden="true">
      {letter}
    </span>
  );
}

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.8 6C12.4 13.7 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.5 5.8c4.4-4 6.8-10 6.8-17.2z" />
      <path fill="#FBBC05" d="M10.5 28.7c-.5-1.4-.8-3-.8-4.7s.3-3.3.8-4.7l-7.8-6C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.8-6z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.6-4.2-13.5-9.9l-7.8 6C6.6 42.6 14.6 48 24 48z" />
    </svg>
  );
}

function MetaMaskIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 32 32" aria-hidden="true">
      <path fill="#E2761B" d="M29 3 17.6 11.4l2.1-5z" />
      <path fill="#E4761B" d="m3 3 11.3 8.5-2-5zm21.9 19.6-3 4.6 6.5 1.8 1.9-6.3zM1.7 22.7l1.8 6.3 6.5-1.8-3-4.6z" />
      <path fill="#E4761B" d="m9.6 14.5-1.8 2.7 6.4.3-.2-6.9zm12.8 0-4.5-4-.1 7 6.4-.3zM10 27.2l3.9-1.9-3.3-2.6zm8.1-1.9 3.9 1.9-.6-4.5z" />
      <path fill="#F6851B" d="m24.3 17.2-6.4.3.6 3.3 1-2 2.4 1.1zm-12.7 2.7 2.4-1.1 1 2 .6-3.3-6.4-.3z" />
    </svg>
  );
}
