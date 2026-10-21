import { useState } from "react";
import { Star } from "lucide-react";
import { useWeb3 } from "../web3";
import Modal from "./Modal";

/** Read-only stars, e.g. 4.5 out of 5. */
export function Stars({ value, size = 15 }) {
  return (
    <span className="stars" aria-label={`${value.toFixed(1)} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} size={size} className={value >= i - 0.25 ? "on" : value >= i - 0.75 ? "half" : ""} aria-hidden="true" />
      ))}
    </span>
  );
}

/** Small summary: "★ 4.5 (3)" or "No ratings yet". summary = { sum, count } as BigInt/number. */
export function RatingBadge({ summary, label = "" }) {
  const count = Number(summary?.count ?? 0);
  if (!count) return <span className="rating-badge none">{label ? `${label}: ` : ""}No ratings yet</span>;
  const avg = Number(summary.sum) / count;
  return (
    <span className="rating-badge" title={`${avg.toFixed(1)} from ${count} rating${count === 1 ? "" : "s"}`}>
      {label && <span className="muted">{label}</span>}
      <Star size={14} className="on" aria-hidden="true" />
      <strong>{avg.toFixed(1)}</strong>
      <span className="muted">({count})</span>
    </span>
  );
}

/** Rating form for one lease. `who` = "owner" or "tenant". */
export function RateModal({ leaseId, who, name, onClose }) {
  const { sendTx } = useWeb3();
  const [stars, setStars] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const words = ["", "Poor", "Fair", "Good", "Very good", "Excellent"];
  const shown = hover || stars;

  async function submit(e) {
    e.preventDefault();
    const ok = await sendTx(`Rate the ${who}`, (c) => c.rateLease(leaseId, stars, comment.trim()));
    if (ok) onClose();
  }

  return (
    <Modal title={`Rate the ${who}`} onClose={onClose}>
      <form className="form" onSubmit={submit}>
        <p className="muted small">
          {name ? `${name}. ` : ""}Your rating is saved on the blockchain and can't be changed later. Only people who
          actually shared a lease can rate each other.
        </p>
        <div className="star-input" role="radiogroup" aria-label="Stars" onMouseLeave={() => setHover(0)}>
          {[1, 2, 3, 4, 5].map((i) => (
            <button
              key={i}
              type="button"
              role="radio"
              aria-checked={stars === i}
              aria-label={`${i} star${i > 1 ? "s" : ""}`}
              className={shown >= i ? "on" : ""}
              onMouseEnter={() => setHover(i)}
              onClick={() => setStars(i)}
            >
              <Star size={30} />
            </button>
          ))}
          <span className="star-word">{words[shown]}</span>
        </div>
        <label className="field">
          <span>
            Comment <small>(optional, up to 280 characters)</small>
          </span>
          <textarea
            rows={3}
            maxLength={280}
            value={comment}
            placeholder={who === "owner" ? "How was the home and the owner?" : "How was this tenant?"}
            onChange={(e) => setComment(e.target.value)}
          />
        </label>
        <button className="btn btn-primary btn-block" type="submit" disabled={!stars}>
          Submit rating
        </button>
      </form>
    </Modal>
  );
}
