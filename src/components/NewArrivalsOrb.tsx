import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import gsap from "gsap";
import { ArrowUpRight } from "lucide-react";
import { products } from "../data";

const CARD_W = 250;
const CARD_H = 332;

/** depth positions in the stack */
const STACK = [
  { x: 0, y: 0, rotation: -3, scale: 1, z: 0, zIndex: 40 },
  { x: 12, y: 17, rotation: 2.6, scale: 0.95, z: 0, zIndex: 30 },
  { x: -8, y: 32, rotation: -1.6, scale: 0.902, z: 0, zIndex: 20 },
  { x: 0, y: 46, rotation: 0, scale: 0.855, z: 0, zIndex: 10 },
];

const HIDDEN = { x: 0, y: 48, rotation: 0, scale: 0.85, opacity: 0, zIndex: 10 };

/**
 * New Arrivals Deck — a small stack of arrivals at the hero's edge.
 * The top card deals off on a 3D arc, the stack springs forward,
 * and the next arrival rises from behind.
 */
export default function NewArrivalsOrb() {
  const items = useMemo(() => {
    const pool = products.filter(
      (p) => p.category === "womens-wear" || p.category === "dance-costumes"
    );
    return [...pool]
      .sort((a, b) => Number(!!b.newArrival) - Number(!!a.newArrival))
      .slice(0, 5);
  }, []);

  const [idx, setIdx] = useState(0);
  const [hovered, setHovered] = useState(false);
  const cardRefs = useRef<Array<HTMLDivElement | null>>([]);
  const prevIdx = useRef(-1);
  const reduce = useMemo(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    []
  );

  /* position the deck */
  useEffect(() => {
    const n = items.length;
    items.forEach((_, i) => {
      const el = cardRefs.current[i];
      if (!el) return;
      const pos = ((i - idx) % n + n) % n;

      if (!reduce && prevIdx.current !== -1 && i === prevIdx.current) {
        // the card that was on top now deals off to the right
        gsap
          .timeline()
          .to(el, { x: 110, y: -54, rotation: 17, opacity: 0, scale: 1.04, duration: 0.66, ease: "power2.in" })
          .set(el, { ...HIDDEN, opacity: 0 });
      } else {
        const p = STACK[pos] ?? STACK[3];
        gsap.to(el, {
          ...p,
          opacity: pos <= 2 ? 1 : 0,
          duration: reduce ? 0 : 0.8,
          ease: "back.out(1.35)",
          delay: prevIdx.current === -1 ? i * 0.09 : 0,
        });
      }
    });
    prevIdx.current = idx;
  }, [idx, items, reduce]);

  /* auto-deal */
  useEffect(() => {
    if (reduce || hovered || items.length < 2) return;
    const id = window.setInterval(() => setIdx((i) => (i + 1) % items.length), 4200);
    return () => window.clearInterval(id);
  }, [hovered, items.length, reduce]);

  if (!items.length) return null;

  return (
    <div
      className="absolute right-[4%] top-1/2 -translate-y-1/2 z-20 hidden lg:block"
      style={{ width: CARD_W + 40, height: CARD_H + 40 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* label */}
      <div className="absolute -top-2 left-2 flex items-center gap-2.5">
        <span className="text-[0.5rem] tracking-[0.42em] uppercase text-white/75">New Arrivals</span>
        <span className="h-px w-10 bg-[rgba(230,206,133,0.55)]" />
      </div>

      {/* deck */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" style={{ perspective: "1200px" }}>
        <div className="relative" style={{ width: CARD_W, height: CARD_H, transformStyle: "preserve-3d" }}>
          {items.map((p, i) => {
            const top = i === idx;
            return (
              <div
                key={p.slug}
                ref={(el) => { cardRefs.current[i] = el; }}
                className="absolute inset-0 will-change-transform"
                style={{ opacity: 0, transformStyle: "preserve-3d" }}
              >
                <Link
                  to={`/product/${p.slug}`}
                  className="group relative block w-full h-full overflow-hidden"
                  style={{
                    borderRadius: 18,
                    background:
                      "linear-gradient(145deg, #12553A 0%, #0B3D28 48%, #3D3016 100%)",
                    boxShadow:
                      "0 34px 64px -22px rgba(4,20,12,0.7), 0 0 0 1px rgba(230,206,133,0.45), inset 0 1px 0 rgba(255,255,255,0.14)",
                    pointerEvents: top ? "auto" : "none",
                  }}
                >
                  <img
                    src={p.image}
                    alt={p.name}
                    draggable={false}
                    loading="lazy"
                    className="absolute inset-0 w-full h-full object-cover transition-transform duration-[1200ms] group-hover:scale-[1.05]"
                  />
                  {/* emerald → champagne wash, replaces the flat black grade */}
                  <div
                    aria-hidden
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      background:
                        "linear-gradient(155deg, rgba(230,206,133,0.18) 0%, rgba(18,85,58,0.10) 26%, transparent 52%, rgba(11,61,40,0.55) 78%, rgba(8,40,26,0.92) 100%)",
                    }}
                  />
                  {/* hover sheen */}
                  <div
                    aria-hidden
                    className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-700"
                    style={{
                      background:
                        "radial-gradient(ellipse 70% 60% at 30% 12%, rgba(230,206,133,0.22), transparent 68%)",
                    }}
                  />

                  {/* corner fillet */}
                  <span
                    aria-hidden
                    className="absolute inset-2 pointer-events-none transition-colors duration-500"
                    style={{ border: "1px solid rgba(230,206,133,0.28)", borderRadius: 12 }}
                  />

                  <div className="absolute inset-x-0 bottom-0 px-4 pb-4 text-white">
                    <div className="text-[0.44rem] tracking-[0.34em] uppercase" style={{ color: "rgba(230,206,133,0.8)" }}>
                      {p.vendor}
                    </div>
                    <div className="mt-1 font-display italic leading-[1.15]" style={{ fontSize: "1.02rem" }}>
                      {p.name}
                    </div>
                    <div className="mt-1.5 flex items-baseline justify-between">
                      <span className="font-display" style={{ fontSize: "0.98rem", color: "#E6CE85" }}>
                        ${p.price}.00
                      </span>
                      {top && (
                        <span className="flex items-center gap-1 text-[0.46rem] tracking-[0.26em] uppercase text-white/70">
                          Shop <ArrowUpRight size={10} strokeWidth={2} />
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}
