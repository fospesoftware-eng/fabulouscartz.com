import { Link } from "react-router-dom";

const posts = [
  {
    kicker: "Fashion",
    title: "Buy Or Rent? Find The Right Outfit For Your Next Celebration",
    author: "Savija Shan",
    time: "2 min read",
    image: "/img/products/bridal-lehenga.webp",
    to: "/category/womens-wear",
  },
  {
    kicker: "Craft",
    title: "The Story of Benarasi Silk — One Weft At A Time",
    author: "Editorial Desk",
    time: "4 min read",
    image: "/img/about/fabric.webp",
    to: "/about",
  },
  {
    kicker: "Sustainability",
    title: "Why Circular Fashion Matters For Ethnic Wear",
    author: "Priya K.",
    time: "3 min read",
    image: "/img/categories/dance-costumes.webp",
    to: "/category/dance-costumes",
  },
];

export default function Editorial() {
  return (
    <section className="section-xl" style={{ background: "var(--bg-soft)" }}>
      <div className="ultra">
        <div className="reveal mb-14 md:mb-20">
          <div className="flex items-center gap-4 mb-6">
            <span className="micro">06 — From Our Journal</span>
            <span className="flex-1 h-px bg-[var(--line-strong)]" />
          </div>
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
            <h2 className="font-display font-light italic text-4xl md:text-5xl lg:text-6xl leading-[0.95]">
              Curated stories. <em className="not-italic font-bold">Real</em> voices.
            </h2>
          </div>
        </div>

        {/* Editorial list — number + kicker + title + photograph */}
        <div className="border-t border-[var(--line-strong)]">
          {posts.map((p, i) => (
            <article
              key={p.title}
              className="reveal group grid md:grid-cols-12 gap-4 md:gap-8 py-8 md:py-10 border-b border-[var(--line-strong)] transition-colors duration-500 hover:bg-[var(--bg)]"
              style={{ transitionDelay: `${i * 80}ms` }}
            >
              <div className="md:col-span-1 font-display font-light text-2xl opacity-40">
                {String(i + 1).padStart(2, "0")}
              </div>
              <div className="md:col-span-2 text-[0.65rem] tracking-[0.3em] uppercase text-[var(--emerald)] font-medium pt-1">
                {p.kicker}
              </div>
              <div className="md:col-span-6 md:self-center">
                <Link to={p.to}>
                  <h3 className="font-display text-xl md:text-2xl font-normal leading-snug group-hover:text-[var(--emerald)] transition-colors duration-300">
                    {p.title}
                  </h3>
                </Link>
                <div className="mt-2 text-[0.62rem] tracking-[0.22em] uppercase opacity-50">
                  {p.time} · {p.author.split(" ")[0]}
                </div>
              </div>
              <Link to={p.to} className="md:col-span-3 overflow-hidden relative">
                <img
                  src={p.image}
                  alt={p.title}
                  loading="lazy"
                  className="w-full aspect-[16/10] object-cover transition-transform duration-[1100ms] ease-[cubic-bezier(.2,.8,.2,1)] group-hover:scale-[1.06]"
                />
                <div className="grain" />
              </Link>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
