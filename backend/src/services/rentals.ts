import type { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { badRequest, conflict, forbidden, notFound } from "../lib/errors.js";
import {
  BOOKING_BLOCKING_STATUSES,
  BOOKING_TRANSITIONS,
  FULFILMENT_BOOKING_TARGETS,
  type BookingStatus,
  bookingNumber,
  canTransitionBooking,
} from "../lib/constants.js";
import { commissionMinor, rentalDaysBetween, rentalQuoteMinor } from "../lib/money.js";
import { recordAudit } from "../lib/audit.js";
import { getSettings } from "./settings.js";
import type { Actor } from "../lib/guards.js";

const listingInclude = {
  owner: { select: { id: true, email: true, firstName: true, lastName: true } },
  seller: { select: { id: true, storeName: true, slug: true, status: true, kycStatus: true } },
  category: { select: { id: true, name: true, slug: true } },
  blackouts: { orderBy: { startDate: "asc" } },
  _count: { select: { bookings: true } },
} satisfies Prisma.RentalListingInclude;

const bookingInclude = {
  listing: {
    include: {
      owner: { select: { id: true, email: true, firstName: true, lastName: true } },
      seller: { select: { id: true, storeName: true, slug: true } },
    },
  },
  renter: { select: { id: true, email: true, firstName: true, lastName: true } },
  owner: { select: { id: true, email: true, firstName: true, lastName: true } },
  events: { orderBy: { createdAt: "asc" } },
  notes: { orderBy: { createdAt: "asc" }, include: { author: { select: { id: true, email: true, firstName: true } } } },
  deposit: { include: { ledgerEntries: { orderBy: { createdAt: "asc" } } } },
  inspection: true,
  dispute: true,
} satisfies Prisma.BookingInclude;

export type RentalListingView = Prisma.RentalListingGetPayload<{ include: typeof listingInclude }>;
export type BookingView = Prisma.BookingGetPayload<{ include: typeof bookingInclude }>;

function photosOf(value: string): string[] {
  return value.split("\n").map((line) => line.trim()).filter(Boolean);
}

export function serializeListing(listing: RentalListingView, now = new Date()) {
  const activeBookings = listing._count.bookings;
  return {
    id: listing.id,
    slug: listing.slug,
    title: listing.title,
    description: listing.description,
    photos: photosOf(listing.photos),
    primaryPhoto: photosOf(listing.photos)[0] ?? null,
    conditionGrade: listing.conditionGrade,
    replacementValue: { amountMinor: listing.replacementValueMinor, amount: listing.replacementValueMinor / 100, currency: "USD" },
    rates: {
      dailyMinor: listing.dailyRateMinor,
      daily: listing.dailyRateMinor / 100,
      weeklyMinor: listing.weeklyRateMinor,
      weekly: listing.weeklyRateMinor == null ? null : listing.weeklyRateMinor / 100,
      monthlyMinor: listing.monthlyRateMinor,
      monthly: listing.monthlyRateMinor == null ? null : listing.monthlyRateMinor / 100,
      depositMinor: listing.depositMinor,
      deposit: listing.depositMinor / 100,
      lateFeePerDayMinor: listing.lateFeePerDayMinor,
    },
    handover: {
      mode: listing.handoverMode,
      pickupLocation: listing.pickupLocation,
    },
    location: { city: listing.city, state: listing.state, country: listing.country },
    availability: {
      minRentalDays: listing.minRentalDays,
      maxRentalDays: listing.maxRentalDays,
      blackouts: listing.blackouts.map((blackout) => ({
        id: blackout.id,
        startDate: blackout.startDate,
        endDate: blackout.endDate,
        reason: blackout.reason,
      })),
    },
    category: listing.category,
    seller: listing.seller,
    owner: {
      id: listing.owner.id,
      name: [listing.owner.firstName, listing.owner.lastName].filter(Boolean).join(" "),
    },
    status: listing.status,
    rating: { average: listing.ratingAvg, count: listing.ratingCount },
    bookingCount: activeBookings,
    createdAt: listing.createdAt,
    updatedAt: listing.updatedAt,
  };
}

export function serializeBooking(booking: BookingView) {
  return {
    id: booking.id,
    bookingNumber: booking.bookingNumber,
    status: booking.status,
    allowedTransitions: BOOKING_TRANSITIONS[booking.status as BookingStatus] ?? [],
    listing: {
      id: booking.listing.id,
      slug: booking.listing.slug,
      title: booking.listing.title,
      photos: photosOf(booking.listing.photos),
      handoverMode: booking.listing.handoverMode,
      pickupLocation: booking.listing.pickupLocation,
      owner: {
        id: booking.listing.owner.id,
        name: [booking.listing.owner.firstName, booking.listing.owner.lastName].filter(Boolean).join(" "),
      },
      seller: booking.listing.seller,
    },
    renter: {
      id: booking.renter.id,
      name: [booking.renter.firstName, booking.renter.lastName].filter(Boolean).join(" "),
      email: booking.renter.email,
    },
    owner: {
      id: booking.owner.id,
      name: [booking.owner.firstName, booking.owner.lastName].filter(Boolean).join(" "),
      email: booking.owner.email,
    },
    window: { startDate: booking.startDate, endDate: booking.endDate, days: booking.days },
    money: {
      dailyRateMinor: booking.dailyRateMinor,
      rentalFeeMinor: booking.rentalFeeMinor,
      platformFeeMinor: booking.platformFeeMinor,
      ownerPayoutMinor: booking.ownerPayoutMinor,
      depositMinor: booking.depositMinor,
      lateFeeMinor: booking.lateFeeMinor,
      totalDueMinor: booking.rentalFeeMinor + booking.depositMinor + booking.lateFeeMinor,
      currency: booking.currency,
    },
    handover: { mode: booking.handoverMode, pickupLocation: booking.pickupLocation },
    location: { city: booking.city, state: booking.state, country: booking.country },
    overdue: {
      flag: booking.overdueFlag,
      days: booking.overdueDays,
      graceDays: booking.graceDays,
      lateFeeMinor: booking.lateFeeMinor,
    },
    deposit: booking.deposit
      ? {
          id: booking.deposit.id,
          amountMinor: booking.deposit.amountMinor,
          capturedMinor: booking.deposit.capturedMinor,
          releasedMinor: booking.deposit.releasedMinor,
          status: booking.deposit.status,
          providerRef: booking.deposit.providerRef,
          authorizedAt: booking.deposit.authorizedAt,
          capturedAt: booking.deposit.capturedAt,
          releasedAt: booking.deposit.releasedAt,
          ledger: booking.deposit.ledgerEntries.map((entry) => ({
            id: entry.id,
            type: entry.type,
            amountMinor: entry.amountMinor,
            reason: entry.reason,
            idempotencyKey: entry.idempotencyKey,
            createdAt: entry.createdAt,
          })),
        }
      : null,
    inspection: booking.inspection
      ? {
          id: booking.inspection.id,
          condition: booking.inspection.condition,
          photos: photosOf(booking.inspection.photos),
          damageClaimMinor: booking.inspection.damageClaimMinor,
          notes: booking.inspection.notes,
          createdAt: booking.inspection.createdAt,
        }
      : null,
    dispute: booking.dispute
      ? {
          id: booking.dispute.id,
          reason: booking.dispute.reason,
          claimAmountMinor: booking.dispute.claimAmountMinor,
          status: booking.dispute.status,
          resolution: booking.dispute.resolution,
          resolutionNote: booking.dispute.resolutionNote,
          decidedAt: booking.dispute.decidedAt,
        }
      : null,
    notes: booking.notes.map((note) => ({
      id: note.id,
      body: note.body,
      author: { id: note.author?.id ?? null, email: note.author?.email ?? null, name: note.author?.firstName ?? null },
      createdAt: note.createdAt,
    })),
    events: booking.events.map((event) => ({
      id: event.id,
      fromStatus: event.fromStatus,
      toStatus: event.toStatus,
      note: event.note,
      actorId: event.actorId,
      createdAt: event.createdAt,
    })),
    timestamps: {
      dispatchedAt: booking.dispatchedAt,
      handedOverAt: booking.handedOverAt,
      inUseAt: booking.inUseAt,
      returnDueAt: booking.returnDueAt,
      returnedAt: booking.returnedAt,
      inspectionAt: booking.inspectionAt,
      completedAt: booking.completedAt,
      cancelledAt: booking.cancelledAt,
      declinedAt: booking.declinedAt,
    },
    createdAt: booking.createdAt,
    updatedAt: booking.updatedAt,
  };
}

export async function loadBooking(idOrNumber: string): Promise<BookingView> {
  const booking = await prisma.booking.findFirst({
    where: { OR: [{ id: idOrNumber }, { bookingNumber: idOrNumber }] },
    include: bookingInclude,
  });
  if (!booking) throw notFound("Booking not found");
  return booking;
}

// ---------------------------------------------------------------------------
// Search & calendar
// ---------------------------------------------------------------------------

export interface ListingSearchQuery {
  page: number;
  pageSize: number;
  q?: string;
  category?: string;
  city?: string;
  state?: string;
  condition?: string;
  handoverMode?: string;
  minPrice?: number;
  maxPrice?: number;
  availableFrom?: Date;
  availableTo?: Date;
  sort: "newest" | "price_asc" | "price_desc" | "rating";
}

export async function searchRentalListings(query: ListingSearchQuery) {
  const where: Record<string, unknown> = { status: "active" };
  if (query.q) {
    where.OR = [
      { title: { contains: query.q } },
      { description: { contains: query.q } },
      { city: { contains: query.q } },
    ];
  }
  if (query.city) where.city = { contains: query.city };
  if (query.state) where.state = query.state.toUpperCase();
  if (query.condition) where.conditionGrade = query.condition;
  if (query.handoverMode) {
    where.handoverMode =
      query.handoverMode === "pickup"
        ? { in: ["pickup", "both"] }
        : query.handoverMode === "ship"
          ? { in: ["ship", "both"] }
          : query.handoverMode;
  }
  if (query.category) {
    const category = await prisma.category.findFirst({
      where: { OR: [{ id: query.category }, { slug: query.category }] },
      include: { children: true },
    });
    if (!category) throw notFound("Category not found");
    where.categoryId = { in: [category.id, ...category.children.map((child) => child.id)] };
  }
  if (query.minPrice != null || query.maxPrice != null) {
    where.dailyRateMinor = {
      ...(query.minPrice != null ? { gte: Math.round(query.minPrice * 100) } : {}),
      ...(query.maxPrice != null ? { lte: Math.round(query.maxPrice * 100) } : {}),
    };
  }
  if (query.availableFrom && query.availableTo) {
    if (query.availableTo <= query.availableFrom) throw badRequest("availableTo must be after availableFrom");
    where.bookings = {
      none: {
        status: { in: BOOKING_BLOCKING_STATUSES },
        startDate: { lte: query.availableTo },
        endDate: { gte: query.availableFrom },
      },
    };
    where.blackouts = {
      none: { startDate: { lte: query.availableTo }, endDate: { gte: query.availableFrom } },
    };
  }

  const orderBy =
    query.sort === "price_asc"
      ? { dailyRateMinor: "asc" as const }
      : query.sort === "price_desc"
        ? { dailyRateMinor: "desc" as const }
        : query.sort === "rating"
          ? { ratingAvg: "desc" as const }
          : { createdAt: "desc" as const };

  const skip = (query.page - 1) * query.pageSize;
  const [total, rows] = await Promise.all([
    prisma.rentalListing.count({ where: where as never }),
    prisma.rentalListing.findMany({
      where: where as never,
      include: listingInclude,
      orderBy,
      skip,
      take: query.pageSize,
    }),
  ]);
  return { total, rows };
}

export async function getListing(idOrSlug: string): Promise<RentalListingView> {
  const listing = await prisma.rentalListing.findFirst({
    where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }] },
    include: listingInclude,
  });
  if (!listing) throw notFound("Rental listing not found");
  return listing;
}

