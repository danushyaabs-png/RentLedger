import { useEffect, useMemo, useState } from "react";
import {
  Activity as ActivityIcon,
  Building2,
  ExternalLink,
  Eye,
  EyeOff,
  FileCheck,
  FileX,
  HandCoins,
  KeyRound,
  Pencil,
  Receipt,
  RefreshCw,
  Settings,
  ShieldCheck,
  Wallet,
  Wrench,
} from "lucide-react";
import { useWeb3, useContractData } from "../web3";
import { DEPLOY_BLOCK } from "../config";
import { addrLink, eth, sameAddr, shortAddr, structs, txLink, REQUEST_STATUS } from "../utils";
import { Inr } from "../price";

const CHUNK = 10_000; // blocks per log query (public RPCs limit the range)
const PAGE = 25;

const FILTERS = [
  { id: "all", label: "All activity" },
  { id: "payments", label: "Payments" },
  { id: "leases", label: "Leases" },
  { id: "listings", label: "Listings" },
  { id: "maintenance", label: "Maintenance" },
  { id: "accounts", label: "Accounts" },
];

/** Read every event the contract has emitted, splitting the block range if the RPC refuses a big one. */
async function fetchLogs(contract, from, to) {
  const out = [];
  const ranges = [];
  for (let start = from; start <= to; start += CHUNK) ranges.push([start, Math.min(start + CHUNK - 1, to)]);
  const getRange = async ([a, b]) => {
    try {
      return await contract.queryFilter("*", a, b);
    } catch (e) {
      if (b - a < 500) throw e;
      const mid = Math.floor((a + b) / 2);
      return [...(await getRange([a, mid])), ...(await getRange([mid + 1, b]))];
    }
  };
  for (let i = 0; i < ranges.length; i += 3) {
    const parts = await Promise.all(ranges.slice(i, i + 3).map(getRange));
    parts.forEach((p) => out.push(...p));
  }
  return out.filter((l) => l.fragment); // only events from our ABI
}

export default function Activity() {
  const { readContract, account } = useWeb3();
  const [nonce, setNonce] = useState(0);
  const [filter, setFilter] = useState("all");
  const [mineOnly, setMineOnly] = useState(false);
  const [shown, setShown] = useState(PAGE);
  const [times, setTimes] = useState({});

  const { data, loading, error } = useContractData(async () => {
    const provider = readContract.runner.provider;
    const latest = await provider.getBlockNumber();
    const [logs, props] = await Promise.all([
      fetchLogs(readContract, Math.max(0, DEPLOY_BLOCK), latest),
      readContract.getAllProperties().then(structs),
    ]);
    return { logs, props };
  }, [nonce]);

  const items = useMemo(() => (data ? buildFeed(data.logs, data.props) : []), [data]);

  const visible = useMemo(() => {
    return items.filter(
      (it) => (filter === "all" || it.group === filter) && (!mineOnly || it.parties.some((a) => sameAddr(a, account)))
    );
  }, [items, filter, mineOnly, account]);
  const page = useMemo(() => visible.slice(0, shown), [visible, shown]);

  // Block timestamps for the rows on screen
  useEffect(() => {
    const provider = readContract.runner.provider;
    const missing = [...new Set(page.map((it) => it.block))].filter((b) => !(b in times));
    if (!missing.length) return;
    let alive = true;
    Promise.all(missing.map((b) => provider.getBlock(b).then((blk) => [b, blk?.timestamp ?? null]).catch(() => [b, null]))).then(
      (pairs) => alive && setTimes((t) => ({ ...t, ...Object.fromEntries(pairs) }))
    );
    return () => {
      alive = false;
    };
  }, [page, readContract, times]);

  useEffect(() => setShown(PAGE), [filter, mineOnly]);

  const stats = useMemo(() => {
    let rent = 0n;
    let leases = 0;
    const txs = new Set();
    for (const it of items) {
      txs.add(it.tx);
      if (it.kind === "RentPaid") rent += it.amount;
      if (it.kind === "LeaseCreated") leases += 1;
    }
    return { rent, leases, txs: txs.size };
  }, [items]);

  return (
    <section className="section">
      <header className="page-head with-action">
        <div>
          <h1>Activity</h1>
          <p>Every action on RentLedger, read straight from the blockchain. Anyone can check each one on Etherscan.</p>
        </div>
        <button className="btn btn-outline" onClick={() => setNonce((n) => n + 1)} disabled={loading}>
          <RefreshCw size={16} /> Refresh
        </button>
      </header>

      <div className="stats stats-3">
        <Stat icon={HandCoins} label="Total rent paid" value={`${eth(stats.rent, 6)} ETH`} sub={<Inr wei={stats.rent} />} />
        <Stat icon={FileCheck} label="Leases signed" value={String(stats.leases)} />
        <Stat icon={ActivityIcon} label="Transactions recorded" value={String(stats.txs)} />
      </div>

      <div className="activity-bar">
        <div className="chips" role="tablist" aria-label="Filter activity">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              role="tab"
              aria-selected={filter === f.id}
              className={`chip ${filter === f.id ? "on" : ""}`}
              onClick={() => setFilter(f.id)}
            >
              {f.label}
            </button>
          ))}
        </div>
        <label className="toggle">
          <input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} />
          <span>Only my activity</span>
        </label>
      </div>

      {loading && !data && <p className="busy"><span className="spinner" /> Reading the blockchain…</p>}
      {error && (
        <div className="empty">
          <p>Couldn't load the activity</p>
          <p className="muted">The public Sepolia node didn't answer. Try Refresh in a moment.</p>
        </div>
      )}
      {data && visible.length === 0 && (
        <div className="empty">
          <p>No activity yet</p>
          <p className="muted">{mineOnly ? "You haven't done anything in this category yet." : "Nothing has happened in this category yet."}</p>
        </div>
      )}

      {page.length > 0 && (
        <ol className="feed">
          {page.map((it) => {
            const Icon = it.icon;
            const ts = times[it.block];
            return (
              <li key={it.key} className={`feed-item tone-${it.tone}`}>
                <span className="feed-icon" aria-hidden="true">
                  <Icon size={18} />
                </span>
                <div className="feed-main">
                  <p className="feed-title">{it.title(account)}</p>
                  <p className="feed-meta">
                    {ts ? <time title={new Date(ts * 1000).toLocaleString("en-IN")}>{ago(ts)}</time> : <span>Block {it.block}</span>}
                    {it.actor && !it.title(account).startsWith(sameAddr(it.actor, account) ? "You" : shortAddr(it.actor)) && (
                      <>
                        {" · "}
                        <a href={addrLink(it.actor)} target="_blank" rel="noreferrer">
                          {sameAddr(it.actor, account) ? "You" : shortAddr(it.actor)}
                        </a>
                      </>
                    )}
                    {it.note && <> · {it.note}</>}
                  </p>
                </div>
                {it.amount !== undefined && it.amount > 0n && (
                  <div className="feed-amount">
                    <strong>{eth(it.amount, 6)} ETH</strong>
                    <Inr wei={it.amount} />
                  </div>
                )}
                <a className="feed-link" href={txLink(it.tx)} target="_blank" rel="noreferrer" aria-label="View on Etherscan" title="View on Etherscan">
                  <ExternalLink size={16} />
                </a>
              </li>
            );
          })}
        </ol>
      )}
      {visible.length > shown && (
        <div className="feed-more">
          <button className="btn btn-outline" onClick={() => setShown((s) => s + PAGE)}>
            Show more ({visible.length - shown} older)
          </button>
        </div>
      )}
      {data && <p className="muted small feed-foot">Showing events since block {DEPLOY_BLOCK.toLocaleString("en-IN")}, when the contract was deployed.</p>}
    </section>
  );
}

