import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

const ITEMS = [
  { id: "top", label: "Opening" },
  { id: "collections", label: "Best Sellers" },
  { id: "walkthrough", label: "Walkthrough" },
  { id: "story", label: "Our Story" },
  { id: "craft", label: "Craft" },
];

/**
 * Anchor dot-navigation — fixed right edge, home only.
 * Active section elongates gold; hover reveals the label.
 */
export default function AnchorNav() {
  const { pathname } = useLocation();
  const [active, setActive] = useState("top");

  useEffect(() => {
    if (pathname !== "/") return;
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) setActive(e.target.id);
        });
      },
      { rootMargin: "-45% 0px -45% 0px" }
    );
    ITEMS.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) obs.observe(el);
    });
    return () => obs.disconnect();
  }, [pathname]);

  if (pathname !== "/") return null;

  return (
    <nav aria-label="Section navigation" className="fixed right-5 top-1/2 -translate-y-1/2 z-40 hidden lg:flex flex-col items-end gap-5">
      {ITEMS.map(({ id, label }) => {
        const isActive = active === id;
        return (
          <button
            key={id}
            onClick={() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" })}
            className="group flex items-center gap-3"
            aria-label={label}
          >
            <span
              className="text-[0.58rem] tracking-[0.28em] uppercase opacity-0 translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-300"
              style={{ color: "var(--ink-muted)" }}
            >
              {label}
            </span>
            <span
              className="block rounded-full transition-all duration-500"
              style={{
                width: isActive ? "22px" : "6px",
                height: "6px",
                background: isActive ? "var(--gold)" : "var(--ink-muted)",
                opacity: isActive ? 1 : 0.4,
              }}
            />
          </button>
        );
      })}
    </nav>
  );
}