export async function listingCalendar(listingId: string, from: Date, to: Date) {
  const listing = await prisma.rentalListing.findFirst({
    where: { OR: [{ id: listingId }, { slug: listingId }] },
  });
  if (!listing) throw notFound("Rental listing not found");
  const [bookings, blackouts] = await Promise.all([
    prisma.booking.findMany({
      where: {
        listingId: listing.id,
        status: { in: BOOKING_BLOCKING_STATUSES },
        startDate: { lte: to },
        endDate: { gte: from },
      },
      select: { id: true, bookingNumber: true, status: true, startDate: true, endDate: true, renterUserId: true },
      orderBy: { startDate: "asc" },
    }),
    prisma.rentalBlackout.findMany({
      where: { listingId: listing.id, startDate: { lte: to }, endDate: { gte: from } },
      orderBy: { startDate: "asc" },
    }),
  ]);
  return {
    listingId: listing.id,
    window: { from, to },
    bookings: bookings.map((booking) => ({ ...booking, renterUserId: undefined })),
    blackouts,
  };
}

export async function platformCalendar(from: Date, to: Date, state?: string) {
  const [bookings, blackouts] = await Promise.all([
    prisma.booking.findMany({
      where: {
        startDate: { lte: to },
        endDate: { gte: from },
        ...(state ? { state: state.toUpperCase() } : {}),
      },
      include: {
        listing: { select: { id: true, slug: true, title: true, city: true, state: true, ownerUserId: true } },
      },
      orderBy: { startDate: "asc" },
      take: 500,
    }),
    prisma.rentalBlackout.findMany({
      where: { startDate: { lte: to }, endDate: { gte: from } },
      include: { listing: { select: { id: true, slug: true, title: true } } },
      orderBy: { startDate: "asc" },
      take: 500,
    }),
  ]);
  return { window: { from, to }, bookings, blackouts };
}

