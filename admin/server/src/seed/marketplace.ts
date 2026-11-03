import type {
  Blackout,
  Booking,
  BookingEvent,
  BookingItem,
  BookingState,
  DepositState,
  Dispute,
  KycDoc,
  Payout,
  RentalListing,
  Seller,
} from "../../../shared/marketplace.js";
import { ALLOWED_TRANSITIONS } from "../../../shared/marketplace.js";
import { NOW } from "./catalog.js";

function at(days: number, hour = 10, minute = 0): string {
  const date = new Date(NOW);
  date.setDate(date.getDate() + days);
  date.setHours(hour, minute, 0, 0);
  return date.toISOString();
}

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
const rand = mulberry32(731003);

const IMGS = [
  "/media/img/products/bridal-lehenga.webp",
  "/media/img/products/silver-jewelry.webp",
  "/media/img/products/red-statement-set.webp",
  "/media/img/products/indo-western-gown.webp",
  "/media/img/products/ethnic-anarkali.webp",
  "/media/img/products/punjabi-kurta.webp",
  "/media/img/products/navy-earrings.webp",
  "/media/img/products/boho-bracelet.webp",
  "/media/img/products/beach-charm-bracelet.webp",
  "/media/img/products/kids-ethnic.webp",
  "/media/img/hero/craft.webp",
  "/media/img/hero/seller.webp",
];

const CITY_PAIRS = [
  ["Austin", "TX"],
  ["Jersey City", "NJ"],
  ["Fremont", "CA"],
  ["Edison", "NJ"],
  ["Houston", "TX"],
  ["Sunnyvale", "CA"],
  ["Seattle", "WA"],
  ["Chicago", "IL"],
  ["Tampa", "FL"],
  ["Plano", "TX"],
  ["Boston", "MA"],
  ["Atlanta", "GA"],
] as const;

const SEED_SELLERS = [
  ["Anaya Atelier", "anaya-atelier", "Pooja Raman", "hybrid"],
  ["Mehndi House", "mehndi-house", "Farah Qureshi", "rental"],
  ["Indus Threads", "indus-threads", "Arjun Mehta", "marketplace"],
  ["Kala Couture", "kala-couture", "Meera Nair", "hybrid"],
  ["Rang Rentals", "rang-rentals", "Devika Shah", "rental"],
  ["The Lehenga Library", "lehenga-library", "Sana Kapoor", "rental"],
  ["Saffron Studio", "saffron-studio", "Nikhil Rao", "marketplace"],
  ["Dupatta & Co", "dupatta-co", "Isha Bhatia", "hybrid"],
  ["Noor Boutique", "noor-boutique", "Zoya Ahmed", "rental"],
  ["Vastra Vault", "vastra-vault", "Kiran Patel", "rental"],
  ["Zari House", "zari-house", "Anita Desai", "marketplace"],
  ["Padma Rentals", "padma-rentals", "Lakshmi Iyer", "rental"],
] as const;

const RENTERS = [
  ["Priya Sharma", "priya.sharma@example.com"],
  ["Aisha Khan", "aisha.khan@example.com"],
  ["Rohan Patel", "rohan.patel@example.com"],
  ["Neha Gupta", "neha.gupta@example.com"],
  ["Marcus Lee", "marcus.lee@example.com"],
  ["Sofia Alvarez", "sofia.alvarez@example.com"],
  ["Divya Menon", "divya.menon@example.com"],
  ["Emily Chen", "emily.chen@example.com"],
  ["Sameer Joshi", "sameer.joshi@example.com"],
  ["Hannah Brooks", "hannah.brooks@example.com"],
] as const;

const RENTAL_TITLES = [
  ["Crimson Bridal Lehenga", "Bridal", 65],
  ["Emerald Zardozi Anarkali", "Bridal", 42],
  ["Ivory Chikankari Gown", "Formal", 28],
  ["Gold Temple Jewellery Set", "Jewellery", 18],
  ["Rose Kundan Necklace", "Jewellery", 22],
  ["Banarasi Silk Saree", "Saree", 34],
  ["Mint Organza Lehenga", "Bridal", 48],
  ["Indo-Western Tuxedo", "Menswear", 38],
  ["Navy Sherwani Set", "Menswear", 40],
  ["Dance Costume — Bharatanatyam", "Costume", 24],
  ["Kids Festive Kurta Set", "Kidswear", 12],
  ["Polki Statement Earrings", "Jewellery", 16],
  ["Peacock Mehndi Set", "Accessory", 10],
  ["Pastel Sequin Saree", "Saree", 30],
  ["Coral Sharara Set", "Formal", 26],
  ["Silver Payal Pair", "Accessory", 8],
] as const;

