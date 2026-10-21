import { useState } from "react";
import { CheckCircle2, ChevronLeft, ChevronRight, Clock, ExternalLink, MessageSquare } from "lucide-react";
import { useWeb3, useContractData } from "../web3";
import { date, eth, months, shortAddr, structs } from "../utils";
import { Inr } from "../price";
import { mapUrl, useMetadata } from "../media";
import PropertyImage from "./PropertyImage";
import PlaceLink from "./PlaceLink";
import IpfsImage from "./IpfsImage";
import Modal from "./Modal";
import { useChat } from "./Chat";
import { RatingBadge, Stars } from "./Stars";

/** Opens the details window, and the request / pay windows from it. Render once per page. */
export function PropertyDialogs({ viewing, setViewing, isMine }) {
  const { account, readContract, isVerified, openVerify } = useWeb3();
  const { openChat } = useChat();
  const [requesting, setRequesting] = useState(null);
  const [paying, setPaying] = useState(null); // { property, request }
  const { data: myRequests } = useContractData(
    async () => (account ? structs(await readContract.getTenantRentalRequests(account)) : []),
    [account]
  );

  // Latest request I made for this property (an open one wins)
  const requestFor = (p) => {
    const mine = (myRequests || []).filter((r) => r.propertyId === p.id);
    return mine.find((r) => [1, 2].includes(Number(r.status))) || mine[mine.length - 1] || null;
  };
  const message = (p) => {
    setViewing(null);
    openChat({ propertyId: Number(p.id), tenant: account, title: p.name });
  };

  return (
    <>
      {viewing && (
        <PropertyDetails
          property={viewing}
          mine={isMine(viewing)}
          request={requestFor(viewing)}
          onClose={() => setViewing(null)}
          onRequest={() => {
            if (!isVerified) return openVerify();
            setRequesting(viewing);
            setViewing(null);
          }}
          onPay={(request) => {
            setPaying({ property: viewing, request });
            setViewing(null);
          }}
          onMessage={() => message(viewing)}
        />
      )}
      {requesting && <RequestModal property={requesting} onClose={() => setRequesting(null)} />}
      {paying && <PayModal property={paying.property} request={paying.request} onClose={() => setPaying(null)} />}
    </>
  );
}

function PropertyDetails({ property: p, mine, request, onClose, onRequest, onPay, onMessage }) {
  const { sendTx } = useWeb3();
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
          <dd>
            {eth(p.rentPerMonth)} ETH / month
            <Inr wei={p.rentPerMonth} />
          </dd>
        </div>
        <div>
          <dt>Security deposit</dt>
          <dd>
            {eth(p.securityDeposit)} ETH
            <Inr wei={p.securityDeposit} />
          </dd>
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
      <OwnerReviews landlord={p.landlord} />

      {mine ? (
        <p className="note">This is your listing.</p>
      ) : (
        <RequestActions request={request} onRequest={onRequest} onPay={onPay} onMessage={onMessage} sendTx={sendTx} />
      )}
    </Modal>
  );
}

function RequestActions({ request, onRequest, onPay, onMessage, sendTx }) {
  const status = request ? Number(request.status) : 0;
  const cancel = () => sendTx("Cancel request", (c) => c.cancelRentalRequest(request.id));
  return (
    <div className="request-box">
      {status === 1 && (
        <p className="notice">
          <Clock size={15} /> Request sent for {months(request.durationMonths)}. Waiting for the owner to approve it.
        </p>
      )}
      {status === 2 && (
        <p className="notice notice-ok">
          <CheckCircle2 size={15} /> The owner approved your request. Pay the deposit and first month to move in.
        </p>
      )}
      {status === 3 && <p className="notice notice-warn">The owner declined your last request. You can send a new one.</p>}
      <div className="request-buttons">
        {status === 2 ? (
          <button className="btn btn-primary btn-lg grow" onClick={() => onPay(request)}>
            Pay and start lease
          </button>
        ) : status === 1 ? (
          <button className="btn btn-outline btn-lg grow" onClick={cancel}>
            Cancel request
          </button>
        ) : (
          <button className="btn btn-primary btn-lg grow" onClick={onRequest}>
            Request to rent
          </button>
        )}
        <button className="btn btn-outline btn-lg" onClick={onMessage}>
          <MessageSquare size={17} /> Message owner
        </button>
      </div>
      {status === 2 && (
        <button className="link-btn small" onClick={cancel}>
          Cancel this request instead
        </button>
      )}
    </div>
  );
}