// ---------------------------------------------------------------------------
// Concurrency guard
// ---------------------------------------------------------------------------

const listingLocks = new Map<string, Promise<unknown>>();

async function withListingLock<T>(listingId: string, fn: () => Promise<T>): Promise<T> {
  const previous = listingLocks.get(listingId) ?? Promise.resolve();
  const run = previous.then(fn, fn);
  listingLocks.set(
    listingId,
    run.then(
      () => undefined,
      () => undefined,
    ),
  );
  try {
    return await run;
  } finally {
    if (listingLocks.get(listingId) === undefined) listingLocks.delete(listingId);
  }
}

// ---------------------------------------------------------------------------
// Booking creation
// ---------------------------------------------------------------------------

export interface CreateBookingInput {
  listingId: string;
  renterId: string;
  startDate: Date;
  endDate: Date;
  note?: string;
  handoverMode?: string;
}

export async function createBooking(input: CreateBookingInput): Promise<BookingView> {
  const settings = await getSettings();
  const listing = await prisma.rentalListing.findFirst({
    where: { OR: [{ id: input.listingId }, { slug: input.listingId }] },
    include: { owner: true, seller: true },
  });
  if (!listing) throw notFound("Rental listing not found");
  if (listing.status !== "active") throw conflict("Rental listing is not accepting bookings", { status: listing.status });
  if (listing.ownerUserId === input.renterId) throw badRequest("You cannot book your own listing");
  if (listing.seller && (listing.seller.status === "suspended" || listing.seller.kycStatus === "suspended")) {
    throw conflict("Seller is suspended; listing is unavailable");
  }

  const days = rentalDaysBetween(input.startDate, input.endDate);
  if (days <= 0) throw badRequest("endDate must be after startDate");
  if (days < listing.minRentalDays) throw badRequest(`Minimum rental is ${listing.minRentalDays} day(s)`);
  if (days > listing.maxRentalDays) throw badRequest(`Maximum rental is ${listing.maxRentalDays} day(s)`);

  const handoverMode = input.handoverMode ?? (listing.handoverMode === "both" ? "ship" : listing.handoverMode);
  const allowedModes = listing.handoverMode === "both" ? ["ship", "pickup"] : [listing.handoverMode];
  if (!allowedModes.includes(handoverMode)) {
    throw badRequest(`Handover mode must be one of: ${allowedModes.join(", ")}`);
  }

  const quote = rentalQuoteMinor(
    { daily: listing.dailyRateMinor, weekly: listing.weeklyRateMinor, monthly: listing.monthlyRateMinor },
    days,
  );
  const platformFeeMinor = commissionMinor(quote.amountMinor, settings.marketplace.rentalPlatformFeeBps);
  const ownerPayoutMinor = quote.amountMinor - platformFeeMinor;

  return withListingLock(listing.id, async () => {
    const booking = await prisma.$transaction(async (tx) => {
      const overlap = await tx.booking.count({
        where: {
          listingId: listing.id,
          status: { in: BOOKING_BLOCKING_STATUSES },
          startDate: { lte: input.endDate },
          endDate: { gte: input.startDate },
        },
      });
      if (overlap > 0) {
        throw conflict("Requested dates overlap an existing booking", {
          listingId: listing.id,
          startDate: input.startDate,
          endDate: input.endDate,
        });
      }
      const blocked = await tx.rentalBlackout.count({
        where: {
          listingId: listing.id,
          startDate: { lte: input.endDate },
          endDate: { gte: input.startDate },
        },
      });
      if (blocked > 0) {
        throw conflict("Requested dates fall inside a blackout window", { listingId: listing.id });
      }

      const created = await tx.booking.create({
        data: {
          bookingNumber: bookingNumber(),
          listingId: listing.id,
          renterUserId: input.renterId,
          ownerUserId: listing.ownerUserId,
          status: "requested",
          startDate: input.startDate,
          endDate: input.endDate,
          days,
          dailyRateMinor: listing.dailyRateMinor,
          rentalFeeMinor: quote.amountMinor,
          platformFeeMinor,
          ownerPayoutMinor,
          depositMinor: listing.depositMinor,
          handoverMode,
          pickupLocation: listing.pickupLocation,
          city: listing.city,
          state: listing.state,
          country: listing.country,
          events: {
            create: { fromStatus: null, toStatus: "requested", note: input.note ?? "Booking requested", actorId: input.renterId },
          },
          deposit: {
            create: {
              amountMinor: listing.depositMinor,
              currency: "USD",
              status: "pending",
            },
          },
        },
        include: bookingInclude,
      });
      return created;
    });

    await recordAudit({
      actor: null,
      action: "rental.booking.requested",
      entityType: "booking",
      entityId: booking.id,
      after: { listingId: listing.id, renterId: input.renterId, startDate: input.startDate, endDate: input.endDate, rentalFeeMinor: quote.amountMinor },
    });
    return booking;
  });
}