function docs(index: number, status: Seller["kycStatus"]): KycDoc[] {
  const base: KycDoc[] = [
    { id: `doc_${index}_1`, type: "business", label: "Business registration", fileName: "llc-certificate.pdf", status: "verified", uploadedAt: at(-30 - index) },
    { id: `doc_${index}_2`, type: "identity", label: "Owner identity", fileName: "passport-scan.pdf", status: "verified", uploadedAt: at(-28 - index) },
    { id: `doc_${index}_3`, type: "tax", label: "Tax ID (EIN)", fileName: "ein-letter.pdf", status: status === "pending" ? "pending" : "verified", uploadedAt: at(-22 - index) },
    { id: `doc_${index}_4`, type: "bank", label: "Payout bank letter", fileName: "bank-letter.pdf", status: status === "pending" ? "pending" : status === "rejected" ? "rejected" : "verified", uploadedAt: at(-19 - index) },
  ];
  return base;
}

export function seedSellers(): Seller[] {
  return SEED_SELLERS.map(([name, handle, ownerName, storeType], index) => {
    const [city, state] = CITY_PAIRS[index];
    const kycStatus: Seller["kycStatus"] = index < 4 ? "pending" : index < 10 ? "approved" : "rejected";
    const suspended = index === 8 || index === 10;
    const rating = Math.round((3.9 + rand() * 1.05) * 10) / 10;
    return {
      id: `sel_${String(index + 1).padStart(3, "0")}`,
      name,
      handle,
      ownerName,
      email: `${handle}@sellers.fabulouscartz.com`,
      phone: `+1 (415) 55${index}-01${index}`,
      city,
      state,
      storeType: storeType as Seller["storeType"],
      kycStatus,
      status: suspended ? "suspended" : "active",
      commissionRate: [8, 10, 12, 14, 15, 18][index % 6],
      rating,
      reviews: 18 + Math.floor(rand() * 90),
      gmv: [48210, 33980, 17460, 62140, 9880, 12400, 8150, 15620, 29900, 5240, 1980, 30600][index],
      orders: 42 + Math.floor(rand() * 210),
      joinedAt: at(-210 - index * 12),
      description:
        storeType === "marketplace"
          ? "Curated ethnic-wear boutique shipping across the US."
          : storeType === "rental"
            ? "Peer-to-peer occasion-wear rental library with insured shipping."
            : "Boutique that both sells and rents occasion wear.",
      hue: 150 + index * 18,
      kycDocs: docs(index, kycStatus),
      rejectionReason: kycStatus === "rejected" ? "Bank letter did not match the registered business name." : undefined,
      suspendedReason: suspended ? "Repeated late dispatches after two renter escalations." : undefined,
    };
  });
}

export function seedListings(sellers: Seller[]): RentalListing[] {
  return RENTAL_TITLES.map(([title, category, dailyRate], index) => {
    const seller = sellers[index % sellers.length];
    const status: RentalListing["status"] =
      index < 6 ? "pending" : index < 13 ? "approved" : index === 13 ? "paused" : "suspended";
    return {
      id: `rnt_${String(index + 1).padStart(3, "0")}`,
      title,
      ownerType: index % 4 === 0 ? "platform" : "peer",
      sellerId: index % 4 === 0 ? undefined : seller.id,
      sellerName: index % 4 === 0 ? "Fabulous Cartz Studio" : seller.name,
      city: index % 4 === 0 ? "San Francisco" : seller.city,
      state: index % 4 === 0 ? "CA" : seller.state,
      category,
      conditionGrade: (["A", "A", "B", "A", "B", "C"] as const)[index % 6],
      replacementValue: dailyRate * 32 + 180,
      dailyRate,
      deposit: Math.max(60, Math.round((dailyRate * 9) / 10) * 10),
      status,
      image: IMGS[index % IMGS.length],
      gallery: [IMGS[index % IMGS.length], IMGS[(index + 4) % IMGS.length], IMGS[(index + 7) % IMGS.length]],
      submittedAt: at(index < 6 ? -2 - index : -30 - index),
      approvedAt: status === "approved" ? at(-18 - index) : undefined,
      description: `${title} in ${category.toLowerCase()}, professionally cleaned and shipped insured. Condition ${(["A", "A", "B", "A", "B", "C"] as const)[index % 6]}.`,
      timesRented: 4 + index * 2,
      revenue: (4 + index * 2) * dailyRate * 3,
      moderationReason: status === "suspended" ? "Replacement value documentation is out of date." : undefined,
    };
  });
}

