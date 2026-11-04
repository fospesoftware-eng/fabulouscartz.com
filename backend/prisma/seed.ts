import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { DEFAULT_SETTINGS } from "../src/services/settings.js";
import { rentalDaysBetween, rentalQuoteMinor } from "../src/lib/money.js";

const prisma = new PrismaClient();
const NOW = new Date("2026-11-03T10:20:00+05:30");
const IMG = "/img";

function daysAgo(days: number, hour = 11, minute = 0): Date {
  const date = new Date(NOW);
  date.setDate(date.getDate() - days);
  date.setHours(hour, minute, 0, 0);
  return date;
}
function hoursAfter(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}
function daysAfter(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CATEGORIES = [
  { id: "cat_kids", slug: "kids-wear", name: "Kids Wear", tagline: "Little celebrations, big memories", image: `${IMG}/categories/kids-wear.webp`, accent: "#2E8B57", order: 0 },
  { id: "cat_jewelry", slug: "handmade-jewelry", name: "Handmade Jewelry", tagline: "Crafted by hand, worn by heart", image: `${IMG}/categories/handmade-jewelry.webp`, accent: "#B8913A", order: 1 },
  { id: "cat_womens", slug: "womens-wear", name: "Women's Wear", tagline: "Sarees, lehengas, kurtas — celebrated", image: `${IMG}/products/bridal-lehenga.webp`, accent: "#B56A4D", order: 2 },
  { id: "cat_dance", slug: "dance-costumes", name: "Dance Costumes", tagline: "Stage-ready, culture-driven", image: `${IMG}/categories/dance-costumes.webp`, accent: "#0F4A2D", order: 3 },
  { id: "cat_mens", slug: "mens-wear", name: "Men's Wear", tagline: "Kurta, sherwani and occasion wear", image: `${IMG}/categories/mens-wear.webp`, accent: "#25231F", order: 4 },
  { id: "cat_accessories", slug: "accessories", name: "Accessories", tagline: "The finish to every look", image: `${IMG}/categories/accessories.webp`, accent: "#B8913A", order: 5 },
];

const SELLERS_DATA: Array<{
  id: string;
  ownerId: string;
  ownerName: string;
  vendorId: string | null;
  storeName: string;
  slug: string;
  kycStatus: "pending" | "approved" | "rejected" | "suspended";
  status: "pending" | "active" | "rejected" | "suspended";
  commissionBps: number | null;
  contactEmail: string;
  city: string;
  state: string;
  rating: number;
  joinedDaysAgo: number;
  payoutMethod: "bank_transfer" | "paypal" | "stripe_connect";
  payoutMasked: string;
  payoutVerification: "unverified" | "pending" | "verified" | "failed";
}> = [
  { id: "sel_viya", ownerId: "selusr_viya", ownerName: "Viya Nair", vendorId: "ven_viya", storeName: "Viya Crafts", slug: "viya-crafts", kycStatus: "approved", status: "active", commissionBps: null, contactEmail: "studio@viyacrafts.com", city: "San Francisco", state: "CA", rating: 4.9, joinedDaysAgo: 420, payoutMethod: "stripe_connect", payoutMasked: "acct_****4821", payoutVerification: "verified" },
  { id: "sel_omana", ownerId: "selusr_omana", ownerName: "Omana Menon", vendorId: "ven_omana", storeName: "Omana Atelier", slug: "omana-atelier", kycStatus: "approved", status: "active", commissionBps: 1000, contactEmail: "hello@omana.in", city: "Austin", state: "TX", rating: 4.8, joinedDaysAgo: 380, payoutMethod: "bank_transfer", payoutMasked: "**** 2210", payoutVerification: "verified" },
  { id: "sel_swathi", ownerId: "selusr_swathi", ownerName: "Swathi Iyer", vendorId: "ven_swathi", storeName: "Swathi Studio", slug: "swathi-studio", kycStatus: "approved", status: "active", commissionBps: 1500, contactEmail: "swathi@atelier.in", city: "New York", state: "NY", rating: 4.9, joinedDaysAgo: 350, payoutMethod: "paypal", payoutMasked: "swat***@paypal.com", payoutVerification: "verified" },
  { id: "sel_leo", ownerId: "selusr_leo", ownerName: "Leo Thomas", vendorId: "ven_leo", storeName: "Leo Textiles", slug: "leo-textiles", kycStatus: "pending", status: "active", commissionBps: 1800, contactEmail: "leo@textile.in", city: "Seattle", state: "WA", rating: 4.6, joinedDaysAgo: 120, payoutMethod: "bank_transfer", payoutMasked: "**** 8842", payoutVerification: "pending" },
  { id: "sel_lakshmi", ownerId: "selusr_lakshmi", ownerName: "Lakshmi Raman", vendorId: "ven_lakshmi", storeName: "Lakshmi Bridal", slug: "lakshmi-bridal", kycStatus: "approved", status: "active", commissionBps: 800, contactEmail: "lakshmi@bridal.in", city: "Chicago", state: "IL", rating: 5.0, joinedDaysAgo: 400, payoutMethod: "bank_transfer", payoutMasked: "**** 1190", payoutVerification: "verified" },
  { id: "sel_mercy", ownerId: "selusr_mercy", ownerName: "Mercy George", vendorId: "ven_mercy", storeName: "Mercy George Tailoring", slug: "mercy-george-tailoring", kycStatus: "approved", status: "active", commissionBps: null, contactEmail: "mercy@tailoring.in", city: "Boston", state: "MA", rating: 4.8, joinedDaysAgo: 300, payoutMethod: "stripe_connect", payoutMasked: "acct_****7712", payoutVerification: "verified" },
  { id: "sel_sangeetha", ownerId: "selusr_sangeetha", ownerName: "Sangeetha Harilal", vendorId: "ven_sangeetha", storeName: "Sangeetha Kids", slug: "sangeetha-kids", kycStatus: "approved", status: "active", commissionBps: 1200, contactEmail: "sangeetha@kidswear.in", city: "Miami", state: "FL", rating: 4.9, joinedDaysAgo: 280, payoutMethod: "bank_transfer", payoutMasked: "**** 5521", payoutVerification: "verified" },
  { id: "sel_madhuri", ownerId: "selusr_madhuri", ownerName: "Madhuri Kapoor", vendorId: "ven_madhuri", storeName: "Madhuri Couture", slug: "madhuri-couture", kycStatus: "pending", status: "active", commissionBps: 1100, contactEmail: "madhuri@couture.in", city: "Denver", state: "CO", rating: 4.7, joinedDaysAgo: 70, payoutMethod: "paypal", payoutMasked: "madh***@paypal.com", payoutVerification: "pending" },
  { id: "sel_grace", ownerId: "selusr_grace", ownerName: "Grace Thomas", vendorId: "ven_grace", storeName: "Grace Craft House", slug: "grace-craft-house", kycStatus: "rejected", status: "rejected", commissionBps: null, contactEmail: "grace@craft.in", city: "Atlanta", state: "GA", rating: 4.7, joinedDaysAgo: 210, payoutMethod: "bank_transfer", payoutMasked: "**** 9002", payoutVerification: "failed" },
  { id: "sel_suspended", ownerId: "selusr_suspended", ownerName: "Ravi Menon", vendorId: null, storeName: "Ravi Vintage Rentals", slug: "ravi-vintage-rentals", kycStatus: "suspended", status: "suspended", commissionBps: 2000, contactEmail: "ravi@vintage.example.com", city: "Phoenix", state: "AZ", rating: 4.2, joinedDaysAgo: 180, payoutMethod: "bank_transfer", payoutMasked: "**** 3300", payoutVerification: "verified" },
];

const VENDORS: Array<[string, string, string, number, number, string, string]> = [
  ["ven_viya", "Viya Crafts", "viya-crafts", 5.0, 1842, "studio@viyacrafts.com", "Kochi, Kerala"],
  ["ven_omana", "Omana", "omana", 4.8, 962, "hello@omana.in", "Thrissur, Kerala"],
  ["ven_swathi", "Swathi", "swathi", 4.9, 1120, "swathi@atelier.in", "Chennai, Tamil Nadu"],
  ["ven_sweety", "Sweety", "sweety", 4.7, 480, "sweety@studio.in", "Coimbatore, Tamil Nadu"],
  ["ven_leo", "Leo", "leo", 4.6, 210, "leo@textile.in", "Bengaluru, Karnataka"],
  ["ven_lakshmi", "Lakshmi", "lakshmi", 4.9, 320, "lakshmi@bridal.in", "Madurai, Tamil Nadu"],
  ["ven_grace", "Grace", "grace", 4.7, 140, "grace@craft.in", "Hyderabad, Telangana"],
  ["ven_mercy", "Mercy George", "mercy-george", 4.8, 96, "mercy@tailoring.in", "Kochi, Kerala"],
  ["ven_sangeetha", "Sangeetha Harilal", "sangeetha-harilal", 4.9, 180, "sangeetha@kidswear.in", "Thiruvananthapuram, Kerala"],
  ["ven_madhuri", "Madhuri", "madhuri", 4.7, 720, "madhuri@couture.in", "Mumbai, Maharashtra"],
  ["ven_rajesh", "Rajesh Sebastian", "rajesh-sebastian", 4.8, 540, "rajesh@menswear.in", "Kottayam, Kerala"],
];

interface SeedVariant {
  size: string;
  color: string;
  stock: number;
  rented?: number;
}
interface SeedProduct {
  id: string;
  slug: string;
  title: string;
  description: string;
  details: string[];
  price: number;
  mrp?: number;
  categoryId: string;
  vendorId: string;
  images: string[];
  variants: SeedVariant[];
  tags: string[];
  modes: Array<"buy" | "rent">;
  status: "active" | "draft" | "archived";
  featured?: boolean;
  newArrival?: boolean;
  topSeller?: boolean;
  rating: number;
  reviews: number;
  createdDaysAgo: number;
}

const PRODUCTS: SeedProduct[] = [
  { id: "prd_001", slug: "bridal-lehenga", title: "Crimson Bridal Lehenga", description: "A deep crimson bridal lehenga with hand-worked gold zardozi borders and a sheer dupatta — made for the mandap.", details: ["Crimson silk with zardozi border", "Full-flare lehenga with blouse", "Dry clean only", "Ships in 4–6 days"], price: 65, categoryId: "cat_womens", vendorId: "ven_lakshmi", images: [`${IMG}/products/bridal-lehenga.webp`, `${IMG}/hero/craft.webp`], variants: [{ size: "XS", color: "Crimson", stock: 2, rented: 1 }, { size: "S", color: "Crimson", stock: 3 }, { size: "M", color: "Crimson", stock: 1, rented: 1 }], tags: ["wedding", "bridal", "red"], modes: ["buy", "rent"], status: "active", featured: true, newArrival: true, rating: 4.9, reviews: 28, createdDaysAgo: 96 },
  { id: "prd_002", slug: "indo-western-gown", title: "Indo Western Gown", description: "Modern cut with traditional motifs — a gown that bridges two worlds.", details: ["Silk-blend fabric", "Hand-embroidered yoke", "Dry clean"], price: 100, mrp: 140, categoryId: "cat_womens", vendorId: "ven_sweety", images: [`${IMG}/products/indo-western-gown.webp`], variants: [{ size: "S", color: "Gold", stock: 7 }, { size: "M", color: "Gold", stock: 9, rented: 1 }, { size: "L", color: "Ivory", stock: 4 }], tags: ["fusion", "party", "cream"], modes: ["buy", "rent"], status: "active", featured: true, topSeller: true, rating: 4.8, reviews: 19, createdDaysAgo: 150 },
  { id: "prd_003", slug: "silver-color-jewelry", title: "Silver Tone Jewelry Set", description: "A silver-plated necklace and earring set, hand-polished for a luminous finish.", details: ["Silver-plated brass", "Anti-tarnish coating", "Hypoallergenic"], price: 10, categoryId: "cat_jewelry", vendorId: "ven_grace", images: [`${IMG}/products/silver-jewelry.webp`], variants: [{ size: "One Size", color: "Silver", stock: 24 }, { size: "One Size", color: "Gold", stock: 11 }], tags: ["silver", "necklace", "everyday"], modes: ["buy"], status: "active", newArrival: true, rating: 4.7, reviews: 12, createdDaysAgo: 41 },
  { id: "prd_004", slug: "punjabi-style-kurta", title: "Punjabi Style Women's Kurta", description: "A cotton-linen kurta with Phulkari-inspired embroidery on the sleeves and yoke.", details: ["Cotton-linen blend", "Hand wash cold", "Includes dupatta"], price: 30, categoryId: "cat_womens", vendorId: "ven_omana", images: [`${IMG}/products/punjabi-kurta-v2.webp`], variants: [{ size: "S", color: "Sage", stock: 14 }, { size: "M", color: "Sage", stock: 18, rented: 2 }, { size: "L", color: "Ivory", stock: 6 }, { size: "XL", color: "Ivory", stock: 3 }], tags: ["everyday", "cotton", "kurta"], modes: ["buy", "rent"], status: "active", topSeller: true, rating: 4.8, reviews: 34, createdDaysAgo: 210 },
  { id: "prd_005", slug: "party-wear-dress", title: "Women's Indian Party Wear", description: "A vibrant Anarkali set in silk-cotton with subtle mirror work.", details: ["Silk-cotton blend", "Includes bottom and dupatta"], price: 35, categoryId: "cat_womens", vendorId: "ven_omana", images: [`${IMG}/products/ethnic-anarkali.webp`], variants: [{ size: "S", color: "Emerald", stock: 8 }, { size: "M", color: "Emerald", stock: 5 }, { size: "L", color: "Rust", stock: 2 }], tags: ["anarkali", "festive"], modes: ["buy", "rent"], status: "active", topSeller: true, rating: 4.6, reviews: 9, createdDaysAgo: 180 },
  { id: "prd_006", slug: "stretchable-saree-blouse", title: "Readymade Stretchable Saree Blouse", description: "A stretchable cotton-spandex blouse that fits most body types with comfort.", details: ["Cotton-spandex blend", "Hand wash", "Fits sizes S–L"], price: 14, categoryId: "cat_womens", vendorId: "ven_mercy", images: [`${IMG}/products/saree-blouse.webp`], variants: [{ size: "S", color: "Black", stock: 22 }, { size: "M", color: "Black", stock: 19 }, { size: "L", color: "Rust", stock: 15 }], tags: ["blouse", "everyday"], modes: ["buy"], status: "active", rating: 4.7, reviews: 22, createdDaysAgo: 260 },
  { id: "prd_007", slug: "white-frock", title: "White Frock", description: "A serene cotton frock with lace trims — perfect for baby showers and ceremonies.", details: ["Pure cotton", "Hand wash cold", "Sizes 2T–10Y"], price: 50, categoryId: "cat_kids", vendorId: "ven_sangeetha", images: [`${IMG}/products/kids-ethnic.webp`], variants: [{ size: "2T", color: "Ivory", stock: 5 }, { size: "4Y", color: "Ivory", stock: 4 }, { size: "6Y", color: "Ivory", stock: 1 }, { size: "10Y", color: "Ivory", stock: 3, rented: 1 }], tags: ["kids", "frock", "ceremony"], modes: ["buy", "rent"], status: "active", newArrival: true, rating: 4.9, reviews: 15, createdDaysAgo: 28 },
  { id: "prd_008", slug: "long-kurthi", title: "Long Kurthi", description: "A floor-length kurthi in pastel sage with intricate hand block prints.", details: ["Cotton", "Hand block print", "Dry clean"], price: 30, categoryId: "cat_womens", vendorId: "ven_leo", images: [`${IMG}/products/long-kurthi.webp`], variants: [{ size: "S", color: "Sage", stock: 12 }, { size: "M", color: "Sage", stock: 9 }, { size: "L", color: "Sage", stock: 6 }], tags: ["kurthi", "everyday"], modes: ["buy"], status: "active", topSeller: true, rating: 4.7, reviews: 41, createdDaysAgo: 190 },
  { id: "prd_009", slug: "sharara-for-girls", title: "Sharara For Girls With Bell Bottom Pants", description: "A sharara set with delicate mirror and thread embroidery — little one ready for the wedding.", details: ["Silk blend", "Dry clean", "Sizes 4–10Y"], price: 65, categoryId: "cat_kids", vendorId: "ven_swathi", images: [`${IMG}/products/kids-ethnic.webp`], variants: [{ size: "4Y", color: "Deep Red", stock: 3 }, { size: "6Y", color: "Deep Red", stock: 2, rented: 1 }, { size: "8Y", color: "Gold", stock: 2 }, { size: "10Y", color: "Gold", stock: 1 }], tags: ["kids", "wedding", "sharara"], modes: ["buy", "rent"], status: "active", featured: true, rating: 4.9, reviews: 27, createdDaysAgo: 120 },
  { id: "prd_010", slug: "kids-lehenga-10y", title: "Kids Lehenga — Age Around 10 Years", description: "A miniature bridal lehenga in crimson and gold — intricate enough to feel real, sized to feel hers.", details: ["Banarasi silk", "Dry clean", "Age 9–11"], price: 65, categoryId: "cat_kids", vendorId: "ven_swathi", images: [`${IMG}/products/kids-ethnic.webp`], variants: [{ size: "9Y", color: "Crimson", stock: 2, rented: 1 }, { size: "11Y", color: "Crimson", stock: 1 }], tags: ["kids", "lehenga", "rent"], modes: ["rent"], status: "active", featured: true, rating: 5.0, reviews: 18, createdDaysAgo: 88 },
  { id: "prd_011", slug: "gold-tone-beach-charm-bracelet", title: "Gold Tone Beach Charm Bracelet – 8 Inch – Lobster Clasp", description: "A gold-tone beaded bracelet with a lobster clasp, beach-inspired and light enough for every day.", details: ["Gold-tone plating", "Lobster clasp", "8 inch adjustable"], price: 12, categoryId: "cat_jewelry", vendorId: "ven_viya", images: [`${IMG}/products/beach-charm-bracelet.webp`], variants: [{ size: "8 Inch", color: "Gold", stock: 16 }, { size: "7 Inch", color: "Gold", stock: 7 }], tags: ["bracelet", "gold", "everyday"], modes: ["buy"], status: "active", newArrival: true, rating: 4.6, reviews: 8, createdDaysAgo: 22 },
  { id: "prd_012", slug: "clear-crystal-angel-earrings", title: "Handmade Clear Crystal Angel Earrings", description: "Clear crystal earrings cut and set by hand — delicate angels that catch every light.", details: ["Swarovski crystals", "Sterling silver hooks", "Handcrafted"], price: 10, categoryId: "cat_jewelry", vendorId: "ven_viya", images: [`${IMG}/products/crystal-earrings.webp`], variants: [{ size: "One Size", color: "Silver", stock: 3 }], tags: ["earrings", "crystal", "top-rated"], modes: ["buy"], status: "active", featured: true, rating: 5.0, reviews: 12, createdDaysAgo: 160 },
  { id: "prd_013", slug: "navy-blue-beaded-earrings", title: "Handmade Navy Blue Beaded Cluster Earrings", description: "Deep navy cluster earrings, strung by hand with seed beads and tiny Czech crystals.", details: ["Seed beads + crystals", "Nickel-free hooks"], price: 10, categoryId: "cat_jewelry", vendorId: "ven_viya", images: [`${IMG}/products/navy-earrings.webp`], variants: [{ size: "One Size", color: "Navy", stock: 9 }], tags: ["earrings", "navy"], modes: ["buy"], status: "active", rating: 4.5, reviews: 6, createdDaysAgo: 175 },
  { id: "prd_014", slug: "memory-wire-red-gold-green-bracelet", title: "Memory Wire Red, Gold & Green Boho Wrapping Bracelet", description: "A memory wire bracelet that wraps around the wrist — red, gold and green, holiday-ready.", details: ["Memory wire", "Seed beads + crystals"], price: 15, categoryId: "cat_jewelry", vendorId: "ven_viya", images: [`${IMG}/products/boho-bracelet.webp`], variants: [{ size: "One Size", color: "Multi", stock: 0 }], tags: ["bracelet", "boho", "holiday"], modes: ["buy"], status: "archived", rating: 4.7, reviews: 10, createdDaysAgo: 300 },
  { id: "prd_015", slug: "red-beaded-statement-set", title: "Handmade Red Beaded Statement Necklace & Earring Set", description: "A silver-tone statement set with vivid red beads — the kind of set that owns the room.", details: ["Silver-tone base", "Acrylic + glass beads"], price: 28, categoryId: "cat_jewelry", vendorId: "ven_viya", images: [`${IMG}/products/red-statement-set.webp`], variants: [{ size: "One Size", color: "Deep Red", stock: 7 }], tags: ["necklace", "statement", "red"], modes: ["buy"], status: "active", topSeller: true, rating: 4.8, reviews: 14, createdDaysAgo: 140 },
  { id: "prd_016", slug: "purple-multi-beaded-memory-wire-bracelet", title: "Handmade Purple Multi-Color Beaded Memory Wire Bracelet", description: "A multi-purple memory wire bracelet with clusters of seed beads and Czech fire-polished crystals.", details: ["Memory wire", "Glass + plastic beads"], price: 18, categoryId: "cat_jewelry", vendorId: "ven_viya", images: [`${IMG}/products/purple-memory-wire.webp`], variants: [{ size: "One Size", color: "Purple", stock: 1 }], tags: ["bracelet", "purple"], modes: ["buy"], status: "active", rating: 4.6, reviews: 7, createdDaysAgo: 115 },
  { id: "prd_017", slug: "air-dry-clay-necklace-blue-green", title: "Handmade Air-Dry Clay Necklace — Blue & Green", description: "A sculptural necklace strung from hand-shaped air-dry clay beads, painted and glazed — wearable art.", details: ["Air-dry clay beads", "Cotton cord", "Handcrafted"], price: 28, categoryId: "cat_jewelry", vendorId: "ven_viya", images: [`${IMG}/products/clay-necklace.webp`], variants: [{ size: "One Size", color: "Teal", stock: 5 }], tags: ["necklace", "clay", "artisan"], modes: ["buy"], status: "active", featured: true, rating: 4.9, reviews: 9, createdDaysAgo: 70 },
  { id: "prd_018", slug: "bharatanatyam-stage-costume", title: "Bharatanatyam Stage Costume", description: "A traditional Bharatanatyam dance costume with temple-border silk, fan-pleated skirt and handmade jewellery set — stage-ready.", details: ["Pure silk with temple border", "Fan-pleated skirt", "Jewellery set included", "Rental only"], price: 95, categoryId: "cat_dance", vendorId: "ven_lakshmi", images: [`${IMG}/categories/dance-costumes.webp`, `${IMG}/hero/craft.webp`], variants: [{ size: "S", color: "Deep Red", stock: 4, rented: 2 }, { size: "M", color: "Deep Red", stock: 3, rented: 1 }, { size: "L", color: "Emerald", stock: 2 }], tags: ["dance", "bharatanatyam", "stage"], modes: ["rent"], status: "active", featured: true, rating: 4.9, reviews: 31, createdDaysAgo: 240 },
  { id: "prd_019", slug: "kathak-anarkali-costume", title: "Kathak Anarkali Costume", description: "A flowing Kathak costume with gota-patti work, fitted churidar and a lightweight dupatta for full spins.", details: ["Silk-cotton anarkali", "Gota-patti detailing", "Rental only"], price: 72, categoryId: "cat_dance", vendorId: "ven_omana", images: [`${IMG}/products/ethnic-anarkali.webp`, `${IMG}/categories/dance-costumes.webp`], variants: [{ size: "S", color: "Indigo", stock: 2 }, { size: "M", color: "Indigo", stock: 1, rented: 1 }, { size: "L", color: "Teal", stock: 2 }], tags: ["dance", "kathak", "rent"], modes: ["rent"], status: "draft", newArrival: true, rating: 4.8, reviews: 4, createdDaysAgo: 16 },
  { id: "prd_020", slug: "ivory-silk-mens-kurta", title: "Ivory Silk Men's Kurta", description: "An ivory raw-silk kurta with a mandarin collar and subtle self-texture — festive without shouting.", details: ["Raw silk", "Mandarin collar", "Side slits", "Dry clean"], price: 48, categoryId: "cat_mens", vendorId: "ven_rajesh", images: [`${IMG}/categories/mens-wear.webp`], variants: [{ size: "S", color: "Ivory", stock: 8 }, { size: "M", color: "Ivory", stock: 12 }, { size: "L", color: "Ivory", stock: 6 }, { size: "XL", color: "Ivory", stock: 2 }], tags: ["mens", "kurta", "festive"], modes: ["buy"], status: "active", rating: 4.7, reviews: 11, createdDaysAgo: 55 },
  { id: "prd_021", slug: "handcrafted-potli-clutch", title: "Handcrafted Zardozi Potli Clutch", description: "A hand-embroidered potli clutch in velvet with a gold zardozi frame and wrist handle.", details: ["Velvet with zardozi work", "Gold-tone frame", "Silk wrist handle"], price: 22, categoryId: "cat_accessories", vendorId: "ven_viya", images: [`${IMG}/categories/accessories.webp`], variants: [{ size: "One Size", color: "Deep Red", stock: 9 }, { size: "One Size", color: "Gold", stock: 3 }], tags: ["clutch", "accessories", "festive"], modes: ["buy"], status: "active", newArrival: true, rating: 4.8, reviews: 13, createdDaysAgo: 12 },
];

const CUSTOMERS = [
  ["Ananya Raghavan", "ananya.raghavan"], ["Diya Menon", "diya.menon"], ["Meera Pillai", "meera.pillai"],
  ["Kavya Nair", "kavya.nair"], ["Aditi Sharma", "aditi.sharma"], ["Isha Iyer", "isha.iyer"],
  ["Nandini Rao", "nandini.rao"], ["Tara Krishnan", "tara.krishnan"], ["Riya Thomas", "riya.thomas"],
  ["Sneha Varma", "sneha.varma"], ["Aishwarya Kumar", "aishwarya.kumar"], ["Lakshmi Subramanian", "lakshmi.subramanian"],
  ["Priyanka Reddy", "priyanka.reddy"], ["Shruti Patel", "shruti.patel"], ["Anjali Joshi", "anjali.joshi"],
  ["Neha Kapoor", "neha.kapoor"], ["Pooja Desai", "pooja.desai"], ["Swara Bhat", "swara.bhat"],
  ["Tanvi Shetty", "tanvi.shetty"], ["Veda Suresh", "veda.suresh"], ["Ira Banerjee", "ira.banerjee"],
  ["Maya Das", "maya.das"], ["Sana Khan", "sana.khan"], ["Zoya Ahmed", "zoya.ahmed"],
  ["Aarav Nair", "aarav.nair"], ["Arjun Menon", "arjun.menon"], ["Vikram Rao", "vikram.rao"],
  ["Rohan Iyer", "rohan.iyer"], ["Karthik Pillai", "karthik.pillai"], ["Dev Sharma", "dev.sharma"],
];

const COUPONS = [
  ["FESTIVE20", "Festive 20% off across the atelier", "percent", 20, 4000, 3, 30, 200, 84, true, null],
  ["WELCOME10", "First order welcome", "percent", 10, 2500, 60, 90, 500, 213, true, null],
  ["DANCE15", "Dance costume rental week", "percent", 15, 6000, 2, 24, 80, 12, true, "cat_dance"],
  ["BRIDAL25", "Bridal trousseau edit", "percent", 25, 9000, 5, 45, 40, 17, true, "cat_womens"],
  ["FREESHIP", "Free shipping over $40", "flat", 1200, 4000, 8, 60, 300, 96, true, null],
  ["JEWEL12", "Handmade jewellery thank-you", "flat", 1200, 3000, 1, 20, 150, 41, true, "cat_jewelry"],
  ["DIWALI18", "Diwali flash edit (ended)", "percent", 18, 3500, 28, -12, 300, 288, false, null],
  ["KIDS10", "Little celebrations", "percent", 10, 3000, 4, 40, 120, 22, true, "cat_kids"],
] as Array<[string, string, string, number, number, number, number, number, number, boolean, string | null]>;

async function reset(): Promise<void> {
  await prisma.webhookEvent.deleteMany();
  await prisma.refund.deleteMany();
  await prisma.payment.deleteMany();
  await prisma.orderStatusEvent.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.address.deleteMany();
  await prisma.stockReservation.deleteMany();
  await prisma.stockAdjustment.deleteMany();
  await prisma.couponRedemption.deleteMany();
  await prisma.order.deleteMany();
  await prisma.cartItem.deleteMany();
  await prisma.cart.deleteMany();
  await prisma.review.deleteMany();
  await prisma.wishlistItem.deleteMany();
  // marketplace / rentals
  await prisma.depositLedgerEntry.deleteMany();
  await prisma.rentalDeposit.deleteMany();
  await prisma.bookingEvent.deleteMany();
  await prisma.bookingNote.deleteMany();
  await prisma.dispute.deleteMany();
  await prisma.inspectionReport.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.rentalBlackout.deleteMany();
  await prisma.rentalListing.deleteMany();
  await prisma.sellerLedgerEntry.deleteMany();
  await prisma.payout.deleteMany();
  await prisma.sellerKycDocument.deleteMany();
  await prisma.sellerOnboardingRequest.deleteMany();
  await prisma.seller.deleteMany();
  await prisma.productImage.deleteMany();
  await prisma.productTag.deleteMany();
  await prisma.productAttribute.deleteMany();
  await prisma.productVariant.deleteMany();
  await prisma.product.deleteMany();
  await prisma.coupon.deleteMany();
  await prisma.banner.deleteMany();
  await prisma.contentPost.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.mediaAsset.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.shippingRule.deleteMany();
  await prisma.taxRule.deleteMany();
  await prisma.appSetting.deleteMany();
  await prisma.refreshSession.deleteMany();
  await prisma.category.deleteMany();
  await prisma.vendor.deleteMany();
  await prisma.user.deleteMany();
}

async function main(): Promise<void> {
  await reset();

  // ------------------------------------------------------------------ users
  const staffPasswords: Record<string, string> = {
    "admin@fabulouscartz.com": "Admin#2026",
    "manager@fabulouscartz.com": "Manager#2026",
    "fulfilment@fabulouscartz.com": "Fulfil#2026",
  };
  const staff = [
    { id: "usr_admin", email: "admin@fabulouscartz.com", name: "Aarav Mehta", role: "admin", title: "Admin", username: "admin" },
    { id: "usr_manager", email: "manager@fabulouscartz.com", name: "Priya Nair", role: "manager", title: "Manager", username: "manager" },
    { id: "usr_fulfilment", email: "fulfilment@fabulouscartz.com", name: "Rohan Das", role: "fulfilment", title: "Fulfilment", username: "fulfilment" },
  ];
  for (const [index, person] of staff.entries()) {
    const [firstName, ...rest] = person.name.split(" ");
    await prisma.user.create({
      data: {
        id: person.id,
        email: person.email,
        username: person.username,
        passwordHash: await bcrypt.hash(staffPasswords[person.email], 10),
        firstName,
        lastName: rest.join(" ") || null,
        role: person.role,
        title: person.title,
        phone: `+91 98470 2102${index}`,
        createdAt: daysAgo(420 - index * 20, 10),
        lastLoginAt: daysAgo(index === 0 ? 0 : index * 2, 18, 40),
      },
    });
  }

  const customerPassword = await bcrypt.hash("Customer#2026", 10);
  const customers: Array<{ id: string; name: string; email: string; phone: string; createdAt: Date }> = [];
  for (const [index, entry] of CUSTOMERS.entries()) {
    const [name, handle] = entry;
    const [firstName, ...rest] = name.split(" ");
    const email = `${handle}@example.com`;
    const createdAt = daysAgo(400 - index * 9, 9, 30 + (index % 20));
    await prisma.user.create({
      data: {
        id: `cus_${String(index + 1).padStart(3, "0")}`,
        email,
        username: handle,
        passwordHash: customerPassword,
        firstName,
        lastName: rest.join(" ") || null,
        phone: `+91 90000 ${String(10000 + index).slice(0, 5)}`,
        role: "customer",
        createdAt,
        lastLoginAt: index % 4 === 0 ? daysAgo(index, 19) : null,
      },
    });
    customers.push({ id: `cus_${String(index + 1).padStart(3, "0")}`, name, email, phone: `+91 90000 ${String(10000 + index).slice(0, 5)}`, createdAt });
  }

  // --------------------------------------------------------------- catalogue
  for (const category of CATEGORIES) {
    await prisma.category.create({
      data: {
        id: category.id,
        slug: category.slug,
        name: category.name,
        tagline: category.tagline,
        description: `${category.name} curated by Fabulous Cartz — hand-worked pieces from independent Indian studios.`,
        imageUrl: category.image,
        accent: category.accent,
        sortOrder: category.order,
        isVisible: true,
      },
    });
  }

  // --------------------------------------------------------------- vendors
  for (const [index, [id, name, slug, rating, sales, email, location]] of VENDORS.entries()) {
    await prisma.vendor.create({
      data: {
        id,
        slug,
        name,
        description: `Independent ${name} studio partner, curated by Fabulous Cartz.`,
        email,
        location,
        rating,
        salesCount: sales,
        isActive: true,
        createdAt: daysAgo(380 - index * 12, 9),
      },
    });
  }

  // -------------------------------------------------------------- sellers
  const sellerIdByVendor = new Map<string, string>();
  for (const [index, seller] of SELLERS_DATA.entries()) {
    const [firstName, ...rest] = seller.ownerName.split(" ");
    await prisma.user.create({
      data: {
        id: seller.ownerId,
        email: `seller${index + 1}@fabulouscartz.com`,
        username: seller.slug,
        passwordHash: customerPassword,
        firstName,
        lastName: rest.join(" ") || null,
        phone: `+1 415 555 ${String(1000 + index)}`,
        role: "customer",
        createdAt: daysAgo(seller.joinedDaysAgo, 10),
        lastLoginAt: daysAgo(index, 17),
      },
    });
    await prisma.seller.create({
      data: {
        id: seller.id,
        ownerId: seller.ownerId,
        vendorId: seller.vendorId,
        storeName: seller.storeName,
        slug: seller.slug,
        logoUrl: `${IMG}/vendors/${seller.slug}.webp`,
        description: `${seller.storeName} — an independent marketplace partner curated by Fabulous Cartz.`,
        contactEmail: seller.contactEmail,
        contactPhone: `+1 415 555 ${String(2000 + index)}`,
        addressLine1: `${120 + index} Market Street`,
        city: seller.city,
        state: seller.state,
        postalCode: String(90000 + index * 11),
        country: "US",
        kycStatus: seller.kycStatus,
        commissionRateBps: seller.commissionBps,
        payoutMethod: seller.payoutMethod,
        payoutDetailsMasked: seller.payoutMasked,
        payoutVerificationStatus: seller.payoutVerification,
        rating: seller.rating,
        status: seller.status,
        joinedAt: daysAgo(seller.joinedDaysAgo, 9),
        createdAt: daysAgo(seller.joinedDaysAgo, 9),
      },
    });
    if (seller.vendorId) sellerIdByVendor.set(seller.vendorId, seller.id);

    const documentStatus = seller.kycStatus === "approved" ? "approved" : seller.kycStatus === "pending" ? "pending" : "rejected";
    const documentCount = seller.kycStatus === "pending" ? 2 : 3;
    for (let documentIndex = 0; documentIndex < documentCount; documentIndex += 1) {
      const types = ["business_license", "tax_id", "bank_statement"] as const;
      await prisma.sellerKycDocument.create({
        data: {
          id: `${seller.id}_kyc_${documentIndex + 1}`,
          sellerId: seller.id,
          type: types[documentIndex],
          documentNumber: `${seller.id.toUpperCase()}-${documentIndex + 1}-${2026}`,
          fileUrl: `/uploads/kyc/${seller.id}-${types[documentIndex]}.pdf`,
          status: documentStatus,
          reviewNote: documentStatus === "rejected" ? "Document expired or unreadable" : null,
          reviewerId: documentStatus === "approved" ? "usr_manager" : null,
          submittedAt: daysAgo(seller.joinedDaysAgo - 1, 11),
          reviewedAt: documentStatus === "approved" ? daysAgo(seller.joinedDaysAgo - 2, 12) : null,
        },
      });
    }
  }
  await prisma.sellerOnboardingRequest.createMany({
    data: [
      { id: "onb_001", applicantName: "Anita Varghese", applicantEmail: "anita@varghese.example.com", proposedStoreName: "Anita's Attic", proposedSlug: "anitas-attic", description: "Vintage textiles and hand-embroidered table linens.", contactPhone: "+1 512 555 0192", city: "Austin", state: "TX", status: "pending", submittedAt: daysAgo(9, 14) },
      { id: "onb_002", applicantName: "Devon Brooks", applicantEmail: "devon@brooks.example.com", proposedStoreName: "Brooks Camera Co.", proposedSlug: "brooks-camera-co", description: "Peer-to-peer camera and lens rentals for weddings.", contactPhone: "+1 213 555 0144", city: "Los Angeles", state: "CA", status: "info_requested", reviewNote: "Please upload a business license and proof of insurance.", submittedAt: daysAgo(16, 10), reviewedAt: daysAgo(12, 16), reviewedById: "usr_manager" },
      { id: "onb_003", applicantName: "Farah Siddiqui", applicantEmail: "farah@thread.example.com", proposedStoreName: "Thread & Tale", proposedSlug: "thread-and-tale", description: "Slow-fashion rentals for South Asian weddings.", contactPhone: "+1 646 555 0177", city: "New York", state: "NY", status: "rejected", reviewNote: "Tax ID did not match the legal entity name.", submittedAt: daysAgo(40, 12), reviewedAt: daysAgo(35, 9), reviewedById: "usr_admin" },
    ],
  });

  const variantIds: Record<string, Array<{ id: string; sku: string; priceMinor: number; productId: string }>> = {};

  for (const product of PRODUCTS) {
    const priceMinor = product.price * 100;
    const rentEnabled = product.modes.includes("rent");
    const buyEnabled = product.modes.includes("buy");
    const daily = rentEnabled ? Math.max(200, Math.round(priceMinor * 0.12)) : null;
    const created = daysAgo(product.createdDaysAgo, 10);
    const variants: Array<{ id: string; sku: string; priceMinor: number; productId: string }> = [];

    await prisma.product.create({
      data: {
        id: product.id,
        slug: product.slug,
        title: product.title,
        description: product.description,
        details: product.details.join("\n"),
        categoryId: product.categoryId,
        vendorId: product.vendorId,
        sellerId: sellerIdByVendor.get(product.vendorId) ?? null,
        priceMinor,
        mrpMinor: product.mrp ? product.mrp * 100 : null,
        currency: "USD",
        status: product.status,
        buyEnabled,
        rentEnabled,
        rentDailyMinor: daily,
        rentWeeklyMinor: daily ? daily * 7 : null,
        rentDepositMinor: rentEnabled ? priceMinor : 0,
        featured: Boolean(product.featured),
        newArrival: Boolean(product.newArrival),
        topSeller: Boolean(product.topSeller),
        ratingAvg: product.rating,
        ratingCount: product.reviews,
        publishedAt: product.status === "active" ? created : null,
        createdAt: created,
        images: {
          create: product.images.map((url, index) => ({
            id: `${product.id}_img_${index + 1}`,
            url,
            alt: product.title,
            isPrimary: index === 0,
            sortOrder: index,
          })),
        },
        tags: { create: product.tags.map((tag) => ({ tag })) },
        attributes: {
          create: [
            { name: "Material", value: product.details[0] ?? "Handcrafted", sortOrder: 0 },
            { name: "Care", value: "Follow garment care label", sortOrder: 1 },
          ],
        },
      },
    });

    for (const [index, variant] of product.variants.entries()) {
      const sizeCode = variant.size.toUpperCase().replace(/[^A-Z0-9]+/g, "").slice(0, 3) || "OS";
      const colorCode = variant.color.toUpperCase().replace(/[^A-Z0-9]+/g, "").slice(0, 3) || "COL";
      const id = `var_${product.id.slice(4)}_${index + 1}`;
      const sku = `FC-${product.id.slice(4)}-${sizeCode}-${colorCode}`;
      // Keep a handful of SKUs deliberately low so the restock report has signal.
      const LOW_STOCK: Record<string, number> = {
        var_001_1: 2,
        var_006_1: 3,
        var_011_1: 1,
        var_016_1: 4,
        var_021_1: 2,
      };
      const stockQuantity = LOW_STOCK[id] ?? Math.max(variant.stock, 6) + 8 + (index % 3);
      await prisma.productVariant.create({
        data: {
          id,
          productId: product.id,
          sku,
          size: variant.size,
          color: variant.color,
          priceMinor,
          stockQuantity,
          reservedQuantity: variant.rented ?? 0,
          lowStockThreshold: 6,
          rentDailyMinor: daily,
          rentDepositMinor: rentEnabled ? priceMinor : null,
          isActive: true,
        },
      });
      variants.push({ id, sku, priceMinor, productId: product.id });
      if (stockQuantity > 0) {
        await prisma.stockAdjustment.create({
          data: {
            variantId: id,
            delta: stockQuantity,
            reason: "initial_stock",
            note: "Opening stock loaded with catalogue seed",
            beforeQuantity: 0,
            afterQuantity: stockQuantity,
            actorId: "usr_admin",
            createdAt: created,
          },
        });
      }
    }
    variantIds[product.id] = variants;
  }

  // ---------------------------------------------------------------- coupons
  const coupons: Array<{ id: string; code: string }> = [];
  for (const [index, [code, description, kind, value, minSpend, startsAgo, endsIn, usageLimit, used, active, categoryId]] of COUPONS.entries()) {
    const coupon = await prisma.coupon.create({
      data: {
        id: `coup_${String(index + 1).padStart(3, "0")}`,
        code,
        description,
        kind,
        value,
        minSubtotalMinor: minSpend,
        startsAt: daysAgo(startsAgo, 9),
        endsAt: daysAgo(-endsIn, 23, 59),
        maxRedemptions: usageLimit,
        redemptionCount: used,
        perCustomerLimit: 1,
        categoryId,
        isActive: active,
        createdAt: daysAgo(startsAgo + 2, 9),
      },
    });
    coupons.push({ id: coupon.id, code: coupon.code });
  }

  // ----------------------------------------------------------------- reviews
  const reviewBodies = [
    "Beautiful craftsmanship — the finish is even better in person.",
    "Fitted perfectly and arrived beautifully packed. Will order again.",
    "The colours are rich and the fabric feels premium. A keeper.",
    "Exactly as photographed. The handwork is exquisite.",
    "Lovely piece, though delivery took a little longer than expected.",
    "Wore it for a family wedding and received so many compliments.",
  ];
  const reviewTitles = ["Beautiful craftsmanship", "Perfect fit", "Rich colours", "As pictured", "Worth the wait", "A keeper"];
  const random = mulberry32(1337);
  for (const product of PRODUCTS) {
    for (let index = 0; index < product.reviews; index += 1) {
      const rating = Math.min(5, Math.max(3, Math.round(product.rating + (random() - 0.5))));
      await prisma.review.create({
        data: {
          id: `rev_${product.id.slice(4)}_${index + 1}`,
          productId: product.id,
          userId: null,
          authorName: `${CUSTOMERS[(product.reviews + index) % CUSTOMERS.length][0]}`,
          rating,
          title: reviewTitles[index % reviewTitles.length],
          body: reviewBodies[index % reviewBodies.length],
          status: "approved",
          moderatedAt: daysAgo(product.createdDaysAgo - 2, 12),
          moderatedById: "usr_manager",
          createdAt: daysAgo(Math.max(0, product.createdDaysAgo - 5 - index * 2), 14),
        },
      });
    }
  }
  for (const productId of ["prd_001", "prd_004", "prd_009", "prd_012", "prd_018", "prd_021"]) {
    await prisma.review.create({
      data: {
        productId,
        authorName: "Pending Customer",
        rating: 4,
        title: "Review awaiting moderation",
        body: "This review was submitted from the storefront and is awaiting review.",
        status: "pending",
        createdAt: daysAgo(2, 16),
      },
    });
  }

  // -------------------------------------------------------------- wishlists
  for (let index = 0; index < 18; index += 1) {
    const customer = customers[index % customers.length];
    const product = PRODUCTS[(index * 5 + 2) % PRODUCTS.length];
    if (product.status !== "active") continue;
    await prisma.wishlistItem.create({
      data: { userId: customer.id, productId: product.id, createdAt: daysAgo(index, 18) },
    });
  }

  // ---------------------------------------------------------------- content
  const admin = { id: "usr_admin" };
  await prisma.banner.createMany({
    data: [
      { id: "ban_001", title: "The Festive Atelier", subtitle: "Hand-worked lehengas, heirloom jewellery and stage costumes, curated from independent Indian studios.", imageUrl: `${IMG}/hero/home-hero.webp`, linkUrl: "/categories/womens-wear", linkLabel: "Explore the edit", placement: "home_hero", sortOrder: 0, isActive: true },
      { id: "ban_002", title: "Consign with Fabulous Cartz", subtitle: "A boutique partnership for independent studios", imageUrl: `${IMG}/hero/seller.webp`, linkUrl: "/consign", linkLabel: "Request the partner pack", placement: "home_banner", sortOrder: 0, isActive: true },
      { id: "ban_003", title: "Gifting, wrapped by hand", subtitle: "Complimentary gift wrap on every order above $50", imageUrl: `${IMG}/hero/craft.webp`, linkUrl: "/collections/gifting", linkLabel: "Shop gifts", placement: "home_banner", sortOrder: 1, isActive: true },
    ],
  });
  await prisma.contentPost.createMany({
    data: [
      { id: "post_001", slug: "zardozi-hours", title: "The Zardozi Hours: inside Lakshmi's Madurai atelier", excerpt: "Four hands, eleven days, one bridal border.", body: "We spent a morning with Lakshmi's karigars to document how a single zardozi border moves from tracing paper to the mandap.", coverImage: `${IMG}/about/loom.webp`, tag: "atelier", status: "published", authorId: admin.id, publishedAt: daysAgo(14, 11) },
      { id: "post_002", slug: "rental-measurements", title: "How to measure for a rented lehenga", excerpt: "The five numbers our fitting desk asks for.", body: "A practical guide to waist, bust, shoulder, length and heel height — with the tolerances our tailors work to.", coverImage: `${IMG}/about/fabric.webp`, tag: "guide", status: "published", authorId: "usr_manager", publishedAt: daysAgo(6, 16) },
      { id: "post_003", slug: "festive-styling-notes", title: "Festive styling notes: colour, drape and heirloom", excerpt: "How our stylists build a single festive look.", body: "Working notes from the Fabulous Cartz styling desk, including palette pairings and heirloom jewellery suggestions.", coverImage: `${IMG}/hero/craft.webp`, tag: "styling", status: "draft", authorId: admin.id, publishedAt: null },
    ],
  });

  // ---------------------------------------------------------------- settings
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await prisma.appSetting.create({ data: { key, value: JSON.stringify(value) } });
  }
  await prisma.taxRule.create({ data: { id: "tax_001", name: "Standard GST-style tax", rateBps: 500, country: "IN", isActive: true } });
  await prisma.shippingRule.create({
    data: { id: "ship_001", name: "Standard shipping", minSubtotalMinor: 0, maxSubtotalMinor: null, rateMinor: 1200, freeAboveMinor: 7500, isActive: true, sortOrder: 0 },
  });

  // ----------------------------------------------------------------- orders
  const buyerRandom = mulberry32(4242);
  const statuses: Array<"pending" | "paid" | "confirmed" | "shipped" | "delivered" | "cancelled" | "refunded"> = [
    ...Array(5).fill("pending"),
    ...Array(6).fill("paid"),
    ...Array(8).fill("confirmed"),
    ...Array(8).fill("shipped"),
    ...Array(26).fill("delivered"),
    ...Array(4).fill("cancelled"),
    ...Array(3).fill("refunded"),
  ];
  // Weighted US destinations: roughly correlated with real population/order
  // volume. Orders are mixed with non-US addresses so geographic analytics can
  // report exclusions honestly. Some rental-only states (MI, OR, TN, VA, UT, MN)
  // are intentionally absent here.
  const ORDER_US_STATES: Array<{ code: string; city: string; postalCode: string }> = [
    { code: "CA", city: "San Francisco", postalCode: "94107" },
    { code: "CA", city: "Los Angeles", postalCode: "90012" },
    { code: "CA", city: "San Diego", postalCode: "92101" },
    { code: "CA", city: "San Jose", postalCode: "95113" },
    { code: "CA", city: "Sacramento", postalCode: "95814" },
    { code: "NY", city: "New York", postalCode: "10001" },
    { code: "NY", city: "Brooklyn", postalCode: "11201" },
    { code: "NY", city: "Buffalo", postalCode: "14202" },
    { code: "NY", city: "Rochester", postalCode: "14604" },
    { code: "TX", city: "Austin", postalCode: "78701" },
    { code: "TX", city: "Houston", postalCode: "77002" },
    { code: "TX", city: "Dallas", postalCode: "75201" },
    { code: "TX", city: "San Antonio", postalCode: "78205" },
    { code: "FL", city: "Miami", postalCode: "33101" },
    { code: "FL", city: "Orlando", postalCode: "32801" },
    { code: "FL", city: "Tampa", postalCode: "33602" },
    { code: "WA", city: "Seattle", postalCode: "98101" },
    { code: "WA", city: "Spokane", postalCode: "99201" },
    { code: "IL", city: "Chicago", postalCode: "60601" },
    { code: "IL", city: "Springfield", postalCode: "62701" },
    { code: "GA", city: "Atlanta", postalCode: "30303" },
    { code: "GA", city: "Savannah", postalCode: "31401" },
    { code: "AZ", city: "Phoenix", postalCode: "85004" },
    { code: "CO", city: "Denver", postalCode: "80202" },
    { code: "MA", city: "Boston", postalCode: "02108" },
    { code: "NJ", city: "Newark", postalCode: "07102" },
    { code: "NJ", city: "Jersey City", postalCode: "07302" },
    { code: "PA", city: "Philadelphia", postalCode: "19103" },
    { code: "OH", city: "Columbus", postalCode: "43201" },
    { code: "NC", city: "Raleigh", postalCode: "27601" },
  ];
  const US_STREETS = ["Market Street", "Main Street", "Oak Avenue", "Cedar Lane", "Maple Drive", "Pine Street"];
  const IN_CITIES = ["Kochi", "Chennai", "Bengaluru", "Mumbai", "Thrissur"];
  const IN_STATES = ["Kerala", "Tamil Nadu", "Karnataka", "Maharashtra", "Kerala"];

  const activeProducts = PRODUCTS.filter((product) => product.status === "active");
  let orderSeq = 1000;
  let usOrderSeq = 0;
  const seededOrderIds: string[] = [];

  for (const [index, status] of statuses.entries()) {
    orderSeq += 1;
    const customer = customers[index % customers.length];
    const orderId = `ord_${String(index + 1).padStart(4, "0")}`;
    const orderNumber = `FC-${orderSeq}`;

    let placedDaysAgo = 0;
    if (status === "delivered") placedDaysAgo = 10 + Math.floor(buyerRandom() * 350);
    else if (status === "refunded") placedDaysAgo = 12 + Math.floor(buyerRandom() * 330);
    else if (status === "shipped") placedDaysAgo = 3 + Math.floor(buyerRandom() * 5);
    else if (status === "confirmed") placedDaysAgo = 2 + Math.floor(buyerRandom() * 3);
    else if (status === "paid") placedDaysAgo = 1 + Math.floor(buyerRandom() * 3);
    else if (status === "cancelled") placedDaysAgo = 5 + Math.floor(buyerRandom() * 30);
    else placedDaysAgo = Math.floor(buyerRandom() * 2);

    const placedAt = daysAgo(placedDaysAgo, 9 + Math.floor(buyerRandom() * 10), Math.floor(buyerRandom() * 59));
    const paidAt = ["paid", "confirmed", "shipped", "delivered", "refunded"].includes(status)
      ? hoursAfter(placedAt, 1 + Math.floor(buyerRandom() * 5))
      : null;
    const confirmedAt = ["confirmed", "shipped", "delivered", "refunded"].includes(status) && paidAt ? daysAfter(paidAt, 1) : null;
    const shippedAt = ["shipped", "delivered", "refunded"].includes(status) && confirmedAt ? daysAfter(confirmedAt, 2) : null;
    const deliveredAt = status === "delivered" && shippedAt ? daysAfter(shippedAt, 3) : null;
    const cancelledAt = status === "cancelled" ? hoursAfter(placedAt, 6) : null;
    const refundedAt = status === "refunded" && deliveredAt ? daysAfter(deliveredAt, 5) : status === "refunded" && paidAt ? daysAfter(paidAt, 3) : null;

    const guestOrder = buyerRandom() < 0.15;
    const itemCount = 1 + Math.floor(buyerRandom() * 3);
    // Two of every three orders ship to the US; the rest stay non-US so the
    // geo endpoint can demonstrate excluded-address reporting.
    const isUsOrder = index % 3 !== 2;
    const usAddress = isUsOrder ? ORDER_US_STATES[usOrderSeq++ % ORDER_US_STATES.length] : null;

    interface Line { productId: string; variantId: string; title: string; sku: string; mode: "buy" | "rent"; quantity: number; unitPriceMinor: number; lineTotalMinor: number; rentalStart: Date | null; rentalEnd: Date | null; rentalDays: number | null; depositMinor: number }
    const lines: Line[] = [];
    for (let itemIndex = 0; itemIndex < itemCount; itemIndex += 1) {
      const product = activeProducts[Math.floor(buyerRandom() * activeProducts.length)];
      const variants = variantIds[product.id];
      const variant = variants[Math.floor(buyerRandom() * variants.length)];
      const rent = product.modes.includes("rent") && (!product.modes.includes("buy") || buyerRandom() < 0.18);
      const quantity = buyerRandom() < 0.15 ? 2 : 1;
      let unit = variant.priceMinor;
      let deposit = 0;
      let rentalDays: number | null = null;
      let rentalStart: Date | null = null;
      let rentalEnd: Date | null = null;
      if (rent) {
        rentalDays = 3 + Math.floor(buyerRandom() * 5);
        rentalStart = daysAfter(placedAt, 5);
        rentalEnd = daysAfter(rentalStart, rentalDays);
        const daily = Math.max(200, Math.round(variant.priceMinor * 0.12));
        const weekly = daily * 7;
        unit = Math.floor(rentalDays / 7) * weekly + (rentalDays % 7) * daily;
        deposit = variant.priceMinor;
      }
      lines.push({
        productId: product.id,
        variantId: variant.id,
        title: product.title,
        sku: variant.sku,
        mode: rent ? "rent" : "buy",
        quantity,
        unitPriceMinor: unit,
        lineTotalMinor: (unit + deposit) * quantity,
        rentalStart,
        rentalEnd,
        rentalDays,
        depositMinor: deposit,
      });
    }

    const subtotal = lines.reduce((sum, line) => sum + line.lineTotalMinor, 0);
    let couponCode: string | null = null;
    let couponId: string | null = null;
    let discount = 0;
    if (buyerRandom() < 0.28) {
      const code = ["WELCOME10", "FESTIVE20", "FREESHIP"][Math.floor(buyerRandom() * 3)];
      const coupon = coupons.find((entry) => entry.code === code);
      if (coupon) {
        if (code === "WELCOME10" && subtotal >= 2500) {
          couponCode = code; couponId = coupon.id; discount = Math.round(subtotal * 0.1);
        } else if (code === "FESTIVE20" && subtotal >= 4000) {
          couponCode = code; couponId = coupon.id; discount = Math.round(subtotal * 0.2);
        } else if (code === "FREESHIP" && subtotal >= 4000) {
          couponCode = code; couponId = coupon.id; discount = 1200;
        }
      }
    }

    const taxable = Math.max(0, subtotal - discount);
    const tax = Math.round(taxable * 0.05);
    const shipping = taxable >= 7500 ? 0 : 1200;
    const total = taxable + tax + shipping;

    const paymentStatus =
      status === "refunded" ? "refunded" : ["paid", "confirmed", "shipped", "delivered"].includes(status) ? "succeeded" : status === "cancelled" ? "failed" : "pending";
    const paymentMethod = ["mock", "upi", "card"][index % 3];

    await prisma.order.create({
      data: {
        id: orderId,
        orderNumber,
        userId: guestOrder ? null : customer.id,
        email: customer.email,
        status,
        paymentStatus,
        paymentMethod,
        currency: "USD",
        subtotalMinor: subtotal,
        discountMinor: discount,
        taxMinor: tax,
        shippingMinor: shipping,
        totalMinor: total,
        couponCode,
        couponId,
        placedAt,
        paidAt,
        confirmedAt,
        shippedAt,
        deliveredAt,
        cancelledAt,
        refundedAt,
        createdAt: placedAt,
        updatedAt: refundedAt ?? deliveredAt ?? shippedAt ?? confirmedAt ?? paidAt ?? placedAt,
        items: {
          create: lines.map((line, lineIndex) => ({
            id: `${orderId}_item_${lineIndex + 1}`,
            productId: line.productId,
            variantId: line.variantId,
            title: line.title,
            sku: line.sku,
            mode: line.mode,
            quantity: line.quantity,
            unitPriceMinor: line.unitPriceMinor,
            lineTotalMinor: line.lineTotalMinor,
            rentalStart: line.rentalStart,
            rentalEnd: line.rentalEnd,
            rentalDays: line.rentalDays,
            depositMinor: line.depositMinor,
            createdAt: placedAt,
          })),
        },
        shippingAddress: {
          create: {
            id: `${orderId}_addr`,
            userId: guestOrder ? null : customer.id,
            recipient: customer.name,
            line1: usAddress
              ? `${120 + index} ${US_STREETS[index % US_STREETS.length]}`
              : `${100 + index} Lake View Road`,
            city: usAddress ? usAddress.city : IN_CITIES[index % IN_CITIES.length],
            state: usAddress ? usAddress.code : IN_STATES[index % IN_STATES.length],
            postalCode: usAddress ? usAddress.postalCode : `${682001 + index}`,
            country: usAddress ? "US" : "IN",
            phone: usAddress ? `+1 555 01${String(index).padStart(2, "0")}` : customer.phone,
          },
        },
        payments: {
          create: {
            id: `${orderId}_pay`,
            provider: paymentMethod === "mock" ? "mock" : paymentMethod,
            providerPaymentId: `seed_${orderNumber}`,
            amountMinor: total,
            currency: "USD",
            status: paymentStatus === "pending" ? "pending" : paymentStatus === "failed" ? "failed" : paymentStatus === "refunded" ? "refunded" : "succeeded",
            idempotencyKey: `seed:${orderNumber}`,
            signatureValid: true,
            createdAt: paidAt ?? placedAt,
            succeededAt: paidAt,
          },
        },
        events: {
          create: [
            { fromStatus: null, toStatus: "pending", note: "Order placed", createdAt: placedAt },
            ...(paidAt ? [{ fromStatus: "pending", toStatus: "paid", note: "Payment captured", createdAt: paidAt }] : []),
            ...(confirmedAt ? [{ fromStatus: "paid", toStatus: "confirmed", note: "Confirmed by operations", createdAt: confirmedAt }] : []),
            ...(shippedAt ? [{ fromStatus: "confirmed", toStatus: "shipped", note: "Dispatched", createdAt: shippedAt }] : []),
            ...(deliveredAt ? [{ fromStatus: "shipped", toStatus: "delivered", note: "Delivered", createdAt: deliveredAt }] : []),
            ...(cancelledAt ? [{ fromStatus: "pending", toStatus: "cancelled", note: "Cancelled before payment", createdAt: cancelledAt }] : []),
            ...(refundedAt ? [{ fromStatus: deliveredAt ? "delivered" : "paid", toStatus: "refunded", note: "Refund issued", createdAt: refundedAt }] : []),
          ],
        },
      },
    });

    if (couponId && couponCode) {
      await prisma.couponRedemption.create({
        data: { couponId, orderId, userId: guestOrder ? null : customer.id, email: customer.email, discountMinor: discount, createdAt: placedAt },
      });
    }
    if (status === "refunded") {
      await prisma.refund.create({
        data: {
          id: `${orderId}_ref`,
          paymentId: `${orderId}_pay`,
          orderId,
          amountMinor: total,
          reason: "Customer return",
          status: "succeeded",
          providerRefundId: `seed_refund_${orderNumber}`,
          processedAt: refundedAt ?? daysAfter(placedAt, 3),
          createdAt: refundedAt ?? daysAfter(placedAt, 3),
        },
      });
    }
    seededOrderIds.push(orderId);
  }

  // ------------------------------------------------------- rental marketplace
  const rentalCities = [
    ["San Francisco", "CA"], ["Austin", "TX"], ["New York", "NY"], ["Miami", "FL"], ["Boston", "MA"],
    ["Chicago", "IL"], ["Seattle", "WA"], ["Atlanta", "GA"], ["Newark", "NJ"], ["Denver", "CO"],
    ["Phoenix", "AZ"], ["Raleigh", "NC"], ["Detroit", "MI"], ["Columbus", "OH"], ["Philadelphia", "PA"],
    ["Portland", "OR"], ["Nashville", "TN"], ["Richmond", "VA"], ["Salt Lake City", "UT"], ["Minneapolis", "MN"],
  ] as const;

  const rentalTitles = [
    "Vintage Leica M6 Film Camera",
    "Crimson Zardozi Bridal Lehenga",
    "Canon EOS R5 Camera Kit",
    "Mid-Century Walnut Lounge Chair",
    "DJI Mavic 3 Drone",
    "Kids' First-Birthday Lehenga",
    "Bose SoundLink Portable Speaker",
    "Handwoven Kanjivaram Saree",
    "Four-Person Camping Tent",
    "Yamaha FG800 Acoustic Guitar",
    "Sony A7 III + 24–70mm Lens",
    "Heirloom Gold Jewellery Set",
    "Peloton Exercise Bike",
    "Emerald Anarkali Suit",
    "Nikon Z6 II Camera Kit",
    "Vintage Royal Typewriter",
    "Ivory Silk Sherwani",
    "Epson 4K Home Projector",
    "Stand-Up Paddleboard",
    "GoPro Hero 11 Adventure Kit",
    "Kundan Bridal Jewellery Set",
    "Ninebot Electric Scooter",
    "Breville Espresso Machine",
    "Bharatanatyam Dance Costume",
    "Wedding Mandap Decor Set",
  ];

  const conditionGrades = ["new", "like_new", "good", "fair", "worn"] as const;
  const handoverModes = ["ship", "pickup", "both"] as const;
  const rentalListings: Array<{
    id: string;
    slug: string;
    title: string;
    ownerUserId: string;
    sellerId: string | null;
    categoryId: string;
    productRefId: string | null;
    dailyRateMinor: number;
    depositMinor: number;
    lateFeePerDayMinor: number;
    status: string;
    city: string;
    state: string;
    handoverMode: string;
    pickupLocation: string | null;
    minRentalDays: number;
    maxRentalDays: number;
  }> = [];

  for (let index = 0; index < 25; index += 1) {
    const sellerOwned = index < 7;
    const seller = sellerOwned ? SELLERS_DATA[index] : null;
    const customerOwner = customers[(index * 3 + 5) % customers.length];
    const [city, state] = rentalCities[index % rentalCities.length];
    const product = PRODUCTS[index % PRODUCTS.length];
    const daily = 1500 + (index % 12) * 950;
    const deposit = daily * (2 + (index % 3));
    const status = index === 22 ? "pending_review" : index === 23 ? "draft" : index === 24 ? "suspended" : "active";
    const listing = {
      id: `lst_${String(index + 1).padStart(3, "0")}`,
      slug: `p2p-${rentalTitles[index].toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`,
      title: rentalTitles[index],
      ownerUserId: index === 24 ? "selusr_suspended" : sellerOwned ? seller!.ownerId : customerOwner.id,
      sellerId: index === 24 ? "sel_suspended" : seller ? seller.id : null,
      categoryId: product.categoryId,
      productRefId: product.id,
      dailyRateMinor: daily,
      depositMinor: deposit,
      lateFeePerDayMinor: Math.round(daily * 0.5),
      status,
      city,
      state,
      handoverMode: handoverModes[index % handoverModes.length],
      pickupLocation: handoverModes[index % handoverModes.length] === "ship" ? null : `${city} pickup locker`,
      minRentalDays: 1 + (index % 3),
      maxRentalDays: [14, 30, 60, 90][index % 4],
    };
    rentalListings.push(listing);
    await prisma.rentalListing.create({
      data: {
        id: listing.id,
        slug: listing.slug,
        ownerUserId: listing.ownerUserId,
        sellerId: listing.sellerId,
        productRefId: listing.productRefId,
        categoryId: listing.categoryId,
        title: listing.title,
        description: `${rentalTitles[index]} available for peer-to-peer rental. Inspected before dispatch; deposit fully refundable on return.`,
        photos: [`${product.images[0]}`, `${IMG}/hero/craft.webp`].join("\n"),
        conditionGrade: conditionGrades[index % conditionGrades.length],
        replacementValueMinor: Math.round(daily * 30),
        dailyRateMinor: listing.dailyRateMinor,
        weeklyRateMinor: listing.dailyRateMinor * 6,
        monthlyRateMinor: listing.dailyRateMinor * 22,
        depositMinor: listing.depositMinor,
        handoverMode: listing.handoverMode,
        pickupLocation: listing.pickupLocation,
        city: listing.city,
        state: listing.state,
        country: "US",
        minRentalDays: listing.minRentalDays,
        maxRentalDays: listing.maxRentalDays,
        lateFeePerDayMinor: listing.lateFeePerDayMinor,
        status: listing.status,
        ratingAvg: Number((4.2 + (index % 9) * 0.1).toFixed(1)),
        ratingCount: 3 + (index % 20),
        createdAt: daysAgo(200 - index * 4, 10),
      },
    });

    if (index % 4 === 0) {
      const blackoutStart = daysAgo(-(45 + index * 2), 0);
      await prisma.rentalBlackout.create({
        data: {
          id: `${listing.id}_blk_1`,
          listingId: listing.id,
          startDate: blackoutStart,
          endDate: daysAfter(blackoutStart, 3 + (index % 5)),
          reason: "Owner unavailable",
        },
      });
    }
  }

  const bookingScenarios: Array<{ status: string; listingIndex: number; startOffset: number; days: number; resolved?: boolean }> = [
    ...([0, 1, 2, 3, 4, 5, 6, 7, 8, 23] as const).map((listingIndex, index) => ({ status: "completed", listingIndex, startOffset: 120 + index * 9, days: 4 + (index % 6) })),
    { status: "completed", listingIndex: 9, startOffset: 55, days: 5, resolved: true },
    { status: "disputed", listingIndex: 10, startOffset: 38, days: 6 },
    { status: "disputed", listingIndex: 11, startOffset: 26, days: 4 },
    { status: "returned", listingIndex: 12, startOffset: 15, days: 5 },
    { status: "returned", listingIndex: 13, startOffset: 12, days: 4 },
    { status: "returned", listingIndex: 14, startOffset: 9, days: 6 },
    { status: "inspection", listingIndex: 15, startOffset: 6, days: 4 },
    { status: "inspection", listingIndex: 16, startOffset: 5, days: 3 },
    { status: "inspection", listingIndex: 17, startOffset: 3, days: 5 },
    { status: "in_use", listingIndex: 18, startOffset: -3, days: 6 },
    { status: "in_use", listingIndex: 19, startOffset: -2, days: 5 },
    { status: "in_use", listingIndex: 0, startOffset: -1, days: 4 },
    { status: "in_use", listingIndex: 1, startOffset: -4, days: 7 },
    { status: "in_use", listingIndex: 2, startOffset: -2, days: 5 },
    { status: "in_use", listingIndex: 3, startOffset: -3, days: 6 },
    { status: "overdue", listingIndex: 4, startOffset: 18, days: 5 },
    { status: "overdue", listingIndex: 5, startOffset: 22, days: 4 },
    { status: "overdue", listingIndex: 6, startOffset: 25, days: 6 },
    { status: "overdue", listingIndex: 7, startOffset: 15, days: 3 },
    { status: "overdue", listingIndex: 8, startOffset: 20, days: 5 },
    { status: "dispatched", listingIndex: 9, startOffset: 0, days: 5 },
    { status: "dispatched", listingIndex: 10, startOffset: 1, days: 4 },
    { status: "deposit_authorized", listingIndex: 11, startOffset: -4, days: 5 },
    { status: "deposit_authorized", listingIndex: 12, startOffset: -6, days: 6 },
    { status: "approved", listingIndex: 13, startOffset: -10, days: 4 },
    { status: "requested", listingIndex: 14, startOffset: -14, days: 5 },
    { status: "cancelled_by_renter", listingIndex: 15, startOffset: 30, days: 4 },
    { status: "cancelled_by_renter", listingIndex: 16, startOffset: 18, days: 3 },
    { status: "cancelled_by_owner", listingIndex: 17, startOffset: 12, days: 4 },
    { status: "declined", listingIndex: 24, startOffset: -20, days: 5 },
  ];

  function eventPath(status: string): string[] {
    switch (status) {
      case "requested": return ["requested"];
      case "approved": return ["requested", "approved"];
      case "deposit_authorized": return ["requested", "approved", "deposit_authorized"];
      case "dispatched": return ["requested", "approved", "deposit_authorized", "dispatched"];
      case "in_use": return ["requested", "approved", "deposit_authorized", "dispatched", "in_use"];
      case "overdue": return ["requested", "approved", "deposit_authorized", "dispatched", "in_use", "overdue"];
      case "returned": return ["requested", "approved", "deposit_authorized", "dispatched", "in_use", "returned"];
      case "inspection": return ["requested", "approved", "deposit_authorized", "dispatched", "in_use", "returned", "inspection"];
      case "disputed": return ["requested", "approved", "deposit_authorized", "dispatched", "in_use", "returned", "inspection", "disputed"];
      case "completed": return ["requested", "approved", "deposit_authorized", "dispatched", "in_use", "returned", "inspection", "completed"];
      case "cancelled_by_renter": return ["requested", "cancelled_by_renter"];
      case "cancelled_by_owner": return ["requested", "approved", "cancelled_by_owner"];
      case "declined": return ["requested", "declined"];
      default: return ["requested"];
    }
  }

  const disputeClaims = [0, 4500, 12000];

  for (const [index, scenario] of bookingScenarios.entries()) {
    const listing = rentalListings[scenario.listingIndex];
    let renter = customers[(index * 7 + 2) % customers.length];
    if (renter.id === listing.ownerUserId) renter = customers[(index * 7 + 3) % customers.length];
    const startDate = daysAgo(scenario.startOffset, 12);
    const endDate = daysAfter(startDate, scenario.days);
    const days = rentalDaysBetween(startDate, endDate);
    const quote = rentalQuoteMinor(
      { daily: listing.dailyRateMinor, weekly: listing.dailyRateMinor * 6, monthly: listing.dailyRateMinor * 22 },
      days,
    );
    const platformFee = Math.round(quote.amountMinor * 0.1);
    const ownerPayout = quote.amountMinor - platformFee;
    const path = eventPath(scenario.status);
    const hasDepositAuth = path.includes("deposit_authorized");
    const overdueDays = scenario.status === "overdue" ? Math.max(1, rentalDaysBetween(endDate, NOW) - 2) : 0;
    const lateFeeMinor = overdueDays * listing.lateFeePerDayMinor;
    const depositId = `${`bkg_${String(index + 1).padStart(3, "0")}`}_dep`;
    const isResolvedDispute = Boolean(scenario.resolved);
    const capturedMinor = isResolvedDispute ? Math.min(listing.depositMinor, disputeClaims[index % disputeClaims.length] || 4500) : 0;
    const depositStatus = isResolvedDispute
      ? "captured"
      : hasDepositAuth
        ? ["completed", "cancelled_by_renter", "cancelled_by_owner"].includes(scenario.status)
          ? "released"
          : "authorized"
        : ["cancelled_by_renter", "cancelled_by_owner", "declined"].includes(scenario.status)
          ? "expired"
          : "pending";
    const releasedMinor = depositStatus === "released" ? listing.depositMinor - capturedMinor : 0;
    const bookingId = `bkg_${String(index + 1).padStart(3, "0")}`;

    const ledgerEntries: Array<{ type: string; amountMinor: number; reason: string | null; createdAt: Date }> = [];
    if (hasDepositAuth) {
      ledgerEntries.push({ type: "authorize", amountMinor: listing.depositMinor, reason: "Pre-authorization hold placed", createdAt: daysAgo(scenario.startOffset - 2, 10) });
    }
    if (depositStatus === "released") {
      ledgerEntries.push({ type: "release", amountMinor: releasedMinor, reason: "Hold released after return", createdAt: daysAgo(Math.max(0, scenario.startOffset - scenario.days), 11) });
    }
    if (depositStatus === "captured") {
      ledgerEntries.push({ type: "capture", amountMinor: capturedMinor, reason: "dispute_split_settlement", createdAt: daysAgo(Math.max(0, scenario.startOffset - scenario.days), 11) });
    }
    if (depositStatus === "expired") {
      ledgerEntries.push({ type: "expire", amountMinor: listing.depositMinor, reason: "Booking cancelled before authorization", createdAt: daysAgo(scenario.startOffset - 1, 10) });
    }

    const isInspected = scenario.status === "inspection" || scenario.status === "disputed" || isResolvedDispute;
    const inspectionCondition = isResolvedDispute ? "damaged" : ["returned", "inspection", "disputed"].includes(scenario.status) ? "minor_wear" : null;
    const damageClaimMinor = isResolvedDispute ? capturedMinor : scenario.status === "disputed" ? disputeClaims[(index % 3)] || 5000 : 0;

    await prisma.booking.create({
      data: {
        id: bookingId,
        bookingNumber: `BK-2026-${String(index + 1).padStart(4, "0")}`,
        listingId: listing.id,
        renterUserId: renter.id,
        ownerUserId: listing.ownerUserId,
        status: scenario.status,
        startDate,
        endDate,
        days,
        dailyRateMinor: listing.dailyRateMinor,
        rentalFeeMinor: quote.amountMinor,
        platformFeeMinor: platformFee,
        ownerPayoutMinor: ownerPayout,
        depositMinor: listing.depositMinor,
        lateFeeMinor,
        currency: "USD",
        handoverMode: listing.handoverMode === "both" ? (index % 2 === 0 ? "ship" : "pickup") : listing.handoverMode,
        pickupLocation: listing.pickupLocation,
        city: listing.city,
        state: listing.state,
        country: "US",
        overdueDays,
        overdueFlag: scenario.status === "overdue",
        graceDays: 2,
        dispatchedAt: path.includes("dispatched") ? daysAgo(scenario.startOffset - 1, 9) : null,
        handedOverAt: path.includes("dispatched") ? daysAgo(scenario.startOffset - 1, 9) : null,
        inUseAt: path.includes("in_use") ? startDate : null,
        returnDueAt: path.includes("in_use") ? endDate : null,
        returnedAt: path.includes("returned") ? daysAgo(Math.max(0, scenario.startOffset - days), 13) : null,
        inspectionAt: path.includes("inspection") ? daysAgo(Math.max(0, scenario.startOffset - days - 1), 10) : null,
        completedAt: path.includes("completed") ? daysAgo(Math.max(0, scenario.startOffset - days - 2), 12) : null,
        cancelledAt: ["cancelled_by_renter", "cancelled_by_owner"].includes(scenario.status) ? daysAgo(Math.max(0, scenario.startOffset - 1), 15) : null,
        declinedAt: scenario.status === "declined" ? daysAgo(scenario.startOffset - 1, 15) : null,
        createdAt: daysAgo(scenario.startOffset + 1, 10),
        events: {
          create: path.map((toStatus, pathIndex) => ({
            fromStatus: pathIndex === 0 ? null : path[pathIndex - 1],
            toStatus,
            note: pathIndex === 0 ? "Booking requested" : `Transitioned to ${toStatus}`,
            actorId: pathIndex === 0 ? renter.id : toStatus.startsWith("cancelled") ? renter.id : "usr_manager",
            createdAt: daysAgo(Math.max(0, scenario.startOffset - pathIndex), 10, pathIndex * 5),
          })),
        },
        deposit: {
          create: {
            id: depositId,
            amountMinor: listing.depositMinor,
            currency: "USD",
            status: depositStatus,
            capturedMinor,
            releasedMinor,
            providerRef: hasDepositAuth ? `preauth_${bookingId}` : null,
            authorizedAt: hasDepositAuth ? daysAgo(scenario.startOffset - 2, 10) : null,
            capturedAt: depositStatus === "captured" ? daysAgo(Math.max(0, scenario.startOffset - days), 11) : null,
            releasedAt: depositStatus === "released" ? daysAgo(Math.max(0, scenario.startOffset - days), 11) : null,
            expiredAt: depositStatus === "expired" ? daysAgo(Math.max(0, scenario.startOffset - 1), 10) : null,
            createdAt: daysAgo(scenario.startOffset + 1, 10),
            ledgerEntries: {
              create: ledgerEntries.map((entry) => ({
                bookingId,
                type: entry.type,
                amountMinor: entry.amountMinor,
                reason: entry.reason,
                actorId: "usr_manager",
                createdAt: entry.createdAt,
              })),
            },
          },
        },
        ...(isInspected
          ? {
              inspection: {
                create: {
                  condition: inspectionCondition ?? "minor_wear",
                  photos: `${IMG}/hero/craft.webp\n${IMG}/about/fabric.webp`,
                  damageClaimMinor,
                  notes: damageClaimMinor > 0 ? "Minor damage noted on return; deposit claim opened." : "Returned in expected condition.",
                  inspectedById: "usr_fulfilment",
                  createdAt: daysAgo(Math.max(0, scenario.startOffset - days - 1), 10),
                },
              },
            }
          : {}),
        ...(scenario.status === "disputed" || isResolvedDispute
          ? {
              dispute: {
                create: {
                  reason: scenario.status === "disputed" ? "Damage beyond normal wear" : "Scuff on the frame during return",
                  claimAmountMinor: damageClaimMinor || 5000,
                  status: isResolvedDispute ? "resolved" : "open",
                  resolution: isResolvedDispute ? "split" : null,
                  resolutionNote: isResolvedDispute ? "Renter and owner agreed to split the repair cost." : null,
                  decidedById: isResolvedDispute ? "usr_admin" : null,
                  decidedAt: isResolvedDispute ? daysAgo(Math.max(0, scenario.startOffset - days - 2), 11) : null,
                  createdAt: daysAgo(Math.max(0, scenario.startOffset - days - 1), 10),
                },
              },
            }
          : {}),
        ...(index % 6 === 0
          ? {
              notes: {
                create: [
                  { body: "Please confirm the pickup window before Friday.", authorId: renter.id, createdAt: daysAgo(Math.max(0, scenario.startOffset - 1), 16) },
                  { body: "Confirmed — the locker code will be shared on dispatch.", authorId: listing.ownerUserId, createdAt: daysAgo(Math.max(0, scenario.startOffset - 2), 9) },
                ],
              },
            }
          : {}),
      },
    });
  }

  // -------------------------------------------------------- payouts & ledger
  const monthStart = (monthsBack: number): Date => {
    const date = new Date(NOW);
    date.setDate(1);
    date.setHours(0, 0, 0, 0);
    date.setMonth(date.getMonth() - monthsBack);
    return date;
  };
  const defaultCommissionBps = DEFAULT_SETTINGS.marketplace.defaultCommissionBps;
  let payoutSequence = 0;
  for (const [sellerIndex, seller] of SELLERS_DATA.entries()) {
    const bps = seller.commissionBps ?? defaultCommissionBps;
    for (let monthsBack = 6; monthsBack >= 1; monthsBack -= 1) {
      const periodStart = monthStart(monthsBack + 1);
      const periodEnd = new Date(monthStart(monthsBack).getTime() - 1);
      const gross = 42000 + sellerIndex * 9000 + (6 - monthsBack) * 7000;
      const commission = Math.round((gross * bps) / 10000);
      const refunds = monthsBack === 3 ? Math.round(gross * 0.15) : 0;
      const net = gross - commission - refunds;
      const status = monthsBack === 1 ? "pending" : monthsBack === 2 ? "failed" : "paid";
      const payoutId = `pyt_${String(++payoutSequence).padStart(3, "0")}`;
      await prisma.payout.create({
        data: {
          id: payoutId,
          sellerId: seller.id,
          periodStart,
          periodEnd,
          grossMinor: gross,
          commissionMinor: commission,
          refundsMinor: refunds,
          netMinor: net,
          currency: "USD",
          status,
          reference: status === "paid" ? `ACH-2026-${payoutId}` : null,
          note: status === "failed" ? "Bank details rejected — awaiting updated payout account" : null,
          createdById: "usr_manager",
          paidAt: status === "paid" ? daysAfter(periodEnd, 4) : null,
          createdAt: daysAfter(periodEnd, 2),
        },
      });
      const splitGross = Math.round(gross * 0.6);
      for (let entryIndex = 0; entryIndex < 2; entryIndex += 1) {
        const entryGross = entryIndex === 0 ? splitGross : gross - splitGross;
        const entryCommission = Math.round((entryGross * bps) / 10000);
        await prisma.sellerLedgerEntry.create({
          data: {
            id: `led_${payoutId}_${entryIndex + 1}`,
            sellerId: seller.id,
            kind: "sale",
            grossMinor: entryGross,
            commissionMinor: entryCommission,
            netMinor: entryGross - entryCommission,
            currency: "USD",
            status: status === "failed" ? "pending" : "settled",
            payoutId,
            occurredAt: daysAfter(periodStart, 5 + entryIndex * 9),
            note: `Marketplace sales settled in ${payoutId}`,
          },
        });
      }
    }
    // Unpaid entries feed the "next payout" preview.
    for (let entryIndex = 0; entryIndex < 2; entryIndex += 1) {
      const gross = 12000 + sellerIndex * 600 + entryIndex * 4500;
      const commission = Math.round((gross * bps) / 10000);
      await prisma.sellerLedgerEntry.create({
        data: {
          id: `led_due_${seller.id}_${entryIndex + 1}`,
          sellerId: seller.id,
          kind: entryIndex === 1 ? "refund" : "sale",
          grossMinor: entryIndex === 1 ? 0 : gross,
          commissionMinor: -commission,
          refundMinor: entryIndex === 1 ? gross : 0,
          netMinor: -gross + commission,
          currency: "USD",
          status: "pending",
          occurredAt: daysAgo(1 + entryIndex * 2, 14),
          note: entryIndex === 1 ? "Customer return adjustment" : "Recent marketplace sale",
        },
      });
    }
  }

  // ----------------------------------------------------------- notifications
  for (const orderId of seededOrderIds.slice(-8)) {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) continue;
    await prisma.notification.create({
      data: {
        channel: "email",
        template: "order_confirmation",
        toAddress: order.email,
        subject: `Fabulous Cartz order ${order.orderNumber}`,
        payload: JSON.stringify({ orderNumber: order.orderNumber, totalMinor: order.totalMinor }),
        status: "sent",
        attempts: 1,
        sentAt: order.paidAt ?? order.placedAt,
        createdAt: order.placedAt,
      },
    });
  }
  await prisma.notification.createMany({
    data: [
      { channel: "email", template: "low_stock", toAddress: "admin@fabulouscartz.com", subject: "Low stock: Clear Crystal Angel Earrings", payload: JSON.stringify({ sku: "FC-012-ONE-SIL", stock: 3 }), status: "pending", createdAt: daysAgo(0, 8) },
      { channel: "email", template: "low_stock", toAddress: "admin@fabulouscartz.com", subject: "Low stock: Purple Memory Wire Bracelet", payload: JSON.stringify({ sku: "FC-016-ONE-PUR", stock: 1 }), status: "pending", createdAt: daysAgo(1, 9) },
    ],
  });

  // ----------------------------------------------------------------- audit
  await prisma.auditLog.createMany({
    data: [
      { actorId: "usr_admin", actorEmail: "admin@fabulouscartz.com", actorRole: "admin", action: "seed.catalogue", entityType: "product", entityId: null, after: JSON.stringify({ products: PRODUCTS.length }), createdAt: daysAgo(3, 10) },
      { actorId: "usr_manager", actorEmail: "manager@fabulouscartz.com", actorRole: "manager", action: "coupon.create", entityType: "coupon", entityId: coupons[0].id, after: JSON.stringify({ code: coupons[0].code }), createdAt: daysAgo(2, 11) },
      { actorId: "usr_fulfilment", actorEmail: "fulfilment@fabulouscartz.com", actorRole: "fulfilment", action: "inventory.adjust", entityType: "productVariant", entityId: "var_001_2", before: JSON.stringify({ stock: 3 }), after: JSON.stringify({ stock: 4 }), createdAt: daysAgo(1, 15) },
    ],
  });

  const counts = {
    users: await prisma.user.count(),
    customers: await prisma.user.count({ where: { role: "customer" } }),
    categories: await prisma.category.count(),
    vendors: await prisma.vendor.count(),
    products: await prisma.product.count(),
    variants: await prisma.productVariant.count(),
    orders: await prisma.order.count(),
    reviews: await prisma.review.count(),
    coupons: await prisma.coupon.count(),
    sellers: await prisma.seller.count(),
    sellerKycDocuments: await prisma.sellerKycDocument.count(),
    onboardingRequests: await prisma.sellerOnboardingRequest.count(),
    payoutLedgerEntries: await prisma.sellerLedgerEntry.count(),
    payouts: await prisma.payout.count(),
    rentalListings: await prisma.rentalListing.count(),
    rentalBlackouts: await prisma.rentalBlackout.count(),
    bookings: await prisma.booking.count(),
    bookingEvents: await prisma.bookingEvent.count(),
    rentalDeposits: await prisma.rentalDeposit.count(),
    depositLedgerEntries: await prisma.depositLedgerEntry.count(),
    inspections: await prisma.inspectionReport.count(),
    disputes: await prisma.dispute.count(),
  };
  console.log("Seed complete", counts);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
