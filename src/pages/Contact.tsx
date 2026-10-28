import { useState } from "react";
import { MapPin, Phone, Mail, Send } from "lucide-react";
import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

export default function Contact() {
  const [sent, setSent] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) return;
    const ctx = gsap.context(() => {
      gsap.from(".contact-title-line", { y: 120, opacity: 0, duration: 1.2, stagger: 0.12, ease: "power4.out" });
      gsap.from(".contact-info", { opacity: 0, y: 30, duration: 0.8, stagger: 0.08, ease: "power3.out", scrollTrigger: { trigger: ".contact-body", start: "top 85%" } });
    }, rootRef);
    return () => ctx.revert();
  }, []);

  return (
    <div ref={rootRef} className="pt-20">
      {/* CINEMATIC HERO */}
      <section className="relative min-h-[65svh] flex items-center overflow-hidden">
        <div className="absolute inset-0">
          <img src="/img/hero/craft.webp" alt="" className="w-full h-full object-cover object-center scale-110" />
          <div aria-hidden className="absolute inset-0" style={{ background: "linear-gradient(135deg, rgba(10,12,10,0.55) 0%, rgba(10,12,10,0.85) 100%)" }} />
        </div>
        <div className="ultra relative text-white py-16">
          <div className="text-[0.62rem] tracking-[0.45em] uppercase text-[#F3E5B8] opacity-80 mb-8">— Get In Touch</div>
          <h1 className="font-display leading-[0.88] tracking-[-0.03em]" style={{ fontSize: "clamp(3rem, 12vw, 12rem)", textShadow: "0 4px 40px rgba(0,0,0,0.55)" }}>
            <div className="contact-title-line font-bold">Say hello.</div>
            <div className="contact-title-line font-light italic text-white/80 font-normal text-2xl md:text-3xl mt-4">
              We answer every message within 24 hours.
            </div>
          </h1>
        </div>
      </section>

      {/* BODY — minimal editorial layout */}
      <section className="ultra py-16 md:py-24 contact-body">
        <div className="grid lg:grid-cols-12 gap-10 lg:gap-20">
          {/* LEFT — Info, minimal */}
          <aside className="lg:col-span-5 space-y-0 contact-info">
            <div className="flex items-center gap-5 py-6 border-b border-[var(--line-strong)]">
              <MapPin size={16} strokeWidth={1.4} style={{ color: "var(--emerald)" }} />
              <div>
                <div className="font-display text-base">Address</div>
                <div className="text-sm opacity-60 mt-1">8 The Green, #22391 · Dover, DE 19901</div>
              </div>
            </div>
            <div className="flex items-center gap-5 py-6 border-b border-[var(--line-strong)]">
              <Phone size={16} strokeWidth={1.4} style={{ color: "var(--emerald)" }} />
              <div>
                <div className="font-display text-base">Phone</div>
                <div className="text-sm opacity-60 mt-1">(346) 481-2640 · Mon–Fri 9am–6pm ET</div>
              </div>
            </div>
            <div className="flex items-center gap-5 py-6 border-b border-[var(--line-strong)]">
              <Mail size={16} strokeWidth={1.4} style={{ color: "var(--emerald)" }} />
              <div>
                <div className="font-display text-base">Email</div>
                <div className="text-sm opacity-60 mt-1">support@fabulouscartz.com</div>
              </div>
            </div>
            <div className="pt-6">
              <div className="micro mb-3">For Vendors</div>
              <div className="text-sm opacity-60">wholesale@fabulouscartz.com</div>
            </div>
          </aside>

          {/* RIGHT — Form, minimal */}
          <form
            className="lg:col-span-7 border border-[var(--line-strong)] p-8 md:p-12 contact-info"
            onSubmit={(e) => { e.preventDefault(); setSent(true); setTimeout(() => setSent(false), 3500); }}
          >
            <h2 className="font-display font-light text-3xl md:text-4xl mb-10">Send a message</h2>

            <div className="grid sm:grid-cols-2 gap-8">
              <Field label="First name" placeholder="Jane" />
              <Field label="Last name" placeholder="Doe" />
              <Field label="Email" type="email" placeholder="you@example.com" />
              <Field label="Subject" placeholder="Order #1234 · Question" />
            </div>

            <div className="mt-8">
              <label className="text-[0.62rem] tracking-[0.3em] uppercase opacity-50 mb-3 block">Message</label>
              <textarea
                rows={5}
                placeholder="Tell us what you need..."
                className="w-full bg-transparent border-b border-[var(--line-strong)] focus:border-[var(--emerald)] outline-none py-3 text-sm transition-colors resize-none"
              />
            </div>

            <button type="submit" className="btn-fill mt-10">
              <Send size={14} strokeWidth={1.5} />
              <span>{sent ? "Sent! We'll be in touch." : "Send Message"}</span>
            </button>
          </form>
        </div>
      </section>

      {/* FAQ — hairline dividers */}
      <section className="section-xl" style={{ background: "var(--bg-soft)" }}>
        <div className="ultra">
          <div className="reveal mb-14">
            <div className="flex items-center gap-4 mb-6">
              <span className="micro">FAQ</span>
              <span className="flex-1 h-px bg-[var(--line-strong)]" />
            </div>
            <h2 className="font-display font-light italic text-3xl md:text-5xl leading-[0.95]">
              Quick answers.
            </h2>
          </div>

          <div className="border-t border-[var(--line-strong)]">
            {[
              { q: "How does renting work?", a: "Pick an outfit, choose your rental window (3 / 5 / 7 days), check out, and we ship it. Return in the pre-paid box." },
              { q: "Is shipping free?", a: "Free on orders over $75 within the US. International shipping calculated at checkout." },
              { q: "Can I sell my own outfits?", a: "Yes — we onboard independent vendors. Drop us a line and we'll walk you through the process." },
              { q: "What's your return policy?", a: "Buy items have a 7-day return window. Rental items need to be returned clean and undamaged." },
            ].map((item) => (
              <details key={item.q} className="reveal group border-b border-[var(--line-strong)] py-6 md:py-8 cursor-pointer" style={{ transitionDelay: "60ms" }}>
                <summary className="flex items-start justify-between gap-6 list-none">
                  <span className="font-display text-lg md:text-xl font-normal">{item.q}</span>
                  <span className="text-[var(--emerald)] text-xl transition-transform duration-500 group-open:rotate-45 font-light">+</span>
                </summary>
                <p className="mt-4 text-[var(--ink-soft)] leading-relaxed max-w-2xl">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

function Field({ label, type = "text", placeholder }: { label: string; type?: string; placeholder?: string }) {
  return (
    <div>
      <label className="text-[0.62rem] tracking-[0.3em] uppercase opacity-50 mb-3 block">{label}</label>
      <input
        type={type}
        placeholder={placeholder}
        className="w-full bg-transparent border-b border-[var(--line-strong)] focus:border-[var(--emerald)] outline-none py-3 text-sm transition-colors"
      />
    </div>
  );
}
