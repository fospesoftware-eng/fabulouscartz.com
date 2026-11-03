import { Router } from "express";
import { z } from "zod";
import {
  ALLOWED_TRANSITIONS,
  BOOKING_STATES,
  type Booking,
  type BookingState,
  type DepositRow,
  type Dispute,
  type OverdueBooking,
  type RentalAnalytics,
  type SellerWorkspace,
} from "../../../shared/marketplace.js";
import {
  ApiError,
  asyncHandler,
  logAudit,
  notification,
  pageParams,
  paginate,
  requireAuth,
  requireRole,
  validate,
} from "../helpers.js";
import { getDb, mutate } from "../store.js";

export const marketplaceRouter = Router();
marketplaceRouter.use(requireAuth);

const moneyRole = requireRole("admin", "manager");

function isoDay(value: string | Date): string {
  const date = new Date(value);
  return date.toISOString().slice(0, 10);
}

function startOfDay(value: string): Date {
  const date = new Date(`${value}T00:00:00`);
  return date;
}

function endOfDay(value: string): Date {
  const date = new Date(`${value}T23:59:59.999`);
  return date;
}

function bookingFor(row: Booking): Booking {
  return { ...row, allowedTransitions: ALLOWED_TRANSITIONS[row.state] };
}

/* ---------------- Sellers ---------------- */

marketplaceRouter.get(
  "/sellers",
  asyncHandler((req, res) => {
    const { page, pageSize } = pageParams(req, 12);
    const q = String(req.query.q ?? "").trim().toLowerCase();
    const kycStatus = String(req.query.kycStatus ?? "");
    const status = String(req.query.status ?? "");
    const all = getDb().sellers;
    const items = all.filter((seller) => {
      if (kycStatus && seller.kycStatus !== kycStatus) return false;
      if (status && seller.status !== status) return false;
      if (!q) return true;
      return [seller.name, seller.handle, seller.ownerName, seller.city, seller.state]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });
    const facets = {
      pending: all.filter((seller) => seller.kycStatus === "pending").length,
      approved: all.filter((seller) => seller.kycStatus === "approved").length,
      rejected: all.filter((seller) => seller.kycStatus === "rejected").length,
      suspended: all.filter((seller) => seller.status === "suspended").length,
    };
    res.json({ ...paginate(items, page, pageSize), facets });
  }),
);

marketplaceRouter.get(
  "/sellers/:id",
  asyncHandler((req, res) => {
    const db = getDb();
    const seller = db.sellers.find((entry) => entry.id === req.params.id);
    if (!seller) throw new ApiError(404, "seller_not_found", "That seller does not exist.");
    const payload: SellerWorkspace = {
      seller,
      listings: db.listings.filter((listing) => listing.sellerId === seller.id),
      payouts: db.payouts.filter((payout) => payout.sellerId === seller.id),
      bookings: db.bookings.filter((booking) => booking.sellerId === seller.id).slice(0, 8).map(bookingFor),
    };
    res.json(payload);
  }),
);

marketplaceRouter.post(
  "/sellers/:id/review",
  asyncHandler((req, res) => {
    const body = validate(z.object({ decision: z.enum(["approve", "reject"]), reason: z.string().trim().max(300).optional() }), req.body);
    const updated = mutate((db) => {
      const seller = db.sellers.find((entry) => entry.id === req.params.id);
      if (!seller) throw new ApiError(404, "seller_not_found", "That seller does not exist.");
      if (body.decision === "reject" && !body.reason) {
        throw new ApiError(422, "reason_required", "Add a reason before rejecting KYC.", { reason: "A reason is required." });
      }
      seller.kycStatus = body.decision === "approve" ? "approved" : "rejected";
      seller.rejectionReason = body.decision === "reject" ? body.reason : undefined;
      seller.kycDocs = seller.kycDocs.map((doc) => ({ ...doc, status: body.decision === "approve" ? "verified" : doc.status }));
      if (body.decision === "approve") seller.status = "active";
      logAudit(db, req.user ?? null, "seller.kyc.review", "seller", seller.id, `${body.decision === "approve" ? "Approved" : "Rejected"} KYC — ${body.reason ?? "documents verified"}`);
      notification(db, `KYC ${body.decision === "approve" ? "approved" : "rejected"}`, `${seller.name} · ${body.reason ?? "All documents verified"}`, "system", `/sellers`);
      return seller;
    });
    res.json(updated);
  }),
);

