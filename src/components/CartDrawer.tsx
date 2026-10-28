import { useCart } from "../context/CartContext";
import { X, Trash2, ShoppingBag } from "lucide-react";

export default function CartDrawer() {
  const { items, remove, clear, isOpen, close } = useCart();

  const total = items.reduce((s, i) => s + i.price * i.quantity, 0);

  return (
    <>
      <div
        className={`fixed inset-0 z-40 transition-opacity ${
          isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
        }`}
        style={{ background: "rgba(15,20,16,0.55)" }}
        onClick={close}
      />
      <aside
        className={`fixed top-0 right-0 bottom-0 z-50 w-full max-w-md transition-transform duration-500 ease-[cubic-bezier(0.22,0.61,0.36,1)]`}
        style={{
          transform: isOpen ? "translateX(0)" : "translateX(100%)",
          background: "var(--bg)",
          boxShadow: "var(--shadow-lg)",
        }}
      >
        <div
          className="flex items-center justify-between px-6 py-5 border-b"
          style={{ borderColor: "var(--line)" }}
        >
          <div className="flex items-center gap-3">
            <ShoppingBag size={18} strokeWidth={1.6} style={{ color: "var(--accent)" }} />
            <h3 className="font-display text-xl">Your Bag</h3>
          </div>
          <button className="p-2 rounded-full hover:bg-[var(--bg-soft)]" onClick={close}>
            <X size={18} />
          </button>
        </div>

        {items.length === 0 ? (
          <div className="px-6 py-20 text-center opacity-70">
            <p className="font-display text-xl mb-2">Your cart is empty</p>
            <p className="text-sm">Discover something fabulous.</p>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4" style={{ maxHeight: "calc(100svh - 220px)" }}>
              {items.map((i) => (
                <div key={i.slug} className="flex gap-4 items-center">
                  <div className="w-16 h-20 rounded-lg shrink-0 overflow-hidden bg-[var(--bg-soft)]">
                    <img src={i.image} alt={i.name} className="w-full h-full object-cover" />
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-sm leading-tight">{i.name}</div>
                    <div className="text-xs opacity-60">{i.vendor}</div>
                    <div className="text-sm font-semibold mt-1" style={{ color: "var(--accent)" }}>
                      ${i.price}.00
                    </div>
                  </div>
                  <button
                    aria-label="Remove"
                    className="p-2 rounded-full hover:bg-[var(--bg-soft)] opacity-60 hover:opacity-100"
                    onClick={() => remove(i.slug)}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>

            <div className="absolute bottom-0 left-0 right-0 p-6 border-t" style={{ background: "var(--bg)", borderColor: "var(--line)" }}>
              <div className="flex items-center justify-between mb-4">
                <span className="text-[0.7rem] tracking-[0.28em] uppercase opacity-70">Subtotal</span>
                <span className="font-display text-2xl">${total}.00</span>
              </div>
              <button className="btn-primary w-full mb-2">Checkout</button>
              <button className="btn-ghost w-full text-xs" onClick={clear}>
                Clear Bag
              </button>
            </div>
          </>
        )}
      </aside>
    </>
  );
}
