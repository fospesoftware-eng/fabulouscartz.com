import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Sun, Moon, Menu, X, ShoppingBag } from "lucide-react";
import { useTheme } from "../context/ThemeContext";
import { useCart } from "../context/CartContext";
import { categories } from "../data";

/** Minimal five-petal mark — one line weight, gold. */
function FlowerMark({ color }: { color: string }) {
  return (
    <svg width="1em" height="1em" viewBox="0 0 24 24" fill="none" aria-hidden style={{ display: "block" }}>
      {[0, 72, 144, 216, 288].map((a) => (
        <ellipse
          key={a}
          cx="12"
          cy="6.6"
          rx="2"
          ry="4.5"
          transform={`rotate(${a} 12 12)`}
          stroke={color}
          strokeWidth="1.7"
          fill="none"
        />
      ))}
      <circle cx="12" cy="12" r="1.7" fill={color} />
    </svg>
  );
}

export default function Header() {
  const { theme, toggle } = useTheme();
  const { count, open } = useCart();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const loc = useLocation();
  const isHome = loc.pathname === "/";

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /* Pages that open on a dark photographic hero can float the wordmark over it.
     Light-backed pages keep the bar so text stays readable. */
  const canFloat =
    isHome ||
    loc.pathname.startsWith("/category/") ||
    loc.pathname === "/about" ||
    loc.pathname === "/contact";
  const solid = scrolled || mobileOpen || !canFloat;
  const fg = solid ? "var(--ink)" : "#F5EFE2";

  return (
    <header
      className="fixed top-0 left-0 right-0 z-50"
      style={{
        background: solid
          ? theme === "dark"
            ? "rgba(12,16,14,0.74)"
            : "rgba(250,246,240,0.78)"
          : "transparent",
        backdropFilter: solid ? "blur(20px) saturate(140%)" : "none",
        WebkitBackdropFilter: solid ? "blur(20px) saturate(140%)" : "none",
        borderBottom: solid ? "1px solid var(--line)" : "1px solid transparent",
        color: fg,
        textShadow: solid ? "none" : "0 1px 18px rgba(0,0,0,0.45)",
        transition: "background 450ms ease, border-color 450ms ease",
      }}
    >
      {/* Progressive scrim — a photograph-grade veil that deepens the top of the
          image and blurs it softly, so the floating header stays readable. */}
      {!solid && (
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 pointer-events-none"
          style={{
            height: 190,
            zIndex: -1,
            background:
              "linear-gradient(180deg, rgba(9,14,11,0.66) 0%, rgba(9,14,11,0.38) 42%, rgba(9,14,11,0) 100%)",
            backdropFilter: "blur(8px) saturate(115%)",
            WebkitBackdropFilter: "blur(8px) saturate(115%)",
            maskImage:
              "linear-gradient(180deg, #000 0%, rgba(0,0,0,0.6) 45%, transparent 100%)",
            WebkitMaskImage:
              "linear-gradient(180deg, #000 0%, rgba(0,0,0,0.6) 45%, transparent 100%)",
          }}
        />
      )}
      <div className="ultra flex items-center justify-between h-16 md:h-20">
        {/* WORDMARK — the F blossoms into the word; no separate symbol */}
        <Link to="/" className="group shrink-0 leading-none" aria-label="Fabulous — home">
          <span
            className="font-display block transition-colors duration-500"
            style={{
              fontSize: "clamp(1.3rem, 2.4vw, 1.58rem)",
              fontStyle: "italic",
              fontWeight: 500,
              letterSpacing: "-0.012em",
              lineHeight: 1,
            }}
          ><span className="inline-block align-middle mr-[0.2em] -translate-y-[0.03em] text-[0.62em] transition-transform duration-[900ms] group-hover:rotate-[72deg]" style={{ lineHeight: 0 }}><FlowerMark color="var(--gold)" /></span>Fabulous</span>
        </Link>

        {/* DESKTOP NAV — hairline Playfair italic + weight anchor */}
        <nav className="hidden lg:flex items-center gap-9">
          {isHome ? (
            <>
              {["Collections", "Walkthrough", "Our Story", "Craft"].map((label, i) => (
                <a
                  key={label}
                  href={`#${["collections", "walkthrough", "story", "craft"][i]}`}
                  className="text-[0.72rem] font-normal tracking-[0.18em] uppercase opacity-80 hover:opacity-100 transition-opacity duration-300"
                >
                  {label}
                </a>
              ))}
              <Link to="/about" className="text-[0.72rem] font-normal tracking-[0.18em] uppercase opacity-80 hover:opacity-100 transition-opacity duration-300">About</Link>
              <Link to="/contact" className="text-[0.72rem] font-normal tracking-[0.18em] uppercase opacity-80 hover:opacity-100 transition-opacity duration-300">Contact</Link>
            </>
          ) : (
            <>
              {categories.slice(0, 4).map((c) => (
                <Link key={c.slug} to={`/category/${c.slug}`} className="text-[0.72rem] font-normal tracking-[0.18em] uppercase opacity-80 hover:opacity-100 transition-opacity duration-300">
                  {c.name}
                </Link>
              ))}
              <Link to="/about" className="text-[0.72rem] font-normal tracking-[0.18em] uppercase opacity-80 hover:opacity-100 transition-opacity duration-300">About</Link>
            </>
          )}
        </nav>

        {/* RIGHT — minimal icons, no pill chrome */}
        <div className="flex items-center gap-3">
          <button aria-label="Toggle theme" onClick={toggle} className="p-2 opacity-60 hover:opacity-100 transition-opacity">
            {theme === "dark" ? <Sun size={15} strokeWidth={1.5} /> : <Moon size={15} strokeWidth={1.5} />}
          </button>
          <button aria-label="Cart" onClick={open} className="relative p-2 opacity-60 hover:opacity-100 transition-opacity">
            <ShoppingBag size={15} strokeWidth={1.5} />
            {count > 0 && (
              <span className="absolute -top-0 right-0 text-[0.6rem] font-medium tracking-wide w-4 h-4 flex items-center justify-center rounded-full" style={{ background: "var(--gold)", color: "var(--ink-inv)" }}>
                {count}
              </span>
            )}
          </button>
          <button aria-label="Menu" className="lg:hidden p-2 opacity-60 hover:opacity-100 transition-opacity" onClick={() => setMobileOpen((v) => !v)}>
            {mobileOpen ? <X size={17} strokeWidth={1.5} /> : <Menu size={17} strokeWidth={1.5} />}
          </button>
        </div>
      </div>

      {/* MOBILE NAV */}
      {mobileOpen && (
        <div className="lg:hidden overflow-hidden border-t" style={{ background: "var(--bg)", borderColor: "var(--line)" }}>
          <div className="ultra py-6 space-y-1">
            {categories.map((c) => (
              <Link key={c.slug} to={`/category/${c.slug}`} onClick={() => setMobileOpen(false)} className="block py-2 font-display italic text-lg text-[var(--ink)]">
                {c.name}
              </Link>
            ))}
            <div className="pt-4 mt-2 border-t flex gap-6 text-[0.68rem] tracking-[0.3em] uppercase opacity-60" style={{ borderColor: "var(--line)" }}>
              <Link to="/about" onClick={() => setMobileOpen(false)}>About</Link>
              <Link to="/contact" onClick={() => setMobileOpen(false)}>Contact</Link>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
