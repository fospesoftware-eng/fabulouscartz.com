import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { useUI } from "../context/UIContext";

export function Toaster() {
  const { toasts, dismiss } = useUI();
  if (!toasts.length) return null;
  return (
    <div className="toaster" aria-live="polite" aria-atomic="false">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast toast-${toast.kind}`} role="status">
          <span className="toast-icon">
            {toast.kind === "success" ? <CheckCircle2 size={17} /> : toast.kind === "error" ? <AlertTriangle size={17} /> : <Info size={17} />}
          </span>
          <div className="toast-copy">
            <strong>{toast.title}</strong>
            {toast.description ? <p>{toast.description}</p> : null}
            {toast.action ? (
              <button
                type="button"
                className="toast-action"
                onClick={() => {
                  toast.action?.run();
                  dismiss(toast.id);
                }}
              >
                {toast.action.label}
              </button>
            ) : null}
          </div>
          <button type="button" className="toast-close" aria-label="Dismiss notification" onClick={() => dismiss(toast.id)}>
            <X size={13} />
          </button>
          <span className="toast-progress" />
        </div>
      ))}
    </div>
  );
}
