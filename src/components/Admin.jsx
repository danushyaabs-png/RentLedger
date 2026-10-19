import { useState } from "react";
import { Building2, Database, FileText, Lock, Users, Wrench } from "lucide-react";
import { useWeb3, useContractData } from "../web3";
import { eth } from "../utils";

export default function Admin({ paused }) {
  const { readContract, sendTx } = useWeb3();
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
  const feeBps = Math.round(Number(fee) * 100);
  const feeValid = fee !== "" && Number.isFinite(feeBps) && feeBps >= 0 && feeBps <= 500;

  return (
    <section className="section">
      <header className="page-head with-action">
        <h1>Admin</h1>
        <p className="muted small">Only the wallet that deployed the contract sees this page.</p>
      </header>

      {data && (
        <div className="stats">
          <Stat icon={Users} label="Verified wallets" value={String(data.verified)} />
          <Stat icon={Building2} label="Properties listed" value={String(data.properties)} />
          <Stat icon={FileText} label="Leases signed" value={String(data.leases)} />
          <Stat icon={Wrench} label="Maintenance requests" value={String(data.requests)} />
          <Stat icon={Lock} label="Deposits held in escrow" value={`${eth(data.escrow, 6)} ETH`} />
          <Stat icon={Database} label="Total ETH in contract" value={`${eth(data.balance, 6)} ETH`} />
        </div>
      )}
      {data && <p className="muted small fee-now">Current platform fee on rent: {data.fee / 100}%</p>}

      <div className="admin-controls">
        <form
          className="inline-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (feeValid) sendTx("Set platform fee", (c) => c.setPlatformFee(feeBps)).then((ok) => ok && setFee(""));
          }}
        >
          <label className="field grow">
            <span>New platform fee (0 to 5%)</span>
            <input inputMode="decimal" value={fee} placeholder="2" onChange={(e) => setFee(e.target.value)} />
          </label>
          <button className="btn btn-primary" type="submit" disabled={!feeValid}>
            Set fee
          </button>
        </form>

        <div className="pause-row">
          <p>
            {paused
              ? "The platform is paused. Nobody can list, rent or pay rent until you resume it."
              : "Pausing stops new listings, rentals and rent payments. Use it if something goes wrong. Withdrawals keep working."}
          </p>
          {paused ? (
            <button className="btn btn-primary" onClick={() => sendTx("Resume platform", (c) => c.unpause())}>
              Resume platform
            </button>
          ) : (
            <button className="btn btn-danger" onClick={() => sendTx("Pause platform", (c) => c.pause())}>
              Pause platform
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

function Stat({ icon: Icon, label, value }) {
  return (
    <div className="stat">
      <span className="stat-icon" aria-hidden="true">
        <Icon size={20} />
      </span>
      <div>
        <span className="stat-label">{label}</span>
        <span className="stat-value">{value}</span>
      </div>
    </div>
  );
}
