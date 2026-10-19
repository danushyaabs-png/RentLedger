import { useEffect, useRef, useState } from "react";
import { ChevronDown, LogOut } from "lucide-react";
import { useWeb3 } from "../web3";
import { addrLink, shortAddr } from "../utils";
import { Avatar } from "./Welcome";

export default function AccountMenu() {
  const { googleUser, account, isVerified, signOutAll } = useWeb3();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const close = (e) => !ref.current?.contains(e.target) && setOpen(false);
    const esc = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  if (!googleUser) return null;

  return (
    <div className="account" ref={ref}>
      <button
        className="account-btn"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Signed in as ${googleUser.email}`}
        title={googleUser.email}
      >
        <Avatar user={googleUser} size={36} />
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      {open && (
        <div className="account-menu" role="menu">
          <div className="account-head">
            <Avatar user={googleUser} size={44} />
            <div>
              <strong>{googleUser.displayName || "Signed in"}</strong>
              <span>{googleUser.email}</span>
            </div>
          </div>
          <div className="account-row">
            <span className="muted small">Signed in with Google</span>
          </div>
          {account && (
            <div className="account-row">
              <span className="muted small">Wallet</span>
              <a href={addrLink(account)} target="_blank" rel="noreferrer">
                {shortAddr(account)}
              </a>
              {isVerified && <span className="badge badge-listed">Verified</span>}
            </div>
          )}
          <button className="account-signout" role="menuitem" onClick={signOutAll}>
            <LogOut size={16} /> Sign out
          </button>
        </div>
      )}
    </div>
  );
}
