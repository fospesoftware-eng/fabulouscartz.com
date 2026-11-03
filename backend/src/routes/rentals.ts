import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db.js";
import { parse } from "../lib/validate.js";
import { badRequest, forbidden } from "../lib/errors.js";
import { pageArgs, pageSchema, paginated } from "../lib/pagination.js";
import { requireActor, type Actor } from "../lib/guards.js";
import {
  addBookingNote,
  createBooking,
  listingCalendar,
  loadBooking,
  openDispute,
  searchRentalListings,
  serializeBooking,
  serializeListing,
  transitionBooking,
  type ListingSearchQuery,
} from "../services/rentals.js";
import { publicRentalListing } from "./sellers.js";

const searchSchema = pageSchema.extend({
  q: z.string().trim().max(120).optional(),
  category: z.string().max(120).optional(),
  city: z.string().max(80).optional(),
  state: z.string().length(2).optional(),
  condition: z.enum(["new", "like_new", "good", "fair", "worn"]).optional(),
  handoverMode: z.enum(["ship", "pickup", "both"]).optional(),
  minPrice: z.coerce.number().min(0).optional(),
  maxPrice: z.coerce.number().min(0).optional(),
  availableFrom: z.coerce.date().optional(),
  availableTo: z.coerce.date().optional(),
  sort: z.enum(["newest", "price_asc", "price_desc", "rating"]).default("newest"),
});

const bookingInput = z.object({
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  handoverMode: z.enum(["ship", "pickup"]).optional(),
  note: z.string().max(500).optional(),
});

const calendarQuery = z.object({
  from: z.coerce.date(),
  to: z.coerce.date(),
});

function assertParticipant(actor: Actor, booking: { renterUserId: string; ownerUserId: string }) {
  if (actor.id === booking.renterUserId || actor.id === booking.ownerUserId) return;
  throw forbidden("You are not a participant in this booking");
}

function isStaff(actor: Actor) {
  return actor.role === "admin" || actor.role === "manager" || actor.role === "fulfilment";
}

