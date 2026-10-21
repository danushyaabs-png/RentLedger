import { useEffect, useRef, useState } from "react";
import { ChevronDown, LogOut, Pencil } from "lucide-react";
import { useWeb3 } from "../web3";
import { addrLink, shortAddr } from "../utils";
import { Avatar } from "./Welcome";
import Modal from "./Modal";

export default function AccountMenu() {
  const { googleUser, account, isVerified, signOutAll, displayName } = useWeb3();
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
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
        <Avatar user={googleUser} size={36} name={displayName} />
        <ChevronDown size={16} aria-hidden="true" />
      </button>
      {open && (
        <div className="account-menu" role="menu">
          <div className="account-head">
            <Avatar user={googleUser} size={44} name={displayName} />
            <div>
              <span className="account-name">
                <strong>{displayName || "Signed in"}</strong>
                <button
                  className="link-btn with-icon"
                  onClick={() => {
                    setOpen(false);
                    setRenaming(true);
                  }}
                >
                  <Pencil size={12} /> Change
                </button>
              </span>
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
      {renaming && <RenameModal onClose={() => setRenaming(false)} />}
    </div>
  );
}

function RenameModal({ onClose }) {
  const { displayName, saveUserName } = useWeb3();
  const [name, setName] = useState(displayName);
  const [busy, setBusy] = useState(false);
  const valid = name.trim().length >= 2;
  return (
    <Modal title="Change your name" onClose={onClose}>
      <form
        className="form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!valid) return;
          setBusy(true);
          await saveUserName(name);
          onClose();
        }}
      >
        <label className="field">
          <span>Your name</span>
          <input autoFocus maxLength={40} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <button className="btn btn-primary btn-block" type="submit" disabled={!valid || busy}>
          Save
        </button>
      </form>
    </Modal>
  );
}
