import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export interface CartItem {
  slug: string;
  name: string;
  price: number;
  image: string;
  vendor: string;
  quantity: number;
}
interface CartCtx {
  items: CartItem[];
  count: number;
  add: (item: CartItem) => void;
  remove: (slug: string) => void;
  clear: () => void;
  isOpen: boolean;
  open: () => void;
  close: () => void;
}
const Ctx = createContext<CartCtx | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(() => {
    try {
      return JSON.parse(localStorage.getItem("fc-cart") || "[]");
    } catch {
      return [];
    }
  });
  const [isOpen, setOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem("fc-cart", JSON.stringify(items));
  }, [items]);

  const add = (item: CartItem) =>
    setItems((prev) => {
      const existing = prev.find((i) => i.slug === item.slug);
      if (existing)
        return prev.map((i) =>
          i.slug === item.slug ? { ...i, quantity: i.quantity + item.quantity } : i
        );
      return [...prev, item];
    });

  const remove = (slug: string) =>
    setItems((prev) => prev.filter((i) => i.slug !== slug));

  const count = items.reduce((n, i) => n + i.quantity, 0);

  return (
    <Ctx.Provider
      value={{
        items,
        count,
        add,
        remove,
        clear: () => setItems([]),
        isOpen,
        open: () => setOpen(true),
        close: () => setOpen(false),
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useCart() {
  const v = useContext(Ctx);
  if (!v) throw new Error("CartProvider missing");
  return v;
}