/** Owner's rating and latest reviews, from real leases only. */
function OwnerReviews({ landlord }) {
  const { readContract } = useWeb3();
  const { data } = useContractData(async () => {
    const [summary, list] = await Promise.all([readContract.getRatingSummary(landlord), readContract.getRatingsOf(landlord)]);
    return { summary: { sum: summary[0], count: summary[1] }, list: structs(list).filter((r) => r.byTenant).reverse() };
  }, [landlord]);
  if (!data) return null;
  return (
    <div className="reviews">
      <div className="reviews-head">
        <h4>Owner rating</h4>
        <RatingBadge summary={data.summary} />
      </div>
      {data.list.length > 0 ? (
        <ul>
          {data.list.slice(0, 3).map((r, i) => (
            <li key={i}>
              <Stars value={Number(r.stars)} size={13} />
              {r.comment ? <p>{r.comment}</p> : <p className="muted">No comment</p>}
              <span className="muted small">
                Tenant {shortAddr(r.from)} · {date(r.createdAt)}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted small">No tenant has rated this owner yet. Ratings can only come from people who rented from them.</p>
      )}
    </div>
  );
}

function RequestModal({ property: p, onClose }) {
  const { sendTx, account } = useWeb3();
  const { send } = useChat();
  const [months, setMonths] = useState(6);
  const [note, setNote] = useState("");
  const valid = Number.isInteger(months) && months >= 1 && months <= 60;

  async function request() {
    const ok = await sendTx(`Request ${p.name}`, (c) => c.requestRental(p.id, months));
    if (!ok) return;
    if (note.trim()) {
      try {
        await send({ propertyId: Number(p.id), tenant: account }, note.trim());
      } catch {
        /* the request itself went through; chat can be retried from Messages */
      }
    }
    onClose();
  }

  return (
    <Modal title={`Request ${p.name}`} onClose={onClose}>
      <p className="muted small">
        Nothing is paid now. The owner reviews your request (and your rating as a tenant). Once they approve it, you
        pay the deposit and first month from My rentals.
      </p>
      <label className="field">
        <span>Lease length (months)</span>
        <input type="number" min="1" max="60" value={months} onChange={(e) => setMonths(parseInt(e.target.value, 10) || 0)} />
      </label>
      <label className="field">
        <span>
          Message to the owner <small>(optional)</small>
        </span>
        <textarea
          rows={3}
          maxLength={1000}
          value={note}
          placeholder="Hi! I'm interested in your home. When can I visit?"
          onChange={(e) => setNote(e.target.value)}
        />
      </label>
      <table className="summary">
        <tbody>
          <tr>
            <td>Pay after approval</td>
            <td>
              {eth(p.securityDeposit + p.rentPerMonth, 6)} ETH
              <Inr wei={p.securityDeposit + p.rentPerMonth} />
            </td>
          </tr>
        </tbody>
      </table>
      <button className="btn btn-primary btn-block btn-lg" disabled={!valid} onClick={request}>
        Send request
      </button>
    </Modal>
  );
}

export function PayModal({ property: p, request, onClose }) {
  const { sendTx, account } = useWeb3();
  const total = p.securityDeposit + p.rentPerMonth;

  async function pay() {
    const ok = await sendTx(`Rent ${p.name}`, async (c) => {
      const balance = await c.runner.provider.getBalance(account);
      if (balance <= total) {
        throw new Error(
          `This account has ${eth(balance, 6)} ETH, but renting needs ${eth(total, 6)} ETH plus a small gas fee. Send more Sepolia ETH to it first.`
        );
      }
      return c.rentProperty(request.id, { value: total });
    });
    if (ok) onClose();
  }

  return (
    <Modal title={`Rent ${p.name}`} onClose={onClose}>
      <p className="notice notice-ok">
        <CheckCircle2 size={15} /> Approved by the owner for {months(request.durationMonths)}.
      </p>
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
            <td>
              {eth(total, 6)} ETH
              <Inr wei={total} />
            </td>
          </tr>
        </tbody>
      </table>
      <p className="muted small">
        After this you'll pay {eth(p.rentPerMonth, 6)} ETH every 30 days from My rentals. Payments more than 5 days late
        add a {Number(p.lateFeeBps) / 100}% fee. A small network fee applies to each transaction.
      </p>
      <button className="btn btn-primary btn-block btn-lg" onClick={pay}>
        Pay {eth(total, 6)} ETH and rent
      </button>
    </Modal>
  );
}
