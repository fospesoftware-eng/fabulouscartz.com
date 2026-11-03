import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../db.js";
import { parse } from "../../lib/validate.js";
import { conflict, notFound } from "../../lib/errors.js";
import { pageArgs, pageSchema, paginated } from "../../lib/pagination.js";
import { recordAudit } from "../../lib/audit.js";
import { BOOKING_STATUSES, DEPOSIT_STATUSES, INSPECTION_CONDITIONS, RENTAL_LISTING_STATUSES } from "../../lib/constants.js";
import { staffActor } from "./catalog.js";
import { getSeller } from "../../services/sellers.js";
import {
  captureDeposit,
  getListing,
  listingCalendar,
  loadBooking,
  overdueQueue,
  platformCalendar,
  releaseDeposit,
  resolveDispute,
  serializeBooking,
  serializeListing,
  sweepOverdue,
  transitionBooking,
  upsertInspection,
} from "../../services/rentals.js";
import { defaultRange, getRentalAnalytics } from "../../services/analytics.js";

const rangeSchema = z.object({ from: z.coerce.date().optional(), to: z.coerce.date().optional() });

const listingListSchema = pageSchema.extend({
  q: z.string().max(120).optional(),
  status: z.enum(RENTAL_LISTING_STATUSES).optional(),
  sellerId: z.string().optional(),
  ownerUserId: z.string().optional(),
  city: z.string().max(80).optional(),
  state: z.string().length(2).optional(),
});

const bookingListSchema = pageSchema.extend({
  status: z.enum(BOOKING_STATUSES).optional(),
  state: z.string().length(2).optional(),
  listingId: z.string().optional(),
  renterUserId: z.string().optional(),
  ownerUserId: z.string().optional(),
  overdue: z.enum(["true", "false"]).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

const calendarQuery = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
  state: z.string().length(2).optional(),
});

const depositListSchema = pageSchema.extend({
  status: z.enum(DEPOSIT_STATUSES).optional(),
  bookingId: z.string().optional(),
});

const captureSchema = z.object({
  amountMinor: z.number().int().min(1),
  reason: z.string().min(3).max(300),
  idempotencyKey: z.string().max(120).optional(),
});

const releaseSchema = z.object({
  reason: z.string().max(300).optional(),
  idempotencyKey: z.string().max(120).optional(),
});