// ---------------------------------------------------------------------------
// Booking state machine
// ---------------------------------------------------------------------------

function timestampFor(status: BookingStatus): Prisma.BookingUpdateInput {
  switch (status) {
    case "dispatched":
      return { dispatchedAt: new Date(), handedOverAt: new Date() };
    case "in_use":
      return { inUseAt: new Date(), returnDueAt: undefined };
    case "return_due":
      return { returnDueAt: new Date() };
    case "returned":
      return { returnedAt: new Date() };
    case "inspection":
      return { inspectionAt: new Date() };
    case "completed":
      return { completedAt: new Date() };
    case "cancelled_by_renter":
    case "cancelled_by_owner":
      return { cancelledAt: new Date() };
    case "declined":
      return { declinedAt: new Date() };
    default:
      return {};
  }
}

export async function transitionBooking(input: {
  bookingId: string;
  to: BookingStatus;
  actor: Actor | null;
  note?: string;
  reason?: string;
}): Promise<BookingView> {
  const booking = await loadBooking(input.bookingId);
  const from = booking.status as BookingStatus;
  if (!canTransitionBooking(from, input.to)) {
    throw conflict(`Illegal booking transition ${from} -> ${input.to}`, {
      allowed: BOOKING_TRANSITIONS[from] ?? [],
    });
  }
  if (input.actor?.role === "fulfilment" && !FULFILMENT_BOOKING_TARGETS.includes(input.to)) {
    throw forbidden("Fulfilment can only move dispatch/inspection states; money actions are restricted");
  }

  await prisma.$transaction(async (tx) => {
    if (input.to === "deposit_authorized") {
      const deposit = booking.deposit;
      if (!deposit) throw conflict("Booking has no deposit record");
      if (deposit.status === "pending") {
        await tx.rentalDeposit.update({
          where: { id: deposit.id },
          data: {
            status: deposit.amountMinor > 0 ? "authorized" : "released",
            authorizedAt: new Date(),
            releasedAt: deposit.amountMinor > 0 ? undefined : new Date(),
            providerRef: deposit.providerRef ?? `preauth_${booking.id}`,
          },
        });
        await tx.depositLedgerEntry.create({
          data: {
            depositId: deposit.id,
            bookingId: booking.id,
            type: "authorize",
            amountMinor: deposit.amountMinor,
            reason: input.note ?? "Pre-authorization hold placed",
            actorId: input.actor?.id ?? null,
          },
        });
      }
    }

    if (input.to === "cancelled_by_renter" || input.to === "cancelled_by_owner" || input.to === "declined") {
      const deposit = booking.deposit;
      if (deposit && deposit.status === "authorized") {
        await tx.rentalDeposit.update({
          where: { id: deposit.id },
          data: { status: "released", releasedAt: new Date(), releasedMinor: deposit.amountMinor - deposit.capturedMinor },
        });
        await tx.depositLedgerEntry.create({
          data: {
            depositId: deposit.id,
            bookingId: booking.id,
            type: "release",
            amountMinor: deposit.amountMinor - deposit.capturedMinor,
            reason: `Hold released on ${input.to}`,
            actorId: input.actor?.id ?? null,
          },
        });
      }
    }

    if (input.to === "completed" && booking.deposit?.status === "authorized") {
      const remaining = booking.deposit.amountMinor - booking.deposit.capturedMinor;
      await tx.rentalDeposit.update({
        where: { id: booking.deposit.id },
        data: { status: "released", releasedAt: new Date(), releasedMinor: remaining },
      });
      await tx.depositLedgerEntry.create({
        data: {
          depositId: booking.deposit.id,
          bookingId: booking.id,
          type: "release",
          amountMinor: remaining,
          reason: "Deposit released on completion",
          actorId: input.actor?.id ?? null,
        },
      });
    }

    if (input.to === "disputed" && !booking.dispute) {
      await tx.dispute.create({
        data: {
          bookingId: booking.id,
          reason: input.reason ?? input.note ?? "Return condition dispute",
          claimAmountMinor: 0,
          status: "open",
        },
      });
    }

    await tx.booking.update({
      where: { id: booking.id },
      data: { status: input.to, ...timestampFor(input.to) },
    });
    await tx.bookingEvent.create({
      data: {
        bookingId: booking.id,
        fromStatus: from,
        toStatus: input.to,
        note: input.note ?? null,
        actorId: input.actor?.id ?? null,
      },
    });
  });

  await recordAudit({
    actor: input.actor,
    action: `rental.booking.${input.to}`,
    entityType: "booking",
    entityId: booking.id,
    before: { status: from },
    after: { status: input.to, note: input.note },
  });

  return loadBooking(booking.id);
}

