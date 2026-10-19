import { useEffect, useState } from "react";
import { useWeb3 } from "./web3";
import Header from "./components/Header";
import Home from "./components/Hero";
import FindHome from "./components/Browse";
import Landlord from "./components/Landlord";
import Tenant from "./components/Tenant";
import Admin from "./components/Admin";
import Toasts from "./components/Toasts";
import Verify from "./components/Verify";
import Welcome from "./components/Welcome";
import WithdrawBar from "./components/WithdrawBar";
import { CONTRACT_ADDRESS, CONTRACT_CONFIGURED } from "./config";
import { addrLink, sameAddr, shortAddr } from "./utils";

const TABS = [
  { id: "home", label: "Home" },
  { id: "browse", label: "Find a home" },
  { id: "tenant", label: "My rentals" },
  { id: "landlord", label: "My properties" },
];

export default function App() {
  const { account, readContract, version, verifyOpen, googleUser, googleIdentity, onRightChain, identity, identityReady } =
    useWeb3();
  const [tab, setTabState] = useState(() => {
    const h = location.hash.slice(1);
    return ["home", "browse", "tenant", "landlord", "admin"].includes(h) ? h : "home";
  });
  const setTab = (t) => {
    setTabState(t);
    window.scrollTo({ top: 0 });
  };
  const [owner, setOwner] = useState(null);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    readContract.owner().then(setOwner).catch(() => {});
    readContract.paused().then(setPaused).catch(() => {});
  }, [readContract, version]);

  useEffect(() => {
    history.replaceState(null, "", `#${tab}`);
  }, [tab]);

  // Signed in with Google, wallet connected on Sepolia, and that wallet verified under this Google account.
  const ready =
    !!googleUser && !!account && onRightChain && identityReady && !!identity && identity === googleIdentity.id;

  if (googleUser === undefined) {
    return (
      <div className="splash" aria-label="Loading">
        <img src="/key.svg" alt="" width="44" height="44" />
      </div>
    );
  }
  if (!ready) {
    return (
      <>
        <Welcome />
        <Toasts />
      </>
    );
  }

  const isAdmin = sameAddr(account, owner);
  const tabs = isAdmin ? [...TABS, { id: "admin", label: "Admin" }] : TABS;

  return (
    <>
      <Header tabs={tabs} tab={tab} setTab={setTab} />
      {!CONTRACT_CONFIGURED && (
        <div className="paused-banner" role="status">
          No contract address is set. Deploy the contract, then paste its address into shared/deployment.js.
        </div>
      )}
      {paused && (
        <div className="paused-banner" role="status">
          The platform is paused by the admin. Renting and rent payments are on hold; withdrawals still work.
        </div>
      )}
      <main>
        {tab === "home" && <Home goFind={() => setTab("browse")} goList={() => setTab("landlord")} />}
        {tab === "browse" && <FindHome />}
        {(tab === "tenant" || tab === "landlord" || tab === "admin") && (
          <div className="page">
            {tab !== "admin" && <WithdrawBar />}
            {tab === "tenant" && <Tenant goBrowse={() => setTab("browse")} />}
            {tab === "landlord" && <Landlord />}
            {tab === "admin" && isAdmin && <Admin paused={paused} />}
          </div>
        )}
      </main>
      <footer className="footer">
        <div className="footer-inner">
          <p>
            <strong>RentLedger</strong> · Leases and payments secured on Ethereum (Sepolia)
          </p>
          <a href={addrLink(CONTRACT_ADDRESS)} target="_blank" rel="noreferrer">
            Smart contract {shortAddr(CONTRACT_ADDRESS)}
          </a>
        </div>
      </footer>
      {verifyOpen && <Verify />}
      <Toasts />
    </>
  );
}
