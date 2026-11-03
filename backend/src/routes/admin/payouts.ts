import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../../db.js";
import { parse } from "../../lib/validate.js";
import { conflict, notFound } from "../../lib/errors.js";
import { pageArgs, pageSchema, paginated } from "../../lib/pagination.js";
import { recordAudit } from "../../lib/audit.js";
import { PAYOUT_STATUSES } from "../../lib/constants.js";
import { staffActor } from "./catalog.js";
import { createPayout, getSeller, previewPayout } from "../../services/sellers.js";

const payoutListSchema = pageSchema.extend({
  sellerId: z.string().optional(),
  status: z.enum(PAYOUT_STATUSES).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

const generateSchema = z.object({
  sellerId: z.string().min(1),
  periodStart: z.coerce.date(),
  periodEnd: z.coerce.date(),
  note: z.string().max(300).optional(),
});

const statusSchema = z.object({
  status: z.enum(["processing", "paid", "failed"]),
  reference: z.string().max(120).optional(),
  note: z.string().max(300).optional(),
});

export async function adminPayoutRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/payouts",
    { schema: { tags: ["Admin · Payouts"], summary: "List seller payouts" } },
    async (request, reply) => {
      await staffActor(request, ["admin", "manager"]);
      const query = parse(payoutListSchema, request.query);
      const where: Record<string, unknown> = {};
      if (query.sellerId) where.sellerId = query.sellerId;
      if (query.status) where.status = query.status;
      if (query.from || query.to) {
        where.periodEnd = {
          ...(query.from ? { gte: query.from } : {}),
          ...(query.to ? { lte: query.to } : {}),
        };
      }
      const { skip, take, page, pageSize } = pageArgs(query);
      const [total, payouts] = await Promise.all([
        prisma.payout.count({ where: where as never }),
        prisma.payout.findMany({
          where: where as never,
          include: { seller: { select: { id: true, storeName: true, slug: true, commissionRateBps: true } } },
          orderBy: [{ periodEnd: "desc" }, { createdAt: "desc" }],
          skip,
          take,
        }),
      ]);
      return reply.send(paginated(payouts, total, page, pageSize));
    },
  );

  app.get(
    "/payouts/:id",
    { schema: { tags: ["Admin · Payouts"], summary: "Payout detail with ledger entries" } },
    async (request, reply) => {
      await staffActor(request, ["admin", "manager"]);
      const { id } = parse(z.object({ id: z.string().min(1) }), request.params);
      const payout = await prisma.payout.findUnique({
        where: { id },
        include: {
          seller: { select: { id: true, storeName: true, slug: true, commissionRateBps: true, payoutMethod: true, payoutDetailsMasked: true, payoutVerificationStatus: true } },
          entries: { orderBy: { occurredAt: "asc" } },
        },
      });
      if (!payout) throw notFound("Payout not found");
      return reply.send({ data: payout });
    },
  );

  app.post(
    "/payouts",
    { schema: { tags: ["Admin · Payouts"], summary: "Generate a payout from unpaid commission ledger entries" } },
    async (request, reply) => {
      const actor = await staffActor(request, ["admin", "manager"]);
      const input = parse(generateSchema, request.body);
      if (input.periodEnd < input.periodStart) throw conflict("periodEnd must be after periodStart");
      await getSeller(input.sellerId);
      const result = await createPayout({
        sellerId: input.sellerId,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        actorId: actor.id,
        note: input.note,
      });
      await recordAudit({
        actor,
        action: "payout.created",
        entityType: "payout",
        entityId: result.payout.id,
        after: {
          sellerId: input.sellerId,
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
          netMinor: result.payout.netMinor,
        },
      });
      return reply.status(201).send({ data: result.payout });
    },
  );

  app.post(
    "/payouts/:id/mark-paid",
    { schema: { tags: ["Admin · Payouts"], summary: "Mark a payout paid with a payment reference" } },
    async (request, reply) => {
      const actor = await staffActor(request, ["admin", "manager"]);
      const { id } = parse(z.object({ id: z.string().min(1) }), request.params);
      const input = parse(z.object({ reference: z.string().min(1).max(120), note: z.string().max(300).optional() }), request.body);
      const payout = await prisma.payout.findUnique({ where: { id } });
      if (!payout) throw notFound("Payout not found");
      if (!["pending", "processing"].includes(payout.status)) {
        throw conflict("Only pending or processing payouts can be marked paid", { status: payout.status });
      }
      const updated = await prisma.payout.update({
        where: { id },
        data: { status: "paid", reference: input.reference, note: input.note ?? payout.note, paidAt: new Date() },
      });
      await recordAudit({
        actor,
        action: "payout.mark_paid",
        entityType: "payout",
        entityId: payout.id,
        before: { status: payout.status, reference: payout.reference },
        after: { status: "paid", reference: input.reference, netMinor: payout.netMinor },
      });
      return reply.send({ data: updated });
    },
  );

  app.post(
    "/payouts/:id/status",
    { schema: { tags: ["Admin · Payouts"], summary: "Move a payout through pending → processing → paid → failed" } },
    async (request, reply) => {
      const actor = await staffActor(request, ["admin", "manager"]);
      const { id } = parse(z.object({ id: z.string().min(1) }), request.params);
      const input = parse(statusSchema, request.body);
      const payout = await prisma.payout.findUnique({ where: { id } });
      if (!payout) throw notFound("Payout not found");
      const legal: Record<string, string[]> = {
        pending: ["processing", "paid", "failed"],
        processing: ["paid", "failed"],
        paid: [],
        failed: ["pending", "processing"],
      };
      if (!legal[payout.status]?.includes(input.status)) {
        throw conflict(`Illegal payout transition ${payout.status} -> ${input.status}`, { allowed: legal[payout.status] ?? [] });
      }
      const updated = await prisma.payout.update({
        where: { id },
        data: {
          status: input.status,
          reference: input.reference ?? payout.reference,
          note: input.note ?? payout.note,
          paidAt: input.status === "paid" ? new Date() : null,
        },
      });
      await recordAudit({
        actor,
        action: `payout.status.${input.status}`,
        entityType: "payout",
        entityId: payout.id,
        before: { status: payout.status },
        after: { status: input.status, reference: input.reference },
      });
      return reply.send({ data: updated });
    },
  );

  app.get(
    "/payouts/preview/:sellerId",
    { schema: { tags: ["Admin · Payouts"], summary: "Alias: preview a seller's next payout" } },
    async (request, reply) => {
      await staffActor(request, ["admin", "manager"]);
      const { sellerId } = parse(z.object({ sellerId: z.string().min(1) }), request.params);
      await getSeller(sellerId);
      return reply.send({ data: await previewPayout(sellerId) });
    },
  );
}
