import type { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { AppError, badRequest, conflict, notFound } from "../lib/errors.js";
import { getProvider, type PaymentProvider } from "./payments/providers.js";
import { getOrderView, settlePaidOrder } from "./orders.js";
import { recordAudit } from "../lib/audit.js";
import { newId } from "../lib/constants.js";
import type { Actor } from "../lib/guards.js";

export interface PaymentWebhookEvent {
  eventId: string;
  type: "payment.succeeded" | "payment.failed" | "refund.succeeded";
  paymentId?: string;
  providerPaymentId?: string;
  orderId?: string;
  amountMinor?: number;
  reason?: string;
}

/** Create a provider intent for a pending order (idempotent per provider). */
export async function createPaymentIntent(input: {
  orderId: string;
  provider: string;
  email?: string;
  actor: Actor | null;
}) {
  const provider: PaymentProvider = getProvider(input.provider);
  const order = await prisma.order.findUnique({
    where: { id: input.orderId },
    include: { payments: true },
  });
  if (!order) throw notFound("Order not found");
  if (input.email && order.email.toLowerCase() !== input.email.toLowerCase()) throw notFound("Order not found");
  if (order.status !== "pending") throw conflict("Order is not awaiting payment", { status: order.status });
  if (provider.name !== "mock" && order.paymentMethod !== provider.name) {
    throw badRequest(`Order was created for ${order.paymentMethod}, not ${provider.name}`);
  }

  const existing = order.payments.find(
    (payment) => payment.provider === provider.name && payment.status === "pending",
  );
  if (existing) {
    return { payment: existing, order: await getOrderView(order.id) };
  }

  const intent = await provider.createIntent({
    orderId: order.id,
    orderNumber: order.orderNumber,
    amountMinor: order.totalMinor,
    currency: order.currency,
    email: order.email,
  });

  const payment = await prisma.payment.create({
    data: {
      orderId: order.id,
      provider: provider.name,
      providerPaymentId: intent.providerPaymentId,
      amountMinor: order.totalMinor,
      currency: order.currency,
      status: intent.status === "succeeded" ? "succeeded" : "pending",
      idempotencyKey: `intent:${order.id}:${provider.name}:${intent.providerPaymentId}`,
      rawPayload: JSON.stringify(intent.clientPayload ?? {}),
    },
  });

  return { payment, order: await getOrderView(order.id), intent };
}

/** Fully local mock confirmation. Idempotent: repeated calls return the order. */
export async function confirmMockPayment(input: {
  paymentId: string;
  actor: Actor | null;
}) {
  const payment = await prisma.payment.findUnique({
    where: { id: input.paymentId },
    include: { order: { include: { payments: true } } },
  });
  if (!payment) throw notFound("Payment not found");
  if (payment.provider !== "mock") throw badRequest("Only the mock provider can be confirmed locally");
  if (payment.status === "succeeded") {
    return { order: await getOrderView(payment.orderId), alreadyProcessed: true };
  }
  if (payment.order.status !== "pending") {
    throw conflict("Order is not awaiting payment", { status: payment.order.status });
  }

  await prisma.$transaction(async (tx) => {
    await tx.payment.update({
      where: { id: payment.id },
      data: { status: "succeeded", succeededAt: new Date(), signatureValid: true },
    });
    await settlePaidOrder(tx, payment.orderId, {
      actorId: input.actor?.id ?? null,
      paymentId: payment.id,
      note: "Mock payment confirmed",
    });
  });

  await recordAudit({
    actor: input.actor,
    action: "payment.mock.confirm",
    entityType: "payment",
    entityId: payment.id,
    before: { status: payment.status },
    after: { status: "succeeded", orderId: payment.orderId },
  });

  return { order: await getOrderView(payment.orderId), alreadyProcessed: false };
}

/**
 * Signed webhook processing with provider-level idempotency. The unique
 * (provider, eventId) row guarantees an event is applied at most once.
 */
export async function processWebhook(input: {
  provider: string;
  rawBody: Buffer;
  signature: string | undefined;
  event: PaymentWebhookEvent;
}) {
  const provider = getProvider(input.provider);
  const signatureValid = provider.verifyWebhook(input.rawBody, input.signature);
  if (!signatureValid) {
    throw new AppError(401, "INVALID_SIGNATURE", "Webhook signature verification failed");
  }

  const already = await prisma.webhookEvent.findUnique({
    where: { provider_eventId: { provider: provider.name, eventId: input.event.eventId } },
  });
  if (already) return { duplicate: true, eventId: input.event.eventId };

  let paymentId: string | null = null;
  let duplicate = false;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.webhookEvent.create({
        data: {
          provider: provider.name,
          eventId: input.event.eventId,
          eventType: input.event.type,
          payload: input.rawBody.toString("utf8"),
        },
      });

      const payment = await findPayment(tx, provider.name, input.event);
      if (!payment) throw notFound("Payment referenced by webhook was not found");
      paymentId = payment.id;

      if (input.event.type === "payment.succeeded") {
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: "succeeded",
            signatureValid: true,
            signature: input.signature ?? null,
            rawPayload: input.rawBody.toString("utf8"),
            succeededAt: new Date(),
          },
        });
        await settlePaidOrder(tx, payment.orderId, {
          paymentId: payment.id,
          note: `Webhook ${input.event.eventId}`,
        });
      } else if (input.event.type === "payment.failed") {
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: "failed",
            failureReason: input.event.reason ?? "Provider declined",
            signatureValid: true,
            signature: input.signature ?? null,
            rawPayload: input.rawBody.toString("utf8"),
          },
        });
        await tx.order.update({
          where: { id: payment.orderId },
          data: { paymentStatus: "failed" },
        });
      } else if (input.event.type === "refund.succeeded") {
        const refund = await tx.refund.findFirst({
          where: { paymentId: payment.id, status: "pending" },
          orderBy: { createdAt: "desc" },
        });
        if (refund) {
          await tx.refund.update({
            where: { id: refund.id },
            data: {
              status: "succeeded",
              providerRefundId: `wh_refund_${newId("rf")}`,
              processedAt: new Date(),
            },
          });
        }
      }
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      duplicate = true;
    } else {
      throw error;
    }
  }

  await recordAudit({
    actor: null,
    action: `webhook.${input.event.type}`,
    entityType: "payment",
    entityId: paymentId,
    after: { provider: provider.name, eventId: input.event.eventId },
  });

  return { duplicate, eventId: input.event.eventId, paymentId };
}

async function findPayment(
  tx: Prisma.TransactionClient,
  providerName: string,
  event: PaymentWebhookEvent,
) {
  if (event.paymentId) {
    return tx.payment.findFirst({ where: { id: event.paymentId, provider: providerName } });
  }
  if (event.providerPaymentId) {
    return tx.payment.findFirst({
      where: { providerPaymentId: event.providerPaymentId, provider: providerName },
    });
  }
  if (event.orderId) {
    return tx.payment.findFirst({
      where: { orderId: event.orderId, provider: providerName, status: { in: ["pending", "processing"] } },
      orderBy: { createdAt: "desc" },
    });
  }
  return null;
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}
