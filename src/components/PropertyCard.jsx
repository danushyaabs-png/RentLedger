import { ArrowRight, Heart, Percent, Receipt } from "lucide-react";
import { eth } from "../utils";
import { Inr } from "../price";
import { RatingBadge } from "./Stars";
import PropertyImage from "./PropertyImage";
import PlaceLink from "./PlaceLink";

/**
 * Listing card.  variant "compact" (Home page: arrow button) or "full" (Find a home: View details button).
 */
export default function PropertyCard({ p, variant = "full", onOpen, saved, onToggleSave, mine }) {
  return (
    <article className="pcard">
      <div className="pcard-media">
        <button className="pcard-img" onClick={onOpen} aria-label={`View ${p.name}`}>
          <PropertyImage src={p.metadataURI} name={p.name} showCount />
        </button>
        {onToggleSave && (
          <button
            className={`heart ${saved ? "on" : ""}`}
            onClick={onToggleSave}
            aria-pressed={saved}
            aria-label={saved ? "Remove from saved" : "Save home"}
          >
            <Heart size={18} />
          </button>
        )}
        {mine && <span className="pcard-flag">Your listing</span>}
      </div>
      <div className="pcard-body">
        <p className="price">
          <strong>{eth(p.rentPerMonth)} ETH</strong> <span>/ month</span>
          <Inr wei={p.rentPerMonth} className="inr price-inr" />
        </p>
        <h3>
          <button className="title-btn" onClick={onOpen}>
            {p.name}
          </button>
        </h3>
        <PlaceLink location={p.location} uri={p.metadataURI} />
        {p.ownerRating && (
          <div className="pcard-rating">
            <RatingBadge summary={p.ownerRating} label="Owner" />
          </div>
        )}
        <div className="pcard-facts">
          <Fact icon={<Receipt size={16} />} label="Deposit" value={`${eth(p.securityDeposit)} ETH`} />
          <Fact icon={<Percent size={16} />} label="Late fee" value={`${Number(p.lateFeeBps) / 100}%`} />
          {variant === "compact" && (
            <button className="round-btn" onClick={onOpen} aria-label={`View ${p.name}`}>
              <ArrowRight size={16} />
            </button>
          )}
        </div>
        {variant === "full" && (
          <button className="btn btn-outline btn-block" onClick={onOpen}>
            View details <ArrowRight size={16} />
          </button>
        )}
      </div>
    </article>
  );
}

export function Fact({ icon, label, value }) {
  return (
    <div className="fact">
      <span className="fact-icon" aria-hidden="true">
        {icon}
      </span>
      <div>
        <span className="fact-label">{label}</span>
        <span className="fact-value">{value}</span>
      </div>
    </div>
  );
}