marketplaceRouter.patch(
  "/sellers/:id/commission",
  moneyRole,
  asyncHandler((req, res) => {
    const body = validate(z.object({ rate: z.number().min(0).max(40) }), req.body);
    const updated = mutate((db) => {
      const seller = db.sellers.find((entry) => entry.id === req.params.id);
      if (!seller) throw new ApiError(404, "seller_not_found", "That seller does not exist.");
      seller.commissionRate = body.rate;
      logAudit(db, req.user ?? null, "seller.commission.update", "seller", seller.id, `Commission set to ${body.rate}%`);
      return seller;
    });
    res.json(updated);
  }),
);

marketplaceRouter.post(
  "/sellers/:id/suspend",
  moneyRole,
  asyncHandler((req, res) => {
    const body = validate(z.object({ reason: z.string().trim().min(4).max(300) }), req.body);
    const updated = mutate((db) => {
      const seller = db.sellers.find((entry) => entry.id === req.params.id);
      if (!seller) throw new ApiError(404, "seller_not_found", "That seller does not exist.");
      seller.status = seller.status === "suspended" ? "active" : "suspended";
      seller.suspendedReason = seller.status === "suspended" ? body.reason : undefined;
      logAudit(db, req.user ?? null, "seller.status.update", "seller", seller.id, `${seller.status === "suspended" ? "Suspended" : "Reactivated"} — ${body.reason}`);
      return seller;
    });
    res.json(updated);
  }),
);

/* ---------------- Payouts ---------------- */

marketplaceRouter.get(
  "/payouts",
  asyncHandler((req, res) => {
    const period = String(req.query.period ?? "");
    const status = String(req.query.status ?? "");
    const all = getDb().payouts;
    const items = all
      .filter((payout) => (period ? payout.period === period : true))
      .filter((payout) => (status ? payout.status === status : true))
      .sort((a, b) => b.period.localeCompare(a.period) || b.net - a.net);
    const summary = {
      due: all.filter((payout) => payout.status === "due").reduce((sum, payout) => sum + payout.net, 0),
      paid: all.filter((payout) => payout.status === "paid").reduce((sum, payout) => sum + payout.net, 0),
      failed: all.filter((payout) => payout.status === "failed").reduce((sum, payout) => sum + payout.net, 0),
      count: items.length,
    };
    const periods = Array.from(new Set(all.map((payout) => payout.period))).sort().reverse();
    res.json({ data: items, summary, periods });
  }),
);

marketplaceRouter.get(
  "/sellers/:id/payouts",
  asyncHandler((req, res) => {
    res.json(getDb().payouts.filter((payout) => payout.sellerId === req.params.id));
  }),
);

marketplaceRouter.post(
  "/payouts/:id/mark-paid",
  moneyRole,
  asyncHandler((req, res) => {
    const body = validate(z.object({ reference: z.string().trim().min(3, "Add the bank reference.").max(80) }), req.body);
    const updated = mutate((db) => {
      const payout = db.payouts.find((entry) => entry.id === req.params.id);
      if (!payout) throw new ApiError(404, "payout_not_found", "That payout does not exist.");
      if (payout.status === "paid") throw new ApiError(409, "already_paid", "This payout is already marked paid.");
      payout.status = "paid";
      payout.reference = body.reference;
      payout.paidAt = new Date().toISOString();
      logAudit(db, req.user ?? null, "payout.mark-paid", "payout", payout.id, `${payout.sellerName} · ${payout.period} · ${body.reference}`);
      return payout;
    });
    res.json(updated);
  }),
);

/* ---------------- Rental listings ---------------- */

marketplaceRouter.get(
  "/rentals/listings",
  asyncHandler((req, res) => {
    const status = String(req.query.status ?? "");
    const city = String(req.query.city ?? "").trim().toLowerCase();
    const ownerType = String(req.query.ownerType ?? "");
    const all = getDb().listings;
    const items = all.filter((listing) => {
      if (status && listing.status !== status) return false;
      if (ownerType && listing.ownerType !== ownerType) return false;
      if (city && !listing.city.toLowerCase().includes(city)) return false;
      return true;
    });
    const facets = {
      pending: all.filter((listing) => listing.status === "pending").length,
      approved: all.filter((listing) => listing.status === "approved").length,
      paused: all.filter((listing) => listing.status === "paused").length,
      suspended: all.filter((listing) => listing.status === "suspended").length,
    };
    const cities = Array.from(new Set(all.map((listing) => listing.city))).sort();
    res.json({ data: items, facets, cities });
  }),
);

