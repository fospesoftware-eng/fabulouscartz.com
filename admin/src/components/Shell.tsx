import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  BarChart3,
  Bell,
  BookOpenText,
  Boxes,
  CalendarDays,
  ClipboardList,
  Gem,
  Handshake,
  KeyRound,
  Landmark,
  LayoutDashboard,
  Layers,
  LogOut,
  Menu,
  Moon,
  Scale,
  ScrollText,
  Search,
  Settings2,
  ShoppingBag,
  Store,
  Sun,
  Tag,
  Users,
  Wallet,
  X,
} from "lucide-react";
import type { Role } from "../../shared/types";
import { api } from "../lib/api";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { useUI } from "../context/UIContext";
import { BrandLogo } from "./BrandLogo";
import { NotificationsDrawer } from "./NotificationsDrawer";
import { CommandPalette } from "./CommandPalette";
import { Toaster } from "./Toaster";
import { Avatar, Button, Field, IconButton } from "./ui";
import { Modal } from "./overlay";
import { cn, foldWords } from "../lib/utils";

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  roles?: Role[];
  badgeKey?: "orders" | "stock";
}

const NAV_GROUPS: Array<{ label: string; items: NavItem[] }> = [
  {
    label: "Workspace",
    items: [{ to: "/", label: "Dashboard", icon: <LayoutDashboard size={17} /> }],
  },
  {
    label: "Commerce",
    items: [
      { to: "/orders", label: "Orders", icon: <ShoppingBag size={17} /> },
      { to: "/products", label: "Products", icon: <Gem size={17} /> },
      { to: "/inventory", label: "Inventory", icon: <Boxes size={17} /> },
    ],
  },
  {
    label: "Audience",
    items: [{ to: "/customers", label: "Customers", icon: <Users size={17} />, roles: ["admin", "manager"] }],
  },
  {
    label: "Curation",
    items: [
      { to: "/categories", label: "Categories", icon: <Layers size={17} />, roles: ["admin", "manager"] },
      { to: "/vendors", label: "Vendors", icon: <Store size={17} />, roles: ["admin", "manager"] },
      { to: "/content", label: "Content studio", icon: <BookOpenText size={17} />, roles: ["admin", "manager"] },
      { to: "/discounts", label: "Discounts", icon: <Tag size={17} />, roles: ["admin", "manager"] },
    ],
  },
  {
    label: "Marketplace",
    items: [
      { to: "/sellers", label: "Sellers", icon: <Users size={17} /> },
      { to: "/payouts", label: "Payouts", icon: <Wallet size={17} /> },
      { to: "/listings", label: "Listings", icon: <ClipboardList size={17} /> },
    ],
  },
  {
    label: "Rentals",
    items: [
      { to: "/bookings", label: "Bookings", icon: <Handshake size={17} /> },
      { to: "/calendar", label: "Calendar", icon: <CalendarDays size={17} /> },
      { to: "/deposits", label: "Deposits", icon: <Landmark size={17} /> },
      { to: "/overdue", label: "Overdue", icon: <AlertTriangle size={17} /> },
      { to: "/disputes", label: "Disputes", icon: <Scale size={17} /> },
    ],
  },
  {
    label: "Intelligence",
    items: [
      { to: "/analytics", label: "Analytics", icon: <BarChart3 size={17} />, roles: ["admin", "manager"] },
      { to: "/audit", label: "Audit log", icon: <ScrollText size={17} />, roles: ["admin", "manager"] },
    ],
  },
  {
    label: "System",
    items: [{ to: "/settings", label: "Settings", icon: <Settings2 size={17} />, roles: ["admin"] }],
  },
];

const SECTION_LABEL: Record<string, string> = {
  "/": "Dashboard",
  "/orders": "Orders",
  "/products": "Products",
  "/inventory": "Inventory",
  "/customers": "Customers",
  "/categories": "Categories",
  "/vendors": "Vendors",
  "/content": "Content studio",
  "/discounts": "Discounts",
  "/sellers": "Sellers",
  "/payouts": "Payouts",
  "/listings": "Rental listings",
  "/bookings": "Bookings",
  "/calendar": "Rental calendar",
  "/deposits": "Deposits",
  "/overdue": "Overdue",
  "/disputes": "Disputes",
  "/analytics": "Analytics",
  "/audit": "Audit log",
  "/settings": "Settings",
};

