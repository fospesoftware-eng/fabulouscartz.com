export interface Category {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  image: string;
  accent: string;
  count: number;
}

export interface Product {
  slug: string;
  name: string;
  price: number;
  originalPrice?: number;
  vendor: string;
  rating: number;
  reviews: number;
  category: string;
  mode: "buy" | "rent" | "both";
  image: string;
  imageGallery?: string[];
  accentColor: string;
  description: string;
  details: string[];
  tags: string[];
  featured?: boolean;
  newArrival?: boolean;
  topSeller?: boolean;
}

export interface Vendor {
  slug: string;
  name: string;
  rating: number;
  sales: number;
}

export const categories: Category[] = [
  {
    slug: "kids-wear",
    name: "Kids Wear",
    tagline: "Little celebrations, big memories",
    description:
      "Festival & wedding outfits, traditional ethnic wear, dance costumes, and everyday essentials for babies, girls and boys.",
    image: "/img/products/kids-ethnic.webp",
    accent: "#2E8B57",
    count: 48,
  },
  {
    slug: "handmade-jewelry",
    name: "Handmade Jewelry",
    tagline: "Crafted by hand, worn by heart",
    description:
      "Necklaces, earrings, bracelets, anklets and statement pieces — all handcrafted by independent artisans.",
    image: "/img/categories/handmade-jewelry.webp",
    accent: "#B8913A",
    count: 36,
  },
  {
    slug: "womens-wear",
    name: "Women's Wear",
    tagline: "Sarees, lehengas, kurtas — celebrated",
    description:
      "From the bridal lehenga to the office kurta, find your next piece among classic and contemporary styles.",
    image: "/img/products/bridal-lehenga.webp",
    accent: "#B56A4D",
    count: 62,
  },
  {
    slug: "dance-costumes",
    name: "Dance Costumes",
    tagline: "Stage-ready, culture-driven",
    description:
      "Bharatanatyam, Kathak, Odissi and folk — costumes that honor tradition and feel performance-ready.",
    image: "/img/categories/dance-costumes.webp",
    accent: "#0F4A2D",
    count: 18,
  },
  {
    slug: "mens-wear",
    name: "Men's Wear",
    tagline: "Kurta, sherwani, and occasion wear",
    description:
      "Classic kurtas, sherwanis, and festive outfits designed for every cultural moment.",
    image: "/img/categories/mens-wear.webp",
    accent: "#25231F",
    count: 28,
  },
  {
    slug: "accessories",
    name: "Accessories",
    tagline: "The finish to every look",
    description:
      "Clutches, bangles, bindis, and hair adornments that complete the story of your outfit.",
    image: "/img/categories/accessories.webp",
    accent: "#B8913A",
    count: 22,
  },
];

