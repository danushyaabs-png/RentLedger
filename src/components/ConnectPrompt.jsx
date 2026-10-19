import { useWeb3 } from "../web3";

export default function ConnectPrompt({ what }) {
  const { connect, hasWallet } = useWeb3();
  return (
    <section className="section">
      <div className="empty">
        <p>Connect your wallet to {what}.</p>
        <p className="muted">Your wallet address is your account. There's no sign-up or password.</p>
        <button className="btn btn-primary" onClick={connect}>
          {hasWallet ? "Connect wallet" : "Install MetaMask"}
        </button>
      </div>
    </section>
  );
}