// ---------------------------------------------------------------------------
// Deposits
// ---------------------------------------------------------------------------

export async function captureDeposit(input: {
  depositId: string;
  amountMinor: number;
  reason: string;
  idempotencyKey?: string;
  actor: Actor;
}) {
  if (input.amountMinor <= 0) throw badRequest("Capture amount must be positive");
  const deposit = await prisma.rentalDeposit.findUnique({ where: { id: input.depositId }, include: { booking: true } });
  if (!deposit) throw notFound("Deposit not found");

  if (input.idempotencyKey) {
    const existing = await prisma.depositLedgerEntry.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (existing) return { deposit, idempotent: true };
  }
  if (deposit.status !== "authorized") {
    throw conflict("Only an authorized deposit can be captured", { status: deposit.status });
  }
  if (deposit.capturedMinor + input.amountMinor > deposit.amountMinor) {
    throw conflict("Capture exceeds the authorized deposit amount", {
      authorizedMinor: deposit.amountMinor,
      alreadyCapturedMinor: deposit.capturedMinor,
      requestedMinor: input.amountMinor,
    });
  }

  const nextCaptured = deposit.capturedMinor + input.amountMinor;
  const fullyCaptured = nextCaptured >= deposit.amountMinor;
  const updated = await prisma.$transaction(async (tx) => {
    await tx.depositLedgerEntry.create({
      data: {
        depositId: deposit.id,
        bookingId: deposit.bookingId,
        type: "capture",
        amountMinor: input.amountMinor,
        reason: input.reason,
        actorId: input.actor.id,
        idempotencyKey: input.idempotencyKey ?? null,
      },
    });
    const result = await tx.rentalDeposit.update({
      where: { id: deposit.id },
      data: {
        capturedMinor: nextCaptured,
        status: fullyCaptured ? "captured" : "authorized",
        capturedAt: new Date(),
      },
    });
    if (input.reason.startsWith("late_fee")) {
      await tx.booking.update({ where: { id: deposit.bookingId }, data: { lateFeeMinor: input.amountMinor } });
    }
    return result;
  });

  await recordAudit({
    actor: input.actor,
    action: "rental.deposit.capture",
    entityType: "rentalDeposit",
    entityId: deposit.id,
    before: { capturedMinor: deposit.capturedMinor, status: deposit.status },
    after: { capturedMinor: nextCaptured, status: updated.status, reason: input.reason },
  });
  return { deposit: updated, idempotent: false };
}

