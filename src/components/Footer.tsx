import { Link } from "react-router-dom";
import { ShoppingBag } from "lucide-react";
import { useCart } from "../context/CartContext";

export default function Footer() {
  const { items, open } = useCart();
  const count = items.reduce((s, i) => s + i.quantity, 0);
  const total = items.reduce((s, i) => s + i.price * i.quantity, 0);

  return (
    <>
      {/* Ticker above footer */}
      <div className="marquee-wrap" style={{ background: "var(--bg)" }}>
        <div className="marquee-track text-[var(--ink)]">
          {Array.from({ length: 2 }).map((_, k) => (
            <div key={k} className="contents">
              <div className="marquee-item"><span className="marquee-dot" /> Handcrafted by Independent Artisans</div>
              <div className="marquee-item"><span className="marquee-dot" /> Rent · Wear · Return · Repeat</div>
              <div className="marquee-item"><span className="marquee-dot" /> Circular Luxury Since 2024</div>
              <div className="marquee-item"><span className="marquee-dot" /> Free Shipping Over $75</div>
              <div className="marquee-item"><span className="marquee-dot" /> 1% of Every Sale to Artisan Families</div>
            </div>
          ))}
        </div>
      </div>

      <footer className="bg-[#1A1714] text-[#EDE8DF]">
        <div className="ultra py-20 md:py-28">
          {/* Big wordmark */}
          <div className="mb-16 md:mb-20">
            <div className="font-display text-[clamp(3rem,12vw,12rem)] leading-[0.85] tracking-tight">
              Fabulous <em className="shimmer not-italic" style={{ fontStyle: "italic" }}>Cartz</em>.
            </div>
          </div>

          {/* Grid */}
          <div className="grid md:grid-cols-12 gap-10 md:gap-16 mb-16">
            <div className="md:col-span-5">
              <p className="font-serif italic text-xl md:text-2xl leading-relaxed text-white/80 max-w-md">
                A shared closet for Indian ethnic wear — where every outfit lives more than one life.
              </p>
              <div className="mt-8 text-[0.68rem] tracking-[0.32em] uppercase opacity-50">
                © 2025 Fabulous Cartz · Delaware, USA
              </div>
            </div>

            <div className="md:col-span-2">
              <div className="text-[0.65rem] tracking-[0.3em] uppercase opacity-50 mb-4">Shop</div>
              <ul className="space-y-2.5 text-sm">
                <li><Link to="/category/womens-wear" className="opacity-80 hover:opacity-100">Women's Wear</Link></li>
                <li><Link to="/category/kids-wear" className="opacity-80 hover:opacity-100">Kids Wear</Link></li>
                <li><Link to="/category/handmade-jewelry" className="opacity-80 hover:opacity-100">Handmade Jewelry</Link></li>
                <li><Link to="/category/dance-costumes" className="opacity-80 hover:opacity-100">Dance Costumes</Link></li>
                <li><Link to="/category/mens-wear" className="opacity-80 hover:opacity-100">Men's Wear</Link></li>
                <li><Link to="/category/accessories" className="opacity-80 hover:opacity-100">Accessories</Link></li>
              </ul>
            </div>

            <div className="md:col-span-2">
              <div className="text-[0.65rem] tracking-[0.3em] uppercase opacity-50 mb-4">About</div>
              <ul className="space-y-2.5 text-sm">
                <li><Link to="/about" className="opacity-80 hover:opacity-100">Our Story</Link></li>
                <li><a href="#" className="opacity-80 hover:opacity-100">Sustainability</a></li>
                <li><a href="#" className="opacity-80 hover:opacity-100">Become a Vendor</a></li>
                <li><Link to="/contact" className="opacity-80 hover:opacity-100">Contact</Link></li>
              </ul>
            </div>

            <div className="md:col-span-3">
              <div className="text-[0.65rem] tracking-[0.3em] uppercase opacity-50 mb-4">Stay in touch</div>
              <p className="text-sm opacity-70 mb-4">New collections, artisan stories, and one-time offers.</p>
              <form className="flex border-b border-white/20 pb-1 group" onSubmit={(e) => e.preventDefault()}>
                <input
                  type="email"
                  placeholder="your@email.com"
                  className="flex-1 bg-transparent outline-none text-sm placeholder:opacity-40 py-1.5"
                  style={{ color: "#EDE8DF" }}
                />
                <button type="submit" className="opacity-60 hover:opacity-100 transition-opacity text-sm tracking-[0.2em] uppercase">Join →</button>
              </form>
              <div className="mt-6 flex gap-5 text-[0.65rem] tracking-[0.28em] uppercase opacity-50">
                <a href="#" className="hover:opacity-100">Instagram</a>
                <a href="#" className="hover:opacity-100">Pinterest</a>
              </div>
            </div>
          </div>

          {/* Bottom bar */}
          <div className="pt-6 border-t border-white/10 flex flex-col md:flex-row md:items-center md:justify-between gap-3 text-[0.65rem] tracking-[0.28em] uppercase opacity-45">
            <div>Privacy · Terms · Accessibility</div>
            <div className="hidden md:flex items-center gap-2">
              <ShoppingBag size={12} />
              {count > 0 ? `${count} items · $${total.toFixed(2)}` : "Your cart is empty"}
              <button onClick={open} className="underline hover:opacity-100 ml-2">View Cart</button>
            </div>
            <div>Handcrafted with ♥ in Delaware</div>
          </div>
        </div>
      </footer>
    </>
  );
}
