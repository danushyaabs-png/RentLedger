import { useWeb3 } from "../web3";

export default function Toasts() {
  const { toasts, dismissToast } = useWeb3();
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast-${t.kind}`}>
          <div className="toast-head">
            {t.kind === "pending" && <span className="spinner" aria-hidden="true" />}
            <strong>{t.title}</strong>
            <button className="toast-x" onClick={() => dismissToast(t.id)} aria-label="Dismiss">
              ×
            </button>
          </div>
          <p>{t.body}</p>
          {t.link && (
            <a href={t.link} target="_blank" rel="noreferrer">
              View on Etherscan
            </a>
          )}
        </div>
      ))}
    </div>
  );
}
