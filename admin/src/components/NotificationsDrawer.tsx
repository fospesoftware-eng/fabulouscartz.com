import { useEffect, useState } from "react";
import { Bell, BellRing, CheckCheck, Package, ShoppingBag, Sparkles, UserPlus } from "lucide-react";
import type { Notification } from "../../shared/types";
import { api } from "../lib/api";
import { useResource } from "../lib/hooks";
import { relative } from "../lib/utils";
import { useUI } from "../context/UIContext";
import { Drawer } from "./overlay";
import { Button, EmptyState, ErrorState, TableSkeleton } from "./ui";
import { useNavigate } from "react-router-dom";

const kindIcon = {
  order: <ShoppingBag size={15} />,
  stock: <Package size={15} />,
  customer: <UserPlus size={15} />,
  system: <Sparkles size={15} />,
};

export function useNotifications() {
  const resource = useResource<{ data: Notification[]; unread: number }>(() => api.get("/notifications"), []);
  return resource;
}

export function NotificationsDrawer() {
  const { notificationsOpen, setNotificationsOpen, notify } = useUI();
  const navigate = useNavigate();
  const { data, loading, error, reload } = useNotifications();
  const [marking, setMarking] = useState(false);

  useEffect(() => {
    if (!notificationsOpen) return;
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notificationsOpen]);

  const markAll = async () => {
    setMarking(true);
    try {
      await api.post("/notifications/read-all");
      await reload();
      window.dispatchEvent(new CustomEvent("fc:notifications-changed"));
      notify({ kind: "success", title: "Notifications cleared", description: "Everything is marked as read." });
    } catch {
      notify({ kind: "error", title: "Could not mark notifications", description: "Please try again." });
    } finally {
      setMarking(false);
    }
  };

  const openNotification = async (entry: Notification) => {
    if (!entry.read) {
      try {
        await api.patch(`/notifications/${entry.id}/read`);
        window.dispatchEvent(new CustomEvent("fc:notifications-changed"));
      } catch {
        /* non-blocking */
      }
    }
    setNotificationsOpen(false);
    navigate(entry.href);
  };

  return (
    <Drawer
      open={notificationsOpen}
      onClose={() => setNotificationsOpen(false)}
      eyebrow="Signals"
      title="Notification desk"
      subtitle={`${data?.unread ?? 0} unread · orders, stock and customer signals`}
      width={430}
      actions={
        <Button variant="ghost" size="sm" icon={<CheckCheck size={14} />} loading={marking} onClick={markAll} disabled={!data?.unread}>
          Mark all
        </Button>
      }
    >
      {loading ? (
        <TableSkeleton rows={5} cols={1} />
      ) : error ? (
        <ErrorState body={error} onRetry={reload} />
      ) : data?.data.length ? (
        <ul className="notification-list">
          {data.data.map((entry) => (
            <li key={entry.id} className={entry.read ? "is-read" : ""}>
              <button type="button" onClick={() => void openNotification(entry)}>
                <span className={`notif-icon notif-${entry.kind}`}>{kindIcon[entry.kind] ?? <Bell size={15} />}</span>
                <span className="notif-copy">
                  <strong>{entry.title}</strong>
                  <span>{entry.body}</span>
                  <em>{relative(entry.at)}</em>
                </span>
                {!entry.read ? <i className="unread-dot" /> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={<BellRing size={22} />} title="All quiet on the floor" body="New order, stock and customer signals will land here." />
      )}
    </Drawer>
  );
}
