// Home page: hero, trust points and a preview of available homes (no filters).

import { useState } from "react";
import { ArrowRight, Building2, FileText, ShieldCheck, Users } from "lucide-react";
import { useWeb3 } from "../web3";
import { useFavorites, useListings } from "../listings";
import PropertyImage from "./PropertyImage";
import PropertyCard from "./PropertyCard";
import { PropertyDialogs } from "./PropertyModals";

const POINTS = [
  { icon: ShieldCheck, title: "Deposits held in escrow", text: "Security deposits sit in a smart contract, not with the landlord." },
  { icon: FileText, title: "Every payment on record", text: "Rent receipts are written to Ethereum and can't be edited." },
  { icon: Users, title: "Verified people only", text: "Every landlord and tenant is tied to a real Google account." },
];

export default function Home({ goFind, goList }) {
  const { data: homes, loading, isMine } = useListings();
  const { isSaved, toggle } = useFavorites();
  const [viewing, setViewing] = useState(null);
  const featured = homes?.[0];
  const { displayName } = useWeb3();

  return (
    <>
      <section className="home-hero">
        <div className="home-hero-copy">
          {displayName && <p className="hello">Welcome back, {displayName}</p>}
          <span className="eyebrow-pill">Blockchain powered rentals</span>
          <h1>
            Renting, <em>settled</em>
            <br />
            <em>on-chain.</em>
          </h1>
          <p className="lede">
            List a home, sign a lease and pay rent in minutes. Deposits and payments are handled by a smart contract so
            both sides can trust.
          </p>
          <div className="hero-actions">
            <button className="btn btn-primary btn-lg" onClick={goFind}>
              Browse homes <ArrowRight size={18} />
            </button>
            <button className="btn btn-outline btn-lg" onClick={goList}>
              List your property
            </button>
          </div>
        </div>

        <div className="home-hero-visual">
          <div className="hero-photo">
            {featured ? (
              <PropertyImage src={featured.metadataURI} name={featured.name} />
            ) : (
              <div className="hero-photo-empty" aria-hidden="true">
                <Building2 size={72} strokeWidth={1.2} />
              </div>
            )}
          </div>
          <div className="hero-badge">
            <EthIcon />
            <div>
              <strong>Secure rentals</strong>
              <span>Transparent payments</span>
              <span>Built on Ethereum (Sepolia)</span>
            </div>
          </div>
        </div>

        <ul className="trust">
          {POINTS.map(({ icon: Icon, title, text }) => (
            <li key={title}>
              <span className="trust-icon" aria-hidden="true">
                <Icon size={20} />
              </span>
              <div>
                <strong>{title}</strong>
                <span>{text}</span>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="page section">
        <div className="section-head">
          <h2>Explore available homes</h2>
          <button className="link-arrow" onClick={goFind}>
            View all <ArrowRight size={16} />
          </button>
        </div>
        {loading && !homes && <p className="muted">Loading homes…</p>}
        {homes && homes.length === 0 && (
          <div className="empty">
            <p>No homes are listed right now.</p>
            <button className="btn btn-primary" onClick={goList}>
              List your property
            </button>
          </div>
        )}
        <div className="grid">
          {homes?.slice(0, 6).map((p) => (
            <PropertyCard
              key={String(p.id)}
              p={p}
              variant="compact"
              mine={isMine(p)}
              onOpen={() => setViewing(p)}
              saved={isSaved(p.id)}
              onToggleSave={() => toggle(p.id)}
            />
          ))}
        </div>
      </section>

      <PropertyDialogs viewing={viewing} setViewing={setViewing} isMine={isMine} />
    </>
  );
}

function EthIcon() {
  return (
    <svg viewBox="0 0 32 32" width="30" height="30" aria-hidden="true">
      <circle cx="16" cy="16" r="16" fill="#2563EB" />
      <path fill="#fff" fillOpacity=".65" d="M16.5 4v8.9l7.5 3.3z" />
      <path fill="#fff" d="M16.5 4 9 16.2l7.5-3.3z" />
      <path fill="#fff" fillOpacity=".65" d="M16.5 22v6l7.5-10.4z" />
      <path fill="#fff" d="M16.5 28v-6L9 17.6z" />
      <path fill="#fff" fillOpacity=".3" d="m16.5 20.6 7.5-4.4-7.5-3.3z" />
      <path fill="#fff" fillOpacity=".65" d="m9 16.2 7.5 4.4v-7.7z" />
    </svg>
  );
}