marketplaceRouter.post(
  "/rentals/listings/:id/moderate",
  asyncHandler((req, res) => {
    const body = validate(
      z.object({ action: z.enum(["approve", "pause", "suspend"]), reason: z.string().trim().max(300).optional() }),
      req.body,
    );
    const updated = mutate((db) => {
      const listing = db.listings.find((entry) => entry.id === req.params.id);
      if (!listing) throw new ApiError(404, "listing_not_found", "That rental listing does not exist.");
      if (body.action !== "approve" && !body.reason) {
        throw new ApiError(422, "reason_required", "Add a moderation reason.", { reason: "A reason is required." });
      }
      listing.status = body.action === "approve" ? "approved" : body.action === "pause" ? "paused" : "suspended";
      listing.moderationReason = body.action === "approve" ? undefined : body.reason;
      if (body.action === "approve") listing.approvedAt = new Date().toISOString();
      logAudit(db, req.user ?? null, `rental.listing.${body.action}`, "rental_listing", listing.id, `${listing.title} — ${body.reason ?? "approved"}`);
      return listing;
    });
    res.json(updated);
  }),
);

/* ---------------- Bookings ---------------- */

marketplaceRouter.get(
  "/rentals/bookings",
  asyncHandler((req, res) => {
    const status = String(req.query.status ?? "");
    const state = String(req.query.state ?? "");
    const from = req.query.dateFrom ? startOfDay(String(req.query.dateFrom)) : null;
    const to = req.query.dateTo ? endOfDay(String(req.query.dateTo)) : null;
    const sellerId = String(req.query.sellerId ?? "");
    const renterId = String(req.query.renterId ?? "");
    const q = String(req.query.q ?? "").trim().toLowerCase();
    const items = getDb()
      .bookings.filter((booking) => {
        if (status && booking.state !== status) return false;
        if (state && booking.listingState !== state) return false;
        if (sellerId && booking.sellerId !== sellerId) return false;
        if (renterId && booking.renterId !== renterId) return false;
        if (from && new Date(booking.endDate) < from) return false;
        if (to && new Date(booking.startDate) > to) return false;
        if (!q) return true;
        return [booking.number, booking.renterName, booking.listingTitle, booking.ownerName]
          .join(" ")
          .toLowerCase()
          .includes(q);
      })
      .sort((a, b) => a.startDate.localeCompare(b.startDate))
      .map(bookingFor);
    res.json({ data: items, total: items.length });
  }),
);

marketplaceRouter.get(
  "/rentals/bookings/:id",
  asyncHandler((req, res) => {
    const booking = getDb().bookings.find((entry) => entry.id === req.params.id);
    if (!booking) throw new ApiError(404, "booking_not_found", "That booking does not exist.");
    res.json(bookingFor(booking));
  }),
);

marketplaceRouter.post(
  "/rentals/bookings/:id/transition",
  asyncHandler((req, res) => {
    const body = validate(
      z.object({ to: z.enum(BOOKING_STATES as [BookingState, ...BookingState[]]), note: z.string().trim().max(300).optional() }),
      req.body,
    );
    const updated = mutate((db) => {
      const booking = db.bookings.find((entry) => entry.id === req.params.id);
      if (!booking) throw new ApiError(404, "booking_not_found", "That booking does not exist.");
      const allowed = ALLOWED_TRANSITIONS[booking.state];
      if (!allowed.includes(body.to)) {
        throw new ApiError(
          409,
          "invalid_transition",
          `A booking in ${booking.state.replace(/_/g, " ")} can only move to ${allowed.join(", ") || "nothing"}.`,
        );
      }
      booking.state = body.to;
      booking.allowedTransitions = ALLOWED_TRANSITIONS[body.to];
      booking.timeline.push({
        at: new Date().toISOString(),
        label: body.to.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()),
        detail: body.note || `State moved from ${booking.state.replace(/_/g, " ")} to ${body.to.replace(/_/g, " ")}.`,
        actor: req.user?.name ?? "System",
      });
      if (body.to === "deposit_authorized" && booking.depositState === "none") booking.depositState = "authorized";
      if (body.to === "completed" && booking.depositState === "authorized") {
        booking.depositState = "released";
        booking.depositReleased = booking.deposit;
      }
      logAudit(db, req.user ?? null, "rental.booking.transition", "booking", booking.id, `${booking.number}: → ${body.to}`);
      return bookingFor(booking);
    });
    res.json(updated);
  }),
);

