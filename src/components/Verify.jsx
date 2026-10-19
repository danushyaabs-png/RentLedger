import { useEffect, useState } from "react";
import { BrowserProvider } from "ethers";
import { useWeb3 } from "../web3";
import { getIdToken, googleReady, signInWithGoogle, signOutGoogle, watchGoogleUser } from "../firebase";
import { linkMessage } from "../../server/verifyCore.js";
import { shortAddr } from "../utils";
import Modal from "./Modal";

export default function Verify() {
  const { account, isVerified, closeVerify, sendTx, connect } = useWeb3();
  const [user, setUser] = useState(undefined); // undefined = loading, null = signed out
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  useEffect(() => watchGoogleUser(setUser), []);

  async function google() {
    setError("");
    try {
      setBusy("Waiting for Google…");
      setUser(await signInWithGoogle());
    } catch (e) {
      if (e?.code !== "auth/popup-closed-by-user" && e?.code !== "auth/cancelled-popup-request") {
        setError(
          e?.code === "auth/unauthorized-domain"
            ? "This website's domain isn't authorised in Firebase yet. Add it under Authentication → Settings → Authorized domains."
            : "Google sign-in didn't complete. Please try again."
        );
      }
    } finally {
      setBusy("");
    }
  }

  async function link() {
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
        body: JSON.stringify({ idToken: await getIdToken(user), address: account, message, signature }),
      });
      const pass = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(pass.error || "Verification failed. Please try again.");

      setBusy("");
      const ok = await sendTx("Verify account", (c) => c.verifyIdentity(pass.identity, pass.expiry, pass.signature));
      if (ok) closeVerify();
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
    <Modal title={isVerified ? "Account verified" : "Verify your account"} onClose={closeVerify}>
      {isVerified ? (
        <>
          <p>
            This wallet ({shortAddr(account)}) is linked to a verified Google account. You can list and rent homes.
          </p>
          <p className="muted small">
            Any other wallet you link with the same Google account is treated as you, so you can't rent your own
            listings from it.
          </p>
          <button className="btn btn-primary btn-block" onClick={closeVerify}>
            Done
          </button>
        </>
      ) : (
        <>
          <p className="muted">
            Link your wallet to your Google account. It takes two steps and one small transaction. Only a scrambled
            fingerprint of your email is stored on the blockchain, never the email itself.
          </p>

          <ol className="steps">
            <li className={user ? "done" : ""}>
              <div>
                <strong>Sign in with Google</strong>
                {user ? (
                  <span className="muted small">
                    Signed in as {user.email}.{" "}
                    <button className="link-btn" onClick={() => signOutGoogle()}>
                      Use another account
                    </button>
                  </span>
                ) : (
                  <span className="muted small">Proves who you are.</span>
                )}
              </div>
              {!user && (
                <button className="btn btn-google" onClick={google} disabled={!googleReady || !!busy || user === undefined}>
                  <GoogleIcon /> Continue with Google
                </button>
              )}
            </li>
            <li>
              <div>
                <strong>Link this wallet</strong>
                <span className="muted small">
                  {account ? `Sign a message with ${shortAddr(account)}, then confirm the transaction.` : "Connect MetaMask first."}
                </span>
              </div>
              {account ? (
                <button className="btn btn-primary" onClick={link} disabled={!user || !!busy}>
                  Link wallet
                </button>
              ) : (
                <button className="btn btn-primary" onClick={connect}>
                  Connect wallet
                </button>
              )}
            </li>
          </ol>

          {!googleReady && (
            <p className="error-text">Google sign-in isn't set up on this website yet (Firebase settings are missing).</p>
          )}
          {busy && (
            <p className="small busy">
              <span className="spinner" aria-hidden="true" /> {busy}
            </p>
          )}
          {error && <p className="error-text">{error}</p>}
        </>
      )}
    </Modal>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.8 6C12.4 13.7 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.5 5.8c4.4-4 6.8-10 6.8-17.2z" />
      <path fill="#FBBC05" d="M10.5 28.7c-.5-1.4-.8-3-.8-4.7s.3-3.3.8-4.7l-7.8-6C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.8-6z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.6-4.2-13.5-9.9l-7.8 6C6.6 42.6 14.6 48 24 48z" />
    </svg>
  );
}
