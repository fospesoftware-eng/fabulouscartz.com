import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";

const steps = [
  { n: "01", t: "Photograph & send", m: "2 min" },
  { n: "02", t: "We curate it", m: "48 h" },
  { n: "03", t: "You earn", m: "70%" },
];

/**
 * The Consignor Programme — one full-bleed photograph, one invitation.
 * Editorial overlay, generous padding, two precise buttons.
 */
export default function CTA() {
  return (
    <section id="sell" className="relative overflow-hidden">
      {/* FULL-WIDTH BACKGROUND PHOTOGRAPH */}
      <img
        src="/img/hero/seller.webp"
        alt="A consignor arranging hand-embroidered lehengas in her boutique"
        className="absolute inset-0 w-full h-full object-cover"
        style={{ objectPosition: "62% 45%" }}
        loading="lazy"
      />
      {/* GRADED OVERLAY — ink from the left, emerald at the floor */}
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(90deg, rgba(8,20,14,0.94) 0%, rgba(8,20,14,0.80) 38%, rgba(8,20,14,0.34) 66%, rgba(8,20,14,0.12) 100%), " +
            "linear-gradient(0deg, rgba(8,20,14,0.86) 0%, rgba(8,20,14,0.10) 42%, rgba(8,20,14,0) 100%)",
        }}
      />
      <div aria-hidden className="pattern-veil pattern-block opacity-40" />

      <div className="ultra relative flex items-center min-h-[600px] md:min-h-[680px] py-20 md:py-28">
        <div className="w-full max-w-[36rem] md:max-w-[40rem]">
          {/* Eyebrow */}
          <div className="flex items-center gap-4 mb-8 md:mb-10">
            <span className="text-[0.55rem] tracking-[0.42em] uppercase" style={{ color: "#E6CE85" }}>
              07 — The Consignor Programme
            </span>
            <span className="h-px w-16 md:w-24" style={{ background: "linear-gradient(90deg, rgba(230,206,133,0.6), transparent)" }} />
          </div>

          <h2
            className="font-display font-normal leading-[0.94] tracking-[-0.025em]"
            style={{ fontSize: "clamp(2.4rem, 5.6vw, 4.4rem)", color: "#F6F1E6" }}
          >
            Sell your
            <br />
            <em className="font-light" style={{ color: "#E6CE85" }}>costumes.</em>
            <br />
            Earn every celebration.
          </h2>

          <p className="mt-6 max-w-md text-[0.92rem] leading-relaxed" style={{ color: "rgba(246,241,230,0.66)" }}>
            A lehenga worn once, a dance costume outgrown, a saree that deserves a second stage.
            List it with us and let it earn while it rests.
          </p>

          {/* Steps — inline, gold separated */}
          <div className="mt-9 flex flex-wrap items-center gap-x-7 gap-y-3">
            {steps.map((s, i) => (
              <div key={s.n} className="flex items-center gap-7">
                {i > 0 && <span aria-hidden className="hidden sm:block w-1 h-1 rounded-full" style={{ background: "rgba(230,206,133,0.6)" }} />}
                <div>
                  <div className="text-[0.44rem] tracking-[0.32em] uppercase" style={{ color: "rgba(230,206,133,0.75)" }}>
                    {s.n}
                  </div>
                  <div className="mt-1 text-[0.68rem] tracking-[0.2em] uppercase" style={{ color: "#F6F1E6" }}>
                    {s.t}
                  </div>
                  <div className="mt-0.5 font-display italic text-[0.78rem]" style={{ color: "rgba(246,241,230,0.5)" }}>
                    {s.m}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Buttons */}
          <div className="mt-10 md:mt-11 flex flex-col sm:flex-row sm:items-center gap-3.5">
            <Link
              to="/contact"
              className="group inline-flex items-center justify-center gap-2.5 px-8 py-4 text-[0.6rem] tracking-[0.3em] uppercase transition-all duration-400 hover:brightness-110"
              style={{ background: "linear-gradient(90deg,#B8913A,#E6CE85 52%,#B8913A)", color: "#10200F" }}
            >
              Open your ledger
              <ArrowUpRight size={13} strokeWidth={2.2} className="transition-transform duration-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </Link>
            <Link
              to="/about"
              className="group inline-flex items-center justify-center gap-2.5 px-8 py-4 text-[0.6rem] tracking-[0.3em] uppercase transition-colors duration-400"
              style={{ border: "1px solid rgba(246,241,230,0.34)", color: "#F6F1E6" }}
            >
              How it works
            </Link>
          </div>

          {/* Footnote */}
          <div className="mt-7 text-[0.52rem] tracking-[0.26em] uppercase" style={{ color: "rgba(246,241,230,0.4)" }}>
            No listing fees &nbsp;·&nbsp; Paid weekly &nbsp;·&nbsp; 18 consignors
          </div>
        </div>
      </div>
    </section>
  );
}