function Stat({ icon: Icon, label, value, sub }) {
  return (
    <div className="stat">
      <span className="stat-icon" aria-hidden="true">
        <Icon size={20} />
      </span>
      <div>
        <span className="stat-label">{label}</span>
        <span className="stat-value">{value}</span>
        {sub}
      </div>
    </div>
  );
}

function ago(ts) {
  const s = Math.max(0, Math.floor(Date.now() / 1000) - Number(ts));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)} d ago`;
  return new Date(ts * 1000).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

/** Turn raw contract events into readable feed rows, newest first. */
function buildFeed(logs, props) {
  const propById = new Map(props.map((p) => [String(p.id), p]));
  const lease = new Map(); // leaseId -> { propertyId, tenant, months }
  const requestProp = new Map(); // requestId -> propertyId
  const sorted = [...logs].sort((a, b) => a.blockNumber - b.blockNumber || a.index - b.index);
  for (const l of sorted) {
    if (l.fragment.name === "LeaseCreated") {
      const [leaseId, propertyId, tenant, months] = l.args;
      lease.set(String(leaseId), { propertyId: String(propertyId), tenant, months: Number(months) });
    }
    if (l.fragment.name === "MaintenanceRequested") requestProp.set(String(l.args[0]), String(l.args[1]));
  }
  const name = (pid) => propById.get(String(pid))?.name || `Property #${pid}`;
  const landlordOf = (pid) => propById.get(String(pid))?.landlord;
  const who = (addr, me) => (sameAddr(addr, me) ? "You" : shortAddr(addr));

  const rows = [];
  for (const l of sorted) {
    const a = l.args;
    const base = { key: `${l.transactionHash}-${l.index}`, tx: l.transactionHash, block: l.blockNumber, kind: l.fragment.name };
    let row = null;
    switch (l.fragment.name) {
      case "PropertyListed":
        row = { group: "listings", icon: Building2, tone: "blue", actor: a[1], parties: [a[1]], amount: a[2], note: "rent per month",
          title: (me) => `${who(a[1], me)} listed ${name(a[0])}` };
        break;
      case "PropertyUpdated":
        row = { group: "listings", icon: Pencil, tone: "muted", actor: landlordOf(a[0]), parties: [landlordOf(a[0])],
          title: () => `${name(a[0])} details were updated` };
        break;
      case "AvailabilityChanged":
        row = { group: "listings", icon: a[1] ? Eye : EyeOff, tone: "muted", actor: landlordOf(a[0]), parties: [landlordOf(a[0])],
          title: () => `${name(a[0])} was ${a[1] ? "shown in" : "hidden from"} the marketplace` };
        break;
      case "LeaseCreated":
        row = { group: "leases", icon: KeyRound, tone: "green", actor: a[2], parties: [a[2], landlordOf(a[1])],
          title: (me) => `${who(a[2], me)} rented ${name(a[1])} for ${Number(a[3])} month${Number(a[3]) === 1 ? "" : "s"}` };
        break;
      case "RentPaid": {
        const ls = lease.get(String(a[0]));
        const late = a[3] > 0n;
        row = { group: "payments", icon: Receipt, tone: late ? "amber" : "green", actor: a[1], parties: [a[1], ls && landlordOf(ls.propertyId)],
          amount: a[2], note: late ? `includes ${eth(a[3], 6)} ETH late fee` : undefined,
          title: (me) => `${who(a[1], me)} paid rent for ${ls ? name(ls.propertyId) : `lease #${a[0]}`} · month ${Number(a[4])}${ls ? ` of ${ls.months}` : ""}` };
        break;
      }
      case "LeaseClosed": {
        const ls = lease.get(String(a[0]));
        const done = Number(a[1]) === 2;
        row = { group: "leases", icon: done ? FileCheck : FileX, tone: done ? "blue" : "red", actor: a[2], parties: [a[2], ls?.tenant, ls && landlordOf(ls.propertyId)],
          title: () => `Lease for ${ls ? name(ls.propertyId) : `#${a[0]}`} was ${done ? "completed" : "terminated for non-payment"}` };
        break;
      }
      case "DepositSettled": {
        const ls = lease.get(String(a[0]));
        row = { group: "payments", icon: HandCoins, tone: "blue", actor: ls && landlordOf(ls.propertyId), parties: [ls?.tenant, ls && landlordOf(ls.propertyId)],
          amount: a[1], note: a[2] > 0n ? `${eth(a[2], 6)} ETH kept${a[3] ? `: ${a[3]}` : ""}` : a[3] || undefined,
          title: () => `Deposit for ${ls ? name(ls.propertyId) : `lease #${a[0]}`} returned to the tenant` };
        break;
      }
      case "MaintenanceRequested":
        row = { group: "maintenance", icon: Wrench, tone: "amber", actor: a[2], parties: [a[2], landlordOf(a[1])],
          title: (me) => `${who(a[2], me)} reported a maintenance issue at ${name(a[1])}` };
        break;
      case "MaintenanceStatusUpdated": {
        const pid = requestProp.get(String(a[0]));
        row = { group: "maintenance", icon: Wrench, tone: Number(a[1]) === 2 ? "green" : "muted", actor: pid && landlordOf(pid), parties: [pid && landlordOf(pid)],
          title: () => `Maintenance request #${a[0]}${pid ? ` at ${name(pid)}` : ""} marked ${REQUEST_STATUS[Number(a[1])] || "updated"}` };
        break;
      }
      case "Withdrawal":
        row = { group: "payments", icon: Wallet, tone: "blue", actor: a[0], parties: [a[0]], amount: a[1],
          title: (me) => `${who(a[0], me)} withdrew to ${sameAddr(a[0], me) ? "your" : "their"} wallet` };
        break;
      case "IdentityVerified":
        row = { group: "accounts", icon: ShieldCheck, tone: "green", actor: a[0], parties: [a[0]],
          title: (me) => `${who(a[0], me)} verified ${sameAddr(a[0], me) ? "your" : "a"} wallet with Google` };
        break;
      case "IdentityRevoked":
        row = { group: "accounts", icon: ShieldCheck, tone: "red", actor: a[0], parties: [a[0]],
          title: (me) => `Verification removed for ${who(a[0], me)}` };
        break;
      case "PlatformFeeUpdated":
        row = { group: "accounts", icon: Settings, tone: "muted", parties: [],
          title: () => `Platform fee set to ${Number(a[0]) / 100}%` };
        break;
      case "Paused":
      case "Unpaused":
        row = { group: "accounts", icon: Settings, tone: l.fragment.name === "Paused" ? "red" : "green", parties: [],
          title: () => (l.fragment.name === "Paused" ? "Platform paused by the admin" : "Platform resumed by the admin") };
        break;
      default:
        row = null; // OwnershipTransferred, VerifierUpdated: deployment housekeeping
    }
    if (row) rows.push({ ...base, ...row, parties: row.parties.filter(Boolean) });
  }
  return rows.reverse();
}