export const products: Product[] = [
  {
    slug: "bridal-lehenga",
    name: "Crimson Bridal Lehenga",
    price: 65,
    vendor: "Lakshmi",
    rating: 4.9,
    reviews: 28,
    category: "womens-wear",
    mode: "both",
    image: "/img/products/bridal-lehenga.webp",
    accentColor: "#8E1F2B",
    description:
      "A deep crimson bridal lehenga with hand-worked gold zardozi borders and a sheer dupatta — made for the mandap.",
    details: [
      "Crimson silk with zardozi border",
      "Full-flare lehenga with blouse",
      "Dry clean only",
      "Ships in 4–6 days",
    ],
    tags: ["wedding", "bridal", "red"],
    featured: true,
    newArrival: true,
  },
  {
    slug: "indo-western-gown",
    name: "Indo Western Gown",
    price: 100,
    originalPrice: 140,
    vendor: "Sweety",
    rating: 4.8,
    reviews: 19,
    category: "womens-wear",
    mode: "both",
    image: "/img/products/indo-western-gown.webp",
    accentColor: "#B8913A",
    description:
      "Modern cut with traditional motifs — a gown that bridges two worlds.",
    details: ["Silk-blend fabric", "Hand-embroidered yoke", "Dry clean"],
    tags: ["fusion", "party", "cream"],
    featured: true,
    topSeller: true,
  },
  {
    slug: "silver-color-jewelry",
    name: "Silver Tone Jewelry Set",
    price: 10,
    vendor: "Grace",
    rating: 4.7,
    reviews: 12,
    category: "handmade-jewelry",
    mode: "buy",
    image: "/img/products/silver-jewelry.webp",
    accentColor: "#9C9688",
    description:
      "A silver-plated necklace and earring set, hand-polished for a luminous finish.",
    details: ["Silver-plated brass", "Anti-tarnish coating", "Hypoallergenic"],
    tags: ["silver", "necklace", "everyday"],
    newArrival: true,
  },
  {
    slug: "punjabi-style-kurta",
    name: "Punjabi Style Women's Kurta",
    price: 30,
    vendor: "Omana",
    rating: 4.8,
    reviews: 34,
    category: "womens-wear",
    mode: "both",
    image: "/img/products/punjabi-kurta-v2.webp",
    accentColor: "#B56A4D",
    description:
      "A cotton-linen kurta with Phulkari-inspired embroidery on the sleeves and yoke.",
    details: ["Cotton-linen blend", "Hand wash cold", "Includes dupatta"],
    tags: ["everyday", "cotton", "kurta"],
    topSeller: true,
  },
  {
    slug: "party-wear-dress",
    name: "Women's Indian Party Wear",
    price: 35,
    vendor: "Omana",
    rating: 4.6,
    reviews: 9,
    category: "womens-wear",
    mode: "both",
    image: "/img/products/ethnic-anarkali.webp",
    accentColor: "#1B6B43",
    description:
      "A vibrant Anarkali set in silk-cotton with subtle mirror work.",
    details: ["Silk-cotton blend", "Includes bottom and dupatta"],
    tags: ["anarkali", "festive"],
    topSeller: true,
  },
  {
    slug: "stretchable-saree-blouse",
    name: "Readymade Stretchable Saree Blouse",
    price: 14,
    vendor: "Mercy George",
    rating: 4.7,
    reviews: 22,
    category: "womens-wear",
    mode: "buy",
    image: "/img/products/saree-blouse.webp",
    accentColor: "#6A4F1B",
    description:
      "A stretchable cotton-spandex blouse that fits most body types with comfort.",
    details: ["Cotton-spandex blend", "Hand wash", "Fits sizes S–L"],
    tags: ["blouse", "everyday"],
  },
  {
    slug: "white-frock",
    name: "White Frock",
    price: 50,
    vendor: "Sangeetha Harilal",
    rating: 4.9,
    reviews: 15,
    category: "kids-wear",
    mode: "both",
    image: "/img/products/kids-ethnic.webp",
    accentColor: "#FAF6F0",
    description:
      "A serene cotton frock with lace trims — perfect for baby showers and ceremonies.",
    details: ["Pure cotton", "Hand wash cold", "Sizes 2T–10Y"],
    tags: ["kids", "frock", "ceremony"],
    newArrival: true,
  },
  {
    slug: "long-kurthi",
    name: "Long Kurthi",
    price: 30,
    vendor: "Leo",
    rating: 4.7,
    reviews: 41,
    category: "womens-wear",
    mode: "buy",
    image: "/img/products/long-kurthi.webp",
    accentColor: "#8DC79B",
    description:
      "A floor-length kurthi in pastel sage with intricate hand block prints.",
    details: ["Cotton", "Hand block print", "Dry clean"],
    tags: ["kurthi", "everyday"],
    topSeller: true,
  },
  {
    slug: "sharara-for-girls",
    name: "Sharara For Girls With Bell Bottom Pants",
    price: 65,
    vendor: "Swathi",
    rating: 4.9,
    reviews: 27,
    category: "kids-wear",
    mode: "both",
    image: "/img/products/kids-ethnic.webp",
    accentColor: "#7A3F2B",
    description:
      "A sharara set with delicate mirror and thread embroidery — little one ready for the wedding.",
    details: ["Silk blend", "Dry clean", "Sizes 4–10Y"],
    tags: ["kids", "wedding", "sharara"],
    featured: true,
  },
  {
    slug: "kids-lehenga-10y",
    name: "Kids Lehenga — Age Around 10 Years",
    price: 65,
    vendor: "Swathi",
    rating: 5.0,
    reviews: 18,
    category: "kids-wear",
    mode: "rent",
    image: "/img/products/kids-ethnic.webp",
    accentColor: "#B8913A",
    description:
      "A miniature bridal lehenga in crimson and gold — intricate enough to feel real, sized to feel hers.",
    details: ["Banarasi silk", "Dry clean", "Age 9–11"],
    tags: ["kids", "lehenga", "rent"],
    featured: true,
  },
  {
    slug: "gold-tone-beach-charm-bracelet",
    name: "Gold Tone Beach Charm Bracelet – 8 Inch – Lobster Clasp",
    price: 12,
    vendor: "Viya Crafts LLC",
    rating: 4.6,
    reviews: 8,
    category: "handmade-jewelry",
    mode: "buy",
    image: "/img/products/beach-charm-bracelet.webp",
    accentColor: "#D4B156",
    description:
      "A gold-tone beaded bracelet with a lobster clasp, beach-inspired and light enough for every day.",
    details: ["Gold-tone plating", "Lobster clasp", "8 inch adjustable"],
    tags: ["bracelet", "gold", "everyday"],
    newArrival: true,
  },
  {
    slug: "clear-crystal-angel-earrings",
    name: "Handmade Clear Crystal Angel Earrings",
    price: 10,
    vendor: "Viya Crafts LLC",
    rating: 5.0,
    reviews: 12,
    category: "handmade-jewelry",
    mode: "buy",
    image: "/img/products/crystal-earrings.webp",
    accentColor: "#C8E3CD",
    description:
      "Clear crystal earrings cut and set by hand — delicate angels that catch every light.",
    details: ["Swarovski crystals", "Sterling silver hooks", "Handcrafted"],
    tags: ["earrings", "crystal", "top-rated"],
    featured: true,
  },
  {
    slug: "navy-blue-beaded-earrings",
    name: "Handmade Navy Blue Beaded Cluster Earrings",
    price: 10,
    vendor: "Viya Crafts LLC",
    rating: 4.5,
    reviews: 6,
    category: "handmade-jewelry",
    mode: "buy",
    image: "/img/products/navy-earrings.webp",
    accentColor: "#25231F",
    description:
      "Deep navy cluster earrings, strung by hand with seed beads and tiny Czech crystals.",
    details: ["Seed beads + crystals", "Nickel-free hooks"],
    tags: ["earrings", "navy"],
  },
  {
    slug: "memory-wire-red-gold-green-bracelet",
    name: "Memory Wire Red, Gold & Green Boho Wrapping Bracelet",
    price: 15,
    vendor: "Viya Crafts LLC",
    rating: 4.7,
    reviews: 10,
    category: "handmade-jewelry",
    mode: "buy",
    image: "/img/products/boho-bracelet.webp",
    accentColor: "#1B6B43",
    description:
      "A memory wire bracelet that wraps around the wrist — red, gold and green, holiday-ready.",
    details: ["Memory wire", "Seed beads + crystals"],
    tags: ["bracelet", "boho", "holiday"],
  },
  {
    slug: "red-beaded-statement-set",
    name: "Handmade Red Beaded Statement Necklace & Earring Set",
    price: 28,
    vendor: "Viya Crafts LLC",
    rating: 4.8,
    reviews: 14,
    category: "handmade-jewelry",
    mode: "buy",
    image: "/img/products/red-statement-set.webp",
    accentColor: "#7A3F2B",
    description:
      "A silver-tone statement set with vivid red beads — the kind of set that owns the room.",
    details: ["Silver-tone base", "Acrylic + glass beads"],
    tags: ["necklace", "statement", "red"],
    topSeller: true,
  },
  {
    slug: "purple-multi-beaded-memory-wire-bracelet",
    name: "Handmade Purple Multi-Color Beaded Memory Wire Bracelet",
    price: 18,
    vendor: "Viya Crafts LLC",
    rating: 4.6,
    reviews: 7,
    category: "handmade-jewelry",
    mode: "buy",
    image: "/img/products/purple-memory-wire.webp",
    accentColor: "#6A4C93",
    description:
      "A multi-purple memory wire bracelet with clusters of seed beads and Czech fire-polished crystals.",
    details: ["Memory wire", "Glass + plastic beads"],
    tags: ["bracelet", "purple"],
  },
  {
    slug: "air-dry-clay-necklace-blue-green",
    name: "Handmade Air-Dry Clay Necklace — Blue & Green",
    price: 28,
    vendor: "Viya Crafts LLC",
    rating: 4.9,
    reviews: 9,
    category: "handmade-jewelry",
    mode: "buy",
    image: "/img/products/clay-necklace.webp",
    accentColor: "#1B6B43",
    description:
      "A sculptural necklace strung from hand-shaped air-dry clay beads, painted and glazed — wearable art.",
    details: ["Air-dry clay beads", "Cotton cord", "Handcrafted"],
    tags: ["necklace", "clay", "artisan"],
    featured: true,
  },
];

