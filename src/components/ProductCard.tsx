import { Link } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { Heart, ShoppingBag } from "lucide-react";
import { useCart } from "../context/CartContext";
import type { Product } from "../data";

/**
 * DVF-style product card:
 * image → optional badge → name → price → colour line + swatch dots → "More Colors"
 * Clean, no chrome. Quick-add appears on hover.
 *
 * Reveals itself with its own IntersectionObserver so cards mounted after a
 * tab / mode switch still animate in (the global observer only sees the
 * first render).
 */
export default function ProductCard({
  product,
  index = 0,
  mode = "buy",
}: {
  product: Product;
  index?: number;
  mode?: "buy" | "rent";
}) {
  const { add } = useCart();
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.12 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Derive a small swatch story from the product's accent
  const swatches = [product.accentColor, "#1A1714", "#B8913A"].filter(
    (v, i, a) => a.indexOf(v) === i
  );

  const rentable = product.mode !== "buy";
  const rentPrice = Math.max(18, Math.round(product.price * 0.34));

  return (
    <div
      ref={ref}
      className="group"
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? "translateY(0)" : "translateY(16px)",
        transition: "opacity 0.7s ease, transform 0.7s cubic-bezier(.2,.8,.2,1)",
        transitionDelay: `${index * 50}ms`,
      }}
    >
      <div className="relative">
        <Link to={`/product/${product.slug}`} className="block relative overflow-hidden bg-[var(--bg-soft)] aspect-[3/4]">
          <img
            src={product.image}
            alt={product.name}
            loading="lazy"
            className="w-full h-full object-cover transition-transform duration-[1100ms] ease-[cubic-bezier(.2,.8,.2,1)] group-hover:scale-[1.05]"
          />
          {/* Badges — DVF plain text style */}
          {product.topSeller && (
            <span className="absolute top-3 left-3 text-[0.62rem] tracking-[0.14em] uppercase font-medium" style={{ color: "var(--ink)", background: "var(--bg)", padding: "4px 10px" }}>
              Best Seller
            </span>
          )}
          {product.newArrival && !product.topSeller && (
            <span className="absolute top-3 left-3 text-[0.62rem] tracking-[0.14em] uppercase font-medium" style={{ color: "var(--ink)", background: "var(--bg)", padding: "4px 10px" }}>
              New
            </span>
          )}
          {mode === "rent" && rentable && (
            <span
              className="absolute bottom-3 left-3 text-[0.55rem] tracking-[0.2em] uppercase px-2 py-1"
              style={{ color: "#12200F", background: "linear-gradient(90deg,#B8913A,#E6CE85)" }}
            >
              Rent
            </span>
          )}
        </Link>

        {/* Wishlist */}
        <button
          aria-label="Save"
          className="absolute top-3 right-3 p-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
          style={{ color: "var(--ink)" }}
        >
          <Heart size={16} strokeWidth={1.5} />
        </button>

        {/* Quick add — slides up on hover */}
        <button
          onClick={() =>
            add({
              slug: product.slug,
              name: mode === "rent" && rentable ? `${product.name} (Rent · 3 days)` : product.name,
              price: mode === "rent" && rentable ? rentPrice : product.price,
              image: product.image,
              vendor: product.vendor,
              quantity: 1,
            })
          }
          className="absolute bottom-0 left-0 right-0 flex items-center justify-center gap-2 py-3 text-[0.65rem] tracking-[0.22em] uppercase font-medium translate-y-full group-hover:translate-y-0 transition-transform duration-400 ease-out"
          style={{ background: "var(--ink)", color: "var(--ink-inv)" }}
        >
          <ShoppingBag size={13} strokeWidth={1.5} /> Quick Add
        </button>
      </div>

      {/* Text block — DVF rhythm */}
      <div className="pt-3 pb-1">
        <Link to={`/product/${product.slug}`} className="block text-[0.82rem] font-normal leading-snug hover:underline underline-offset-2" style={{ color: "var(--ink)" }}>
          {product.name}
        </Link>
        <div className="mt-1 text-[0.82rem]" style={{ color: "var(--ink)" }}>
          {mode === "rent" && rentable ? (
            <>
              Rent ${rentPrice}.00
              <span className="ml-1.5 text-[0.66rem]" style={{ color: "var(--ink-muted)" }}>/ 3 days</span>
              <span className="ml-2 line-through opacity-50">${product.price}.00</span>
            </>
          ) : (
            <>
              ${product.price}.00
              {product.originalPrice && (
                <span className="ml-2 line-through opacity-50">${product.originalPrice}.00</span>
              )}
            </>
          )}
        </div>
        {/* Swatches */}
        <div className="mt-2 flex items-center gap-1.5">
          {swatches.map((c) => (
            <span
              key={c}
              className="w-3.5 h-3.5 rounded-full border"
              style={{ background: c, borderColor: "var(--line-strong)" }}
            />
          ))}
          {product.featured && (
            <span className="ml-1 text-[0.68rem] italic" style={{ color: "var(--ink-muted)" }}>
              More Colors
            </span>
          )}
        </div>
        <div className="mt-1.5 text-[0.68rem] tracking-[0.1em]" style={{ color: "var(--ink-muted)" }}>
          by {product.vendor}
        </div>
      </div>
    </div>
  );
}