marketplaceRouter.post(
  "/rentals/bookings/:id/notes",
  asyncHandler((req, res) => {
    const body = validate(z.object({ body: z.string().trim().min(3).max(500) }), req.body);
    const updated = mutate((db) => {
      const booking = db.bookings.find((entry) => entry.id === req.params.id);
      if (!booking) throw new ApiError(404, "booking_not_found", "That booking does not exist.");
      booking.notes.push({
        id: `note_${Date.now()}`,
        author: req.user?.name ?? "Operations",
        at: new Date().toISOString(),
        body: body.body,
      });
      logAudit(db, req.user ?? null, "rental.booking.note", "booking", booking.id, `${booking.number}: ${body.body.slice(0, 80)}`);
      return bookingFor(booking);
    });
    res.json(updated);
  }),
);

/* ---------------- Calendar ---------------- */

marketplaceRouter.get(
  "/rentals/calendar",
  asyncHandler((req, res) => {
    const now = new Date();
    const defaultFrom = new Date(now.getFullYear(), now.getMonth(), 1);
    const defaultTo = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const from = req.query.from ? startOfDay(String(req.query.from)) : defaultFrom;
    const to = req.query.to ? endOfDay(String(req.query.to)) : defaultTo;
    const listingId = String(req.query.listingId ?? "");
    const db = getDb();
    const bookings = db.bookings
      .filter((booking) => (listingId ? booking.listingId === listingId : true))
      .filter((booking) => new Date(booking.endDate) >= from && new Date(booking.startDate) <= to)
      .map(bookingFor);
    const blackouts = db.blackouts.filter((blackout) => (listingId ? blackout.listingId === listingId : true));
    res.json({
      from: isoDay(from),
      to: isoDay(to),
      bookings,
      blackouts,
      listings: db.listings.map((listing) => ({ id: listing.id, title: listing.title, city: listing.city })),
    });
  }),
);

/* ---------------- Deposits ---------------- */

marketplaceRouter.get(
  "/rentals/deposits",
  asyncHandler((req, res) => {
    const state = String(req.query.state ?? "");
    const now = Date.now();
    const rows: DepositRow[] = getDb()
      .bookings.filter((booking) => booking.depositState !== "none" && (state ? booking.depositState === state : true))
      .map((booking) => {
        const authorizedAt = booking.createdAt;
        const ageDays = Math.max(0, Math.floor((now - new Date(authorizedAt).getTime()) / 86400000));
        const expiresAt = new Date(new Date(authorizedAt).getTime() + 21 * 86400000).toISOString();
        const daysToExpiry = Math.ceil((new Date(expiresAt).getTime() - now) / 86400000);
        return {
          bookingId: booking.id,
          number: booking.number,
          renterName: booking.renterName,
          listingTitle: booking.listingTitle,
          amount: booking.deposit,
          state: booking.depositState,
          authorizedAt,
          expiresAt,
          ageDays,
          daysToExpiry,
          sellerName: booking.ownerName,
        };
      })
      .sort((a, b) => a.daysToExpiry - b.daysToExpiry);
    res.json({ data: rows });
  }),
);

marketplaceRouter.post(
  "/rentals/bookings/:id/deposit/capture",
  moneyRole,
  asyncHandler((req, res) => {
    const body = validate(z.object({ amount: z.number().positive(), reason: z.string().trim().min(4) }), req.body);
    const updated = mutate((db) => {
      const booking = db.bookings.find((entry) => entry.id === req.params.id);
      if (!booking) throw new ApiError(404, "booking_not_found", "That booking does not exist.");
      if (booking.depositState !== "authorized") throw new ApiError(409, "no_hold", "Only authorized deposits can be captured.");
      if (body.amount > booking.deposit) throw new ApiError(422, "amount_too_high", "Capture cannot exceed the held deposit.", { amount: "Too high." });
      booking.depositState = "captured";
      booking.depositCaptured = body.amount;
      booking.depositReason = body.reason;
      booking.timeline.push({
        at: new Date().toISOString(),
        label: "Deposit captured",
        detail: `${body.reason} · $${body.amount}`,
        actor: req.user?.name ?? "System",
      });
      logAudit(db, req.user ?? null, "rental.deposit.capture", "booking", booking.id, `${booking.number} captured $${body.amount} — ${body.reason}`);
      return bookingFor(booking);
    });
    res.json(updated);
  }),
);