export const vendors: Vendor[] = [
  { slug: "viya-crafts", name: "Viya Crafts LLC", rating: 5.0, sales: 1842 },
  { slug: "omana", name: "Omana", rating: 4.8, sales: 962 },
  { slug: "swathi", name: "Swathi", rating: 4.9, sales: 1120 },
  { slug: "sweety", name: "Sweety", rating: 4.7, sales: 480 },
  { slug: "leo", name: "Leo", rating: 4.6, sales: 210 },
  { slug: "lakshmi", name: "Lakshmi", rating: 4.9, sales: 320 },
  { slug: "grace", name: "Grace", rating: 4.7, sales: 140 },
  { slug: "mercy-george", name: "Mercy George", rating: 4.8, sales: 96 },
  { slug: "sangeetha-harilal", name: "Sangeetha Harilal", rating: 4.9, sales: 180 },
  { slug: "madhuri", name: "Madhuri", rating: 4.7, sales: 720 },
  { slug: "rajesh-sebastian", name: "Rajesh Sebastian", rating: 4.8, sales: 540 },
];

export function getCategory(slug: string) {
  return categories.find((c) => c.slug === slug);
}
export function getProduct(slug: string) {
  return products.find((p) => p.slug === slug);
}
export function getCategoryProducts(slug: string) {
  return products.filter((p) => p.category === slug);
}
export function featuredProducts() {
  return products.filter((p) => p.featured);
}
export function newArrivals() {
  return products.filter((p) => p.newArrival);
}
export function topSellers() {
  return products.filter((p) => p.topSeller);
}
export function topRated() {
  return products.filter((p) => p.rating >= 4.9);
}
