import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  ArrowRight,
  BarChart3,
  BookOpenText,
  Box,
  Boxes,
  Command,
  CornerDownLeft,
  Download,
  Gem,
  LayoutDashboard,
  Layers,
  LogOut,
  Plus,
  ScrollText,
  Search,
  Settings2,
  ShoppingBag,
  Store,
  Tag,
  Users,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { Role, SearchResult } from "../../shared/types";
import { api, downloadCsv } from "../lib/api";
import { useDebounced } from "../lib/hooks";
import { useAuth } from "../context/AuthContext";
import { useUI } from "../context/UIContext";
import { useTheme } from "../context/ThemeContext";
import { foldWords } from "../lib/utils";

interface PaletteItem {
  id: string;
  label: string;
  hint?: string;
  group: string;
  icon: ReactNode;
  run: () => void | Promise<void>;
  roles?: Role[];
}

const PAGES: Array<{ path: string; label: string; icon: ReactNode; roles?: Role[] }> = [
  { path: "/", label: "Dashboard", icon: <LayoutDashboard size={16} /> },
  { path: "/orders", label: "Orders", icon: <ShoppingBag size={16} /> },
  { path: "/products", label: "Products", icon: <Gem size={16} /> },
  { path: "/inventory", label: "Inventory", icon: <Boxes size={16} /> },
  { path: "/customers", label: "Customers", icon: <Users size={16} />, roles: ["admin", "manager"] },
  { path: "/categories", label: "Categories", icon: <Layers size={16} />, roles: ["admin", "manager"] },
  { path: "/vendors", label: "Vendors", icon: <Store size={16} />, roles: ["admin", "manager"] },
  { path: "/content", label: "Content studio", icon: <BookOpenText size={16} />, roles: ["admin", "manager"] },
  { path: "/discounts", label: "Discounts", icon: <Tag size={16} />, roles: ["admin", "manager"] },
  { path: "/analytics", label: "Analytics", icon: <BarChart3 size={16} />, roles: ["admin", "manager"] },
  { path: "/audit", label: "Audit log", icon: <ScrollText size={16} />, roles: ["admin", "manager"] },
  { path: "/settings", label: "Settings", icon: <Settings2 size={16} />, roles: ["admin"] },
];

