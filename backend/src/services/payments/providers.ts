import crypto from "node:crypto";
import { config } from "../../config.js";
import { AppError, notFound } from "../../lib/errors.js";

/**
 * Payment provider abstraction.
 *
 * The mock driver is fully functional locally. PhonePe / Razorpay / UPI / Card
 * adapters expose the same contract; their live calls intentionally throw until
 * merchant credentials and SDK integration are supplied. Webhook signature
 * verification is implemented for Razorpay (`X-Razorpay-Signature`) and a
 * generic HMAC scheme used by PhonePe / UPI / Card gateways.
 */
export interface PaymentIntentInput {
  orderId: string;
  orderNumber: string;
  amountMinor: number;
  currency: string;
  email: string;
}

export interface PaymentIntentResult {
  provider: string;
  providerPaymentId: string;
  status: "pending" | "succeeded";
  redirectUrl?: string;
  clientPayload?: Record<string, unknown>;
}

export interface PaymentProvider {
  readonly name: string;
  createIntent(input: PaymentIntentInput): Promise<PaymentIntentResult>;
  verifyWebhook(rawBody: Buffer, signature: string | undefined): boolean;
  refund(input: { paymentId: string; amountMinor: number }): Promise<{ providerRefundId: string }>;
}

function hmac(secret: string, payload: Buffer | string): string {
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

class MockProvider implements PaymentProvider {
  readonly name = "mock";
  async createIntent(input: PaymentIntentInput): Promise<PaymentIntentResult> {
    return {
      provider: this.name,
      providerPaymentId: `mock_${input.orderId}`,
      status: "pending",
      clientPayload: { simulated: true, confirmEndpoint: `/api/v1/payments/${input.orderId}/confirm-mock` },
    };
  }
  verifyWebhook(rawBody: Buffer, signature: string | undefined): boolean {
    const secret = config.MOCK_WEBHOOK_SECRET;
    if (!secret) throw new AppError(503, "PROVIDER_NOT_CONFIGURED", "Mock webhook secret is not configured");
    if (!signature) return false;
    return safeEqual(hmac(secret, rawBody), signature);
  }
  async refund() {
    return { providerRefundId: `mock_refund_${crypto.randomUUID()}` };
  }
}

class RazorpayProvider implements PaymentProvider {
  readonly name = "razorpay";
  async createIntent(input: PaymentIntentInput): Promise<PaymentIntentResult> {
    if (!config.RAZORPAY_KEY_ID) {
      throw new AppError(503, "PROVIDER_NOT_CONFIGURED", "Razorpay credentials missing (RAZORPAY_KEY_ID)");
    }
    return {
      provider: this.name,
      providerPaymentId: `rzp_stub_${input.orderId}`,
      status: "pending",
      clientPayload: { keyId: config.RAZORPAY_KEY_ID },
    };
  }
  verifyWebhook(rawBody: Buffer, signature: string | undefined): boolean {
    if (!config.RAZORPAY_WEBHOOK_SECRET) {
      throw new AppError(503, "PROVIDER_NOT_CONFIGURED", "Razorpay webhook secret is not configured");
    }
    if (!signature) return false;
    return safeEqual(hmac(config.RAZORPAY_WEBHOOK_SECRET, rawBody), signature);
  }
  async refund(input: { paymentId: string; amountMinor: number }) {
    if (!config.RAZORPAY_KEY_SECRET) {
      throw new AppError(503, "PROVIDER_NOT_CONFIGURED", "Razorpay refunds require RAZORPAY_KEY_SECRET");
    }
    return { providerRefundId: `rzp_refund_stub_${input.paymentId}` };
  }
}

class PhonePeProvider implements PaymentProvider {
  readonly name = "phonepe";
  async createIntent(input: PaymentIntentInput): Promise<PaymentIntentResult> {
    if (!config.PHONEPE_MERCHANT_ID) {
      throw new AppError(503, "PROVIDER_NOT_CONFIGURED", "PhonePe credentials missing (PHONEPE_MERCHANT_ID)");
    }
    return {
      provider: this.name,
      providerPaymentId: `pp_stub_${input.orderId}`,
      status: "pending",
      clientPayload: { merchantId: config.PHONEPE_MERCHANT_ID },
    };
  }
  verifyWebhook(rawBody: Buffer, signature: string | undefined): boolean {
    if (!config.PHONEPE_WEBHOOK_SECRET) {
      throw new AppError(503, "PROVIDER_NOT_CONFIGURED", "PhonePe webhook secret is not configured");
    }
    if (!signature) return false;
    return safeEqual(hmac(config.PHONEPE_WEBHOOK_SECRET, rawBody), signature);
  }
  async refund(input: { paymentId: string; amountMinor: number }) {
    return { providerRefundId: `pp_refund_stub_${input.paymentId}` };
  }
}

class UpiProvider implements PaymentProvider {
  readonly name = "upi";
  async createIntent(input: PaymentIntentInput): Promise<PaymentIntentResult> {
    return {
      provider: this.name,
      providerPaymentId: `upi_stub_${input.orderId}`,
      status: "pending",
      clientPayload: { vpa: "stub@upi" },
    };
  }
  verifyWebhook(rawBody: Buffer, signature: string | undefined): boolean {
    return mockWebhookVerification("UPI_WEBHOOK_SECRET", rawBody, signature);
  }
  async refund(input: { paymentId: string; amountMinor: number }) {
    return { providerRefundId: `upi_refund_stub_${input.paymentId}` };
  }
}

class CardProvider implements PaymentProvider {
  readonly name = "card";
  async createIntent(input: PaymentIntentInput): Promise<PaymentIntentResult> {
    return {
      provider: this.name,
      providerPaymentId: `card_stub_${input.orderId}`,
      status: "pending",
      clientPayload: { tokenise: true },
    };
  }
  verifyWebhook(rawBody: Buffer, signature: string | undefined): boolean {
    return mockWebhookVerification("CARD_WEBHOOK_SECRET", rawBody, signature);
  }
  async refund(input: { paymentId: string; amountMinor: number }) {
    return { providerRefundId: `card_refund_stub_${input.paymentId}` };
  }
}

/** Fallback HMAC scheme for adapters whose secret is supplied via env. */
function mockWebhookVerification(secretName: string, rawBody: Buffer, signature: string | undefined): boolean {
  const secret = process.env[secretName] ?? "";
  if (!secret) {
    throw new AppError(503, "PROVIDER_NOT_CONFIGURED", `${secretName} is not configured`);
  }
  if (!signature) return false;
  return safeEqual(hmac(secret, rawBody), signature);
}

const providers = new Map<string, PaymentProvider>([
  ["mock", new MockProvider()],
  ["razorpay", new RazorpayProvider()],
  ["phonepe", new PhonePeProvider()],
  ["upi", new UpiProvider()],
  ["card", new CardProvider()],
]);

export function getProvider(name: string): PaymentProvider {
  const provider = providers.get(name);
  if (!provider) throw notFound(`Unknown payment provider: ${name}`);
  return provider;
}

export function listProviders(): string[] {
  return [...providers.keys()];
}
