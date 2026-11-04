import { useEffect } from "react";
import { Bell, BellRing, Package, ShoppingBag, Sparkles, UserPlus } from "lucide-react";
import type { Notification } from "../../shared/types";
import { resources } from "../lib/normalize";
import { useResource } from "../lib/hooks";
import { relative } from "../lib/utils";
import { useUI } from "../context/UIContext";
import { Drawer } from "./overlay";
import { EmptyState, ErrorState, TableSkeleton } from "./ui";
import { useNavigate } from "react-router-dom";

const kindIcon = {
  order: <ShoppingBag size={15} />,
  stock: <Package size={15} />,
  customer: <UserPlus size={15} />,
  system: <Sparkles size={15} />,
};

export function useNotifications() {
  const resource = useResource<{ data: Notification[]; unread: number }>(() => resources.notifications(), []);
  return resource;
}

export function NotificationsDrawer() {
  const { notificationsOpen, setNotificationsOpen } = useUI();
  const navigate = useNavigate();
  const { data, loading, error, reload } = useNotifications();

  useEffect(() => {
    if (!notificationsOpen) return;
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notificationsOpen]);

  const openNotification = async (entry: Notification) => {
    setNotificationsOpen(false);
    navigate(entry.href);
  };

  return (
    <Drawer
      open={notificationsOpen}
      onClose={() => setNotificationsOpen(false)}
      eyebrow="Signals"
      title="Notification desk"
      subtitle={`${data?.unread ?? 0} unsent · email dispatch log from the API`}
      width={430}
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
