"use client";
// Local toast stack for mayor actions (M5.7). No library: a small hook plus a fixed
// list. Success toasts carry the arcscan link; error toasts stay until dismissed.
import { useCallback, useRef, useState } from "react";
import { ExternalLink, X } from "lucide-react";
import type { Toast } from "@/lib/mayor";

const SUCCESS_TTL_MS = 8000;

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);
  const dismiss = useCallback((id: number) => {
    setToasts((ts) => ts.filter((t) => t.id !== id));
  }, []);
  const push = useCallback(
    (t: Omit<Toast, "id">) => {
      const id = ++seq.current;
      setToasts((ts) => [...ts.slice(-4), { ...t, id }]);
      if (t.tone === "ok") setTimeout(() => dismiss(id), SUCCESS_TTL_MS);
    },
    [dismiss],
  );
  return { toasts, push, dismiss };
}

export function Toasts({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}) {
  return (
    <div className="toasts" aria-live="polite" aria-relevant="additions">
      {toasts.map((t) => (
        <div
          key={t.id}
          className="toast"
          data-tone={t.tone}
          role={t.tone === "error" ? "alert" : "status"}
        >
          <div className="toast-body">
            <div className="toast-title">{t.title}</div>
            {t.detail ? <div className="toast-detail">{t.detail}</div> : null}
            {t.href ? (
              <a href={t.href} target="_blank" rel="noreferrer" className="toast-link">
                View on arcscan <ExternalLink size={12} aria-hidden="true" />
              </a>
            ) : null}
          </div>
          <button
            type="button"
            className="toast-close"
            aria-label="Dismiss"
            onClick={() => onDismiss(t.id)}
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  );
}
