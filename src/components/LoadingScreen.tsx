import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { gsap } from "gsap";

/** Five-petal blossom — the same mark that sits before the wordmark. */
function Bloom({ size = 78, color = "#E6CE85" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
      {[0, 72, 144, 216, 288].map((a, i) => (
        <ellipse
          key={a}
          cx="12"
          cy="6.6"
          rx="2"
          ry="4.5"
          transform={`rotate(${a} 12 12)`}
          stroke={color}
          strokeWidth="1.15"
          fill="none"
          className="bloom-petal"
          style={{ animationDelay: `${i * 0.28}s` }}
        />
      ))}
      <circle cx="12" cy="12" r="1.8" fill={color} />
    </svg>
  );
}

export default function LoadingScreen() {
  const ref = useRef<HTMLDivElement>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const tl = gsap.timeline({ onComplete: () => setHidden(true) });
    // one continuous, constant-speed revolution of the single ring
    const ring = gsap.to(".loading-ring", {
      rotation: "+=360",
      duration: 9,
      ease: "none",
      repeat: -1,
      transformOrigin: "50% 50%",
    });
    tl.to(el, { yPercent: -100, ease: "power3.inOut", duration: 1, delay: 1.35 });
    return () => {
      ring.kill();
      tl.kill();
    };
  }, []);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  if (hidden) return null;

  return createPortal(
    <div
      ref={ref}
      className="fixed inset-0 z-[100] flex items-center justify-center"
      style={{
        background:
          "radial-gradient(130% 95% at 14% 8%, rgba(230,206,133,0.30) 0%, rgba(230,206,133,0.06) 34%, transparent 62%), " +
          "radial-gradient(120% 100% at 86% 92%, rgba(11,61,40,0.85) 0%, transparent 64%), " +
          "linear-gradient(158deg, #1A7049 0%, #176845 32%, #12573A 62%, #0E4A30 100%)",
      }}
    >
      {/* One liquid-gold ring — a single, smooth revolution */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div
          className="loading-ring rounded-full opacity-45 w-[300px] h-[300px] sm:w-[420px] sm:h-[420px] md:w-[520px] md:h-[520px]"
          style={{
            background:
              "conic-gradient(from 0deg, rgba(230,206,133,0) 0%, #B8913A 18%, #F3E5B8 42%, #D4B156 62%, rgba(230,206,133,0) 88%)",
            maskImage:
              "radial-gradient(circle, transparent 0 84%, #000 86%, #000 89%, transparent 91%)",
            WebkitMaskImage:
              "radial-gradient(circle, transparent 0 84%, #000 86%, #000 89%, transparent 91%)",
            willChange: "transform",
          }}
        />
        {/* warm core glow, no outline */}
        <div
          aria-hidden
          className="absolute rounded-full"
          style={{
            width: "58%",
            height: "58%",
            background: "radial-gradient(circle, rgba(230,206,133,0.13) 0%, transparent 68%)",
          }}
        />
      </div>

      <div className="flex flex-col items-center gap-8 text-center">
        {/* Medallion */}
        <div className="loading-mark-wrap2 relative grid place-items-center" style={{ width: 176, height: 176 }}>

          {/* the blossom, slowly turning */}
          <div
            className="relative"
            style={{ animation: "bloomSpin 16s linear infinite", filter: "drop-shadow(0 0 18px rgba(230,206,133,0.45))" }}
          >
            <Bloom size={86} />
          </div>
        </div>

        <div className="overflow-hidden">
          <div className="loading-word text-white/90 font-display text-[1.6rem] italic tracking-[-0.01em]">
            Fabulous
          </div>
        </div>
        <div className="loading-word loading-word-2 text-[0.55rem] text-white/60 tracking-[0.42em] uppercase">
          Circular · Ethnic · Luxury
        </div>
      </div>

      {/* Progress hairline */}
      <div className="absolute bottom-10 left-1/2 -translate-x-1/2 w-44 h-px bg-white/15 overflow-hidden">
        <div
          className="h-full"
          style={{ background: "linear-gradient(90deg,#B8913A,#F3E5B8)", animation: "loaderbar 1.9s ease-in-out forwards" }}
        />
      </div>

      <style>{`
        @keyframes loaderbar { 0%{width:0} 100%{width:100%} }
        @keyframes bloomSpin { to { transform: rotate(360deg) } }
        @keyframes petalPulse {
          0%, 100% { opacity: .55 }
          50% { opacity: 1 }
        }
        @keyframes markIn {
          0% { opacity: 0; transform: scale(.72) }
          100% { opacity: 1; transform: scale(1) }
        }
        @keyframes wordIn {
          0% { opacity: 0; transform: translateY(14px) }
          100% { opacity: 1; transform: translateY(0) }
        }
        .loading-mark-wrap2 {
          animation: markIn .95s cubic-bezier(.34,1.4,.64,1) both;
        }
        .loading-word, .loading-word + div {
          animation: wordIn .7s ease-out both;
          animation-delay: .22s;
        }
        .loading-word-2 { animation-delay: .38s !important }
        .bloom-petal { animation: petalPulse 2.6s ease-in-out infinite }
        @media (prefers-reduced-motion: reduce) {
          .loading-ring, .bloom-petal, .loading-mark-wrap2, .loading-word { animation: none !important }
        }
      `}</style>
    </div>,
    document.body
  );
}
