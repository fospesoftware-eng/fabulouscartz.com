import type {
  AuditEntry,
  Customer,
  Order,
  OrderLine,
  OrderStatus,
  PaymentMethod,
  Segment,
  StockMovement,
  TimelineEvent,
} from "../../../shared/types.js";
import { NOW, seedProducts } from "./catalog.js";
import { usStreet, weightedShipping } from "./usShipping.js";

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(20261103);

function pick<T>(list: readonly T[]): T {
  return list[Math.floor(rand() * list.length)];
}

function between(min: number, max: number): number {
  return Math.floor(rand() * (max - min + 1)) + min;
}

function iso(daysAgo: number, hour = 11, minute = 0): string {
  const date = new Date(NOW);
  date.setDate(date.getDate() - daysAgo);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

function addHours(isoValue: string, hours: number): string {
  return new Date(new Date(isoValue).getTime() + hours * 3600_000).toISOString();
}

const customerSeed: Array<[string, string, string, string, Segment, string[], string]> = [
  ["Ananya Raghavan", "ananya.r@gmail.com", "+91 98470 11234", "Kochi", "VIP", ["bridal", "rental"], "Prefers silk over synthetic. Wedding in December — keep an eye on lehenga fittings."],
  ["Priya Krishnan", "priya.k@outlook.com", "+91 99460 22345", "Chennai", "Repeat", ["dance", "jewellery"], "Bharatanatyam teacher; rents 2–3 costumes each quarter."],
  ["Jennifer Smith", "jennifer.s@icloud.com", "+1 415 555 0142", "San Francisco", "VIP", ["export", "gifting"], "US-based; always requests express shipping and gift wrap."],
  ["Divya Menon", "divya.m@gmail.com", "+91 98950 33456", "Thrissur", "Repeat", ["festive", "kids"], "Two daughters; shops kids' festive wear ahead of Onam."],
  ["Meenakshi Iyer", "meenakshi.i@gmail.com", "+91 94470 44567", "Madurai", "VIP", ["bridal", "jewellery"], "Bridal stylist — refers clients to the atelier."],
  ["Sneha Patel", "sneha.p@gmail.com", "+91 98250 55678", "Mumbai", "Repeat", ["party", "fusion"], ""],
  ["Aiswarya Nair", "aiswarya.n@gmail.com", "+91 97460 66789", "Kozhikode", "New", ["kurta", "everyday"], "First purchase in the festive edit."],
  ["Ritu Sharma", "ritu.s@gmail.com", "+91 98110 77890", "New Delhi", "Repeat", ["jewellery", "gifting"], "Buys statement sets for editorial shoots."],
  ["Lakshmi Pillai", "lakshmi.p@gmail.com", "+91 98470 88901", "Thiruvananthapuram", "VIP", ["bridal", "saree"], "Long-time consignor customer; invited to private previews."],
  ["Nithya Balakrishnan", "nithya.b@gmail.com", "+91 90030 99012", "Coimbatore", "New", ["kids"], ""],
  ["Sarah Thomas", "sarah.t@gmail.com", "+91 98470 10123", "Kottayam", "Repeat", ["dance", "rental"], "Rents costumes for her dance school's annual recital."],
  ["Kavya Reddy", "kavya.r@gmail.com", "+91 99490 21234", "Hyderabad", "Repeat", ["party", "accessories"], "Loves potli clutches; often buys in pairs."],
  ["Fatima Rahman", "fatima.r@gmail.com", "+91 98460 32345", "Kozhikode", "New", ["jewellery"], ""],
  ["Ishita Bose", "ishita.b@gmail.com", "+91 98300 43456", "Kolkata", "At risk", ["saree", "everyday"], "No order since the summer edit — win-back candidate."],
  ["Nandini Rao", "nandini.r@gmail.com", "+91 99450 54567", "Bengaluru", "Wholesale", ["wholesale", "jewellery"], "Buys jewellery in lots of 6 for a boutique in Indiranagar."],
  ["Deepa Varghese", "deepa.v@gmail.com", "+91 98470 65678", "Kochi", "Repeat", ["kids", "festive"], "Prefers WhatsApp updates for delivery."],
];

export function seedCustomers(): Customer[] {
  return customerSeed.map(([name, email, phone, city, segment, tags, notes], index) => ({
    id: `cus_${String(index + 1).padStart(3, "0")}`,
    name,
    email,
    phone,
    city,
    segment,
    tags,
    notes,
    createdAt: iso(150 - index * 9, 9),
    ordersCount: 0,
    lifetimeValue: 0,
    lastOrderAt: null,
  }));
}

const paymentMethods: PaymentMethod[] = ["phonepe", "gpay", "upi", "card", "card", "phonepe", "upi"];

function statusForAge(age: number): OrderStatus {
  if (age <= 0) return pick(["pending", "processing", "packed"] as const);
  if (age === 1) return pick(["processing", "packed", "packed", "shipped"] as const);
  if (age <= 3) return pick(["packed", "shipped", "shipped", "delivered"] as const);
  if (age <= 7) return pick(["shipped", "delivered", "delivered"] as const);
  const roll = rand();
  if (roll > 0.93) return "returned";
  if (roll > 0.88) return "cancelled";
  return "delivered";
}

function timelineFor(order: Order, status: OrderStatus, created: string, actor: string): TimelineEvent[] {
  const events: TimelineEvent[] = [
    { id: `tl_${order.id}_1`, label: "Order placed", detail: `Paid via ${order.paymentMethod.toUpperCase()}`, at: created, by: order.customerName },
    { id: `tl_${order.id}_2`, label: "Payment captured", at: addHours(created, 1), by: "Payments" },
  ];
  if (["packed", "shipped", "delivered", "returned"].includes(status)) {
    events.push({ id: `tl_${order.id}_3`, label: "Packed at Fort Kochi studio", at: addHours(created, 18), by: "Rohan Das" });
  }
  if (["shipped", "delivered", "returned"].includes(status)) {
    events.push({ id: `tl_${order.id}_4`, label: "Dispatched via BlueDart", detail: "AWB 7712 0093", at: addHours(created, 30), by: "Fulfilment" });
  }
  if (["delivered", "returned"].includes(status)) {
    events.push({
      id: `tl_${order.id}_5`,
      label: status === "delivered" ? "Delivered" : "Return received",
      at: addHours(created, 86),
      by: status === "delivered" ? "Courier" : actor,
    });
  }
  if (status === "cancelled") {
    events.push({ id: `tl_${order.id}_6`, label: "Order cancelled", detail: "Customer request", at: addHours(created, 6), by: actor });
  }
  return events;
}

export function seedOrders(customers: Customer[]): Order[] {
  const couponPercents = [20, 10, 15, 25, 10];
  const orders: Order[] = [];
  const active = seedProducts.filter((product) => product.status === "published");
  const total = 74;

  for (let i = 0; i < total; i += 1) {
    // More recent orders are denser so the 7/30-day views look alive.
    const age = i < 9 ? between(0, 2) : Math.floor(Math.pow(rand(), 1.35) * 88);
    const created = iso(age, between(8, 21), between(0, 59));
    const customer = i < 9 ? customers[i % 5 === 0 ? 0 : between(0, 5)] : pick(customers);
    const lineCount = rand() > 0.55 ? 2 : 1;
    const chosen: typeof active = [];
    while (chosen.length < lineCount) {
      const product = pick(active);
      if (!chosen.find((entry) => entry.id === product.id)) chosen.push(product);
    }

    const items: OrderLine[] = chosen.map((product, lineIndex) => {
      const variant = product.variants[Math.min(product.variants.length - 1, between(0, product.variants.length - 1))];
      const rental = product.modes.includes("rent") && rand() > 0.62;
      const rentalDays = rental ? pick([3, 5, 7]) : undefined;
      const unitPrice = rental ? Math.round(variant.rentalPrice * (rentalDays ?? 3)) : variant.price;
      const qty = product.categoryId === "cat_jewelry" && !rental ? between(1, 2) : 1;
      return {
        id: `oln_${i + 1}_${lineIndex + 1}`,
        productId: product.id,
        name: product.name,
        sku: variant.sku,
        image: product.images[0],
        qty,
        unitPrice,
        mode: rental ? "rent" : "buy",
        rentalDays,
      };
    });

    const subtotal = items.reduce((sum, item) => sum + item.unitPrice * item.qty, 0);
    const hasCoupon = rand() > 0.7 && subtotal >= 30;
    const discount = hasCoupon ? Math.round(subtotal * (pick(couponPercents) / 100)) : 0;
    const shipping = subtotal >= 75 ? 0 : 12;
    const tax = Math.round((subtotal - discount + shipping) * 0.05);
    const status = statusForAge(age);
    const paymentStatus =
      status === "cancelled" || status === "returned" ? "refunded" : status === "pending" ? pick(["paid", "pending"] as const) : "paid";
    const destination = weightedShipping(i);
    const order: Order = {
      id: `ord_${String(1001 + i)}`,
      number: `FC-${1001 + i}`,
      customerId: customer.id,
      customerName: customer.name,
      customerEmail: customer.email,
      customerPhone: customer.phone,
      items,
      subtotal,
      shipping,
      tax,
      discount,
      total: subtotal - discount + shipping + tax,
      couponCode: hasCoupon ? pick(["FESTIVE20", "WELCOME10", "DANCE15", "BRIDAL25", "JEWEL12"]) : undefined,
      paymentMethod: pick(paymentMethods),
      paymentStatus,
      status,
      channel: pick(["web", "web", "web", "instagram", "whatsapp", "store"] as const),
      shippingAddress: {
        line1: usStreet(rand),
        city: destination.city,
        state: destination.state,
        pin: destination.zip,
        country: "United States",
      },
      notes:
        rand() > 0.76
          ? [
              {
                id: `note_${i + 1}`,
                author: pick(["Rohan Das", "Priya Nair", "Kabir Shah"]),
                body: pick([
                  "Customer asked for delivery after 6pm — courier notified.",
                  "Fitting requested before dispatch; tailor booked.",
                  "Gift wrap confirmed, note card included.",
                  "Second pair shipped in the same parcel.",
                ]),
                createdAt: addHours(created, 4),
              },
            ]
          : [],
      timeline: [],
      createdAt: created,
      updatedAt: addHours(created, status === "delivered" ? 86 : 12),
    };
    order.timeline = timelineFor(order, status, created, order.notes[0]?.author ?? "Priya Nair");
    orders.push(order);
  }

  orders.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  // Roll customer aggregates from the order ledger.
  for (const customer of customers) {
    const mine = orders.filter((order) => order.customerId === customer.id);
    const billable = mine.filter((order) => order.status !== "cancelled");
    customer.ordersCount = billable.length;
    customer.lifetimeValue = billable.reduce((sum, order) => sum + order.total, 0);
    customer.lastOrderAt = mine[0]?.createdAt ?? null;
    if (customer.ordersCount >= 4 && customer.lifetimeValue >= 420) customer.segment = "VIP";
    else if (customer.ordersCount >= 2 && customer.segment === "New") customer.segment = "Repeat";
    if (!customer.lastOrderAt) customer.segment = "At risk";
  }

  return orders;
}

export function seedMovements(): StockMovement[] {
  const movements: StockMovement[] = [];
  const reasons = ["Restock received", "Damaged in transit", "Cycle count correction", "Rental returned late", "Sample sold at pop-up"];
  const actors = ["Rohan Das", "Priya Nair", "Kabir Shah"];
  const variants = seedProducts.flatMap((product) =>
    product.variants.map((variant) => ({ product, variant })),
  );

  for (let i = 0; i < 34; i += 1) {
    const entry = variants[(i * 7) % variants.length];
    const delta = pick([8, 12, 6, -1, -2, 3, 10, -3]);
    const next = entry.variant.stock;
    const previous = Math.max(0, next - delta);
    const at = iso(between(1, 34), between(9, 18), between(0, 59));
    movements.push({
      id: `mv_${String(i + 1).padStart(4, "0")}`,
      sku: entry.variant.sku,
      productId: entry.product.id,
      productName: entry.product.name,
      delta,
      previous,
      next,
      reason: pick(reasons),
      note: pick([
        "Supplier batch QC passed.",
        "Photographed for the festive edit.",
        "Returned by customer with minor bead repair.",
        "Recount against warehouse sheet.",
        "Dispatched with order FC-1058.",
      ]),
      actor: pick(actors),
      at,
    });
  }
  return movements.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
}

export function seedAudit(): AuditEntry[] {
  const rows: Array<[number, number, string, string, string, string, AuditEntry["actorRole"], string]> = [
    [0, 9, "order.status_updated", "order", "ord_1069", "Fulfilment status packed → shipped", "fulfilment", "Rohan Das"],
    [0, 8, "inventory.adjusted", "inventory", "FC-012-OSS-SLV", "Stock -2 · Damaged in transit", "fulfilment", "Rohan Das"],
    [1, 17, "product.updated", "product", "prd_021", "Published the Zardoji Potli Clutch", "manager", "Priya Nair"],
    [1, 15, "discount.updated", "discount", "coup_001", "FESTIVE20 usage cap raised to 200", "admin", "Aarav Mehta"],
    [2, 12, "content.published", "content", "cnt_001", "Hero 'The Festive Atelier' published", "manager", "Meera Kapoor"],
    [2, 10, "customer.tagged", "customer", "cus_013", "Tagged 'jewellery'", "manager", "Priya Nair"],
    [3, 16, "order.status_updated", "order", "ord_1058", "Marked delivered", "fulfilment", "Kabir Shah"],
    [3, 13, "product.created", "product", "prd_019", "Draft created for Kathak Anarkali Costume", "manager", "Priya Nair"],
    [4, 11, "settings.updated", "settings", "settings", "Free shipping threshold set to $75", "admin", "Aarav Mehta"],
    [5, 18, "team.member_added", "team", "usr_support", "Kabir Shah added as Customer Support", "admin", "Aarav Mehta"],
    [6, 9, "inventory.adjusted", "inventory", "FC-004-M-SGE", "Stock +12 · Restock received", "fulfilment", "Rohan Das"],
    [7, 14, "order.note_added", "order", "ord_1051", "Delivery window note added", "fulfilment", "Rohan Das"],
    [8, 10, "product.archived", "product", "prd_014", "Archived out-of-stock boho bracelet", "manager", "Priya Nair"],
    [10, 12, "vendor.updated", "vendor", "ven_viya", "Vendor visibility confirmed", "admin", "Aarav Mehta"],
    [12, 16, "discount.created", "discount", "coup_008", "KIDS10 created", "manager", "Priya Nair"],
    [14, 11, "content.draft_saved", "content", "cnt_005", "Rental measurement guide saved", "manager", "Meera Kapoor"],
    [18, 15, "order.refunded", "order", "ord_1042", "Refund issued after return", "admin", "Aarav Mehta"],
  ];
  return rows.map(([age, hour, action, entity, entityId, detail, role, actor], i) => ({
    id: `aud_${String(i + 1).padStart(4, "0")}`,
    at: iso(age, hour, 20),
    actor,
    actorRole: role,
    action,
    entity,
    entityId,
    detail,
  }));
}