const DEPOSIT_STATE: Record<BookingState, DepositState> = {
  requested: "none",
  approved: "none",
  deposit_authorized: "authorized",
  dispatched: "authorized",
  in_use: "authorized",
  return_due: "authorized",
  returned: "released",
  inspection: "captured",
  completed: "released",
  overdue: "authorized",
  disputed: "captured",
};

const STATE_SEQUENCE: BookingState[] = [
  "requested",
  "approved",
  "deposit_authorized",
  "dispatched",
  "in_use",
  "return_due",
  "returned",
  "inspection",
  "completed",
];

const STATE_OFFSET: Record<BookingState, number> = {
  requested: 8,
  approved: 5,
  deposit_authorized: 3,
  dispatched: 1,
  in_use: -1,
  return_due: -2,
  returned: -4,
  inspection: -5,
  completed: -12,
  overdue: -7,
  disputed: -9,
};

const MIX: BookingState[] = [
  "requested",
  "approved",
  "deposit_authorized",
  "dispatched",
  "in_use",
  "return_due",
  "returned",
  "inspection",
  "completed",
  "overdue",
  "disputed",
  "requested",
  "approved",
  "in_use",
  "completed",
  "return_due",
  "deposit_authorized",
  "completed",
  "overdue",
  "inspection",
  "approved",
  "completed",
  "in_use",
  "disputed",
  "requested",
  "completed",
  "return_due",
  "dispatched",
  "completed",
  "overdue",
];

function timelineFor(state: BookingState, createdAt: string, actor: string): BookingEvent[] {
  const events: BookingEvent[] = [
    { at: createdAt, label: "Booking requested", detail: "Renter submitted dates and accepted the rental terms.", actor: "Renter" },
    { at: createdAt, label: "Payment authorized", detail: "Card authorized for the rental fee and deposit.", actor: "System" },
  ];
  const index = STATE_SEQUENCE.indexOf(state);
  const steps = index >= 0 ? STATE_SEQUENCE.slice(1, index + 1) : STATE_SEQUENCE.slice(1, 6);
  steps.forEach((step, offset) => {
    events.push({
      at: at(STATE_OFFSET[step] + offset * 0.2, 10 + offset),
      label: step.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()),
      detail:
        step === "approved"
          ? "Owner confirmed availability and the pickup window."
          : step === "deposit_authorized"
            ? "Deposit hold placed on the renter's card."
            : step === "dispatched"
              ? "Insured shipment handed to the carrier."
              : step === "in_use"
                ? "Renter confirmed delivery and condition."
                : step === "return_due"
                  ? "Return label issued; rental window closing."
                  : step === "returned"
                    ? "Parcel scanned back at the studio."
                    : step === "inspection"
                      ? "Condition inspection started."
                      : "Rental closed and deposit released.",
      actor,
    });
  });
  if (state === "overdue") {
    events.push({ at: at(-2), label: "Marked overdue", detail: "Return window passed without a carrier scan.", actor: "System" });
  }
  if (state === "disputed") {
    events.push({ at: at(-3), label: "Dispute opened", detail: "Owner raised a damage claim after inspection.", actor: "Owner" });
  }
  return events;
}

