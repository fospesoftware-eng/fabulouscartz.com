import type { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import { config } from "../config.js";

export interface NotificationInput {
  channel?: "email" | "sms";
  template: string;
  toAddress: string;
  subject?: string;
  payload?: Record<string, unknown>;
}

/** Outbox write used inside business transactions. */
export async function enqueueNotification(
  input: NotificationInput,
  client: Prisma.TransactionClient | typeof prisma = prisma,
): Promise<void> {
  await client.notification.create({
    data: {
      channel: input.channel ?? "email",
      template: input.template,
      toAddress: input.toAddress,
      subject: input.subject ?? null,
      payload: JSON.stringify(input.payload ?? {}),
    },
  });
}

export interface NotificationDriver {
  send(message: { channel: string; to: string; subject?: string; body: string }): Promise<{ id: string }>;
}

/** Local dev driver: logs instead of calling an SMTP/SMS gateway. */
export const mockDriver: NotificationDriver = {
  async send(message) {
    // eslint-disable-next-line no-console
    console.log(
      `[notifications:mock] ${message.channel} -> ${message.to} :: ${message.subject ?? "(no subject)"}\n${message.body}`,
    );
    return { id: `mock_${Date.now()}` };
  },
};

export function getDriver(): NotificationDriver {
  switch (config.NOTIFICATION_DRIVER) {
    case "mock":
    default:
      return mockDriver;
  }
}

/**
 * Drain pending outbox rows. In production this is a worker; for local dev it
 * can be triggered by an admin endpoint.
 */
export async function dispatchPending(limit = 50): Promise<{ processed: number; failed: number }> {
  const driver = getDriver();
  const pending = await prisma.notification.findMany({
    where: { status: "pending" },
    orderBy: { createdAt: "asc" },
    take: limit,
  });

  let processed = 0;
  let failed = 0;
  for (const row of pending) {
    try {
      await driver.send({
        channel: row.channel,
        to: row.toAddress,
        subject: row.subject ?? undefined,
        body: row.payload,
      });
      await prisma.notification.update({
        where: { id: row.id },
        data: { status: "sent", sentAt: new Date(), attempts: { increment: 1 }, lastError: null },
      });
      processed += 1;
    } catch (error) {
      failed += 1;
      await prisma.notification.update({
        where: { id: row.id },
        data: {
          status: "failed",
          attempts: { increment: 1 },
          lastError: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }
  return { processed, failed };
}