export async function rentalRoutes(app: FastifyInstance): Promise<void> {
  // ------------------------------------------------------------------ search
  app.get(
    "/rentals",
    { schema: { tags: ["Rentals"], summary: "Search peer-to-peer rental listings" } },
    async (request, reply) => {
      const query = parse(searchSchema, request.query);
      if ((query.availableFrom && !query.availableTo) || (query.availableTo && !query.availableFrom)) {
        throw badRequest("availableFrom and availableTo must be supplied together");
      }
      const { page, pageSize } = pageArgs(query);
      const search: ListingSearchQuery = { ...query, page, pageSize };
      const { total, rows } = await searchRentalListings(search);
      return reply.send(paginated(rows.map((listing) => serializeListing(listing)), total, page, pageSize));
    },
  );

  app.get(
    "/rentals/search",
    { schema: { tags: ["Rentals"], summary: "Alias for rental listing search" } },
    async (request, reply) => {
      const query = parse(searchSchema, request.query);
      const { page, pageSize } = pageArgs(query);
      const { total, rows } = await searchRentalListings({ ...query, page, pageSize } as ListingSearchQuery);
      return reply.send(paginated(rows.map((listing) => serializeListing(listing)), total, page, pageSize));
    },
  );

  app.get(
    "/rentals/bookings",
    { schema: { tags: ["Rentals"], summary: "Bookings where the caller is renter or owner" } },
    async (request, reply) => {
      const actor = await requireActor(request);
      const query = parse(pageSchema.extend({ role: z.enum(["renter", "owner", "any"]).default("any") }), request.query);
      const where: Record<string, unknown> = {};
      if (query.role === "renter") where.renterUserId = actor.id;
      else if (query.role === "owner") where.ownerUserId = actor.id;
      else if (isStaff(actor)) {
        // staff may omit the scope to list all bookings
      } else {
        where.OR = [{ renterUserId: actor.id }, { ownerUserId: actor.id }];
      }
      const { skip, take, page, pageSize } = pageArgs(query);
      const [total, bookings] = await Promise.all([
        prisma.booking.count({ where: where as never }),
        prisma.booking.findMany({
          where: where as never,
          include: {
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
          },
          orderBy: { createdAt: "desc" },
          skip,
          take,
        }),
      ]);
      return reply.send(paginated(bookings.map(serializeBooking), total, page, pageSize));
    },
  );

  app.get(
    "/rentals/:id",
    { schema: { tags: ["Rentals"], summary: "Rental listing detail" } },
    async (request, reply) => {
      const { id } = parse(z.object({ id: z.string().min(1) }), request.params);
      return reply.send({ data: serializeListing(await publicRentalListing(id)) });
    },
  );

  app.get(
    "/rentals/:id/calendar",
    { schema: { tags: ["Rentals"], summary: "Bookings and blackouts for a listing" } },
    async (request, reply) => {
      const { id } = parse(z.object({ id: z.string().min(1) }), request.params);
      const query = parse(calendarQuery, request.query);
      await publicRentalListing(id);
      return reply.send({ data: await listingCalendar(id, query.from, query.to) });
    },
  );

  app.post(
    "/rentals/:id/bookings",
    { schema: { tags: ["Rentals"], summary: "Request a booking (renter)" } },
    async (request, reply) => {
      const actor = await requireActor(request);
      const { id } = parse(z.object({ id: z.string().min(1) }), request.params);
      const input = parse(bookingInput, request.body);
      const booking = await createBooking({
        listingId: id,
        renterId: actor.id,
        startDate: input.startDate,
        endDate: input.endDate,
        handoverMode: input.handoverMode,
        note: input.note,
      });
      return reply.status(201).send({ data: serializeBooking(booking) });
    },
  );

  // ---------------------------------------------------------------- booking
  app.get(
    "/rentals/bookings/:id",
    { schema: { tags: ["Rentals"], summary: "Booking detail (participants or staff)" } },
    async (request, reply) => {
      const actor = await requireActor(request);
      const { id } = parse(z.object({ id: z.string().min(1) }), request.params);
      const booking = await loadBooking(id);
      if (!isStaff(actor)) assertParticipant(actor, booking);
      return reply.send({ data: serializeBooking(booking) });
    },
  );

  app.post(
    "/rentals/bookings/:id/cancel",
    { schema: { tags: ["Rentals"], summary: "Cancel a booking as renter or owner" } },
    async (request, reply) => {
      const actor = await requireActor(request);
      const { id } = parse(z.object({ id: z.string().min(1) }), request.params);
      const input = parse(z.object({ reason: z.string().max(300).optional() }), request.body ?? {});
      const booking = await loadBooking(id);
      assertParticipant(actor, booking);
      const isRenter = actor.id === booking.renterUserId;
      const target = isRenter ? "cancelled_by_renter" : "cancelled_by_owner";
      const updated = await transitionBooking({ bookingId: booking.id, to: target, actor, note: input.reason });
      return reply.send({ data: serializeBooking(updated) });
    },
  );

  app.post(
    "/rentals/bookings/:id/owner-action",
    { schema: { tags: ["Rentals"], summary: "Approve or decline a requested booking (owner)" } },
    async (request, reply) => {
      const actor = await requireActor(request);
      const { id } = parse(z.object({ id: z.string().min(1) }), request.params);
      const input = parse(z.object({ action: z.enum(["approve", "decline"]), note: z.string().max(300).optional() }), request.body);
      const booking = await loadBooking(id);
      if (!isStaff(actor) && actor.id !== booking.ownerUserId) throw forbidden("Only the listing owner can decide this booking");
      const target = input.action === "approve" ? "approved" : "declined";
      const updated = await transitionBooking({ bookingId: booking.id, to: target, actor, note: input.note });
      return reply.send({ data: serializeBooking(updated) });
    },
  );

  app.post(
    "/rentals/bookings/:id/return",
    { schema: { tags: ["Rentals"], summary: "Mark an item returned (renter or owner)" } },
    async (request, reply) => {
      const actor = await requireActor(request);
      const { id } = parse(z.object({ id: z.string().min(1) }), request.params);
      const input = parse(z.object({ note: z.string().max(300).optional() }), request.body ?? {});
      const booking = await loadBooking(id);
      assertParticipant(actor, booking);
      if (!["in_use", "return_due", "overdue"].includes(booking.status)) {
        throw badRequest("Only an in-use or overdue booking can be returned", { status: booking.status });
      }
      const updated = await transitionBooking({ bookingId: booking.id, to: "returned", actor, note: input.note ?? "Item returned" });
      return reply.send({ data: serializeBooking(updated) });
    },
  );

  app.get(
    "/rentals/bookings/:id/notes",
    { schema: { tags: ["Rentals"], summary: "Booking thread notes" } },
    async (request, reply) => {
      const actor = await requireActor(request);
      const { id } = parse(z.object({ id: z.string().min(1) }), request.params);
      const booking = await loadBooking(id);
      if (!isStaff(actor)) assertParticipant(actor, booking);
      return reply.send({ data: serializeBooking(booking).notes });
    },
  );

  app.post(
    "/rentals/bookings/:id/notes",
    { schema: { tags: ["Rentals"], summary: "Add a booking thread note" } },
    async (request, reply) => {
      const actor = await requireActor(request);
      const { id } = parse(z.object({ id: z.string().min(1) }), request.params);
      const input = parse(z.object({ body: z.string().min(1).max(1000) }), request.body);
      const booking = await loadBooking(id);
      if (!isStaff(actor)) assertParticipant(actor, booking);
      const note = await addBookingNote({ bookingId: booking.id, body: input.body, actor });
      return reply.status(201).send({ data: note });
    },
  );

  app.post(
    "/rentals/bookings/:id/dispute",
    { schema: { tags: ["Rentals"], summary: "Open a return dispute" } },
    async (request, reply) => {
      const actor = await requireActor(request);
      const { id } = parse(z.object({ id: z.string().min(1) }), request.params);
      const input = parse(
        z.object({ reason: z.string().min(3).max(500), claimAmountMinor: z.number().int().min(0).optional() }),
        request.body,
      );
      const booking = await loadBooking(id);
      assertParticipant(actor, booking);
      const dispute = await openDispute({
        bookingId: booking.id,
        reason: input.reason,
        claimAmountMinor: input.claimAmountMinor,
        actor,
      });
      return reply.status(201).send({ data: dispute });
    },
  );
}