export async function adminRentalRoutes(app: FastifyInstance): Promise<void> {
  // ----------------------------------------------------------------- listings
  app.get(
    "/rentals/listings",
    { schema: { tags: ["Admin · Rentals"], summary: "Moderation queue for rental listings" } },
    async (request, reply) => {
      await staffActor(request, ["admin", "manager"]);
      const query = parse(listingListSchema, request.query);
      const where: Record<string, unknown> = {};
      if (query.status) where.status = query.status;
      if (query.sellerId) where.sellerId = query.sellerId;
      if (query.ownerUserId) where.ownerUserId = query.ownerUserId;
      if (query.city) where.city = { contains: query.city };
      if (query.state) where.state = query.state.toUpperCase();
      if (query.q) where.OR = [{ title: { contains: query.q } }, { description: { contains: query.q } }, { slug: { contains: query.q } }];
      const { skip, take, page, pageSize } = pageArgs(query);
      const [total, listings] = await Promise.all([
        prisma.rentalListing.count({ where: where as never }),
        prisma.rentalListing.findMany({
          where: where as never,
          include: {
            owner: { select: { id: true, email: true, firstName: true, lastName: true } },
            seller: { select: { id: true, storeName: true, slug: true, status: true, kycStatus: true } },
            category: { select: { id: true, name: true, slug: true } },
            blackouts: true,
            _count: { select: { bookings: true } },
          },
          orderBy: { createdAt: "desc" },
          skip,
          take,
        }),
      ]);
      return reply.send(paginated(listings.map((listing) => serializeListing(listing)), total, page, pageSize));
    },
  );

  app.get(
    "/rentals/listings/:id",
    { schema: { tags: ["Admin · Rentals"], summary: "Rental listing moderation detail" } },
    async (request, reply) => {
      await staffActor(request, ["admin", "manager"]);
      const { id } = parse(z.object({ id: z.string().min(1) }), request.params);
      return reply.send({ data: serializeListing(await getListing(id)) });
    },
  );

  app.patch(
    "/rentals/listings/:id",
    { schema: { tags: ["Admin · Rentals"], summary: "Moderate a rental listing status" } },
    async (request, reply) => {
      const actor = await staffActor(request, ["admin", "manager"]);
      const { id } = parse(z.object({ id: z.string().min(1) }), request.params);
      const input = parse(
        z.object({
          status: z.enum(RENTAL_LISTING_STATUSES),
          note: z.string().max(300).optional(),
          title: z.string().min(2).max(200).optional(),
          description: z.string().max(4000).optional(),
          dailyRateMinor: z.number().int().min(0).optional(),
          depositMinor: z.number().int().min(0).optional(),
          conditionGrade: z.enum(["new", "like_new", "good", "fair", "worn"]).optional(),
        }),
        request.body,
      );
      const listing = await getListing(id);
      if (input.status === "active") {
        if (listing.seller) {
          const seller = await getSeller(listing.seller.id);
          if (seller.status === "suspended" || seller.kycStatus === "suspended") {
            throw conflict("Cannot activate a listing for a suspended seller", { sellerId: seller.id });
          }
        }
      }
      const updated = await prisma.rentalListing.update({
        where: { id: listing.id },
        data: {
          status: input.status,
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.dailyRateMinor !== undefined ? { dailyRateMinor: input.dailyRateMinor } : {}),
          ...(input.depositMinor !== undefined ? { depositMinor: input.depositMinor } : {}),
          ...(input.conditionGrade !== undefined ? { conditionGrade: input.conditionGrade } : {}),
        },
        include: {
          owner: { select: { id: true, email: true, firstName: true, lastName: true } },
          seller: { select: { id: true, storeName: true, slug: true, status: true, kycStatus: true } },
          category: { select: { id: true, name: true, slug: true } },
          blackouts: true,
          _count: { select: { bookings: true } },
        },
      });
      await recordAudit({
        actor,
        action: "rental.listing.moderate",
        entityType: "rentalListing",
        entityId: listing.id,
        before: { status: listing.status },
        after: { status: input.status, note: input.note },
      });
      return reply.send({ data: serializeListing(updated) });
    },
  );

  app.get(
    "/rentals/listings/:id/calendar",
    { schema: { tags: ["Admin · Rentals"], summary: "Calendar for a single listing" } },
    async (request, reply) => {
      await staffActor(request);
      const { id } = parse(z.object({ id: z.string().min(1) }), request.params);
      const query = parse(calendarQuery, request.query);
      return reply.send({ data: await listingCalendar(id, query.from, query.to) });
    },
  );

  // ----------------------------------------------------------------- bookings
  app.get(
    "/rentals/bookings",
    { schema: { tags: ["Admin · Rentals"], summary: "List bookings across the platform" } },
    async (request, reply) => {
      await staffActor(request);
      const query = parse(bookingListSchema, request.query);
      const where: Record<string, unknown> = {};
      if (query.status) where.status = query.status;
      if (query.state) where.state = query.state.toUpperCase();
      if (query.listingId) where.listingId = query.listingId;
      if (query.renterUserId) where.renterUserId = query.renterUserId;
      if (query.ownerUserId) where.ownerUserId = query.ownerUserId;
      if (query.overdue === "true") where.overdueFlag = true;
      if (query.from || query.to) {
        where.startDate = {
          ...(query.from ? { gte: query.from } : {}),
          ...(query.to ? { lte: query.to } : {}),
        };
      }
      const { skip, take, page, pageSize } = pageArgs(query);
      const [total, bookings] = await Promise.all([
        prisma.booking.count({ where: where as never }),
        prisma.booking.findMany({
          where: where as never,
          include: {
            listing: { select: { id: true, slug: true, title: true, city: true, state: true, ownerUserId: true } },
            renter: { select: { id: true, email: true, firstName: true, lastName: true } },
            owner: { select: { id: true, email: true, firstName: true, lastName: true } },
          },
          orderBy: { createdAt: "desc" },
          skip,
          take,
        }),
      ]);
      return reply.send(
        paginated(
          bookings.map((booking) => ({
            id: booking.id,
            bookingNumber: booking.bookingNumber,
            status: booking.status,
            listing: booking.listing,
            renter: booking.renter,
            owner: booking.owner,
            window: { startDate: booking.startDate, endDate: booking.endDate, days: booking.days },
            money: {
              rentalFeeMinor: booking.rentalFeeMinor,
              platformFeeMinor: booking.platformFeeMinor,
              ownerPayoutMinor: booking.ownerPayoutMinor,
              depositMinor: booking.depositMinor,
              lateFeeMinor: booking.lateFeeMinor,
              currency: booking.currency,
            },
            overdue: { flag: booking.overdueFlag, days: booking.overdueDays },
            location: { city: booking.city, state: booking.state },
            createdAt: booking.createdAt,
            updatedAt: booking.updatedAt,
          })),
          total,
          page,
          pageSize,
        ),
      );
    },
  );

  app.get(
    "/rentals/bookings/:id",
    { schema: { tags: ["Admin · Rentals"], summary: "Booking detail for operations" } },
    async (request, reply) => {
      await staffActor(request);
      const { id } = parse(z.object({ id: z.string().min(1) }), request.params);
      return reply.send({ data: serializeBooking(await loadBooking(id)) });
    },
  );

  app.post(
    "/rentals/bookings/:id/transition",
    {
      schema: {
        tags: ["Admin · Rentals"],
        summary: "Transition a booking (fulfilment limited to dispatch/inspection, no money states)",
      },
    },
    async (request, reply) => {
      const actor = await staffActor(request);
      const { id } = parse(z.object({ id: z.string().min(1) }), request.params);
      const input = parse(z.object({ to: z.enum(BOOKING_STATUSES), note: z.string().max(300).optional() }), request.body);
      const updated = await transitionBooking({ bookingId: id, to: input.to, actor, note: input.note });
      return reply.send({ data: serializeBooking(updated) });
    },
  );

  app.get(
    "/rentals/calendar",
    { schema: { tags: ["Admin · Rentals"], summary: "Platform-wide bookings and blackouts for a date window" } },
    async (request, reply) => {
      await staffActor(request);
      const query = parse(calendarQuery, request.query);
      return reply.send({ data: await platformCalendar(query.from, query.to, query.state) });
    },
  );

  app.post(
    "/rentals/bookings/:id/inspection",
    { schema: { tags: ["Admin · Rentals"], summary: "Record the return inspection report" } },
    async (request, reply) => {
      const actor = await staffActor(request);
      const { id } = parse(z.object({ id: z.string().min(1) }), request.params);
      const input = parse(
        z.object({
          condition: z.enum(INSPECTION_CONDITIONS),
          photos: z.array(z.string().max(500)).max(12).optional(),
          damageClaimMinor: z.number().int().min(0).default(0),
          notes: z.string().max(1000).optional(),
        }),
        request.body,
      );
      const inspection = await upsertInspection({
        bookingId: id,
        condition: input.condition,
        photos: input.photos,
        damageClaimMinor: input.damageClaimMinor,
        notes: input.notes,
        actor,
      });
      return reply.status(201).send({ data: inspection });
    },
  );

  // ------------------------------------------------------------------ deposits
  app.get(
    "/rentals/deposits",
    { schema: { tags: ["Admin · Rentals"], summary: "Deposit ledger (money endpoint)" } },
    async (request, reply) => {
      await staffActor(request, ["admin", "manager"]);
      const query = parse(depositListSchema, request.query);
      const where: Record<string, unknown> = {};
      if (query.status) where.status = query.status;
      if (query.bookingId) where.bookingId = query.bookingId;
      const { skip, take, page, pageSize } = pageArgs(query);
      const [total, deposits] = await Promise.all([
        prisma.rentalDeposit.count({ where: where as never }),
        prisma.rentalDeposit.findMany({
          where: where as never,
          include: {
            booking: {
              select: {
                id: true,
                bookingNumber: true,
                status: true,
                renter: { select: { id: true, email: true } },
                owner: { select: { id: true, email: true } },
              },
            },
            ledgerEntries: { orderBy: { createdAt: "asc" } },
          },
          orderBy: { createdAt: "desc" },
          skip,
          take,
        }),
      ]);
      return reply.send(paginated(deposits, total, page, pageSize));
    },
  );

  app.post(
    "/rentals/deposits/:id/capture",
    { schema: { tags: ["Admin · Rentals"], summary: "Partially capture a deposit (damage/late fee)" } },
    async (request, reply) => {
      const actor = await staffActor(request, ["admin", "manager"]);
      const { id } = parse(z.object({ id: z.string().min(1) }), request.params);
      const input = parse(captureSchema, request.body);
      const headerKey = request.headers["x-idempotency-key"];
      const result = await captureDeposit({
        depositId: id,
        amountMinor: input.amountMinor,
        reason: input.reason,
        idempotencyKey: input.idempotencyKey ?? (typeof headerKey === "string" ? headerKey : undefined),
        actor,
      });
      return reply.send({ data: result.deposit, idempotent: result.idempotent });
    },
  );

  app.post(
    "/rentals/deposits/:id/release",
    { schema: { tags: ["Admin · Rentals"], summary: "Release a deposit hold (idempotent)" } },
    async (request, reply) => {
      const actor = await staffActor(request, ["admin", "manager"]);
      const { id } = parse(z.object({ id: z.string().min(1) }), request.params);
      const input = parse(releaseSchema, request.body ?? {});
      const headerKey = request.headers["x-idempotency-key"];
      const result = await releaseDeposit({
        depositId: id,
        reason: input.reason,
        idempotencyKey: input.idempotencyKey ?? (typeof headerKey === "string" ? headerKey : undefined),
        actor,
      });
      return reply.send({ data: result.deposit, idempotent: result.idempotent });
    },
  );

  // ------------------------------------------------------------------- overdue
  app.get(
    "/rentals/overdue",
    { schema: { tags: ["Admin · Rentals"], summary: "Overdue queue flagged for admin action" } },
    async (request, reply) => {
      await staffActor(request);
      return reply.send({ data: await overdueQueue() });
    },
  );

  app.post(
    "/rentals/overdue/sweep",
    { schema: { tags: ["Admin · Rentals"], summary: "Accrue late fees and flag newly overdue bookings" } },
    async (request, reply) => {
      const actor = await staffActor(request, ["admin", "manager"]);
      const result = await sweepOverdue();
      await recordAudit({
        actor,
        action: "rental.overdue.sweep",
        entityType: "booking",
        after: { flagged: result.flagged },
      });
      return reply.send({ data: result });
    },
  );

  // ------------------------------------------------------------------- disputes
  app.get(
    "/rentals/disputes",
    { schema: { tags: ["Admin · Rentals"], summary: "List rental disputes (money endpoint)" } },
    async (request, reply) => {
      await staffActor(request, ["admin", "manager"]);
      const query = parse(pageSchema.extend({ status: z.enum(["open", "resolved"]).optional() }), request.query);
      const where: Record<string, unknown> = {};
      if (query.status) where.status = query.status;
      const { skip, take, page, pageSize } = pageArgs(query);
      const [total, disputes] = await Promise.all([
        prisma.dispute.count({ where: where as never }),
        prisma.dispute.findMany({
          where: where as never,
          include: {
            booking: {
              select: {
                id: true,
                bookingNumber: true,
                status: true,
                rentalFeeMinor: true,
                depositMinor: true,
                listing: { select: { id: true, title: true, slug: true } },
                renter: { select: { id: true, email: true } },
                owner: { select: { id: true, email: true } },
              },
            },
          },
          orderBy: { createdAt: "desc" },
          skip,
          take,
        }),
      ]);
      return reply.send(paginated(disputes, total, page, pageSize));
    },
  );

  app.post(
    "/rentals/disputes/:id/resolve",
    { schema: { tags: ["Admin · Rentals"], summary: "Admin decision on a rental dispute" } },
    async (request, reply) => {
      const actor = await staffActor(request, ["admin", "manager"]);
      const { id } = parse(z.object({ id: z.string().min(1) }), request.params);
      const input = parse(
        z.object({
          resolution: z.enum(["renter_pays", "owner_pays", "split", "refunded"]),
          resolutionNote: z.string().max(500).optional(),
          idempotencyKey: z.string().max(120).optional(),
        }),
        request.body,
      );
      const headerKey = request.headers["x-idempotency-key"];
      const result = await resolveDispute({
        disputeId: id,
        resolution: input.resolution,
        resolutionNote: input.resolutionNote,
        idempotencyKey: input.idempotencyKey ?? (typeof headerKey === "string" ? headerKey : undefined),
        actor,
      });
      return reply.send({ data: result.dispute, idempotent: result.idempotent });
    },
  );

  // ----------------------------------------------------------------- analytics
  app.get(
    "/analytics/rentals",
    { schema: { tags: ["Admin · Rentals"], summary: "Rental GMV, deposit ledger, overdue and state mix" } },
    async (request, reply) => {
      await staffActor(request, ["admin", "manager"]);
      const query = parse(rangeSchema, request.query);
      return reply.send({ data: await getRentalAnalytics(defaultRange(query.from, query.to)) });
    },
  );

  app.get(
    "/analytics/rentals/states",
    { schema: { tags: ["Admin · Rentals"], summary: "Booking distribution by US state" } },
    async (request, reply) => {
      await staffActor(request, ["admin", "manager"]);
      const query = parse(rangeSchema, request.query);
      const data = await getRentalAnalytics(defaultRange(query.from, query.to));
      return reply.send({ data: { range: data.range, byState: data.byState } });
    },
  );
}
