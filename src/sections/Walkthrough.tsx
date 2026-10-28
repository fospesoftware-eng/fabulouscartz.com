import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ShoppingBag, Check, ArrowUpRight } from "lucide-react";
import { products } from "../data";
import { useCart } from "../context/CartContext";

gsap.registerPlugin(ScrollTrigger);

const FRAMES = products.slice(0, 7);

const W = 300;
const H = 424;
const SPACING = 348;
const TOTAL = FRAMES.length * SPACING;

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

/**
 * THE WALKTHROUGH — glass panels in rotating gradient borders.
 * Each arrival is a dark glass card with an animated conic gold/emerald
 * border, a lit product plate, and direct shop actions.
 */
export default function Walkthrough() {
  const cardRefs = useRef<Array<HTMLDivElement | null>>([]);
  const ghostRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLElement>(null);
  const hudRef = useRef<HTMLSpanElement>(null);
  const posRef = useRef(0);
  const pausedRef = useRef(false);
  const nudgingRef = useRef(false);
  const [reduced, setReduced] = useState(false);
  const [justAdded, setJustAdded] = useState<string | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const { add } = useCart();

  const render = (p: number) => {
    let bestIdx = 0;
    let bestAbs = Infinity;

    cardRefs.current.forEach((el, i) => {
      if (!el) return;
      let local = (i * SPACING - p) % TOTAL;
      if (local > TOTAL / 2) local -= TOTAL;
      if (local < -TOTAL / 2) local += TOTAL;

      const abs = Math.abs(local);
      if (abs < bestAbs) { bestAbs = abs; bestIdx = i; }

      const rotY = -clamp(local / SPACING, -1, 1) * 40;
      const z = -abs * 0.62;
      const op = clamp(1 - abs / 1150, 0.38, 1);
      const sc = clamp(1 - abs / 5400, 0.85, 1);

      el.style.transform =
        `translate(-50%,-50%) translateX(${local}px) translateZ(${z}px) rotateY(${rotY}deg) scale(${sc})`;
      el.style.opacity = op.toFixed(3);
      el.style.zIndex = String(1000 - Math.round(abs));
      el.style.pointerEvents = abs < 220 ? "auto" : "none";
    });

    if (hudRef.current) hudRef.current.textContent = String(bestIdx + 1).padStart(2, "0");
    setActiveIdx((prev) => (prev === bestIdx ? prev : bestIdx));
  };

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setReduced(true);
      return;
    }
    render(0);

    const SPEED = 26;
    const tick = (_t: number, delta: number) => {
      if (!pausedRef.current && !nudgingRef.current) {
        posRef.current = (posRef.current + (SPEED * delta) / 1000) % TOTAL;
      }
      render(posRef.current);
    };
    gsap.ticker.add(tick);

    const ghostTween = gsap.to(ghostRef.current, {
      xPercent: -16,
      ease: "none",
      scrollTrigger: { trigger: wrapRef.current, start: "top bottom", end: "bottom top", scrub: true },
    });

    return () => {
      gsap.ticker.remove(tick);
      ghostTween.scrollTrigger?.kill();
      ghostTween.kill();
    };
  }, []);

  const goTo = (idx: number) => {
    if (nudgingRef.current) return;
    nudgingRef.current = true;
    const start = posRef.current;
    const delta = (((idx * SPACING - start + TOTAL * 1.5) % TOTAL) - TOTAL / 2);
    const state = { v: 0 };
    gsap.to(state, {
      v: delta,
      duration: 0.85,
      ease: "power3.inOut",
      onUpdate: () => {
        posRef.current = (((start + state.v) % TOTAL) + TOTAL) % TOTAL;
        render(posRef.current);
      },
      onComplete: () => { nudgingRef.current = false; },
    });
  };

  const quickAdd = (p: (typeof FRAMES)[number]) => {
    add({ slug: p.slug, name: p.name, price: p.price, image: p.image, vendor: p.vendor, quantity: 1 });
    setJustAdded(p.slug);
    setTimeout(() => setJustAdded(null), 1500);
  };

  /* ---------- Reduced motion ---------- */
  if (reduced) {
    return (
      <section id="walkthrough" className="atmo-emerald section-xl">
        <div className="ultra">
          <div className="text-[0.62rem] tracking-[0.42em] uppercase mb-4" style={{ color: "#E6CE85" }}>
            The Walkthrough
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
            {FRAMES.map((p) => (
              <div key={p.slug} className="rounded-[20px] overflow-hidden" style={{ background: "#0B3A26", border: "1px solid rgba(230,206,133,0.4)" }}>
                <Link to={`/product/${p.slug}`}>
                  <img src={p.image} alt={p.name} loading="lazy" className="w-full aspect-[4/5] object-cover" />
                </Link>
                <div className="px-3.5 py-3">
                  <div className="text-[0.7rem] text-[#F2EDE2]">{p.name}</div>
                  <div className="font-display text-sm" style={{ color: "#E6CE85" }}>${p.price}</div>
                </div>
                <button
                  onClick={() => quickAdd(p)}
                  className="w-full py-2.5 text-[0.58rem] tracking-[0.24em] uppercase"
                  style={{ background: "linear-gradient(90deg,#B8913A,#E6CE85)", color: "#1A1714" }}
                >
                  Add to Bag
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      id="walkthrough"
      ref={wrapRef}
      className="atmo-emerald relative overflow-hidden"
    >
      <div aria-hidden className="pattern-veil pattern-block" />
      <div aria-hidden className="canvas-weave absolute inset-0 pointer-events-none" />

      {/* Parallax ghost type */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden">
        <div
          ref={ghostRef}
          className="font-display font-bold whitespace-nowrap select-none will-change-transform"
          style={{
            fontSize: "clamp(7rem, 19vw, 19rem)",
            letterSpacing: "-0.02em",
            color: "transparent",
            WebkitTextStroke: "1px rgba(230,206,133,0.12)",
          }}
        >
          NEW ARRIVALS
        </div>
      </div>

      {/* Ceiling wash */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-1/2 pointer-events-none"
        style={{ background: "radial-gradient(ellipse 40% 100% at 50% 0%, rgba(230,206,133,0.15) 0%, transparent 70%)" }}
      />

      <div className="relative z-10 ultra pt-16 md:pt-20 pb-14 flex flex-col">
        {/* Header */}
        <div className="relative z-30 text-center shrink-0">
          <div className="text-[0.6rem] tracking-[0.42em] uppercase" style={{ color: "#E6CE85" }}>
            The East Wing · Auto Walk
          </div>
          <h2
            className="font-display font-normal text-[#F2EDE2] mt-2.5"
            style={{ fontSize: "clamp(1.9rem, 3.8vw, 3.4rem)" }}
          >
            The <em className="font-light" style={{ color: "#E6CE85" }}>Walkthrough</em>
          </h2>
        </div>

        {/* 3D STAGE (desktop / tablet) */}
        <div
          className="relative my-8 hidden sm:block h-[380px] md:h-[500px]"
          onMouseEnter={() => { pausedRef.current = true; }}
          onMouseLeave={() => { pausedRef.current = false; }}
        >
          <div className="absolute inset-0" style={{ perspective: "1800px", perspectiveOrigin: "50% 46%" }}>
            <div
              className="absolute inset-0 origin-center scale-[0.54] sm:scale-[0.7] md:scale-100"
              style={{ transformStyle: "preserve-3d" }}
            >
              {FRAMES.map((p, i) => (
                <div
                  key={p.slug}
                  ref={(el) => { cardRefs.current[i] = el; }}
                  className="absolute will-change-transform"
                  style={{
                    top: "50%",
                    left: "50%",
                    width: W,
                    height: H,
                    transform: "translate(-50%,-50%)",
                    opacity: 0,
                  }}
                >
                  {/* Soft glow bed under the panel */}
                  <div
                    aria-hidden
                    className="absolute -inset-6 rounded-[32px] pointer-events-none"
                    style={{
                      background: "radial-gradient(ellipse at 50% 55%, rgba(230,206,133,0.16) 0%, transparent 68%)",
                      filter: "blur(6px)",
                    }}
                  />

                  {/* GRADIENT BORDER PANEL */}
                  <div className="gborder group/card relative" style={{ width: W, height: H }}>
                    <div
                      className="relative h-full flex flex-col overflow-hidden"
                      style={{
                        borderRadius: 20.5,
                        background: "linear-gradient(170deg, #0C3D27 0%, #082418 55%, #06180F 100%)",
                      }}
                    >
                      {/* ---- LIT PLATE ---- */}
                      <Link to={`/product/${p.slug}`} className="relative block overflow-hidden" style={{ height: 272 }}>
                        <img
                          src={p.image}
                          alt={p.name}
                          className="w-full h-full object-cover transition-transform duration-[1000ms] ease-[cubic-bezier(.2,.8,.2,1)] group-hover/card:scale-[1.06]"
                          draggable={false}
                          loading="lazy"
                        />
                        {/* top light + bottom scrim */}
                        <div
                          aria-hidden
                          className="absolute inset-0 pointer-events-none"
                          style={{
                            background:
                              "linear-gradient(180deg, rgba(6,24,15,0.32) 0%, transparent 26%, transparent 52%, rgba(6,24,15,0.82) 100%)",
                          }}
                        />
                        {/* sweep on hover */}
                        <span
                          aria-hidden
                          className="absolute inset-0 opacity-0 group-hover/card:opacity-100 transition-opacity duration-500 pointer-events-none"
                          style={{ background: "linear-gradient(115deg, transparent 38%, rgba(255,255,255,0.16) 50%, transparent 62%)" }}
                        />

                        {/* N° chip */}
                        <span
                          className="absolute top-3 left-3 text-[0.5rem] tracking-[0.28em] uppercase px-2 py-1 rounded-full backdrop-blur"
                          style={{ background: "rgba(6,24,15,0.45)", color: "#E6CE85", border: "1px solid rgba(230,206,133,0.35)" }}
                        >
                          N° {String(i + 1).padStart(2, "0")}
                        </span>
                        {/* NEW chip */}
                        {p.newArrival && (
                          <span
                            className="absolute top-3 right-3 text-[0.48rem] tracking-[0.26em] uppercase px-2 py-1 rounded-full"
                            style={{ background: "linear-gradient(90deg,#E6CE85,#B8913A)", color: "#1A1714" }}
                          >
                            New
                          </span>
                        )}
                      </Link>

                      {/* ---- INFO ---- */}
                      <div className="flex-1 px-4 pt-3.5 pb-2">
                        <div className="text-[0.46rem] tracking-[0.32em] uppercase" style={{ color: "rgba(230,206,133,0.62)" }}>
                          {p.vendor}
                        </div>
                        <Link to={`/product/${p.slug}`} className="block mt-1">
                          <div
                            className="font-display italic leading-[1.2] text-[#F5EFE2] hover:text-[#E6CE85] transition-colors duration-300"
                            style={{ fontSize: "0.98rem" }}
                          >
                            {p.name}
                          </div>
                        </Link>
                        <div className="mt-1.5 flex items-baseline gap-2">
                          <span className="font-display text-[1rem]" style={{ color: "#E6CE85" }}>
                            ${p.price}.00
                          </span>
                          {p.originalPrice && (
                            <span className="text-[0.62rem] line-through" style={{ color: "rgba(242,237,226,0.35)" }}>
                              ${p.originalPrice}.00
                            </span>
                          )}
                        </div>
                      </div>

                      {/* ---- ACTIONS ---- */}
                      <div className="px-3 pb-3 flex items-center gap-2">
                        <Link
                          to={`/product/${p.slug}`}
                          className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-full text-[0.56rem] tracking-[0.26em] uppercase transition-transform duration-300 hover:scale-[1.02]"
                          style={{ background: "linear-gradient(90deg,#B8913A,#E6CE85 55%,#B8913A)", color: "#12200F" }}
                        >
                          Shop Now
                          <ArrowUpRight size={11} strokeWidth={2.2} />
                        </Link>
                        <button
                          onClick={(e) => { e.stopPropagation(); quickAdd(p); }}
                          aria-label={`Add ${p.name} to bag`}
                          className="w-9 h-9 rounded-full flex items-center justify-center transition-colors duration-300"
                          style={{
                            background: justAdded === p.slug ? "#0F4A2D" : "rgba(245,239,226,0.08)",
                            border: "1px solid rgba(230,206,133,0.42)",
                            color: justAdded === p.slug ? "#E6CE85" : "#F5EFE2",
                          }}
                        >
                          {justAdded === p.slug
                            ? <Check size={13} strokeWidth={2.2} />
                            : <ShoppingBag size={13} strokeWidth={1.7} />}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* MOBILE RAIL — swipeable plates */}
        <div className="sm:hidden relative z-30 mt-7 -mx-5">
          <div className="h-scroll snap-x snap-mandatory flex gap-4 overflow-x-auto px-5 pb-2">
            {FRAMES.map((p) => (
              <Link
                key={p.slug}
                to={`/product/${p.slug}`}
                className="relative shrink-0 snap-center w-[72vw] rounded-[22px] overflow-hidden"
                style={{
                  background: "linear-gradient(155deg,#12553A 0%,#0A3524 60%,#3D3016 100%)",
                  boxShadow: "0 0 0 1px rgba(230,206,133,0.4), 0 22px 44px -20px rgba(3,16,10,0.8)",
                }}
              >
                <img src={p.image} alt={p.name} loading="lazy" className="w-full aspect-[4/5] object-cover" />
                <div
                  className="absolute inset-x-0 bottom-0 p-4"
                  style={{ background: "linear-gradient(180deg, transparent 0%, rgba(6,20,13,0.9) 78%)" }}
                >
                  <div className="text-[0.46rem] tracking-[0.3em] uppercase" style={{ color: "rgba(230,206,133,0.85)" }}>
                    {p.vendor}
                  </div>
                  <div className="mt-1 font-display italic leading-tight text-[1rem]" style={{ color: "#F5EFE2" }}>
                    {p.name}
                  </div>
                  <div className="mt-1.5 flex items-baseline justify-between">
                    <span className="font-display text-[0.95rem]" style={{ color: "#E6CE85" }}>${p.price}.00</span>
                    <span className="text-[0.48rem] tracking-[0.24em] uppercase" style={{ color: "rgba(242,237,226,0.7)" }}>
                      Shop ↗
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
          <div className="text-center mt-3 text-[0.48rem] tracking-[0.32em] uppercase" style={{ color: "rgba(242,237,226,0.35)" }}>
            Swipe the rail
          </div>
        </div>

        {/* HUD — dots */}
        <div className="relative z-30 hidden sm:flex flex-col items-center gap-3">
          <div className="flex items-center gap-2.5">
            {FRAMES.map((p, i) => (
              <button key={p.slug} onClick={() => goTo(i)} aria-label={`Go to ${p.name}`} className="py-1">
                <span
                  className="block rounded-full transition-all duration-500"
                  style={{
                    width: i === activeIdx ? 20 : 5,
                    height: 5,
                    background: i === activeIdx ? "#E6CE85" : "rgba(242,237,226,0.32)",
                  }}
                />
              </button>
            ))}
          </div>
          <div className="font-display text-[0.78rem] tracking-[0.34em]" style={{ color: "#E6CE85" }}>
            <span ref={hudRef}>01</span>
            <span style={{ opacity: 0.45 }}> / {String(FRAMES.length).padStart(2, "0")}</span>
          </div>
          <div className="text-[0.48rem] tracking-[0.32em] uppercase" style={{ color: "rgba(242,237,226,0.38)" }}>
            Hover to pause · Tap a dot to jump
          </div>
        </div>

        <div className="mt-7 text-center">
          <Link
            to="/category/womens-wear"
            className="inline-block px-8 py-3 rounded-full text-[0.64rem] tracking-[0.32em] uppercase transition-colors duration-400"
            style={{ border: "1px solid rgba(230,206,133,0.6)", color: "#E6CE85" }}
          >
            Enter the Boutique
          </Link>
        </div>
      </div>
    </section>
  );
}
