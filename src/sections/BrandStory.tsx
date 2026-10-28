import { Link } from "react-router-dom";

/**
 * DVF split section — "Signature Styles, Refreshed for Fall" pattern.
 * Image left, text right. Clean serif, one rectangular CTA. No chrome.
 */
export default function BrandStory() {
  return (
    <section id="story" className="section-lg ultra">
      <div className="grid md:grid-cols-2 gap-8 md:gap-16 items-center">
        {/* Image */}
        <div className="reveal-left overflow-hidden">
          <img
            src="/img/hero/about-hero.jpg"
            alt="Our heritage story"
            loading="lazy"
            className="w-full aspect-[4/5] md:aspect-[4/4] object-cover hover:scale-[1.03] transition-transform duration-[1400ms] ease-[cubic-bezier(.2,.8,.2,1)]"
          />
        </div>

        {/* Text */}
        <div className="reveal-right md:pl-6">
          <div className="text-[0.65rem] tracking-[0.42em] uppercase mb-5" style={{ color: "var(--ink-muted)" }}>
            Our Story
          </div>
          <h2 className="font-display font-normal leading-[1.05]" style={{ fontSize: "clamp(2rem, 4vw, 3.8rem)" }}>
            Heritage pieces,<br />
            <em className="font-light">refreshed for now.</em>
          </h2>
          <p className="mt-6 text-[0.95rem] leading-relaxed max-w-md" style={{ color: "var(--ink-soft)" }}>
            Fabulous Cartz began with one wardrobe of beautiful Indian ethnic wear — silk sarees, handcrafted
            lehengas, elegant churidars — each worn once, each carrying a story. We give those pieces a second life:
            buy, rent, and rewear, while independent artisans find the audience their craft deserves.
          </p>
          <div className="mt-8 flex items-center gap-8">
            <Link
              to="/about"
              className="inline-block px-9 py-3.5 border text-[0.68rem] tracking-[0.3em] uppercase font-medium transition-colors duration-400"
              style={{ borderColor: "var(--ink)", color: "var(--ink)" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--ink)"; e.currentTarget.style.color = "var(--ink-inv)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--ink)"; }}
            >
              Discover More
            </Link>
            <Link to="/category/handmade-jewelry" className="btn-underline">Shop Jewelry</Link>
          </div>
        </div>
      </div>
    </section>
  );
}
