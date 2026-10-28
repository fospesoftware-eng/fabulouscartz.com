import { Link } from "react-router-dom";
import { Star } from "lucide-react";

const testimonials = [
  {
    quote: "I rented a lehenga for my cousin's wedding — it fit perfectly and arrived on time. My mother wants me to buy one now.",
    name: "Ananya R.",
    role: "Rented · Bangalore",
    image: "/img/products/bridal-lehenga.jpg",
    piece: "Crimson Bridal Lehenga",
    to: "/product/bridal-lehenga",
  },
  {
    quote: "As an artisan, selling through Fabulous Cartz has opened up customers I'd never reach on my own. Every order feels personal.",
    name: "Priya K.",
    role: "Artisan · Viya Crafts",
    image: "/img/about/artisan-weaver.jpg",
    piece: "At the zari handloom",
    to: "/about",
  },
  {
    quote: "My daughter's sharara was the talk of the school function. I rented it for a fraction of retail — and she loved it.",
    name: "Jennifer S.",
    role: "Parent · Delaware",
    image: "/img/products/kids-ethnic.jpg",
    piece: "Festive Lehenga",
    to: "/category/kids-wear",
  },
];

/**
 * Testimonials — warm sand atmosphere, block-print texture,
 * each voice paired with the piece or the hands behind it.
 */
export default function Testimonials() {
  return (
    <section className="atmo-sand section-xl relative overflow-hidden">
      <div aria-hidden className="pattern-veil pattern-block" />

      <div className="ultra relative">
        <div className="reveal mb-14 md:mb-20 flex flex-col md:flex-row md:items-end md:justify-between gap-6">
          <div>
            <div className="text-[0.62rem] tracking-[0.42em] uppercase mb-5" style={{ color: "var(--ink-muted)" }}>
              Worn · Loved · Remembered
            </div>
            <h2 className="font-display font-normal leading-[1.02]" style={{ fontSize: "clamp(2.2rem, 4.6vw, 4.2rem)" }}>
              From our <em className="font-light" style={{ color: "var(--gold-deep)" }}>wearers.</em>
            </h2>
          </div>
          <div className="flex items-center gap-4">
            <div className="font-display font-light leading-none" style={{ fontSize: "clamp(3rem, 6vw, 5rem)", color: "var(--ink)" }}>4.9</div>
            <div>
              <div className="flex gap-0.5" style={{ color: "var(--gold)" }}>
                {Array.from({ length: 5 }).map((_, i) => <Star key={i} size={12} fill="currentColor" />)}
              </div>
              <div className="mt-1.5 text-[0.6rem] tracking-[0.28em] uppercase" style={{ color: "var(--ink-muted)" }}>
                1,200+ Reviews
              </div>
            </div>
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-10 md:gap-8">
          {testimonials.map((t, i) => (
            <figure key={t.name} className="reveal" style={{ transitionDelay: `${i * 90}ms` }}>
              {/* Real photograph of the piece / the maker */}
              <Link to={t.to} className="group block overflow-hidden relative">
                <img
                  src={t.image}
                  alt={t.piece}
                  loading="lazy"
                  className="w-full aspect-[4/5] object-cover transition-transform duration-[1200ms] ease-[cubic-bezier(.2,.8,.2,1)] group-hover:scale-[1.05]"
                />
                <div className="grain" />
                <figcaption
                  className="absolute bottom-0 inset-x-0 px-3 py-2.5 text-[0.54rem] tracking-[0.24em] uppercase text-white"
                  style={{ background: "linear-gradient(180deg, transparent, rgba(12,14,12,0.72))" }}
                >
                  {t.piece}
                </figcaption>
              </Link>

              <div className="relative pt-6">
                <div
                  aria-hidden
                  className="font-display leading-none select-none absolute -top-2 left-0"
                  style={{ fontSize: "4.4rem", color: "var(--gold)", opacity: 0.28 }}
                >
                  "
                </div>
                <blockquote className="relative font-display text-lg md:text-xl font-normal leading-[1.5]" style={{ color: "var(--ink)" }}>
                  {t.quote}
                </blockquote>
                <figcaption className="mt-5 pt-4 border-t flex items-baseline justify-between" style={{ borderColor: "var(--line-strong)" }}>
                  <span className="text-[0.78rem] font-medium tracking-wide">{t.name}</span>
                  <span className="text-[0.58rem] tracking-[0.26em] uppercase" style={{ color: "var(--ink-muted)" }}>{t.role}</span>
                </figcaption>
              </div>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
