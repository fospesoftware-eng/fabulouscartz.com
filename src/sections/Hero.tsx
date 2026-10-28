import { Link } from "react-router-dom";
import { useEffect, useRef } from "react";
import gsap from "gsap";
import NewArrivalsOrb from "../components/NewArrivalsOrb";

/**
 * HERO v5 — DVF campaign discipline
 * Full-bleed campaign image. One serif statement bottom-left.
 * One rectangular CTA. Nothing else. The image does the work.
 */
export default function Hero() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) return;
    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
      tl.fromTo(
        ".hero-media img",
        { scale: 1.12 },
        { scale: 1, duration: 2.2, ease: "power2.out" }
      )
        .from(".hero-kicker", { opacity: 0, y: 16, duration: 0.8 }, 0.5)
        .from(".hero-title-line", { yPercent: 105, duration: 1.1, stagger: 0.12, ease: "power4.out" }, 0.65)
        .from(".hero-cta", { opacity: 0, y: 14, duration: 0.8 }, 1.3);
    }, rootRef);
    return () => ctx.revert();
  }, []);

  return (
    <section id="top" ref={rootRef} className="relative w-full h-[92svh] min-h-[560px] overflow-hidden">
      {/* FULL-BLEED CAMPAIGN IMAGE */}
      <div className="hero-media absolute inset-0">
        <img
          src="/img/hero/home-hero.jpg"
          alt="Fabulous Cartz — Heritage Edit"
          className="w-full h-full object-cover object-[center_30%]"
          draggable={false}
        />
        {/* Whisper of legibility at the base — no heavy gradients */}
        <div aria-hidden className="absolute inset-x-0 bottom-0 h-2/5" style={{ background: "linear-gradient(180deg, transparent 0%, rgba(10,10,10,0.42) 100%)" }} />
      </div>

      {/* STATEMENT — bottom-left, white serif on image */}
      <div className="ultra relative z-10 h-full flex flex-col justify-end pb-14 md:pb-20">
        <div className="hero-kicker text-[0.65rem] tracking-[0.42em] uppercase font-medium text-white/90 mb-4">
          The Heritage Edit — Spring 2026
        </div>
        <h1 className="text-white">
          <div className="overflow-hidden">
            <span className="hero-title-line block font-display font-normal leading-[0.95]" style={{ fontSize: "clamp(2.6rem, 6.5vw, 6.5rem)" }}>
              Heritage, worn
            </span>
          </div>
          <div className="overflow-hidden">
            <span className="hero-title-line block font-display italic font-light leading-[0.95]" style={{ fontSize: "clamp(2.6rem, 6.5vw, 6.5rem)" }}>
              your way.
            </span>
          </div>
        </h1>
        <div className="hero-cta mt-7">
          <Link
            to="/category/womens-wear"
            className="inline-block px-10 py-4 bg-white text-[0.68rem] tracking-[0.32em] uppercase font-medium transition-colors duration-400 hover:bg-black hover:text-white"
            style={{ color: "#1A1714" }}
          >
            Shop New Arrivals
          </Link>
        </div>
      </div>

      {/* Floating new-arrivals medallion */}
      <NewArrivalsOrb />
    </section>
  );
}
