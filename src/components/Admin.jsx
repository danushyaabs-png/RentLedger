import { useState } from "react";
import { getAddress, isAddress } from "ethers";
import { Building2, Check, Copy, Database, ExternalLink, FileText, Lock, ShieldCheck, Users, Wrench } from "lucide-react";
import { useWeb3, useContractData } from "../web3";
import { CONTRACT_ADDRESS } from "../config";
import { addrLink, eth, sameAddr, shortAddr } from "../utils";
import { Inr } from "../price";
import { readSafe, safeAppUrl } from "../safe";

export default function Admin({ paused, owner, safe }) {
  const { readContract, sendTx, account } = useWeb3();
  const { data } = useContractData(async () => {
    const [fee, escrow, properties, leases, requests, balance, verified] = await Promise.all([
      readContract.platformFeeBps(),
      readContract.totalEscrowedDeposits(),
      readContract.propertyCount(),
      readContract.leaseCount(),
      readContract.requestCount(),
      readContract.runner.provider.getBalance(readContract.target),
      readContract.verifiedAccounts(),
    ]);
    return { fee: Number(fee), escrow, properties, leases, requests, balance, verified };
  }, []);
  const [fee, setFee] = useState("");
  const [proposal, setProposal] = useState(null); // { label, data } to submit through the Safe
  const feeBps = Math.round(Number(fee) * 100);
  const feeValid = fee !== "" && Number.isFinite(feeBps) && feeBps >= 0 && feeBps <= 500;

  // With a Safe as owner, admin changes are proposed in the Safe app and need several approvals.
  const run = (label, method, args = []) => {
    if (safe) {
      setProposal({ label, data: readContract.interface.encodeFunctionData(method, args) });
      return Promise.resolve(false);
    }
    return sendTx(label, (c) => c[method](...args));
  };

  return (
    <section className="section">
      <header className="page-head with-action">
        <h1>Admin</h1>
        <p className="muted small">
          {safe ? "Visible to the signers of the multisig that controls the contract." : "Only the wallet that deployed the contract sees this page."}
        </p>
      </header>

      {data && (
        <div className="stats">
          <Stat icon={Users} label="Verified wallets" value={String(data.verified)} />
          <Stat icon={Building2} label="Properties listed" value={String(data.properties)} />
          <Stat icon={FileText} label="Leases signed" value={String(data.leases)} />
          <Stat icon={Wrench} label="Maintenance requests" value={String(data.requests)} />
          <Stat icon={Lock} label="Deposits held in escrow" value={`${eth(data.escrow, 6)} ETH`} sub={<Inr wei={data.escrow} />} />
          <Stat icon={Database} label="Total ETH in contract" value={`${eth(data.balance, 6)} ETH`} sub={<Inr wei={data.balance} />} />
        </div>
      )}
      {data && <p className="muted small fee-now">Current platform fee on rent: {data.fee / 100}%</p>}

      {safe && <MultisigCard safe={safe} account={account} />}

      <div className="admin-controls">
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (feeValid) run("Set platform fee", "setPlatformFee", [feeBps]).then((ok) => ok && setFee(""));
          }}
        >
          <label className="field grow">
            <span>New platform fee (0 to 5%)</span>
            <input inputMode="decimal" value={fee} placeholder="2" onChange={(e) => setFee(e.target.value)} />
          </label>
          <button className="btn btn-primary" type="submit" disabled={!feeValid}>
            {safe ? "Propose fee" : "Set fee"}
          </button>
        </form>

        <div className="pause-row">
          <p>
            {paused
              ? "The platform is paused. Nobody can list, rent or pay rent until it is resumed."
              : "Pausing stops new listings, rentals and rent payments. Use it if something goes wrong. Withdrawals keep working."}
          </p>
          {paused ? (
            <button className="btn btn-primary" onClick={() => run("Resume platform", "unpause")}>
              {safe ? "Propose resume" : "Resume platform"}
            </button>
          ) : (
            <button className="btn btn-danger" onClick={() => run("Pause platform", "pause")}>
              {safe ? "Propose pause" : "Pause platform"}
            </button>
          )}
        </div>

        {proposal && safe && <SafeProposal proposal={proposal} safe={safe} onClose={() => setProposal(null)} />}
      </div>

      {!safe && sameAddr(account, owner) && <TransferToSafe account={account} run={run} />}
    </section>
  );
}

