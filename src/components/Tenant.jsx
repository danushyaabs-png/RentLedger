import { useState } from "react";
import { Calendar, ChevronDown, FileText, KeyRound, MessageSquare, Star, Wallet } from "lucide-react";
import { useWeb3, useContractData } from "../web3";
import {
  DEPOSIT_CLAIM_WINDOW,
  GRACE_PERIOD,
  LEASE_STATUS,
  REQUEST_STATUS,
  RENTAL_STATUS,
  addrLink,
  date,
  eth,
  nowSec,
  shortAddr,
  months,
  struct,
  structs,
  txLink,
} from "../utils";
import { Inr } from "../price";
import PropertyImage from "./PropertyImage";
import PlaceLink from "./PlaceLink";
import ConnectPrompt from "./ConnectPrompt";
import { Fact } from "./PropertyCard";
import { useChat } from "./Chat";
import { RateModal } from "./Stars";
import { PayModal } from "./PropertyModals";

export default function Tenant({ goBrowse }) {
  const { account, readContract } = useWeb3();
  const { data, loading, error } = useContractData(async () => {
    if (!account) return [];
    const leases = structs(await readContract.getTenantLeases(account)).reverse();
    return Promise.all(
      leases.map(async (l) => {
        const active = Number(l.status) === 1;
        const [property, payments, requests, due] = await Promise.all([
          readContract.getProperty(l.propertyId),
          readContract.getLeasePayments(l.id),
          readContract.getPropertyRequests(l.propertyId),
          active ? readContract.getAmountDue(l.id) : null,
        ]);
        return {
          ...l,
          property: struct(property),
          payments: structs(payments).reverse(),
          requests: structs(requests).filter((r) => r.leaseId === l.id).reverse(),
          due: due ? { rent: due[0], lateFee: due[1], total: due[2] } : null,
        };
      })
    );
  }, [account]);
  const requests = useContractData(async () => {
    if (!account) return [];
    const list = structs(await readContract.getTenantRentalRequests(account)).reverse();
    const ids = [...new Set(list.map((r) => String(r.propertyId)))];
    const props = Object.fromEntries(
      await Promise.all(ids.map(async (id) => [id, struct(await readContract.getProperty(id))]))
    );
    // Show open requests, plus the most recent closed ones that didn't become a lease
    const open = list.filter((r) => [1, 2].includes(Number(r.status)));
    const closed = list.filter((r) => [3, 4].includes(Number(r.status))).slice(0, 3);
    return [...open, ...closed].map((r) => ({ ...r, property: props[String(r.propertyId)] }));
  }, [account]);

  if (!account) return <ConnectPrompt what="see your rentals" />;

  return (
    <section className="section">
      <header className="page-head">
        <h1>My rentals</h1>
        <p>Properties you are renting. Pay rent, view lease details and track your deposit.</p>
      </header>
      {loading && !data && <p className="muted">Loading your leases…</p>}
      {error && <p className="error-text">Couldn't load your leases. Refresh to try again.</p>}
      {requests.data?.length > 0 && (
        <div className="requests-block">
          <h2>Rental requests</h2>
          <div className="stack">
            {requests.data.map((r) => (
              <TenantRequest key={String(r.id)} r={r} />
            ))}
          </div>
        </div>
      )}
      {data && data.length > 0 && requests.data?.length > 0 && <h2 className="leases-title">Leases</h2>}
      {data && data.length === 0 && !requests.data?.length && (
        <div className="empty">
          <p>You're not renting anything yet.</p>
          <button className="btn btn-primary" onClick={goBrowse}>
            Find a home
          </button>
        </div>
      )}
      <div className="stack">
        {data?.map((l) => (
          <TenantLease key={String(l.id)} l={l} />
        ))}
      </div>
    </section>
  );
}

function TenantRequest({ r }) {
  const { sendTx, account } = useWeb3();
  const { openChat } = useChat();
  const [paying, setPaying] = useState(false);
  const p = r.property;
  const status = Number(r.status);
  const label = RENTAL_STATUS[status];
  return (
    <article className="lcard request-card">
      <div className="request-row">
        <div className="thumb thumb-sm">
          <PropertyImage src={p.metadataURI} name={p.name} />
        </div>
        <div className="grow">
          <h3>{p.name}</h3>
          <p className="muted small">
            {months(r.durationMonths)} · requested {date(r.createdAt)} · pay {eth(p.securityDeposit + p.rentPerMonth, 6)} ETH
            after approval
          </p>
          <p className="small request-hint">
            {status === 1 && "Waiting for the owner to approve."}
            {status === 2 && "Approved! Pay the deposit and first month to start the lease."}
            {status === 3 && "The owner declined this request."}
            {status === 4 && "You cancelled this request."}
          </p>
        </div>
        <span className={`status rstatus-${label.toLowerCase()}`}>{label}</span>
      </div>
      <div className="lcard-actions">
        <button
          className="btn btn-outline btn-sm"
          onClick={() => openChat({ propertyId: Number(r.propertyId), tenant: account, title: p.name })}
        >
          <MessageSquare size={14} /> Message owner
        </button>
        {[1, 2].includes(status) && (
          <button className="btn btn-danger btn-sm" onClick={() => sendTx("Cancel request", (c) => c.cancelRentalRequest(r.id))}>
            Cancel request
          </button>
        )}
        {status === 2 && (
          <button className="btn btn-primary btn-sm" onClick={() => setPaying(true)}>
            Pay {eth(p.securityDeposit + p.rentPerMonth, 6)} ETH and rent
          </button>
        )}
      </div>
      {paying && <PayModal property={p} request={r} onClose={() => setPaying(false)} />}
    </article>
  );
}

function TenantLease({ l }) {
  const { sendTx, readContract, account } = useWeb3();
  const { openChat } = useChat();
  const [rating, setRating] = useState(false);
  const [request, setRequest] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const p = l.property;
  const status = Number(l.status);
  const active = status === 1;
  const fullyPaid = l.monthsPaid >= l.durationMonths;
  const now = nowSec();
  const due = Number(l.nextDueDate);
  const overdue = active && !fullyPaid && now > due;
  const lateFeeApplies = active && !fullyPaid && now > due + GRACE_PERIOD;
  const claimOpensAt = Number(l.closedAt) + DEPOSIT_CLAIM_WINDOW;

  async function payRent() {
    // Re-read the amount right before paying, in case a late fee just kicked in.
    await sendTx("Pay rent", async (c) => {
      const [, , total] = await readContract.getAmountDue(l.id);
      return c.payRent(l.id, { value: total });
    });
  }

  async function raise(e) {
    e.preventDefault();
    const text = request.trim();
    if (!text) return;
    const ok = await sendTx("Send maintenance request", (c) => c.raiseMaintenanceRequest(l.id, text));
    if (ok) setRequest("");
  }

  return (
    <article className="lcard">
      <div className="lcard-top">
        <div className="thumb">
          <PropertyImage src={p.metadataURI} name={p.name} />
        </div>
        <div className="lcard-title">
          <h3>{p.name}</h3>
          <PlaceLink location={p.location} uri={p.metadataURI} />
          <dl className="tiles">
            <div>
              <dt>Rent amount</dt>
              <dd>
                {eth(l.rentPerMonth)} ETH / month
                <Inr wei={l.rentPerMonth} />
              </dd>
            </div>
            <div>
              <dt>Security deposit</dt>
              <dd>
                {eth(l.securityDeposit)} ETH
                <Inr wei={l.securityDeposit} />
              </dd>
            </div>
            <div>
              <dt>Late fee</dt>
              <dd>{Number(l.lateFeeBps) / 100}%</dd>
            </div>
          </dl>
        </div>
        <div className="lcard-status">
          <span className={`status status-${LEASE_STATUS[status].toLowerCase()}`}>{LEASE_STATUS[status]}</span>
          {overdue && <span className="status status-overdue">Overdue</span>}
        </div>
      </div>

      <div className="lcard-meta">
        <Fact
          icon={<KeyRound size={16} />}
          label="Landlord"
          value={
            <a href={addrLink(l.landlord)} target="_blank" rel="noreferrer">
              {shortAddr(l.landlord)}
            </a>
          }
        />
        <Fact icon={<Calendar size={16} />} label="Period" value={`${date(l.startDate)} – ${date(l.endDate)}`} />
        <Fact
          icon={<FileText size={16} />}
          label="Payments"
          value={`${String(l.monthsPaid)} of ${String(l.durationMonths)} months paid`}
        />
        <Fact
          icon={<Wallet size={16} />}
          label="Next payment"
          value={active && !fullyPaid ? date(l.nextDueDate) : "–"}
        />
      </div>

      <div className="meter" aria-hidden="true">
        {Array.from({ length: Number(l.durationMonths) }, (_, i) => (
          <span key={i} className={i < Number(l.monthsPaid) ? "paid" : ""} />
        ))}
      </div>

      {active && !fullyPaid && l.due && (
        <p className={`notice ${lateFeeApplies ? "notice-warn" : ""}`}>
          {lateFeeApplies
            ? `Rent is overdue. ${eth(l.due.lateFee, 6)} ETH late fee included.`
            : overdue
              ? `You're in the 5-day grace period. Pay by ${date(due + GRACE_PERIOD)} to avoid a late fee.`
              : `Next rent of ${eth(l.due.total, 6)} ETH is due ${date(l.nextDueDate)}. You can pay early.`}
        </p>
      )}
      {active && fullyPaid && (
        <p className="notice">Every month is paid. Close the lease so the landlord can return your deposit.</p>
      )}
      {!active && (
        <p className="notice">
          {l.depositSettled
            ? "The deposit has been settled. Withdraw anything owed to you from the bar at the top."
            : now >= claimOpensAt
              ? "The landlord didn't return your deposit within 14 days. You can claim all of it now."
              : `Waiting for the landlord to return your ${eth(l.securityDeposit, 6)} ETH deposit. If they don't by ${date(
                  claimOpensAt
                )}, you can claim it yourself.`}
        </p>
      )}

      <div className="lcard-actions">
        <button className="btn btn-outline btn-sm" onClick={() => setShowHistory((s) => !s)} aria-expanded={showHistory}>
          {showHistory ? "Hide details" : "View details"} <ChevronDown size={15} className={showHistory ? "flip" : ""} />
        </button>
        {active && !fullyPaid && l.due && (
          <button className="btn btn-primary btn-sm" onClick={payRent}>
            Pay rent · {eth(l.due.total, 6)} ETH
          </button>
        )}
        {active && fullyPaid && (
          <button className="btn btn-danger btn-sm" onClick={() => sendTx("Close lease", (c) => c.completeLease(l.id))}>
            Close lease
          </button>
        )}
        <button
          className="btn btn-outline btn-sm"
          onClick={() => openChat({ propertyId: Number(l.propertyId), tenant: account, title: p.name })}
        >
          <MessageSquare size={14} /> Message owner
        </button>
        {l.tenantRated ? (
          <span className="rated-note">
            <Star size={14} /> You rated the owner
          </span>
        ) : (
          <button className="btn btn-outline btn-sm" onClick={() => setRating(true)}>
            <Star size={14} /> Rate owner
          </button>
        )}
        {!active && !l.depositSettled && now >= claimOpensAt && (
          <button className="btn btn-primary btn-sm" onClick={() => sendTx("Claim deposit", (c) => c.claimDeposit(l.id))}>
            Claim {eth(l.securityDeposit, 6)} ETH deposit
          </button>
        )}
      </div>

      {rating && <RateModal leaseId={l.id} who="owner" name={p.name} onClose={() => setRating(false)} />}
      {showHistory && (
        <div className="lcard-more">
          {(active || l.requests.length > 0) && (
            <div className="sub">
              <h4>Maintenance</h4>
              {l.requests.length > 0 && (
                <ul className="requests">
                  {l.requests.map((r) => (
                    <li key={String(r.id)}>
                      <div>
                        <p>{r.description}</p>
                        <p className="muted small">Sent {date(r.createdAt)}</p>
                      </div>
                      <span className={`status status-req-${Number(r.status)}`}>{REQUEST_STATUS[Number(r.status)]}</span>
                    </li>
                  ))}
                </ul>
              )}
              {active && (
                <form className="inline-form" onSubmit={raise}>
                  <input
                    value={request}
                    maxLength={300}
                    placeholder="Describe the problem, e.g. kitchen tap is leaking"
                    onChange={(e) => setRequest(e.target.value)}
                    aria-label="Maintenance request"
                  />
                  <button className="btn btn-outline" type="submit" disabled={!request.trim()}>
                    Send request
                  </button>
                </form>
              )}
            </div>
          )}
          <div className="sub">
            <h4>Payment history</h4>
            <table className="history">
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Paid on</th>
                  <th>Amount</th>
                  <th>Late fee</th>
                </tr>
              </thead>
              <tbody>
                {l.payments.map((pay, i) => (
                  <tr key={i}>
                    <td>{String(pay.monthNumber)}</td>
                    <td>{date(pay.paidAt)}</td>
                    <td>{eth(pay.amount, 6)} ETH</td>
                    <td>{pay.lateFee > 0n ? `${eth(pay.lateFee, 6)} ETH` : "None"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </article>
  );
}
