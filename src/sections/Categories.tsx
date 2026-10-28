import { Link } from "react-router-dom";
import { categories } from "../data";

/**
 * The Rack — five collections hung side by side as vertical panels.
 * Collapsed, each shows its name set vertically like a garment tag.
 * Hovering a panel opens it: the name rotates to horizontal and the
 * panel takes three-quarters of the width. Compact, one band tall.
 */
const SHOWN = ["womens-wear", "handmade-jewelry", "dance-costumes", "mens-wear", "accessories"];

export default function Categories() {
  const items = SHOWN.map((s) => categories.find((c) => c.slug === s)).filter(Boolean) as typeof categories;

  return (
    <section className="section-lg">
      <div className="ultra">
        {/* header */}
        <div className="reveal flex items-end justify-between gap-6 mb-8 md:mb-10">
          <div>
            <div className="flex items-center gap-4 mb-4">
              <span className="text-[0.56rem] tracking-[0.42em] uppercase" style={{ color: "var(--ink-muted)" }}>
                Collections
              </span>
              <span className="h-px w-16" style={{ background: "var(--line-strong)" }} />
            </div>
            <h2
              className="font-display font-normal leading-[0.98]"
              style={{ fontSize: "clamp(1.9rem, 3.6vw, 3.2rem)", color: "var(--ink)" }}
            >
              One atelier,
              <em className="font-light" style={{ color: "var(--gold-deep)" }}> five worlds.</em>
            </h2>
          </div>
          <Link
            to="/category/kids-wear"
            className="hidden md:flex items-center gap-2 text-[0.58rem] tracking-[0.28em] uppercase shrink-0 transition-colors hover:text-[var(--gold-deep)]"
            style={{ color: "var(--ink-muted)" }}
          >
            Kids Wear
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M7 17L17 7M17 7H8M17 7V16" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        </div>

        {/* the rack */}
        <div className="reveal h-scroll snap-x snap-mandatory flex gap-2.5 md:gap-3 h-[360px] md:h-[440px] overflow-x-auto md:overflow-hidden">
          {items.map((c, i) => (
            <Link
              key={c.slug}
              to={`/category/${c.slug}`}
              className="group relative shrink-0 snap-center basis-[72vw] md:basis-0 md:shrink flex-[1] md:hover:flex-[3.2] transition-[flex-grow] duration-700 ease-[cubic-bezier(.2,.8,.2,1)] overflow-hidden"
            >
              <img
                src={c.image}
                alt={c.name}
                loading="lazy"
                className="absolute inset-0 w-full h-full object-cover transition-transform duration-[1600ms] ease-[cubic-bezier(.2,.8,.2,1)] group-hover:scale-[1.06]"
              />

              {/* grade */}
              <span
                aria-hidden
                className="absolute inset-0 pointer-events-none"
                style={{
                  background:
                    "linear-gradient(180deg, rgba(8,20,14,0.30) 0%, transparent 38%, rgba(8,20,14,0.55) 72%, rgba(8,20,14,0.92) 100%)",
                }}
              />
              <span aria-hidden className="grain" />
              <span
                aria-hidden
                className="absolute inset-0 pointer-events-none transition-colors duration-700"
                style={{ border: "1px solid rgba(255,255,255,0.16)" }}
              />

              {/* index */}
              <span className="absolute top-4 left-4 font-display text-[0.62rem] tracking-[0.28em] text-white/75">
                {String(i + 1).padStart(2, "0")}
              </span>

              {/* vertical tag — collapsed state */}
              <span
                className="absolute bottom-4 left-4 md:bottom-5 md:left-5 text-white transition-opacity duration-500 md:group-hover:opacity-0"
                style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}
              >
                <span
                  className="font-display text-[0.92rem] tracking-[0.16em] whitespace-nowrap"
                  style={{ color: "#F5EFE2" }}
                >
                  {c.name}
                </span>
              </span>

              {/* opened state */}
              <span className="absolute inset-x-0 bottom-0 p-5 md:p-6 text-white opacity-0 md:group-hover:opacity-100 translate-y-2 md:group-hover:translate-y-0 transition-all duration-500">
                <span className="block text-[0.5rem] tracking-[0.36em] uppercase mb-2" style={{ color: "#E6CE85" }}>
                  {String(c.count).padStart(2, "0")} pieces
                </span>
                <span className="block font-display leading-[1.05]" style={{ fontSize: "clamp(1.3rem, 2vw, 1.9rem)" }}>
                  {c.name}
                </span>
                <span className="mt-2 flex items-center gap-2 text-[0.52rem] tracking-[0.3em] uppercase">
                  Enter
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                    <path d="M7 17L17 7M17 7H8M17 7V16" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
              </span>
            </Link>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between text-[0.54rem] tracking-[0.28em] uppercase" style={{ color: "var(--ink-muted)" }}>
          <span>Hover to open a world</span>
          <span className="hidden md:block">05 Collections</span>
        </div>
      </div>
    </section>
  );
}
