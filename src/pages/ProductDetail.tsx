import { useParams, Link } from "react-router-dom";
import { Star, Heart, Share2, ShoppingCart, Truck, RefreshCw, ShieldCheck, CalendarDays, Rotate3d } from "lucide-react";
import { getProduct, featuredProducts } from "../data";
import ProductCard from "../components/ProductCard";
import { useState, useEffect, useRef } from "react";
import { useCart } from "../context/CartContext";
import gsap from "gsap";

const RENT_BOXES = [
  { days: 3, mult: 1, tag: null },
  { days: 5, mult: 1.2, tag: "Most Loved" },
  { days: 7, mult: 1.35, tag: null },
];

export default function ProductDetail() {
  const { slug } = useParams();
  const product = getProduct(slug || "");
  const { add } = useCart();
  const [qty, setQty] = useState(1);
  const [activeMode, setActiveMode] = useState<"buy" | "rent">(product?.mode === "rent" ? "rent" : "buy");
  const [rentDays, setRentDays] = useState(5);
  const [added, setAdded] = useState(false);
  const [activeImg, setActiveImg] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const tiltRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!product) return;
    setActiveMode(product.mode === "rent" ? "rent" : "buy");
    setActiveImg(0);
  }, [slug, product]);

  useEffect(() => {
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced || !rootRef.current) return;
    const ctx = gsap.context(() => {
      gsap.from(".pd-gallery > *", { opacity: 0, y: 40, duration: 0.9, stagger: 0.08, ease: "power3.out" });
      gsap.from(".pd-info-block", { opacity: 0, y: 30, duration: 0.7, stagger: 0.06, ease: "power3.out", delay: 0.2 });
    }, rootRef);
    return () => ctx.revert();
  }, [slug]);

  if (!product) {
    return (
      <div className="pt-32 text-center pb-20 narrow">
        <p className="micro mb-3">404</p>
        <h1 className="font-display text-4xl mb-6">Not found</h1>
        <Link to="/" className="btn-underline">Back to Home →</Link>
      </div>
    );
  }

  const related = featuredProducts().filter((p) => p.slug !== product.slug).slice(0, 4);
  const thumbs = [product.image, product.image, product.image, product.image];

  // Rental math — 3-day base derives from product price
  const rentBase = product.mode === "rent" ? product.price : Math.max(29, Math.round(product.price * 0.35));
  const rentPrice = (d: number) => Math.round(rentBase * (RENT_BOXES.find((b) => b.days === d)?.mult ?? 1));
  const isRent = activeMode === "rent";
  const displayPrice = isRent ? rentPrice(rentDays) : product.price;

  /* ---- Minimal CSS-3D tilt ---- */
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const onTilt = (e: React.MouseEvent) => {
    if (reduced || !tiltRef.current) return;
    const r = tiltRef.current.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    gsap.to(tiltRef.current, { rotateY: px * 9, rotateX: -py * 7, duration: 0.6, ease: "power2.out", transformPerspective: 1000 });
    gsap.to(".pd-glare", { xPercent: px * 70, yPercent: py * 70, opacity: 0.55, duration: 0.6, ease: "power2.out" });
  };
  const onTiltEnd = () => {
    if (!tiltRef.current) return;
    gsap.to(tiltRef.current, { rotateX: 0, rotateY: 0, duration: 1, ease: "power3.out" });
    gsap.to(".pd-glare", { opacity: 0, duration: 0.8 });
  };

  return (
    <div ref={rootRef} className="pt-20">
      {/* Breadcrumb */}
      <div className="ultra pt-6 text-[0.62rem] tracking-[0.32em] uppercase opacity-50">
        <Link to="/" className="hover:opacity-100">Home</Link> <span className="mx-2 opacity-30">/</span>
        <Link to={`/category/${product.category}`} className="hover:opacity-100 capitalize">{product.category.replace("-", " ")}</Link> <span className="mx-2 opacity-30">/</span>
        <span className="opacity-80">{product.name}</span>
      </div>

      {/* GALLERY + INFO */}
      <div className="ultra py-12 md:py-20 grid lg:grid-cols-12 gap-10 lg:gap-20">
        {/* Gallery — 3D tilt stage */}
        <div className="lg:col-span-7 pd-gallery space-y-4">
          <div className="relative" style={{ perspective: "1200px" }}>
            <div
              ref={tiltRef}
              onMouseMove={onTilt}
              onMouseLeave={onTiltEnd}
              className="aspect-[4/5] overflow-hidden relative cinematic will-change-transform"
              style={{ transformStyle: "preserve-3d" }}
            >
              <img
                src={thumbs[activeImg]}
                alt={product.name}
                key={activeImg}
                className="w-full h-full object-cover"
                style={{ transform: "translateZ(28px) scale(1.04)" }}
                draggable={false}
              />
              {/* Light glare following cursor */}
              <div
                className="pd-glare absolute inset-0 pointer-events-none opacity-0"
                style={{ background: "radial-gradient(circle at 50% 40%, rgba(255,255,255,0.35) 0%, transparent 55%)" }}
              />
              <div className="grain" />
              {product.newArrival && <span className="absolute top-5 left-5 pc-tag">New</span>}
              {product.topSeller && <span className="absolute top-5 right-5 pc-tag gold">Top</span>}
              {/* 3D hint */}
              <span className="absolute bottom-4 right-4 flex items-center gap-1.5 text-[0.58rem] tracking-[0.22em] uppercase text-white/90 bg-black/35 backdrop-blur px-3 py-1.5">
                <Rotate3d size={12} strokeWidth={1.5} /> Move to explore
              </span>
            </div>
          </div>
          {/* Thumbnails */}
          <div className="grid grid-cols-4 gap-3">
            {thumbs.map((src, i) => (
              <button
                key={i}
                onClick={() => setActiveImg(i)}
                className="aspect-square overflow-hidden relative transition-opacity duration-300"
                style={{ opacity: activeImg === i ? 1 : 0.55 }}
              >
                <img src={src} alt={`View ${i + 1}`} className="w-full h-full object-cover hover:opacity-100 transition-opacity" />
                {activeImg === i && <span className="absolute inset-x-0 bottom-0 h-px bg-[var(--emerald)]" />}
              </button>
            ))}
          </div>
        </div>

        {/* INFO — minimal editorial */}
        <div className="lg:col-span-5 lg:sticky lg:top-24 lg:self-start">
          <div className="pd-info-block text-[0.62rem] tracking-[0.3em] uppercase" style={{ color: "var(--emerald)" }}>
            {product.vendor}
          </div>
          <h1 className="pd-info-block font-display text-4xl md:text-5xl font-light leading-[1.02] mt-3">
            {product.name}
          </h1>
          <div className="pd-info-block flex items-center gap-3 mt-4">
            <div className="flex gap-0.5 text-[var(--gold)]">
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} size={13} fill={i < Math.round(product.rating) ? "currentColor" : "none"} strokeWidth={1.2} />
              ))}
            </div>
            <span className="text-sm opacity-60">{product.rating.toFixed(1)} · {product.reviews} reviews</span>
          </div>

          {/* Price */}
          <div className="pd-info-block mt-8 pb-6 border-b border-[var(--line-strong)]">
            <span className="font-display text-3xl gold-gradient">${displayPrice}.00</span>
            {isRent && <span className="ml-3 text-sm opacity-60">for {rentDays} days</span>}
            {!isRent && product.originalPrice && <span className="line-through opacity-50 ml-3">${product.originalPrice}</span>}
          </div>

          {/* Mode */}
          <div className="pd-info-block mt-8">
            {product.mode !== "both" ? (
              <div className="font-display italic text-lg" style={{ color: "var(--emerald)" }}>
                {product.mode === "rent" ? "Available for Rent" : "Available for Purchase"}
              </div>
            ) : (
              <div className="flex gap-8">
                {(["buy", "rent"] as const).map((m) => (
                  <button
                    key={m}
                    onClick={() => setActiveMode(m)}
                    className="relative font-display italic text-lg transition-colors duration-300"
                    style={{ color: activeMode === m ? "var(--ink)" : "var(--ink-muted)" }}
                  >
                    {m === "buy" ? "Buy" : "Rent"}
                    {activeMode === m && <span className="absolute left-0 right-0 -bottom-1 h-px bg-[var(--emerald)]" />}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* RENTAL BOXES — creative duration selector */}
          {isRent && (
            <div className="pd-info-block mt-8">
              <div className="flex items-center gap-2.5 mb-4 text-[0.62rem] tracking-[0.3em] uppercase" style={{ color: "var(--ink-muted)" }}>
                <CalendarDays size={13} strokeWidth={1.5} style={{ color: "var(--gold)" }} />
                Choose your rental window
              </div>
              <div className="grid grid-cols-3 gap-3">
                {RENT_BOXES.map((b) => {
                  const price = rentPrice(b.days);
                  const selected = rentDays === b.days;
                  return (
                    <button
                      key={b.days}
                      onClick={() => setRentDays(b.days)}
                      className="relative border p-3 pt-4 sm:p-4 sm:pt-5 text-center transition-all duration-400"
                      style={{
                        borderColor: selected ? "var(--ink)" : "var(--line-strong)",
                        background: selected ? "var(--ink)" : "transparent",
                        color: selected ? "var(--ink-inv)" : "var(--ink)",
                      }}
                    >
                      {/* Gold diamond marker */}
                      <span
                        className="absolute -top-[5px] left-1/2 -translate-x-1/2 w-2.5 h-2.5 rotate-45 transition-opacity duration-300"
                        style={{ background: "var(--gold)", opacity: selected ? 1 : 0 }}
                      />
                      {b.tag && (
                        <span className="absolute -top-2.5 right-2 text-[0.52rem] tracking-[0.14em] uppercase px-1.5 py-0.5"
                          style={{ background: "var(--gold)", color: "#1A1714" }}>
                          {b.tag}
                        </span>
                      )}
                      <div className="font-display font-light leading-none text-[1.65rem] sm:text-[2rem]" style={{ color: selected ? "#E6CE85" : "var(--ink)" }}>
                        {String(b.days).padStart(2, "0")}
                      </div>
                      <div className="mt-1 text-[0.6rem] tracking-[0.3em] uppercase" style={{ opacity: selected ? 0.75 : 0.55 }}>
                        Days
                      </div>
                      <div className="mt-3 pt-3 border-t font-display text-lg" style={{ borderColor: selected ? "rgba(237,232,223,0.2)" : "var(--line-strong)" }}>
                        ${price}
                      </div>
                      <div className="text-[0.58rem] mt-0.5" style={{ opacity: selected ? 0.6 : 0.45 }}>
                        ${(price / b.days).toFixed(0)}/day
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="mt-4 flex items-center justify-between text-[0.66rem]" style={{ color: "var(--ink-muted)" }}>
                <span>✦ $20 refundable deposit included</span>
                <span>✦ Free return pickup</span>
              </div>
            </div>
          )}

          {/* Add to bag */}
          <div className="pd-info-block mt-10 flex items-center gap-5">
            {!isRent && (
              <div className="flex items-center border-b border-[var(--line-strong)]">
                <button onClick={() => setQty((q) => Math.max(1, q - 1))} className="px-3 py-2 hover:text-[var(--emerald)]">−</button>
                <span className="px-4 min-w-[40px] text-center font-display text-lg">{qty}</span>
                <button onClick={() => setQty((q) => q + 1)} className="px-3 py-2 hover:text-[var(--emerald)]">+</button>
              </div>
            )}
            <button
              className="btn-fill flex-1"
              onClick={() => {
                add({
                  slug: `${product.slug}${isRent ? `-rent-${rentDays}d` : ""}`,
                  name: isRent ? `${product.name} (Rent · ${rentDays} days)` : product.name,
                  price: displayPrice,
                  image: product.image,
                  vendor: product.vendor,
                  quantity: isRent ? 1 : qty,
                });
                setAdded(true);
                setTimeout(() => setAdded(false), 1800);
              }}
            >
              <ShoppingCart size={14} strokeWidth={1.5} />
              <span>{added ? "Added to Bag" : isRent ? `Rent for ${rentDays} Days · $${displayPrice}` : `Add to Bag · $${product.price * qty}`}</span>
            </button>
          </div>

          {/* Actions */}
          <div className="pd-info-block mt-6 flex gap-8 text-[0.62rem] tracking-[0.28em] uppercase opacity-60">
            <button className="hover:opacity-100 flex items-center gap-1.5"><Heart size={12} strokeWidth={1.5} /> Save</button>
            <button className="hover:opacity-100 flex items-center gap-1.5"><Share2 size={12} strokeWidth={1.5} /> Share</button>
          </div>

          {/* Features */}
          <div className="pd-info-block mt-12 grid grid-cols-3 gap-0 border-t border-b py-6 border-[var(--line-strong)]">
            {[
              { Icon: Truck, label: "Ships 4–6 days" },
              { Icon: RefreshCw, label: "7-day returns" },
              { Icon: ShieldCheck, label: "Secure payment" },
            ].map(({ Icon, label }, i) => (
              <div key={label} className={`text-center ${i < 2 ? "border-r border-[var(--line-strong)]" : ""}`}>
                <Icon size={18} strokeWidth={1.4} style={{ color: "var(--emerald)" }} className="mx-auto mb-2" />
                <div className="text-[0.58rem] tracking-[0.25em] uppercase opacity-55">{label}</div>
              </div>
            ))}
          </div>

          {/* Description */}
          <div className="pd-info-block mt-10 space-y-4">
            <p className="font-serif italic text-lg leading-relaxed text-[var(--ink-soft)]">
              {product.description}
            </p>
            <div className="pt-4 border-t border-[var(--line-strong)]">
              <ul className="space-y-2 text-sm text-[var(--ink-soft)]">
                {product.details.map((d) => (
                  <li key={d} className="flex gap-3">
                    <span style={{ color: "var(--gold)" }} className="text-xs">✦</span>{d}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* RELATED */}
      <div className="ultra pb-24">
        <div className="flex items-center gap-4 mb-10">
          <span className="micro">You May Also Love</span>
          <span className="flex-1 h-px bg-[var(--line-strong)]" />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-20">
          {related.map((p, i) => <ProductCard key={p.slug} product={p} index={i} />)}
        </div>
      </div>
    </div>
  );
}