marketplaceRouter.post(
  "/rentals/bookings/:id/deposit/release",
  moneyRole,
  asyncHandler((req, res) => {
    const body = validate(z.object({ reason: z.string().trim().max(200).optional() }), req.body ?? {});
    const updated = mutate((db) => {
      const booking = db.bookings.find((entry) => entry.id === req.params.id);
      if (!booking) throw new ApiError(404, "booking_not_found", "That booking does not exist.");
      if (booking.depositState !== "authorized") throw new ApiError(409, "no_hold", "Only authorized deposits can be released.");
      booking.depositState = "released";
      booking.depositReleased = booking.deposit;
      booking.depositReason = body.reason;
      booking.timeline.push({
        at: new Date().toISOString(),
        label: "Deposit released",
        detail: body.reason || "Deposit returned to the renter in full.",
        actor: req.user?.name ?? "System",
      });
      logAudit(db, req.user ?? null, "rental.deposit.release", "booking", booking.id, `${booking.number} released $${booking.deposit}`);
      return bookingFor(booking);
    });
    res.json(updated);
  }),
);

marketplaceRouter.post(
  "/rentals/bookings/:id/remind",
  asyncHandler((req, res) => {
    const updated = mutate((db) => {
      const booking = db.bookings.find((entry) => entry.id === req.params.id);
      if (!booking) throw new ApiError(404, "booking_not_found", "That booking does not exist.");
      booking.timeline.push({
        at: new Date().toISOString(),
        label: "Return reminder sent",
        detail: "Email and SMS reminder queued to the renter with the return label.",
        actor: req.user?.name ?? "System",
      });
      logAudit(db, req.user ?? null, "rental.booking.remind", "booking", booking.id, `${booking.number} reminder sent to ${booking.renterName}`);
      return bookingFor(booking);
    });
    res.json(updated);
  }),
);

/* ---------------- Overdue + disputes ---------------- */

marketplaceRouter.get(
  "/rentals/overdue",
  asyncHandler((_req, res) => {
    const now = Date.now();
    const data: OverdueBooking[] = getDb()
      .bookings.filter((booking) => booking.state === "overdue" || (booking.state === "return_due" && new Date(booking.endDate).getTime() < now))
      .map((booking) => {
        const daysLate = Math.max(1, Math.floor((now - new Date(booking.endDate).getTime()) / 86400000));
        return {
          booking: bookingFor(booking),
          daysLate,
          accruedLateFee: daysLate * Math.round(booking.items[0]?.dailyRate ? booking.items[0].dailyRate * 0.5 : 10),
          depositHeld: booking.depositState === "authorized" ? booking.deposit : 0,
        };
      })
      .sort((a, b) => b.daysLate - a.daysLate);
    res.json({ data });
  }),
);

marketplaceRouter.post(
  "/rentals/disputes",
  asyncHandler((req, res) => {
    const body = validate(z.object({ bookingId: z.string(), reason: z.string().trim().min(6).max(300) }), req.body);
    const created = mutate((db) => {
      const booking = db.bookings.find((entry) => entry.id === body.bookingId);
      if (!booking) throw new ApiError(404, "booking_not_found", "That booking does not exist.");
      if (db.disputes.some((dispute) => dispute.bookingId === booking.id && dispute.status === "open")) {
        throw new ApiError(409, "dispute_exists", "This booking already has an open dispute.");
      }
      const dispute: Dispute = {
        id: `dsp_${db.disputes.length + 1}`,
        bookingId: booking.id,
        number: booking.number,
        renterName: booking.renterName,
        ownerName: booking.ownerName,
        listingTitle: booking.listingTitle,
        reason: body.reason,
        openedAt: new Date().toISOString(),
        evidence: [booking.listingImage],
        status: "open",
      };
      db.disputes.push(dispute);
      booking.state = "disputed";
      booking.allowedTransitions = ALLOWED_TRANSITIONS.disputed;
      booking.timeline.push({
        at: new Date().toISOString(),
        label: "Dispute opened",
        detail: body.reason,
        actor: req.user?.name ?? "System",
      });
      logAudit(db, req.user ?? null, "rental.dispute.open", "booking", booking.id, `${booking.number}: ${body.reason.slice(0, 80)}`);
      return dispute;
    });
    res.json(created);
  }),
);

