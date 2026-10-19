import { useEffect, useRef } from "react";

export default function Modal({ title, onClose, children, wide = false }) {
  const ref = useRef(null);
  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog ref={ref} className={`modal${wide ? " modal-wide" : ""}`} onCancel={onClose} onClick={(e) => e.target === ref.current && onClose()}>
      <div className="modal-body">
        <div className="modal-head">
          <h2>{title}</h2>
          <button className="toast-x" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
