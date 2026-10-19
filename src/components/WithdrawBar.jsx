import { useWeb3, useContractData } from "../web3";
import { eth } from "../utils";

export default function WithdrawBar() {
  const { account, readContract, sendTx } = useWeb3();
  const { data: balance } = useContractData(() => readContract.pendingWithdrawals(account), [account]);

  if (!balance || balance === 0n) return null;
  return (
    <div className="withdraw-bar">
      <p>
        <strong>{eth(balance, 6)} ETH</strong> is waiting for you in the contract (rent earned or deposit returned).
      </p>
      <button className="btn btn-primary" onClick={() => sendTx("Withdraw to wallet", (c) => c.withdraw())}>
        Withdraw to wallet
      </button>
    </div>
  );
}