export async function releaseDeposit(input: {
  depositId: string;
  reason?: string;
  idempotencyKey?: string;
  actor: Actor;
}) {
  const deposit = await prisma.rentalDeposit.findUnique({ where: { id: input.depositId } });
  if (!deposit) throw notFound("Deposit not found");

  if (input.idempotencyKey) {
    const existing = await prisma.depositLedgerEntry.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
    if (existing) return { deposit, idempotent: true };
  }
  if (deposit.status === "released" || deposit.status === "expired") {
    return { deposit, idempotent: true };
  }
  if (deposit.status !== "authorized" && deposit.status !== "captured") {
    throw conflict("Only an authorized or captured deposit can be released", { status: deposit.status });
  }

  const remaining = deposit.amountMinor - deposit.capturedMinor;
  const updated = await prisma.$transaction(async (tx) => {
    await tx.depositLedgerEntry.create({
      data: {
        depositId: deposit.id,
        bookingId: deposit.bookingId,
        type: "release",
        amountMinor: remaining,
        reason: input.reason ?? "Deposit hold released",
        actorId: input.actor.id,
        idempotencyKey: input.idempotencyKey ?? null,
      },
    });
    return tx.rentalDeposit.update({
      where: { id: deposit.id },
      data: {
        status: "released",
        releasedMinor: deposit.releasedMinor + remaining,
        releasedAt: new Date(),
      },
    });
  });

  await recordAudit({
    actor: input.actor,
    action: "rental.deposit.release",
    entityType: "rentalDeposit",
    entityId: deposit.id,
    before: { status: deposit.status, releasedMinor: deposit.releasedMinor },
    after: { status: "released", releasedMinor: updated.releasedMinor },
  });
  return { deposit: updated, idempotent: false };
}