export function seedBookings(listings: RentalListing[], sellers: Seller[]): Booking[] {
  return MIX.map((state, index) => {
    const listing = listings[index % listings.length];
    const renter = RENTERS[index % RENTERS.length];
    const seller = sellers.find((entry) => entry.id === listing.sellerId);
    const offset = STATE_OFFSET[state] + (index % 3);
    const days = 2 + (index % 5);
    const start = at(offset);
    const end = at(offset + days);
    const createdAt = at(offset - 4, 9);
    const rentalFee = listing.dailyRate * days;
    const deliveryFee = 18;
    const cleaningFee = 14;
    const tax = Math.round((rentalFee + deliveryFee + cleaningFee) * 0.0825);
    const total = rentalFee + deliveryFee + cleaningFee + tax;
    const daysLate = state === "overdue" ? Math.max(1, Math.abs(offset) - days) : 0;
    const lateFee = daysLate * Math.round(listing.dailyRate * 0.5);
    const depositState = DEPOSIT_STATE[state];
    const items: BookingItem[] = [
      { id: `itm_${index}_1`, name: listing.title, image: listing.image, qty: 1, dailyRate: listing.dailyRate, days },
    ];
    if (index % 4 === 0) {
      const extra = listings[(index + 3) % listings.length];
      items.push({ id: `itm_${index}_2`, name: extra.title, image: extra.image, qty: 1, dailyRate: extra.dailyRate, days });
    }
    const notes =
      index % 5 === 0
        ? [
            {
              id: `note_${index}_1`,
              author: "Fulfilment desk",
              at: at(offset - 1, 15),
              body: state === "overdue" ? "Renter has not responded to the return reminder. Second email sent." : "Confirmed the pickup window with the owner; insured label attached.",
            },
          ]
        : [];
    return {
      id: `bkg_${String(1000 + index)}`,
      number: `FC-R${String(1000 + index)}`,
      state,
      listingId: listing.id,
      listingTitle: listing.title,
      listingImage: listing.image,
      listingCity: listing.city,
      listingState: listing.state,
      sellerId: listing.sellerId,
      ownerName: listing.sellerName,
      renterId: `cus_${index}`,
      renterName: renter[0],
      renterEmail: renter[1],
      startDate: start,
      endDate: end,
      days,
      rentalFee,
      deliveryFee,
      cleaningFee,
      tax,
      total,
      deposit: listing.deposit,
      depositState,
      depositCaptured: depositState === "captured" ? listing.deposit : undefined,
      depositReleased: depositState === "released" ? listing.deposit : undefined,
      depositReason: depositState === "captured" ? "Staining found during inspection; partial deposit retained." : undefined,
      daysLate,
      lateFee,
      createdAt,
      items,
      timeline: timelineFor(state, createdAt, seller?.ownerName ?? "Fabulous Cartz"),
      notes,
      allowedTransitions: ALLOWED_TRANSITIONS[state],
    };
  });
}

export function seedPayouts(sellers: Seller[]): Payout[] {
  const rows: Payout[] = [];
  sellers.forEach((seller, index) => {
    if (seller.kycStatus !== "approved") return;
    ["2026-10", "2026-09"].forEach((period, pindex) => {
      const gross = Math.round((seller.gmv / 4) * (pindex === 0 ? 1 : 0.86));
      const commission = Math.round((gross * seller.commissionRate) / 100);
      const refunds = pindex === 0 ? Math.round(gross * 0.03) : 0;
      const status: Payout["status"] = pindex === 0 ? "due" : index === 9 ? "failed" : "paid";
      rows.push({
        id: `pay_${seller.id}_${period.replace("-", "")}`,
        sellerId: seller.id,
        sellerName: seller.name,
        period,
        gross,
        commission,
        refunds,
        net: gross - commission - refunds,
        status,
        reference: status === "paid" ? `ACH-${period.replace("-", "")}-${index + 1}` : undefined,
        paidAt: status === "paid" ? at(-4) : undefined,
        createdAt: at(pindex === 0 ? -6 : -36),
      });
    });
  });
  return rows;
}

export function seedBlackouts(listings: RentalListing[]): Blackout[] {
  return [0, 2, 4, 6, 9, 12].map((index, position) => {
    const listing = listings[index % listings.length];
    return {
      id: `blk_${position + 1}`,
      listingId: listing.id,
      listingTitle: listing.title,
      from: at(5 + position * 4),
      to: at(7 + position * 4),
      reason: position % 2 === 0 ? "Owner maintenance / dry-clean" : "Already reserved for an editorial shoot",
    };
  });
}

export function seedDisputes(bookings: Booking[]): Dispute[] {
  return bookings
    .filter((booking) => booking.state === "disputed")
    .map((booking, index) => ({
      id: `dsp_${index + 1}`,
      bookingId: booking.id,
      number: booking.number,
      renterName: booking.renterName,
      ownerName: booking.ownerName,
      listingTitle: booking.listingTitle,
      reason: index % 2 === 0 ? "Hemline torn and beads missing on return." : "Returned two days late with a make-up stain on the dupatta.",
      openedAt: at(-3 - index),
      evidence: [booking.listingImage, IMGS[(index + 3) % IMGS.length]],
      status: "open",
    }));
}

export interface MarketplaceSeed {
  sellers: Seller[];
  payouts: Payout[];
  listings: RentalListing[];
  bookings: Booking[];
  blackouts: Blackout[];
  disputes: Dispute[];
}

export function seedMarketplace(): MarketplaceSeed {
  const sellers = seedSellers();
  const listings = seedListings(sellers);
  const bookings = seedBookings(listings, sellers);
  return {
    sellers,
    payouts: seedPayouts(sellers),
    listings,
    bookings,
    blackouts: seedBlackouts(listings),
    disputes: seedDisputes(bookings),
  };
}
