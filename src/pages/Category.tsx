import { useParams, Link } from "react-router-dom";
import ProductCard from "../components/ProductCard";
import { getCategory, getCategoryProducts, categories } from "../data";
import { useState } from "react";

export default function Category() {
  const { slug } = useParams();
  const cat = getCategory(slug || "");
  const products = getCategoryProducts(slug || "");

  const [mode, setMode] = useState<"all" | "buy" | "rent">("all");
  const [sort, setSort] = useState<"new" | "price-asc" | "price-desc" | "rating">("new");

  if (!cat) {
    return (
      <div className="pt-32 text-center pb-20 narrow">
        <p className="micro mb-3">404</p>
        <h1 className="font-display text-4xl mb-6">Category not found</h1>
        <Link to="/" className="btn-underline">Back to Home →</Link>
      </div>
    );
  }

  let filtered = products;
  if (mode !== "all") filtered = filtered.filter((p) => p.mode === mode || p.mode === "both");
  if (sort === "price-asc") filtered = [...filtered].sort((a, b) => a.price - b.price);
  if (sort === "price-desc") filtered = [...filtered].sort((a, b) => b.price - a.price);
  if (sort === "rating") filtered = [...filtered].sort((a, b) => b.rating - a.rating);

  return (
    <div className="pt-20">
      {/* HERO — minimalist, big serif on photo */}
      <section className="relative min-h-[65svh] flex items-center overflow-hidden">
        <div className="absolute inset-0">
          <img src={cat.image} alt={cat.name} className="w-full h-full object-cover object-center scale-110" />
          <div aria-hidden className="absolute inset-0" style={{ background: "linear-gradient(135deg, rgba(10,12,10,0.55) 0%, rgba(10,12,10,0.75) 100%)" }} />
        </div>

        <div className="ultra relative text-white py-16">
          <div className="text-[0.62rem] tracking-[0.45em] uppercase opacity-60 mb-6">
            <Link to="/" className="hover:opacity-100 opacity-70">Home</Link> <span className="mx-2 opacity-40">/</span> {cat.name}
          </div>
          <h1 className="font-display font-bold leading-[0.88] tracking-[-0.03em]" style={{ fontSize: "clamp(4rem, 14vw, 14rem)", textShadow: "0 4px 40px rgba(0,0,0,0.5)" }}>
            {cat.name}
          </h1>
          <p className="mt-6 max-w-xl font-serif italic text-xl md:text-2xl font-light text-white/85">
            {cat.tagline}
          </p>
          <div className="mt-8 flex items-center gap-5 text-[0.62rem] tracking-[0.32em] uppercase opacity-50">
            <span>{cat.count} Pieces</span>
            <span className="w-px h-4 bg-white/40" />
            <span>Buy · Rent</span>
          </div>
        </div>
      </section>

      {/* FILTER BAR — minimal, sticky, hairline */}
      <div className="sticky top-16 md:top-20 z-20 backdrop-blur-xl py-5" style={{ background: "color-mix(in srgb, var(--bg) 88%, transparent)", borderBottom: "1px solid var(--line)" }}>
        <div className="ultra flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex gap-8 text-[0.7rem]">
            {(["all", "buy", "rent"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className="font-display italic transition-colors duration-300"
                style={{ color: mode === m ? "var(--ink)" : "var(--ink-muted)" }}
              >
                {m === "all" ? "Everything" : m === "buy" ? "Buy" : "Rent"}
                {mode === m && <span className="block h-px bg-[var(--emerald)] mt-0.5" />}
              </button>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-3">
            <span className="text-[0.62rem] tracking-[0.3em] uppercase opacity-50">Sort</span>
            <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="bg-transparent border-b border-[var(--line-strong)] text-sm py-0.5 focus:outline-none focus:border-[var(--emerald)]">
              <option value="new">Newest</option>
              <option value="price-asc">Price: Low → High</option>
              <option value="price-desc">Price: High → Low</option>
              <option value="rating">Top Rated</option>
            </select>
          </div>
        </div>
      </div>

      {/* PRODUCTS — art gallery grid */}
      <div className="ultra py-16 md:py-24">
        {filtered.length === 0 ? (
          <div className="text-center py-20">
            <p className="font-display text-2xl mb-2">No items</p>
            <p className="text-sm opacity-60">Try another filter.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-4 sm:gap-x-6 md:gap-x-10 gap-y-10 sm:gap-y-16 md:gap-y-28">
            {filtered.map((p, i) => <ProductCard key={p.slug} product={p} index={i} />)}
          </div>
        )}
      </div>

      {/* OTHER CATEGORIES — minimal */}
      <div className="ultra pb-24">
        <div className="flex items-center gap-4 mb-6">
          <span className="micro">Explore Other Worlds</span>
          <span className="flex-1 h-px bg-[var(--line-strong)]" />
        </div>
        <div className="flex flex-wrap gap-6">
          {categories.filter((c) => c.slug !== cat.slug).map((c) => (
            <Link key={c.slug} to={`/category/${c.slug}`} className="font-display italic text-lg text-[var(--ink-soft)] hover:text-[var(--emerald)] transition-colors duration-300">
              {c.name} <span className="opacity-40 text-sm">→</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
