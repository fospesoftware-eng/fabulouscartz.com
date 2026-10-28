import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

export default function About() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) return;
    const ctx = gsap.context(() => {
      gsap.from(".about-title-line", { y: 150, opacity: 0, duration: 1.4, stagger: 0.12, ease: "power4.out" });
      gsap.utils.toArray<HTMLElement>(".about-parallax").forEach((el) => {
        gsap.to(el, { yPercent: 12, ease: "none", scrollTrigger: { trigger: el, start: "top bottom", end: "bottom top", scrub: 1.2 } });
      });
      gsap.utils.toArray<HTMLElement>(".story-reveal").forEach((el) => {
        gsap.from(el, { opacity: 0, y: 60, duration: 1, ease: "power3.out", scrollTrigger: { trigger: el, start: "top 85%" } });
      });
    }, rootRef);
    return () => ctx.revert();
  }, []);

  return (
    <div ref={rootRef} className="pt-20">
      {/* CINEMATIC HERO */}
      <section className="relative min-h-[85svh] flex items-center overflow-hidden">
        <div className="absolute inset-0">
          <img src="/img/hero/about-hero.webp" alt="" className="w-full h-full object-cover object-center scale-110 about-parallax" />
          <div aria-hidden className="absolute inset-0" style={{ background: "linear-gradient(135deg, rgba(8,48,28,0.55) 0%, rgba(10,12,10,0.75) 100%)" }} />
        </div>

        <div className="ultra relative text-white py-20">
          <div className="text-[0.62rem] tracking-[0.45em] uppercase text-[#F3E5B8] opacity-80 mb-8">— Our Story</div>
          <h1 className="font-display leading-[0.88] tracking-[-0.03em]" style={{ fontSize: "clamp(3.5rem, 13vw, 13rem)", textShadow: "0 4px 40px rgba(0,0,0,0.55)" }}>
            <div className="about-title-line font-bold">Every outfit</div>
            <div className="about-title-line font-light italic text-[#F3E5B8]">has a <span className="shimmer not-italic font-bold">story</span>.</div>
            <div className="about-title-line font-light italic text-white/80 font-normal text-2xl md:text-3xl lg:text-4xl mt-4">
              Some just deserve to be worn again.
            </div>
          </h1>
        </div>
      </section>

      {/* STORY BLOCKS — minimal magazine */}
      <section className="section-xl narrow space-y-24 md:space-y-32">
        {/* 1 */}
        <div className="story-reveal grid md:grid-cols-12 gap-10 items-center">
          <div className="md:col-span-5 md:col-start-1">
            <div className="aspect-[4/5] overflow-hidden cinematic">
              <img src="/img/about/artisan-weaver.webp" alt="" className="about-parallax w-full h-full object-cover" />
              <div className="grain" />
            </div>
          </div>
          <div className="md:col-span-6 md:col-start-7">
            <div className="micro mb-3">Chapter I</div>
            <p className="font-serif italic text-2xl md:text-3xl leading-relaxed text-[var(--ink-soft)]">
              It started at home.
            </p>
            <p className="mt-6 text-[var(--ink-soft)] leading-relaxed">
              The founder noticed something meaningful in everyday life — his wife's wardrobe was filled with incredible{" "}
              <strong style={{ color: "var(--ink)" }}>Indian ethnic wear</strong>. Silk sarees, intricately crafted
              lehengas, elegant churidars. Each chosen with love, each carrying a story. Yet many were worn just once.
            </p>
          </div>
        </div>

        {/* 2 — reversed */}
        <div className="story-reveal grid md:grid-cols-12 gap-10 items-center">
          <div className="md:col-span-5 md:col-start-8 md:[order-2]">
            <div className="aspect-[4/5] overflow-hidden cinematic">
              <img src="/img/about/loom.webp" alt="" className="about-parallax w-full h-full object-cover" />
              <div className="grain" />
            </div>
          </div>
          <div className="md:col-span-5 md:col-start-1 md:[order-1]">
            <div className="micro mb-3">Chapter II</div>
            <p className="font-serif italic text-2xl md:text-3xl leading-relaxed text-[var(--ink-soft)]">
              From one wardrobe, a shared closet.
            </p>
            <p className="mt-6 text-[var(--ink-soft)] leading-relaxed">
              His wife's collection represented celebrations — weddings, festivals, milestones. But like many wardrobes,
              it held more potential than opportunity. Fabulous Cartz was born to connect people who own beautiful outfits
              with those who want to wear them.
            </p>
          </div>
        </div>

        {/* 3 */}
        <div className="story-reveal grid md:grid-cols-12 gap-10 items-center">
          <div className="md:col-span-5 md:col-start-1">
            <div className="aspect-[4/5] overflow-hidden cinematic">
              <img src="/img/about/artisan-2.webp" alt="" className="about-parallax w-full h-full object-cover" />
              <div className="grain" />
            </div>
          </div>
          <div className="md:col-span-6 md:col-start-7">
            <div className="micro mb-3">Chapter III</div>
            <p className="font-serif italic text-2xl md:text-3xl leading-relaxed text-[var(--ink-soft)]">
              Beautiful outfits. Limited moments.
            </p>
            <p className="mt-6 text-[var(--ink-soft)] leading-relaxed">
              Traditional wear is expensive and occasion-specific. Many outfits remain unused after a single event, while
              others search endlessly for something special. We built Fabulous Cartz to make fashion more accessible,
              sustainable, and meaningful.
            </p>
          </div>
        </div>
      </section>

      {/* MISSION + VISION — big blocks, real images */}
      <section className="section-xl ultra">
        <div className="grid md:grid-cols-2 gap-6 md:gap-8">
          <div className="story-reveal relative min-h-[420px] overflow-hidden group">
            <img src="/img/about/fabric.webp" alt="" className="absolute inset-0 w-full h-full object-cover transition-transform duration-[1500ms] ease-out group-hover:scale-[1.04]" />
            <div aria-hidden className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(8,48,28,0.2) 0%, rgba(8,48,28,0.85) 100%)" }} />
            <div className="relative h-full flex flex-col justify-end p-10 md:p-14 text-white">
              <div className="text-[0.62rem] tracking-[0.4em] uppercase text-[#F3E5B8] opacity-80 mb-4">Our Mission</div>
              <h3 className="font-display font-light italic text-4xl md:text-5xl leading-[1.02]">
                Give every outfit a <em className="not-italic font-bold shimmer">second</em> life.
              </h3>
              <p className="mt-4 font-serif italic text-white/85 font-light max-w-md leading-relaxed">
                And every person a chance to feel extraordinary. Sustainable fashion for a circular world.
              </p>
            </div>
          </div>
          <div className="story-reveal relative min-h-[420px] overflow-hidden group">
            <img src="/img/hero/craft.webp" alt="" className="absolute inset-0 w-full h-full object-cover transition-transform duration-[1500ms] ease-out group-hover:scale-[1.04]" />
            <div aria-hidden className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgba(106,79,27,0.25) 0%, rgba(106,79,27,0.85) 100%)" }} />
            <div className="relative h-full flex flex-col justify-end p-10 md:p-14 text-[var(--ink-inv)]">
              <div className="text-[0.62rem] tracking-[0.4em] uppercase text-white/85 mb-4">Our Vision</div>
              <h3 className="font-display font-light italic text-4xl md:text-5xl leading-[1.02]">
                A world where style is <em className="not-italic font-bold">shared</em>, not stored.
              </h3>
              <p className="mt-4 font-serif italic text-white/90 font-light max-w-md leading-relaxed">
                Every celebration unique. Fashion circular. Culture experienced — not preserved.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CLOSING — minimalist quote + CTA */}
      <section className="section-xl narrow text-center">
        <div className="story-reveal">
          <p className="font-serif italic text-3xl md:text-5xl leading-[1.15] font-light text-[var(--ink-soft)]">
            "Your next outfit already exists. Find it. Wear it. Love it."
          </p>
          <div className="mt-6 text-[0.62rem] tracking-[0.4em] uppercase opacity-40">— The Fabulous Cartz Family</div>

          <div className="mt-14">
            <Link to="/category/womens-wear" className="btn-fill">
              <span>Enter the Collection</span>
              <ArrowRight size={14} strokeWidth={1.5} />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
