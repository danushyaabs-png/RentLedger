import { useEffect, useState } from "react";
import { formatEther } from "ethers";
import { Eye, EyeOff, Pencil, Plus } from "lucide-react";
import { useWeb3, useContractData } from "../web3";
import {
  DEFAULT_PERIOD,
  LEASE_STATUS,
  REQUEST_STATUS,
  date,
  eth,
  nowSec,
  shortAddr,
  addrLink,
  structs,
  toWei,
} from "../utils";
import { Inr } from "../price";
import PropertyImage from "./PropertyImage";
import PlaceLink from "./PlaceLink";
import PhotoPicker from "./PhotoPicker";
import { isMapsLink, loadMetadata, uploadImage, uploadListingDetails } from "../media";
import Modal from "./Modal";
import ConnectPrompt from "./ConnectPrompt";

export default function Landlord() {
  const { account, readContract, isVerified, openVerify } = useWeb3();
  const [editing, setEditing] = useState(null); // null | "new" | property
  const startListing = () => (isVerified ? setEditing("new") : openVerify());
  const { data, loading, error } = useContractData(async () => {
    if (!account) return [];
    const props = structs(await readContract.getLandlordProperties(account));
    return Promise.all(
      props.map(async (p) => {
        const [leases, requests] = await Promise.all([
          readContract.getPropertyLeases(p.id),
          readContract.getPropertyRequests(p.id),
        ]);
        return { ...p, leases: structs(leases).reverse(), requests: structs(requests).reverse() };
      })
    );
  }, [account]);

  if (!account) return <ConnectPrompt what="manage your properties" />;

  return (
    <section className="section">
      <header className="page-head with-action">
        <div>
          <h1>My properties</h1>
          <p>Properties you have listed. View leases and manage rentals.</p>
        </div>
        <button className="btn btn-primary" onClick={startListing}>
          <Plus size={18} /> List a property
        </button>
      </header>

      {loading && !data && <p className="muted">Loading your properties…</p>}
      {error && <p className="error-text">Couldn't load your properties. Refresh to try again.</p>}
      {data && data.length === 0 && (
        <div className="empty">
          <p>You haven't listed a property yet.</p>
          <button className="btn btn-primary" onClick={startListing}>
            List your first property
          </button>
        </div>
      )}

      <div className="stack">
        {data?.map((p) => (
          <LandlordProperty key={String(p.id)} p={p} onEdit={() => setEditing(p)} />
        ))}
      </div>

      {editing && <PropertyForm property={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </section>
  );
}

function LandlordProperty({ p, onEdit }) {
  const { sendTx } = useWeb3();
  const status = p.isRented ? "Rented" : p.isAvailable ? "Listed" : "Hidden";
  const openRequests = p.requests.filter((r) => Number(r.status) !== 2).length;

  return (
    <article className="lcard">
      <div className="lcard-top">
        <div className="thumb">
          <PropertyImage src={p.metadataURI} name={p.name} />
        </div>
        <div className="lcard-title">
          <h3>{p.name}</h3>
          <PlaceLink location={p.location} uri={p.metadataURI} />
          <dl className="tiles tiles-plain">
            <div>
              <dt>Rent (per month)</dt>
              <dd>
                {eth(p.rentPerMonth)} ETH
                <Inr wei={p.rentPerMonth} />
              </dd>
            </div>
            <div>
              <dt>Deposit</dt>
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
        </div>
        <div className="lcard-status">
          <span className={`badge badge-${status.toLowerCase()}`}>{status}</span>
          {!p.isRented && (
            <div className="lcard-tools">
              <button className="btn btn-outline btn-sm" onClick={onEdit}>
                <Pencil size={14} /> Edit
              </button>
              <button
                className="btn btn-outline btn-sm"
                onClick={() =>
                  sendTx(p.isAvailable ? "Hide listing" : "Show listing", (c) => c.setAvailability(p.id, !p.isAvailable))
                }
              >
                {p.isAvailable ? <EyeOff size={14} /> : <Eye size={14} />} {p.isAvailable ? "Hide" : "Show"}
              </button>
            </div>
          )}
        </div>
      </div>

      {p.leases.length > 0 && (
        <div className="sub">
          <h4>Leases</h4>
          {p.leases.map((l) => (
            <LandlordLease key={String(l.id)} l={l} />
          ))}
        </div>
      )}

      {p.requests.length > 0 && (
        <div className="sub">
          <h4>
            Maintenance requests {openRequests > 0 && <span className="badge badge-hidden">{openRequests} open</span>}
          </h4>
          <ul className="requests">
            {p.requests.map((r) => (
              <li key={String(r.id)}>
                <div>
                  <p>{r.description}</p>
                  <p className="muted small">
                    From {shortAddr(r.tenant)} on {date(r.createdAt)} · {REQUEST_STATUS[Number(r.status)]}
                  </p>
                </div>
                {Number(r.status) < 2 && (
                  <button
                    className="btn btn-outline btn-sm"
                    onClick={() => sendTx("Update request", (c) => c.updateMaintenanceStatus(r.id, Number(r.status) + 1))}
                  >
                    {Number(r.status) === 0 ? "Mark in progress" : "Mark resolved"}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}

function LandlordLease({ l }) {
  const { sendTx } = useWeb3();
  const [settling, setSettling] = useState(false);
  const status = Number(l.status);
  const active = status === 1;
  const fullyPaid = l.monthsPaid >= l.durationMonths;
  const overdue = active && !fullyPaid && nowSec() > Number(l.nextDueDate);
  const inDefault = active && !fullyPaid && nowSec() > Number(l.nextDueDate) + DEFAULT_PERIOD;

  return (
    <div className="lease-row">
      <div className="lease-info">
        <p>
          <a href={addrLink(l.tenant)} target="_blank" rel="noreferrer">
            {shortAddr(l.tenant)}
          </a>{" "}
          · {String(l.monthsPaid)} of {String(l.durationMonths)} months paid ·{" "}
          <span className={`status status-${LEASE_STATUS[status].toLowerCase()}`}>{LEASE_STATUS[status]}</span>
          {overdue && <span className="status status-overdue">Overdue</span>}
        </p>
        <p className="muted small">
          {date(l.startDate)} to {date(l.endDate)}
          {active && !fullyPaid && <> · next rent due {date(l.nextDueDate)}</>}
          {!active && (l.depositSettled ? " · deposit settled" : ` · deposit of ${eth(l.securityDeposit)} ETH held`)}
        </p>
      </div>
      <div className="lease-actions">
        {active && fullyPaid && (
          <button className="btn btn-danger btn-sm" onClick={() => sendTx("Close lease", (c) => c.completeLease(l.id))}>
            Close lease
          </button>
        )}
        {inDefault && (
          <button
            className="btn btn-danger btn-sm"
            onClick={() => sendTx("End lease for non-payment", (c) => c.terminateForNonPayment(l.id))}
          >
            End lease for non-payment
          </button>
        )}
        {!active && !l.depositSettled && (
          <button className="btn btn-primary btn-sm" onClick={() => setSettling(true)}>
            Return deposit
          </button>
        )}
      </div>
      {settling && <SettleDeposit l={l} onClose={() => setSettling(false)} />}
    </div>
  );
}

function SettleDeposit({ l, onClose }) {
  const { sendTx } = useWeb3();
  const [deduction, setDeduction] = useState("0");
  const [reason, setReason] = useState("");
  let dedWei = 0n;
  let err = "";
  try {
    dedWei = toWei(deduction);
    if (dedWei > l.securityDeposit) err = "The deduction can't be more than the deposit.";
  } catch {
    err = "Enter a number, like 0.001";
  }
  if (!err && dedWei > 0n && !reason.trim()) err = "Give a reason for the deduction.";

  async function settle() {
    const ok = await sendTx("Return deposit", (c) =>
      c.settleDeposit(l.id, dedWei, reason.trim() || "No deductions")
    );
    if (ok) onClose();
  }

  return (
    <Modal title="Return deposit" onClose={onClose}>
      <p>
        Deposit held: <strong>{eth(l.securityDeposit, 6)} ETH</strong>
      </p>
      <label className="field">
        <span>Deduct for damages (ETH)</span>
        <input inputMode="decimal" value={deduction} onChange={(e) => setDeduction(e.target.value)} />
      </label>
      <label className="field">
        <span>Reason (shown to the tenant and stored on-chain)</span>
        <input value={reason} maxLength={200} placeholder="No damage" onChange={(e) => setReason(e.target.value)} />
      </label>
      {!err && (
        <p className="small">
          The tenant gets back <strong>{formatEther(l.securityDeposit - dedWei)} ETH</strong>
          {dedWei > 0n && <>, you keep {formatEther(dedWei)} ETH</>}.
        </p>
      )}
      {err && <p className="error-text">{err}</p>}
      <button className="btn btn-primary btn-block" disabled={!!err} onClick={settle}>
        Return deposit
      </button>
    </Modal>
  );
}

function PropertyForm({ property, onClose }) {
  const { sendTx, googleUser } = useWeb3();
  const isEdit = !!property;
  const [f, setF] = useState(() => ({
    name: property?.name ?? "",
    location: property?.location ?? "",
    rent: property ? formatEther(property.rentPerMonth) : "",
    deposit: property ? formatEther(property.securityDeposit) : "",
    lateFee: property ? String(Number(property.lateFeeBps) / 100) : "10",
  }));
  const [photos, setPhotos] = useState([]);
  const [mapLink, setMapLink] = useState("");
  const [loaded, setLoaded] = useState(!isEdit);
  const [busy, setBusy] = useState("");
  const [uploadError, setUploadError] = useState("");
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  // When editing, start from the listing's current photos and pin.
  useEffect(() => {
    if (!isEdit) return;
    loadMetadata(property.metadataURI).then((m) => {
      setPhotos(m.images.map((uri, i) => ({ key: `old-${i}`, uri })));
      setMapLink(m.mapLink || "");
      setLoaded(true);
    });
  }, [isEdit, property]);

  let rentWei, depositWei, feeBps;
  let err = "";
  try {
    rentWei = toWei(f.rent);
    depositWei = toWei(f.deposit);
  } catch {
    err = "Rent and deposit must be numbers, like 0.001";
  }
  feeBps = Math.round(Number(f.lateFee) * 100);
  if (!err) {
    if (!f.name.trim() || !f.location.trim()) err = "Add a name and location.";
    else if (!rentWei || rentWei <= 0n) err = "Rent must be more than 0.";
    else if (!Number.isFinite(feeBps) || feeBps < 0 || feeBps > 2000) err = "Late fee must be between 0 and 20%.";
    else if (mapLink.trim() && !isMapsLink(mapLink)) err = "Paste a Google Maps link, like https://maps.app.goo.gl/…";
  }

  async function submit(e) {
    e.preventDefault();
    if (err || busy) return;
    setUploadError("");
    let metadataURI = "";
    try {
      // 1. Upload new photos to IPFS
      const images = [];
      const fresh = photos.filter((p) => !p.uri).length;
      let n = 0;
      for (const p of photos) {
        if (p.uri) images.push(p.uri);
        else {
          setBusy(`Uploading photo ${++n} of ${fresh}…`);
          images.push(await uploadImage(googleUser, p.data));
        }
      }
      // 2. Save photos + map link as the listing's details on IPFS
      const link = mapLink.trim();
      if (images.length || link) {
        setBusy("Saving listing details…");
        metadataURI = await uploadListingDetails(googleUser, { version: 1, images, mapLink: link });
      }
    } catch (e2) {
      setUploadError(e2.message);
      setBusy("");
      return;
    }
    setBusy("");
    // 3. Record the listing on the blockchain
    const args = [f.name.trim(), f.location.trim(), metadataURI, rentWei, depositWei, feeBps];
    const ok = await sendTx(isEdit ? "Save changes" : "List property", (c) =>
      isEdit ? c.updateProperty(property.id, ...args) : c.listProperty(...args)
    );
    if (ok) onClose();
  }

  return (
    <Modal title={isEdit ? "Edit property" : "List a property"} onClose={onClose} wide>
      {!loaded ? (
        <p className="muted busy">
          <span className="spinner" aria-hidden="true" /> Loading the listing…
        </p>
      ) : (
        <form onSubmit={submit} className="form">
          <label className="field">
            <span>Name</span>
            <input value={f.name} maxLength={100} placeholder="2BHK near Anna Nagar" onChange={set("name")} />
          </label>

          <div className="field">
            <span>Photos</span>
            <PhotoPicker photos={photos} onChange={setPhotos} />
          </div>

          <label className="field">
            <span>Address</span>
            <input value={f.location} maxLength={150} placeholder="Anna Nagar, Chennai, Tamil Nadu" onChange={set("location")} />
          </label>
          <label className="field">
            <span>Google Maps link (optional)</span>
            <input
              type="url"
              value={mapLink}
              placeholder="https://maps.app.goo.gl/…"
              onChange={(e) => setMapLink(e.target.value)}
            />
            <small className="muted">
              In Google Maps, find the house, tap <strong>Share</strong>, then <strong>Copy link</strong> and paste it
              here.
            </small>
          </label>

          <div className="field-row">
            <label className="field">
              <span>Rent per month (ETH)</span>
              <input inputMode="decimal" value={f.rent} placeholder="0.001" onChange={set("rent")} />
              <Inr ethValue={f.rent} className="inr field-inr" />
            </label>
            <label className="field">
              <span>Security deposit (ETH)</span>
              <input inputMode="decimal" value={f.deposit} placeholder="0.002" onChange={set("deposit")} />
              <Inr ethValue={f.deposit} className="inr field-inr" />
            </label>
          </div>
          <label className="field">
            <span>Late fee (% of rent, after a 5-day grace period)</span>
            <input inputMode="decimal" value={f.lateFee} onChange={set("lateFee")} />
          </label>
          {err && <p className="error-text">{err}</p>}
          {uploadError && <p className="error-text">{uploadError}</p>}
          {busy && (
            <p className="small busy">
              <span className="spinner" aria-hidden="true" /> {busy}
            </p>
          )}
          <button className="btn btn-primary btn-block" type="submit" disabled={!!err || !!busy}>
            {isEdit ? "Save changes" : "List property"}
          </button>
        </form>
      )}
    </Modal>
  );
}
