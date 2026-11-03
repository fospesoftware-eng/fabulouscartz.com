import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Button, IconButton } from "./ui";
import { cn } from "../lib/utils";

function useOverlayBehaviour(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);
}

export function Drawer({
  open,
  onClose,
  title,
  eyebrow,
  subtitle,
  actions,
  children,
  width = 520,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  eyebrow?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  width?: number;
  footer?: ReactNode;
}) {
  useOverlayBehaviour(open, onClose);
  if (!open) return null;

  return createPortal(
    <div className="overlay-root">
      <div className="overlay-scrim" onClick={onClose} aria-hidden="true" />
      <aside className="drawer" style={{ maxWidth: `min(${width}px, 100vw)` }} role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : "Details"}>
        <header className="drawer-head">
          <div className="drawer-head-copy">
            {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
            <h2>{title}</h2>
            {subtitle ? <p className="drawer-sub">{subtitle}</p> : null}
          </div>
          <div className="row" style={{ gap: 6 }}>
            {actions}
            <IconButton label="Close panel" onClick={onClose}>
              <X size={17} />
            </IconButton>
          </div>
        </header>
        <div className="drawer-body">{children}</div>
        {footer ? <footer className="drawer-foot">{footer}</footer> : null}
      </aside>
    </div>,
    document.body,
  );
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  useOverlayBehaviour(open, onClose);
  if (!open) return null;

  return createPortal(
    <div className="overlay-root overlay-center">
      <div className="overlay-scrim" onClick={onClose} aria-hidden="true" />
      <div className={cn("modal", `modal-${size}`)} role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : "Dialog"}>
        <header className="modal-head">
          <div>
            <h2>{title}</h2>
            {description ? <p>{description}</p> : null}
          </div>
          <IconButton label="Close dialog" onClick={onClose}>
            <X size={16} />
          </IconButton>
        </header>
        <div className="modal-body">{children}</div>
        {footer ? <footer className="modal-foot">{footer}</footer> : null}
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  body,
  confirmLabel = "Confirm",
  tone = "primary",
  loading,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  body: string;
  confirmLabel?: string;
  tone?: "primary" | "danger" | "gold";
  loading?: boolean;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant={tone} loading={loading} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="confirm-copy">{body}</p>
    </Modal>
  );
}