// ---------------------------------------------------------------------------
// Overdue handling
// ---------------------------------------------------------------------------

export async function sweepOverdue(now = new Date()): Promise<{ flagged: number; bookings: Array<{ id: string; bookingNumber: string; overdueDays: number; lateFeeMinor: number }> }> {
  const candidates = await prisma.booking.findMany({
    where: {
      status: { in: ["dispatched", "in_use", "return_due"] },
      endDate: { lt: new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000) },
    },
    include: { listing: { select: { lateFeePerDayMinor: true } } },
  });
  const results: Array<{ id: string; bookingNumber: string; overdueDays: number; lateFeeMinor: number }> = [];
  for (const booking of candidates) {
    const overdueDays = Math.max(0, rentalDaysBetween(booking.endDate, now) - booking.graceDays);
    if (overdueDays <= 0) continue;
    const lateFeeMinor = overdueDays * booking.listing.lateFeePerDayMinor;
    await prisma.$transaction(async (tx) => {
      await tx.booking.update({
        where: { id: booking.id },
        data: {
          status: "overdue",
          overdueFlag: true,
          overdueDays,
          lateFeeMinor,
        },
      });
      await tx.bookingEvent.create({
        data: {
          bookingId: booking.id,
          fromStatus: booking.status,
          toStatus: "overdue",
          note: `Auto-flagged overdue: ${overdueDays} day(s) late; late fee ${lateFeeMinor} minor units`,
        },
      });
    });
    results.push({ id: booking.id, bookingNumber: booking.bookingNumber, overdueDays, lateFeeMinor });
  }
  await recordAudit({
    actor: null,
    action: "rental.overdue.sweep",
    entityType: "booking",
    after: { flagged: results.length, now },
  });
  return { flagged: results.length, bookings: results };
}

export async function overdueQueue() {
  return prisma.booking.findMany({
    where: { OR: [{ status: "overdue" }, { overdueFlag: true }] },
    include: {
      listing: { select: { id: true, title: true, slug: true, city: true, state: true } },
      renter: { select: { id: true, email: true, firstName: true, lastName: true } },
      owner: { select: { id: true, email: true, firstName: true, lastName: true } },
    },
    orderBy: { updatedAt: "desc" },
  });
}

// ---------------------------------------------------------------------------
// Inspection, disputes, notes
// ---------------------------------------------------------------------------

export async function upsertInspection(input: {
  bookingId: string;
  condition: string;
  photos?: string[];
  damageClaimMinor?: number;
  notes?: string;
  actor: Actor;
}) {
  const booking = await loadBooking(input.bookingId);
  if (!["returned", "inspection", "disputed"].includes(booking.status)) {
    throw conflict("Inspection can only be recorded after the item is returned", { status: booking.status });
  }
  const inspection = await prisma.inspectionReport.upsert({
    where: { bookingId: booking.id },
    update: {
      condition: input.condition,
      photos: (input.photos ?? []).join("\n"),
      damageClaimMinor: input.damageClaimMinor ?? 0,
      notes: input.notes ?? null,
      inspectedById: input.actor.id,
    },
    create: {
      bookingId: booking.id,
      condition: input.condition,
      photos: (input.photos ?? []).join("\n"),
      damageClaimMinor: input.damageClaimMinor ?? 0,
      notes: input.notes ?? null,
      inspectedById: input.actor.id,
    },
  });
  await recordAudit({
    actor: input.actor,
    action: "rental.inspection.record",
    entityType: "inspectionReport",
    entityId: inspection.id,
    after: { bookingId: booking.id, condition: input.condition, damageClaimMinor: inspection.damageClaimMinor },
  });
  return inspection;
}

export async function openDispute(input: {
  bookingId: string;
  reason: string;
  claimAmountMinor?: number;
  actor: Actor;
}) {
  const booking = await loadBooking(input.bookingId);
  if (booking.dispute) throw conflict("A dispute already exists for this booking", { disputeId: booking.dispute.id });
  if (!["returned", "inspection", "disputed"].includes(booking.status)) {
    throw conflict("A dispute can only be opened after return", { status: booking.status });
  }
  const dispute = await prisma.dispute.create({
    data: {
      bookingId: booking.id,
      reason: input.reason,
      claimAmountMinor: input.claimAmountMinor ?? 0,
      status: "open",
    },
  });
  await prisma.bookingEvent.create({
    data: {
      bookingId: booking.id,
      fromStatus: booking.status,
      toStatus: booking.status,
      note: `Dispute opened: ${input.reason}`,
      actorId: input.actor.id,
    },
  });
  await recordAudit({
    actor: input.actor,
    action: "rental.dispute.open",
    entityType: "dispute",
    entityId: dispute.id,
    after: { bookingId: booking.id, reason: input.reason, claimAmountMinor: dispute.claimAmountMinor },
  });
  return dispute;
}