export function CommandPalette() {
  const { commandOpen, setCommandOpen, notify } = useUI();
  const { user, logout } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [results, setResults] = useState<SearchResult | null>(null);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounced = useDebounced(query, 240);

  useEffect(() => {
    if (!commandOpen) return;
    setQuery("");
    setActive(0);
    setResults(null);
    window.setTimeout(() => inputRef.current?.focus(), 30);
  }, [commandOpen]);

  useEffect(() => {
    if (!commandOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setCommandOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [commandOpen, setCommandOpen]);

  useEffect(() => {
    if (!commandOpen || debounced.trim().length < 2) {
      setResults(null);
      return;
    }
    let cancelled = false;
    setSearching(true);
    api
      .get<SearchResult>(`/search?q=${encodeURIComponent(debounced.trim())}`)
      .then((data) => {
        if (!cancelled) setResults(data);
      })
      .catch(() => {
        if (!cancelled) setResults(null);
      })
      .finally(() => {
        if (!cancelled) setSearching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debounced, commandOpen]);

  if (!commandOpen || !user) return null;

  const can = (roles?: Role[]) => !roles || roles.includes(user.role);
  const close = () => setCommandOpen(false);
  const go = (path: string) => {
    close();
    navigate(path);
  };

  const items: PaletteItem[] = [];
  if (can(["admin", "manager"])) {
    items.push({
      id: "act-new-product",
      label: "Create a new product",
      hint: "Catalogue",
      group: "Actions",
      icon: <Plus size={16} />,
      run: () => go("/products/new"),
    });
  }
  if (can(["admin", "manager"])) {
    items.push({
      id: "act-export",
      label: "Export 30-day analytics CSV",
      hint: "Downloads",
      group: "Actions",
      icon: <Download size={16} />,
      run: async () => {
        try {
          await downloadCsv("/analytics/export.csv?range=30", "fabulouscartz-analytics-30d.csv");
          notify({ kind: "success", title: "Analytics exported" });
          close();
        } catch {
          notify({ kind: "error", title: "Export failed" });
        }
      },
    });
  }
  items.push({
    id: "act-theme",
    label: `Switch to ${theme === "light" ? "dark" : "light"} theme`,
    hint: "Appearance",
    group: "Actions",
    icon: <Command size={16} />,
    run: () => {
      toggle();
      close();
    },
  });
  items.push({
    id: "act-logout",
    label: "Sign out of the console",
    hint: "Session",
    group: "Actions",
    icon: <LogOut size={16} />,
    run: async () => {
      await logout();
      close();
    },
  });

  PAGES.filter((page) => can(page.roles) && (query.trim() === "" || page.label.toLowerCase().includes(query.trim().toLowerCase()))).forEach((page) => {
    items.push({
      id: `page-${page.path}`,
      label: page.label,
      hint: "Navigate",
      group: "Go to",
      icon: page.icon,
      run: () => go(page.path),
    });
  });

  results?.products.slice(0, 4).forEach((product) => {
    items.push({
      id: `product-${product.id}`,
      label: product.name,
      hint: `Product · ${foldWords(product.status)}`,
      group: "Records",
      icon: <Box size={16} />,
      run: () => go(`/products/${product.id}`),
    });
  });
  results?.orders.slice(0, 4).forEach((order) => {
    items.push({
      id: `order-${order.id}`,
      label: `${order.number} · ${order.customerName}`,
      hint: `${foldWords(order.status)} order`,
      group: "Records",
      icon: <ShoppingBag size={16} />,
      run: () => go(`/orders?q=${order.number}`),
    });
  });
  results?.customers.slice(0, 3).forEach((customer) => {
    items.push({
      id: `customer-${customer.id}`,
      label: customer.name,
      hint: customer.email,
      group: "Records",
      icon: <Users size={16} />,
      run: () => go(`/customers?q=${encodeURIComponent(customer.email)}`),
    });
  });

  const safeActive = Math.min(active, Math.max(0, items.length - 1));
  let runningIndex = -1;
  const groups = ["Actions", "Go to", "Records"];

  return createPortal(
    <div className="overlay-root overlay-center">
      <div className="overlay-scrim" onClick={close} aria-hidden="true" />
      <div className="palette" role="dialog" aria-modal="true" aria-label="Command palette">
        <div className="palette-input">
          <Search size={17} />
          <input
            ref={inputRef}
            value={query}
            placeholder="Search orders, products, customers or jump to a page…"
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActive((current) => Math.min(items.length - 1, current + 1));
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                setActive((current) => Math.max(0, current - 1));
              }
              if (event.key === "Enter") {
                event.preventDefault();
                const item = items[safeActive];
                if (item) void item.run();
              }
            }}
            aria-label="Command palette search"
          />
          {searching ? <span className="palette-status">Searching…</span> : <kbd>esc</kbd>}
        </div>
        <div className="palette-results">
          {groups.map((group) => {
            const groupItems = items.filter((item) => item.group === group);
            if (!groupItems.length) return null;
            return (
              <div key={group} className="palette-group">
                <p className="eyebrow">{group}</p>
                {groupItems.map((item) => {
                  runningIndex += 1;
                  const index = runningIndex;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`palette-item ${index === safeActive ? "is-active" : ""}`}
                      onMouseEnter={() => setActive(index)}
                      onClick={() => void item.run()}
                    >
                      <span className="palette-item-icon">{item.icon}</span>
                      <span className="palette-item-label truncate">{item.label}</span>
                      {item.hint ? <span className="palette-item-hint">{item.hint}</span> : null}
                      {index === safeActive ? <CornerDownLeft size={14} className="palette-enter" /> : null}
                    </button>
                  );
                })}
              </div>
            );
          })}
          {!items.length ? (
            <div className="palette-empty">
              <Search size={18} />
              <p>Nothing matches “{query}”. Try an order number or product name.</p>
            </div>
          ) : null}
        </div>
        <footer className="palette-foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
          <span><kbd>↵</kbd> open</span>
          <button type="button" onClick={() => go("/analytics")} className="palette-foot-link">
            Analytics <ArrowRight size={12} />
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