marketplaceRouter.get(
  "/rentals/disputes",
  asyncHandler((req, res) => {
    const status = String(req.query.status ?? "");
    const data = getDb().disputes.filter((dispute) => (status ? dispute.status === status : true));
    res.json({ data });
  }),
);

marketplaceRouter.post(
  "/rentals/disputes/:id/resolve",
  moneyRole,
  asyncHandler((req, res) => {
    const body = validate(
      z.object({
        outcome: z.enum(["renter_pays", "owner_pays", "split", "refunded"]),
        amount: z.number().min(0),
        note: z.string().trim().min(6),
      }),
      req.body,
    );
    const updated = mutate((db) => {
      const dispute = db.disputes.find((entry) => entry.id === req.params.id);
      if (!dispute) throw new ApiError(404, "dispute_not_found", "That dispute does not exist.");
      dispute.status = "resolved";
      dispute.outcome = body.outcome;
      dispute.amount = body.amount;
      dispute.note = body.note;
      dispute.resolvedAt = new Date().toISOString();
      const booking = db.bookings.find((entry) => entry.id === dispute.bookingId);
      if (booking) {
        booking.state = "completed";
        booking.allowedTransitions = ALLOWED_TRANSITIONS.completed;
        booking.timeline.push({
          at: new Date().toISOString(),
          label: "Dispute resolved",
          detail: `${body.outcome.replace(/_/g, " ")} · $${body.amount} · ${body.note}`,
          actor: req.user?.name ?? "System",
        });
      }
      logAudit(db, req.user ?? null, "rental.dispute.resolve", "dispute", dispute.id, `${body.outcome} · $${body.amount}`);
      return dispute;
    });
    res.json(updated);
  }),
);

/* ---------------- Rental analytics ---------------- */

marketplaceRouter.get(
  "/rentals/analytics",
  asyncHandler((req, res) => {
    const range = [7, 30, 90].includes(Number(req.query.range)) ? Number(req.query.range) : 30;
    const db = getDb();
    const cutoff = Date.now() - range * 86400000;
    const inRange = db.bookings.filter((booking) => new Date(booking.startDate).getTime() >= cutoff);
    const activeStates: BookingState[] = ["deposit_authorized", "dispatched", "in_use", "return_due", "overdue"];
    const rentalRevenue = inRange.filter((booking) => booking.state !== "requested").reduce((sum, booking) => sum + booking.rentalFee, 0);
    const activeBookings = db.bookings.filter((booking) => activeStates.includes(booking.state)).length;
    const depositsHeld = db.bookings.filter((booking) => booking.depositState === "authorized").reduce((sum, booking) => sum + booking.deposit, 0);
    const overdueCount = db.bookings.filter((booking) => booking.state === "overdue").length;
    const bookedDays = inRange.reduce((sum, booking) => sum + booking.days, 0);
    const capacity = db.listings.filter((listing) => listing.status === "approved").length * range;
    const utilization = capacity ? Math.round((bookedDays / capacity) * 1000) / 10 : 0;

    const buckets = 6;
    const revenueSeries = Array.from({ length: buckets }).map((_, index) => {
      const bucketMs = range / buckets;
      const bucketEnd = Date.now() - (buckets - 1 - index) * bucketMs * 86400000;
      const bucketStart = bucketEnd - bucketMs * 86400000;
      const value = db.bookings
        .filter((booking) => {
          const time = new Date(booking.startDate).getTime();
          return time >= bucketStart && time <= bucketEnd && booking.state !== "requested";
        })
        .reduce((sum, booking) => sum + booking.rentalFee, 0);
      return {
        label: new Intl.DateTimeFormat("en-US", { month: "short", day: "2-digit" }).format(new Date(bucketEnd)),
        value,
      };
    });

    const stateCounts = new Map<string, number>();
    db.bookings.forEach((booking) => stateCounts.set(booking.listingState, (stateCounts.get(booking.listingState) ?? 0) + 1));
    const stateMix = Array.from(stateCounts.entries())
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    const payload: RentalAnalytics = {
      range,
      rentalRevenue,
      activeBookings,
      utilization,
      depositsHeld,
      overdueCount,
      pendingListings: db.listings.filter((listing) => listing.status === "pending").length,
      pendingKyc: db.sellers.filter((seller) => seller.kycStatus === "pending").length,
      gmvSellers: db.sellers.reduce((sum, seller) => sum + seller.gmv, 0),
      revenueSeries,
      stateMix,
    };
    res.json(payload);
  }),
);