export async function resolveDispute(input: {
  disputeId: string;
  resolution: "renter_pays" | "owner_pays" | "split" | "refunded";
  resolutionNote?: string;
  actor: Actor;
  idempotencyKey?: string;
}) {
  const dispute = await prisma.dispute.findUnique({
    where: { id: input.disputeId },
    include: { booking: { include: { deposit: true } } },
  });
  if (!dispute) throw notFound("Dispute not found");
  if (dispute.status === "resolved") {
    return { dispute, idempotent: true };
  }
  if (input.actor.role !== "admin" && input.actor.role !== "manager") {
    throw forbidden("Only admins or managers can decide disputes");
  }

  const deposit = dispute.booking.deposit;
  let capturedMinor = 0;
  if (deposit && deposit.status === "authorized" && dispute.claimAmountMinor > 0) {
    if (input.resolution === "renter_pays") capturedMinor = Math.min(dispute.claimAmountMinor, deposit.amountMinor - deposit.capturedMinor);
    if (input.resolution === "split") capturedMinor = Math.min(Math.round(dispute.claimAmountMinor / 2), deposit.amountMinor - deposit.capturedMinor);
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (capturedMinor > 0) {
      await tx.depositLedgerEntry.create({
        data: {
          depositId: deposit!.id,
          bookingId: dispute.bookingId,
          type: "capture",
          amountMinor: capturedMinor,
          reason: `Dispute resolution ${input.resolution}`,
          actorId: input.actor.id,
          idempotencyKey: input.idempotencyKey ?? null,
        },
      });
      await tx.rentalDeposit.update({
        where: { id: deposit!.id },
        data: {
          capturedMinor: deposit!.capturedMinor + capturedMinor,
          status: deposit!.capturedMinor + capturedMinor >= deposit!.amountMinor ? "captured" : "authorized",
          capturedAt: new Date(),
        },
      });
    }
    const remaining = deposit ? deposit.amountMinor - (deposit.capturedMinor + capturedMinor) : 0;
    if (deposit && remaining > 0 && deposit.status !== "released" && deposit.status !== "expired") {
      await tx.rentalDeposit.update({
        where: { id: deposit.id },
        data: { status: "released", releasedAt: new Date(), releasedMinor: remaining },
      });
      await tx.depositLedgerEntry.create({
        data: {
          depositId: deposit.id,
          bookingId: dispute.bookingId,
          type: "release",
          amountMinor: remaining,
          reason: `Dispute resolution ${input.resolution} — remaining hold released`,
          actorId: input.actor.id,
          idempotencyKey: input.idempotencyKey ? `${input.idempotencyKey}:release` : null,
        },
      });
    }
    const resolved = await tx.dispute.update({
      where: { id: dispute.id },
      data: {
        status: "resolved",
        resolution: input.resolution,
        resolutionNote: input.resolutionNote ?? null,
        decidedById: input.actor.id,
        decidedAt: new Date(),
      },
    });
    await tx.booking.update({ where: { id: dispute.bookingId }, data: { status: "completed", completedAt: new Date() } });
    await tx.bookingEvent.create({
      data: {
        bookingId: dispute.bookingId,
        fromStatus: dispute.booking.status,
        toStatus: "completed",
        note: `Dispute resolved: ${input.resolution}`,
        actorId: input.actor.id,
      },
    });
    return resolved;
  });

  await recordAudit({
    actor: input.actor,
    action: "rental.dispute.resolve",
    entityType: "dispute",
    entityId: dispute.id,
    before: { status: dispute.status },
    after: { status: "resolved", resolution: input.resolution, capturedMinor },
  });
  return { dispute: updated, idempotent: false };
}

export async function addBookingNote(input: { bookingId: string; body: string; actor: Actor }) {
  const booking = await loadBooking(input.bookingId);
  const note = await prisma.bookingNote.create({
    data: { bookingId: booking.id, body: input.body, authorId: input.actor.id },
  });
  await recordAudit({
    actor: input.actor,
    action: "rental.booking.note",
    entityType: "booking",
    entityId: booking.id,
    after: { noteId: note.id },
  });
  return note;
}