export function Shell() {
  const { user, logout, changePassword } = useAuth();
  const { theme, toggle } = useTheme();
  const { setCommandOpen, setNotificationsOpen, notify } = useUI();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const menuRef = useRef<HTMLDivElement>(null);

  const subsection = SECTION_LABEL[location.pathname] ?? (location.pathname.startsWith("/products") ? "Products" : "Operations");

  useEffect(() => {
    const load = () => {
      api
        .get<{ unread: number }>("/notifications")
        .then((result) => setUnread(result.unread))
        .catch(() => undefined);
    };
    load();
    window.addEventListener("fc:notifications-changed", load);
    return () => window.removeEventListener("fc:notifications-changed", load);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen(true);
      }
      if (event.key === "Escape") {
        setSidebarOpen(false);
        setMenuOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [setCommandOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  useEffect(() => setSidebarOpen(false), [location.pathname]);

  if (!user) return null;

  const visibleGroups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.roles || item.roles.includes(user.role)),
  })).filter((group) => group.items.length > 0);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-left">
          <IconButton label="Open navigation" className="mobile-only" onClick={() => setSidebarOpen(true)}>
            <Menu size={18} />
          </IconButton>
          <BrandLogo />
          <span className="topbar-divider" aria-hidden="true" />
          <div className="topbar-context">
            <span className="topbar-context-label">Operations</span>
            <span className="topbar-context-section">{subsection}</span>
          </div>
        </div>

        <div className="topbar-center">
          <button type="button" className="command-trigger" onClick={() => setCommandOpen(true)}>
            <Search size={15} />
            <span>Search orders, products, people…</span>
            <kbd>⌘K</kbd>
          </button>
          <IconButton label="Open search" className="mobile-only command-trigger-icon" onClick={() => setCommandOpen(true)}>
            <Search size={17} />
          </IconButton>
        </div>

        <div className="topbar-right">
          <span className="role-chip" title={`Signed in as ${user.role}`}>
            <i />
            {foldWords(user.role)}
          </span>
          <IconButton label={`Switch to ${theme === "light" ? "dark" : "light"} theme`} onClick={toggle} className="theme-toggle">
            {theme === "light" ? <Moon size={17} /> : <Sun size={17} />}
          </IconButton>
          <button
            type="button"
            className="bell-btn"
            aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}
            onClick={() => {
              setNotificationsOpen(true);
              window.setTimeout(() => setUnread(0), 2500);
            }}
          >
            <Bell size={17} />
            {unread ? <span className="bell-count">{unread > 9 ? "9+" : unread}</span> : null}
          </button>
          <div className="account" ref={menuRef}>
            <button type="button" className="account-btn" onClick={() => setMenuOpen((open) => !open)} aria-label="Account menu" aria-expanded={menuOpen}>
              <Avatar name={user.name} size={32} tone="emerald" />
              <span className="account-copy">
                <strong>{user.name}</strong>
                <em>{user.title}</em>
              </span>
            </button>
            {menuOpen ? (
              <div className="account-menu">
                <div className="account-menu-head">
                  <Avatar name={user.name} size={38} tone="gold" />
                  <div>
                    <strong>{user.name}</strong>
                    <span>{user.email}</span>
                    <em>{foldWords(user.role)} access</em>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    setPasswordOpen(true);
                  }}
                >
                  <KeyRound size={15} /> Change password
                </button>
                {user.role === "admin" ? (
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      navigate("/settings");
                    }}
                  >
                    <Settings2 size={15} /> Settings
                  </button>
                ) : null}
                <a href="http://localhost:5173" target="_blank" rel="noreferrer">
                  <Store size={15} /> Open storefront
                </a>
                <button
                  type="button"
                  className="account-signout"
                  onClick={() => {
                    setMenuOpen(false);
                    void logout();
                  }}
                >
                  <LogOut size={15} /> Sign out
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      {sidebarOpen ? <div className="sidebar-scrim" onClick={() => setSidebarOpen(false)} aria-hidden="true" /> : null}

      <aside className={cn("sidebar", sidebarOpen && "is-open")}>
        <div className="sidebar-scroll">
          <nav className="side-nav" aria-label="Primary navigation">
            {visibleGroups.map((group) => (
              <div key={group.label} className="side-group">
                <p className="side-label">{group.label}</p>
                {group.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === "/"}
                    className={({ isActive }) => cn("side-link", isActive && "is-active")}
                  >
                    <span className="side-link-icon">{item.icon}</span>
                    <span>{item.label}</span>
                    <i className="side-link-rail" aria-hidden="true" />
                  </NavLink>
                ))}
              </div>
            ))}
          </nav>

          <div className="side-card">
            <div className="side-card-head">
              <span className="live-dot" />
              <span>Storefront live</span>
            </div>
            <p>21 pieces · 6 categories · 11 studio partners</p>
            <a href="http://localhost:5173" target="_blank" rel="noreferrer">
              View storefront <span>↗</span>
            </a>
          </div>
        </div>
        <div className="side-foot">
          <span>Fabulous Cartz</span>
          <span className="mono">OPS 1.0</span>
        </div>
      </aside>

      <main className="main">
        <div className="page-container">
          <Outlet />
        </div>
      </main>

      <CommandPalette />
      <NotificationsDrawer />
      <Toaster />
      <PasswordModal
        open={passwordOpen}
        onClose={() => setPasswordOpen(false)}
        changePassword={changePassword}
        onDone={(message) => notify({ kind: "success", title: "Password updated", description: message })}
      />
    </div>
  );
}

function PasswordModal({
  open,
  onClose,
  changePassword,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  changePassword: (current: string, next: string) => Promise<void>;
  onDone: (message: string) => void;
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      setCurrentPassword("");
      setNewPassword("");
      setConfirm("");
      setError(null);
      setFieldError(null);
    }
  }, [open]);

  const submit = async () => {
    setError(null);
    setFieldError(null);
    if (newPassword !== confirm) {
      setError("The new password and confirmation do not match.");
      return;
    }
    setLoading(true);
    try {
      await changePassword(currentPassword, newPassword);
      onDone("Your new password is active for this account.");
      onClose();
    } catch (cause) {
      const apiCause = cause as { message?: string; fields?: Record<string, string> };
      setError(apiCause.message ?? "Could not update the password.");
      setFieldError(apiCause.fields?.currentPassword ?? apiCause.fields?.newPassword ?? null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Change password"
      description="Rotate your console credentials. The change is audited against your account."
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" loading={loading} onClick={() => void submit()} disabled={!currentPassword || !newPassword || !confirm}>
            Update password
          </Button>
        </>
      }
    >
      <div className="stack-18">
        <Field label="Current password" error={fieldError ?? undefined} required>
          <input className="input" type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" />
        </Field>
        <Field label="New password" hint="At least 10 characters, one uppercase letter and one number." required>
          <input className="input" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" />
        </Field>
        <Field label="Confirm new password" required>
          <input className="input" type="password" value={confirm} onChange={(event) => setConfirm(event.target.value)} autoComplete="new-password" />
        </Field>
        {error ? <p className="form-error">{error}</p> : null}
      </div>
    </Modal>
  );
}