function MultisigCard({ safe, account }) {
  return (
    <div className="multisig">
      <div className="multisig-head">
        <span className="stat-icon" aria-hidden="true">
          <ShieldCheck size={20} />
        </span>
        <div>
          <h3>
            Protected by a {safe.threshold}-of-{safe.owners.length} multisig
          </h3>
          <p className="muted small">
            Admin changes need approval from {safe.threshold} of these {safe.owners.length} wallets. One stolen key is not
            enough to control the platform.
          </p>
        </div>
        <a className="btn btn-outline btn-sm" href={safeAppUrl(safe.address)} target="_blank" rel="noreferrer">
          Open Safe <ExternalLink size={14} />
        </a>
      </div>
      <dl className="multisig-list">
        <div>
          <dt>Safe address</dt>
          <dd>
            <a href={addrLink(safe.address)} target="_blank" rel="noreferrer">
              {shortAddr(safe.address)}
            </a>
          </dd>
        </div>
        {safe.owners.map((o, i) => (
          <div key={o}>
            <dt>Signer {i + 1}</dt>
            <dd>
              <a href={addrLink(o)} target="_blank" rel="noreferrer">
                {shortAddr(o)}
              </a>
              {sameAddr(o, account) && <span className="badge badge-listed">You</span>}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function SafeProposal({ proposal, safe, onClose }) {
  return (
    <div className="proposal">
      <div className="proposal-head">
        <strong>{proposal.label}: approve it in the Safe</strong>
        <button className="link-btn" onClick={onClose}>
          Close
        </button>
      </div>
      <ol>
        <li>
          Open the Safe, then <b>New transaction → Transaction Builder</b>.
        </li>
        <li>Paste the contract address, turn on <b>Custom data</b>, set value 0 and paste the data below.</li>
        <li>
          Create the batch and sign. {safe.threshold - 1} more signer{safe.threshold - 1 === 1 ? "" : "s"} must approve,
          then anyone can execute it.
        </li>
      </ol>
      <CopyField label="To (contract)" value={CONTRACT_ADDRESS} />
      <CopyField label="Value" value="0" />
      <CopyField label="Data" value={proposal.data} />
      <a className="btn btn-primary btn-sm" href={safeAppUrl(safe.address)} target="_blank" rel="noreferrer">
        Open Safe <ExternalLink size={14} />
      </a>
    </div>
  );
}

function CopyField({ label, value }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="copy-field">
      <span>{label}</span>
      <code>{value}</code>
      <button
        type="button"
        className="round-btn"
        aria-label={`Copy ${label}`}
        onClick={() => {
          navigator.clipboard?.writeText(value).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          });
        }}
      >
        {copied ? <Check size={15} /> : <Copy size={15} />}
      </button>
    </div>
  );
}

/** Hand admin control to a Safe. Checks the address really is a Safe that this wallet signs for. */
function TransferToSafe({ account, run }) {
  const { readContract } = useWeb3();
  const [addr, setAddr] = useState("");
  const [check, setCheck] = useState(null); // { ok, safe?, msg }
  const [agree, setAgree] = useState(false);

  const inspect = async () => {
    setCheck({ busy: true });
    if (!isAddress(addr.trim())) return setCheck({ ok: false, msg: "That isn't a valid address." });
    const safe = await readSafe(readContract.runner.provider, addr.trim());
    if (!safe) return setCheck({ ok: false, msg: "No Safe found at this address on Sepolia. Create the Safe on the Sepolia network first." });
    if (safe.threshold < 2) return setCheck({ ok: false, safe, msg: `This Safe only needs ${safe.threshold} approval. Use at least 2 so one stolen key isn't enough.` });
    if (!safe.owners.some((o) => sameAddr(o, account)))
      return setCheck({ ok: false, safe, msg: "Your current wallet isn't a signer of this Safe. Add it, or you won't see the Admin page any more." });
    setCheck({ ok: true, safe, msg: `Safe found: ${safe.threshold}-of-${safe.owners.length}, and you are a signer.` });
  };

  return (
    <div className="admin-controls transfer">
      <div>
        <h3>Protect admin control with a multisig</h3>
        <p className="muted small">
          Right now one wallet controls pause, fees and the verifier. Hand control to a Safe so that changes need approval
          from several people. Withdrawals and user funds are not affected.
        </p>
      </div>
      <div className="inline-form">
        <label className="field grow">
          <span>Safe address (Sepolia)</span>
          <input
            value={addr}
            placeholder="0x…"
            onChange={(e) => {
              setAddr(e.target.value);
              setCheck(null);
              setAgree(false);
            }}
          />
        </label>
        <button className="btn btn-outline" type="button" onClick={inspect} disabled={!addr || check?.busy}>
          Check Safe
        </button>
      </div>
      {check && !check.busy && <p className={check.ok ? "notice" : "notice notice-warn"}>{check.msg}</p>}
      {check?.ok && (
        <>
          <label className="toggle">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            <span>I understand this wallet will no longer be able to make admin changes on its own.</span>
          </label>
          <div>
            <button
              className="btn btn-primary"
              disabled={!agree}
              onClick={() => run("Transfer admin to Safe", "transferOwnership", [getAddress(addr.trim())])}
            >
              Transfer admin to this Safe
            </button>
          </div>
        </>
      )}
    </div>
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
