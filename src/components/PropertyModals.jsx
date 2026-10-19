import { useState } from "react";
import { ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { useWeb3 } from "../web3";
import { eth, shortAddr } from "../utils";
import { mapUrl, useMetadata } from "../media";
import PropertyImage from "./PropertyImage";
import PlaceLink from "./PlaceLink";
import IpfsImage from "./IpfsImage";
import Modal from "./Modal";

/** Opens the details window, and the rent window from it. Render once per page. */
export function PropertyDialogs({ viewing, setViewing, isMine }) {
  const [renting, setRenting] = useState(null);
  return (
    <>
      {viewing && (
        <PropertyDetails
          property={viewing}
          mine={isMine(viewing)}
          onClose={() => setViewing(null)}
          onRent={() => {
            setRenting(viewing);
            setViewing(null);
          }}
        />
      )}
      {renting && <RentModal property={renting} onClose={() => setRenting(null)} />}
    </>
  );
}

function PropertyDetails({ property: p, mine, onClose, onRent }) {
  const meta = useMetadata(p.metadataURI);
  const [index, setIndex] = useState(0);
  const images = meta.images;
  const current = images[Math.min(index, images.length - 1)];

  return (
    <Modal title={p.name} onClose={onClose} wide>
      <div className="gallery">
        <div className="gallery-main">
          {current ? <IpfsImage uri={current} alt={`${p.name}, photo ${index + 1}`} /> : <PropertyImage src="" name={p.name} />}
          {images.length > 1 && (
            <>
              <button className="gallery-nav prev" onClick={() => setIndex((index - 1 + images.length) % images.length)} aria-label="Previous photo">
                <ChevronLeft size={22} />
              </button>
              <button className="gallery-nav next" onClick={() => setIndex((index + 1) % images.length)} aria-label="Next photo">
                <ChevronRight size={22} />
              </button>
              <span className="photo-count">
                {index + 1} / {images.length}
              </span>
            </>
          )}
        </div>
        {images.length > 1 && (
          <div className="gallery-thumbs">
            {images.map((img, i) => (
              <button key={img + i} className={i === index ? "active" : ""} onClick={() => setIndex(i)} aria-label={`Photo ${i + 1}`}>
                <IpfsImage uri={img} loading="lazy" />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="details-place">
        <PlaceLink location={p.location} uri={p.metadataURI} />
        <a className="btn btn-outline btn-sm" href={mapUrl({ ...meta, location: p.location })} target="_blank" rel="noreferrer">
          Open in Google Maps <ExternalLink size={14} />
        </a>
      </div>

      <dl className="tiles">
        <div>
          <dt>Rent</dt>
          <dd>{eth(p.rentPerMonth)} ETH / month</dd>
        </div>
        <div>
          <dt>Security deposit</dt>
          <dd>{eth(p.securityDeposit)} ETH</dd>
        </div>
        <div>
          <dt>Late fee</dt>
          <dd>{Number(p.lateFeeBps) / 100}%</dd>
        </div>
        <div>
          <dt>Landlord</dt>
          <dd>{shortAddr(p.landlord)}</dd>
        </div>
      </dl>
      {mine ? (
        <p className="note">This is your listing.</p>
      ) : (
        <button className="btn btn-primary btn-block btn-lg" onClick={onRent}>
          Rent this home
        </button>
      )}
    </Modal>
  );
}

function RentModal({ property: p, onClose }) {
  const { sendTx, account } = useWeb3();
  const [months, setMonths] = useState(6);
  const total = p.securityDeposit + p.rentPerMonth;
  const valid = Number.isInteger(months) && months >= 1 && months <= 60;

  async function rent() {
    const ok = await sendTx(`Rent ${p.name}`, async (c) => {
      const balance = await c.runner.provider.getBalance(account);
      if (balance <= total) {
        throw new Error(
          `This account has ${eth(balance, 6)} ETH, but renting needs ${eth(total, 6)} ETH plus a small gas fee. Send more Sepolia ETH to it first.`
        );
      }
      return c.rentProperty(p.id, months, { value: total });
    });
    if (ok) onClose();
  }

  return (
    <Modal title={`Rent ${p.name}`} onClose={onClose}>
      <label className="field">
        <span>Lease length (months)</span>
        <input type="number" min="1" max="60" value={months} onChange={(e) => setMonths(parseInt(e.target.value, 10) || 0)} />
      </label>
      <table className="summary">
        <tbody>
          <tr>
            <td>Security deposit (held in escrow)</td>
            <td>{eth(p.securityDeposit, 6)} ETH</td>
          </tr>
          <tr>
            <td>First month's rent</td>
            <td>{eth(p.rentPerMonth, 6)} ETH</td>
          </tr>
          <tr className="total">
            <td>Pay now</td>
            <td>{eth(total, 6)} ETH</td>
          </tr>
        </tbody>
      </table>
      <p className="muted small">
        After this you'll pay {eth(p.rentPerMonth, 6)} ETH every 30 days from My rentals. Payments more than 5 days late
        add a {Number(p.lateFeeBps) / 100}% fee. A small network fee applies to each transaction.
      </p>
      <button className="btn btn-primary btn-block btn-lg" disabled={!valid} onClick={rent}>
        Pay {eth(total, 6)} ETH and rent
      </button>
    </Modal>
  );
}
