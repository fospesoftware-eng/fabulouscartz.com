import { Link } from "react-router-dom";
import ProductCard from "../components/ProductCard";
import { featuredProducts, topSellers, newArrivals } from "../data";
import { useState } from "react";

type Tab = "best" | "new" | "signature";
type Mode = "buy" | "rent";

/**
 * DVF "Best Sellers" section:
 * Centered serif section title, right-aligned "Shop now",
 * clean 4-col grid with swatches. Tabs as small uppercase text links.
 */
export default function Featured() {
  const [tab, setTab] = useState<Tab>("best");
  const [mode, setMode] = useState<Mode>("buy");
  const tabs: { id: Tab; label: string; get: () => ReturnType<typeof topSellers> }[] = [
    { id: "best", label: "Best Sellers", get: topSellers },
    { id: "new", label: "New Arrivals", get: newArrivals },
    { id: "signature", label: "Signature Styles", get: featuredProducts },
  ];
  const active = tabs.find((t) => t.id === tab)!;
  const list = active.get();
  const byMode = list.filter((p) => (mode === "buy" ? p.mode !== "rent" : p.mode !== "buy"));
  const filtered = (byMode.length ? byMode : list).slice(0, 4);
  // rental pieces lead the row when Rent is active, so the switch is visible
  const items =
    mode === "rent"
      ? [...filtered].sort((a, b) => Number(b.mode === "rent") - Number(a.mode === "rent"))
      : filtered;

  return (
    <section id="collections" className="section-lg ultra">
      {/* Section header — DVF rhythm */}
      <div className="flex items-end justify-between mb-3 reveal">
        <h2 className="font-display font-normal leading-none" style={{ fontSize: "clamp(1.9rem, 3.4vw, 3rem)" }}>
          {active.label}
          {mode === "rent" && (
            <span className="ml-3 align-middle font-display italic" style={{ fontSize: "0.5em", color: "var(--gold)" }}>
              to rent
            </span>
          )}
        </h2>
        <Link
          to="/category/womens-wear"
          className="text-[0.7rem] tracking-[0.2em] uppercase border-b pb-0.5 transition-colors"
          style={{ borderColor: "var(--ink)", color: "var(--ink)" }}
        >
          Shop now
        </Link>
      </div>

      {/* Tabs + Buy / Rent mode */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8 reveal">
        <div className="flex gap-6 text-[0.7rem] tracking-[0.16em] uppercase">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="pb-1 transition-colors duration-300"
              style={{
                color: tab === t.id ? "var(--ink)" : "var(--ink-muted)",
                borderBottom: tab === t.id ? "1px solid var(--ink)" : "1px solid transparent",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Buy / Rent toggle — hairline capsule with a sliding ink fill */}
        <div className="relative flex rounded-full p-[3px] shrink-0" style={{ border: "1px solid var(--line)" }}>
          <span
            aria-hidden
            className="absolute rounded-full"
            style={{
              top: 3,
              bottom: 3,
              left: mode === "buy" ? 3 : "50%",
              width: "calc(50% - 3px)",
              background: "var(--ink)",
              transition: "left 420ms cubic-bezier(.4,0,.2,1)",
            }}
          />
          {(["buy", "rent"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              aria-pressed={mode === m}
              className="relative z-10 px-6 py-[0.34rem] rounded-full text-[0.6rem] tracking-[0.22em] uppercase whitespace-nowrap transition-colors duration-300"
              style={{ color: mode === m ? "var(--bg)" : "var(--ink-muted)" }}
            >
              {m === "buy" ? "Buy" : "Rent"}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-10 md:gap-x-6">
        {items.map((p, i) => (
          <ProductCard key={`${tab}-${mode}-${p.slug}`} product={p} index={i} mode={mode} />
        ))}
      </div>
    </section>
  );
}
