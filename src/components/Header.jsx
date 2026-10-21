import { Activity, Building2, CircleCheck, Home, KeyRound, LayoutDashboard, MessageSquare, Search } from "lucide-react";
import { useChat } from "./Chat";
import { useWeb3 } from "../web3";
import { addrLink, shortAddr } from "../utils";
import AccountMenu from "./AccountMenu";

const ICONS = { home: Home, browse: Search, tenant: KeyRound, landlord: Building2, messages: MessageSquare, activity: Activity, admin: LayoutDashboard };

export default function Header({ tabs, tab, setTab }) {
  const { account, isVerified } = useWeb3();
  const unread = useChat()?.unread || 0;

  return (
    <header className="header">
      <div className="header-inner">
        <button className="brand" onClick={() => setTab("home")} aria-label="RentLedger home">
          <KeyIcon />
          <span>RentLedger</span>
        </button>
        <nav className="tabs" aria-label="Sections">
          {tabs.map((t) => {
            const Icon = ICONS[t.id];
            return (
              <button
                key={t.id}
                className={`tab ${tab === t.id ? "active" : ""}`}
                aria-current={tab === t.id ? "page" : undefined}
                onClick={() => setTab(t.id)}
              >
                {Icon && <Icon size={17} aria-hidden="true" />}
                {t.label}
                {t.id === "messages" && unread > 0 && <span className="tab-badge" aria-label={`${unread} unread`}>{unread}</span>}
              </button>
            );
          })}
        </nav>
        <div className="wallet">
          {account && (
            <a className="wallet-chip" href={addrLink(account)} target="_blank" rel="noreferrer" title={account}>
              {isVerified ? <CircleCheck size={18} className="verified-tick" aria-label="Verified" /> : <span className="dot" />}
              {shortAddr(account)}
            </a>
          )}
          <AccountMenu />
        </div>
      </div>
    </header>
  );
}

export function KeyIcon({ size = 28 }) {
  return (
    <svg viewBox="0 0 32 32" width={size} height={size} aria-hidden="true">
      <circle cx="11" cy="16" r="6.5" fill="none" stroke="#60A5FA" strokeWidth="3.2" />
      <path d="M17.5 16H29M25 16v4.5M28.5 16v3.5" stroke="#60A5FA" strokeWidth="3.2" strokeLinecap="round" />
    </svg>
  );
}
