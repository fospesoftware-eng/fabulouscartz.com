import { createContext, useContext, useRef, useState, type ReactNode } from "react";

export interface Toast {
  id: string;
  kind: "success" | "error" | "info";
  title: string;
  description?: string;
  action?: { label: string; run: () => void };
}

interface UIContextValue {
  toasts: Toast[];
  notify: (toast: Omit<Toast, "id">) => string;
  dismiss: (id: string) => void;
  commandOpen: boolean;
  setCommandOpen: (open: boolean) => void;
  notificationsOpen: boolean;
  setNotificationsOpen: (open: boolean) => void;
}

const UIContext = createContext<UIContextValue | null>(null);

export function UIProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [commandOpen, setCommandOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const timers = useRef<Record<string, number>>({});

  const dismiss = (id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    const timer = timers.current[id];
    if (timer) window.clearTimeout(timer);
    delete timers.current[id];
  };

  const notify = (toast: Omit<Toast, "id">) => {
    const id = `toast_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    setToasts((current) => [...current.slice(-3), { ...toast, id }]);
    timers.current[id] = window.setTimeout(() => dismiss(id), toast.kind === "error" ? 6000 : 4200);
    return id;
  };

  return (
    <UIContext.Provider
      value={{ toasts, notify, dismiss, commandOpen, setCommandOpen, notificationsOpen, setNotificationsOpen }}
    >
      {children}
    </UIContext.Provider>
  );
}

export function useUI(): UIContextValue {
  const value = useContext(UIContext);
  if (!value) throw new Error("useUI must be used inside UIProvider");
  return value;
}
