import { HandCoins, Leaf, Gem, ShieldCheck } from "lucide-react";

const pillars = [
  { n: "01", title: "Handcrafted", copy: "Every piece is touched by human hands — zari work, bead clusters, block prints, embroidery.", Icon: HandCoins },
  { n: "02", title: "Circular", copy: "Buy, rent, wear — outfits get a second life. Less fabric waste, more cultural joy.", Icon: Leaf },
  { n: "03", title: "Authentic", copy: "From Benarasi silk to Phulkari, we honor the craft, the region, the story.", Icon: Gem },
  { n: "04", title: "Secure", copy: "Verified vendors, quality checks, secure payments every time.", Icon: ShieldCheck },
];

/**
 * Craft — dark emerald immersion with block-print texture.
 * The page's dramatic act break: cream → deep green → cream.
 */
export default function Craft() {
  return (
    <section id="craft" className="atmo-emerald section-xl overflow-hidden">
      {/* Block-print texture veil */}
      <div aria-hidden className="pattern-veil pattern-block" />
      {/* Giant watermark */}
      <div aria-hidden className="absolute top-8 right-0 font-display font-bold leading-none select-none pointer-events-none"
        style={{ fontSize: "clamp(10rem, 26vw, 26rem)", color: "transparent", WebkitTextStroke: "1px rgba(230,206,133,0.14)" }}>
        कला
      </div>

      <div className="ultra relative">
        <div className="reveal mb-16 md:mb-20 max-w-3xl">
          <div className="text-[0.62rem] tracking-[0.42em] uppercase mb-5" style={{ color: "#E6CE85" }}>
            The Standard — कला
          </div>
          <h2 className="font-display font-normal leading-[1.02]" style={{ fontSize: "clamp(2.2rem, 4.6vw, 4.2rem)" }}>
            Four promises,
            <em className="font-light" style={{ color: "#E6CE85" }}> kept every time.</em>
          </h2>
        </div>

        {/* Editorial numbered rows */}
        <div className="border-t" style={{ borderColor: "rgba(242,237,226,0.18)" }}>
          {pillars.map((p, i) => {
            const Icon = p.Icon;
            return (
              <div
                key={p.title}
                className="reveal group grid grid-cols-12 gap-4 md:gap-8 items-baseline py-8 md:py-10 border-b transition-all duration-500"
                style={{ borderColor: "rgba(242,237,226,0.18)", transitionDelay: `${i * 70}ms` }}
              >
                <div className="col-span-2 md:col-span-1 font-display text-2xl md:text-3xl font-light italic" style={{ color: "#E6CE85" }}>
                  {p.n}
                </div>
                <div className="col-span-10 md:col-span-3 flex items-center gap-3">
                  <Icon size={20} strokeWidth={1.4} style={{ color: "#E6CE85" }} className="shrink-0 opacity-70 group-hover:opacity-100 transition-opacity" />
                  <h3 className="font-display text-2xl md:text-3xl font-normal group-hover:translate-x-2 transition-transform duration-500">
                    {p.title}
                  </h3>
                </div>
                <p className="col-span-10 col-start-3 md:col-span-7 md:col-start-6 text-[0.92rem] leading-relaxed" style={{ color: "rgba(242,237,226,0.72)" }}>
                  {p.copy}
                </p>
              </div>
            );
          })}
        </div>

        {/* Materials strip */}
        <div className="mt-14 md:mt-20 grid grid-cols-2 md:grid-cols-4 gap-8">
          {[
            { value: "100%", label: "Benarasi Silk" },
            { value: "Handloom", label: "Cotton" },
            { value: "Gold-tone", label: "Zari Embroidery" },
            { value: "Azo-free", label: "Natural Dyes" },
          ].map((m) => (
            <div key={m.label} className="reveal text-center md:text-left">
              <div className="font-display font-light text-3xl md:text-4xl" style={{ color: "#E6CE85" }}>{m.value}</div>
              <div className="mt-1.5 text-[0.6rem] tracking-[0.3em] uppercase" style={{ color: "rgba(242,237,226,0.55)" }}>{m.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
