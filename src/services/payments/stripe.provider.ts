import Stripe from "stripe";
import { PaymentStatus } from "../../models/payment.model";
import { logger } from "../../utils/logger";
import { env } from "../../config/env";
import {
  CreateIntentParams,
  CreateIntentResult,
  PaymentProvider,
  StatusResult,
} from "./payment.provider";
import { Request } from "express";

/**
 * STRIPE PAYMENT PROVIDER - WEBHOOK SECURITY & IMPLEMENTATION
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WEBHOOK SIGNATURE VERIFICATION (Core Security)
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Stripe uses HMAC-SHA256 to sign every webhook:
 *
 * SIGNATURE GENERATION (Stripe Side):
 * ─────────────────────────────────
 * 1. Stripe has your webhook secret: whsec_test_xxxxx (from dashboard)
 * 2. For each webhook, Stripe creates signing string: "{timestamp}.{body}"
 * 3. Computes HMAC: hash = HMAC-SHA256(signing_string, webhook_secret)
 * 4. Adds header: Stripe-Signature: t={timestamp},v1={hash}
 * 5. Sends webhook to your endpoint
 *
 * SIGNATURE VERIFICATION (Our Side):
 * ─────────────────────────────────
 * 1. We receive webhook request with Stripe-Signature header
 * 2. Extract timestamp and hash from header
 * 3. Recompute hash: hash = HMAC-SHA256(signing_string, our_webhook_secret)
 * 4. Compare: recomputed_hash === provided_hash (using timing-safe comparison)
 * 5. If match: Webhook is authentic
 *    If mismatch: Webhook is fake or modified
 *
 * WHY STRIPE SDK?
 * ────────────────
 * ✅ Uses timing-safe comparison (prevents timing attacks)
 * ✅ Handles body format variations
 * ✅ Verified by Stripe engineers (cryptography is hard)
 * ❌ Never implement HMAC verification yourself (easy to get wrong)
 *
 * CRITICAL REQUIREMENT: req.body MUST BE RAW BUFFER
 * ──────────────────────────────────────────────
 * const app = express();
 * app.post('/webhook', express.raw({ type: 'application/json' }), handler);
 *         ⬆️ MUST use express.raw(), NOT express.json()
 *
 * Why? Signature is computed on exact raw bytes:
 * - express.json() parses and re-stringifies
 * - Whitespace changes = hash changes
 * - Signature verification fails even though webhook is authentic
 *
 * THREAT MODEL & PREVENTION:
 * ──────────────────────────
 *
 * Threat 1: Attacker sends crafted webhook
 * ─────────
 * Attack:   POST /webhook { "amount": "0.01", "status": "succeeded" }
 * Prevention: Signature verification fails (attacker doesn't know secret)
 * Result: ✅ Webhook rejected (400 or 401 error)
 *
 * Threat 2: Man-in-the-middle modifies webhook
 * ─────────
 * Attack:   Network attacker intercepts webhook, changes amount 100 → 1
 * Prevention: Signature invalid (hash changes with data modification)
 * Result: ✅ Webhook rejected
 *
 * Threat 3: Timing attack to guess signature
 * ─────────
 * Attack:   Attacker sends many requests, times responses
 *           If hash starts with correct byte, response is 1ns slower
 *           Attacker deduces correct hash bit-by-bit
 * Prevention: Timing-safe comparison (always takes same time)
 * Result: ✅ Attack requires billions of guesses (infeasible)
 *
 * Threat 4: Webhook from wrong Stripe account
 * ─────────
 * Attack:   Attacker's Stripe account sends webhook with their secret
 * Prevention: We verify against OUR webhook secret (from dashboard)
 * Result: ✅ Signature fails, webhook rejected
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * IMPLEMENTATION DETAILS
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * Stripe Payment Provider Implementation
 *
 * SETUP REQUIREMENTS:
 * - Environment variable: STRIPE_SECRET_KEY (from Stripe dashboard)
 * - Environment variable: STRIPE_WEBHOOK_SECRET (from Webhook settings)
 * - Webhook endpoint: POST /api/payments/webhook
 * - Webhook events subscribed: checkout.session.completed, payment_intent.succeeded, etc.
 *
 * TESTING:
 * - Use Stripe test keys (sk_test_..., whsec_test_...)
 * - Use Stripe CLI: stripe listen --forward-to localhost:5000/webhook
 * - Trigger events: stripe trigger payment_intent.succeeded
 *
 * PRODUCTION:
 * - Use Stripe live keys (sk_live_..., whsec_... live prefix)
 * - Webhook endpoint must be publicly accessible (https)
 * - Monitor webhook failures in Stripe dashboard
 * - Set up retry for failed webhooks
 */
export class StripeProvider implements PaymentProvider {
  name = "stripe";
  private stripe: Stripe;

  private static trimTrailingSlash(value: string): string {
    return value.endsWith("/") ? value.slice(0, -1) : value;
  }

  private resolveClientUrl(): string {
    // 1) Explicit app config (preferred)
    if (env.CLIENT_URL) {
      return StripeProvider.trimTrailingSlash(env.CLIENT_URL);
    }

    // 2) Render full external URL (preferred Render source)
    if (process.env.RENDER_EXTERNAL_URL) {
      try {
        return new URL(process.env.RENDER_EXTERNAL_URL).origin;
      } catch {
        logger.warn(
          { renderExternalUrl: process.env.RENDER_EXTERNAL_URL },
          "Invalid RENDER_EXTERNAL_URL; falling back",
        );
      }
    }

    // 3) Render service name fallback if available
    if (process.env.RENDER && process.env.RENDER_SERVICE_NAME) {
      return `https://${process.env.RENDER_SERVICE_NAME}.onrender.com`;
    }

    // 4) In production we should never redirect users to localhost
    if (env.NODE_ENV === "production") {
      throw new Error(
        "CLIENT_URL is required in production when creating Stripe checkout URLs",
      );
    }

    // 5) Local development fallback
    return "http://localhost:3000";
  }

  constructor() {
    const secretKey = env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      throw new Error("STRIPE_SECRET_KEY is not set in environment variables");
    }
    this.stripe = new Stripe(secretKey, {
      apiVersion: "2025-12-15.clover" as any, // Use latest API version
    });
  }

  async createPaymentIntent(
    params: CreateIntentParams,
  ): Promise<CreateIntentResult> {
    // Create Stripe Checkout Session
    const clientUrl = this.resolveClientUrl();

    const session = await this.stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: params.currency.toLowerCase(),
            product_data: {
              name: `Order ${params.orderNumber}`,
              description: `Payment for order ${params.orderNumber}`,
            },
            unit_amount: Math.round(params.amount * 100), // Convert to cents/agorot
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${clientUrl}/payment-result?payment=success&orderId=${params.orderId}`,
      cancel_url: `${clientUrl}/payment-result?payment=cancelled&orderId=${params.orderId}`,
      client_reference_id: params.orderId,
      metadata: {
        orderId: params.orderId,
        userId: params.userId,
        orderNumber: params.orderNumber,
      },
      // Ensure Payment Intent also carries the order metadata for PI webhooks
      payment_intent_data: {
        metadata: {
          orderId: params.orderId,
          userId: params.userId,
          orderNumber: params.orderNumber,
        },
      },
    });

    // Map Stripe status to our PaymentStatus
    const status: PaymentStatus =
      session.payment_status === "paid" ? "succeeded" : "pending";

    return {
      providerPaymentId: session.id,
      status,
      clientSecret: session.client_secret || undefined,
      checkoutUrl: session.url || undefined,
      raw: session,
    };
  }

  async getPaymentStatus(providerPaymentId: string): Promise<StatusResult> {
    const session =
      await this.stripe.checkout.sessions.retrieve(providerPaymentId);

    const status: PaymentStatus =
      session.payment_status === "paid"
        ? "succeeded"
        : session.payment_status === "unpaid"
          ? "pending"
          : "failed";

    return {
      providerPaymentId,
      status,
      raw: session,
    };
  }

  /**
   * Handle Stripe webhook - Signature Verification + Event Routing
   *
   * ═════════════════════════════════════════════════════════════════════════════
   * WEBHOOK SIGNATURE VERIFICATION PROCESS
   * ═════════════════════════════════════════════════════════════════════════════
   *
   * STEP 1: Extract Signature from Header
   * ────────────────────────────────────
   * Header: Stripe-Signature: t={timestamp},v1={hash},v0={old_hash}
   * We extract both timestamp and hash for verification
   *
   * STEP 2: Call Stripe SDK's constructEvent()
   * ──────────────────────────────────────────
   * - Extracts timestamp and hashes from header
   * - Computes HMAC-SHA256(signing_string, webhook_secret)
   * - Compares with timing-safe comparison
   * - Validates timestamp is recent (prevents replay attacks)
   * - Throws error if verification fails
   *
   * WHAT THE SDK VERIFIES:
   * - ✅ Signature matches (attacker can't forge webhooks)
   * - ✅ Timestamp is fresh (not an old replayed webhook)
   * - ✅ Hash algorithm matches (v1 = SHA256)
   * - ✅ Timing-safe comparison (prevents timing attacks)
   *
   * If ANY check fails: SDK throws error immediately
   * If all checks pass: We receive Stripe.Event object
   *
   * ═════════════════════════════════════════════════════════════════════════════
   * STRIPE EVENT TYPES & ROUTING
   * ═════════════════════════════════════════════════════════════════════════════
   *
   * CHECKOUT.SESSION.COMPLETED
   * ──────────────────────────
   * When: Customer completes checkout page, Stripe processes payment
   * Timing: ~100ms after customer clicks "Pay"
   * Status: Checkout submitted but payment not yet confirmed
   * Contains: Session ID, amount, customer email, metadata
   * Action: Return "pending" (wait for payment_intent.succeeded)
   * Why pending? Stripe hasn't confirmed bank authorization yet
   *
   * PAYMENT_INTENT.SUCCEEDED
   * ────────────────────────
   * When: Bank confirms payment authorization (payment_intent)
   * Timing: ~2-5 seconds after checkout.session.completed
   * Status: Payment actually charged and confirmed
   * Contains: PaymentIntent ID, amount, charges
   * Action: Return "succeeded" (fulfill order, reduce stock)
   * Why different event? Provides double confirmation (checkout + bank)
   *
   * PAYMENT_INTENT.PAYMENT_FAILED
   * ─────────────────────────────
   * When: Payment attempt fails (insufficient funds, declined, etc.)
   * Timing: ~2-5 seconds after checkout.session.completed
   * Status: Payment rejected by bank
   * Contains: PaymentIntent ID, failure code, failure reason
   * Action: Return "failed" (notify customer, don't fulfill)
   * Codes: card_declined, insufficient_funds, lost_card, stolen_card, etc.
   *
   * WHY MULTIPLE EVENTS?
   * ────────────────────
   * - Stripe's webhook design: Each event = atomic fact
   * - Provides retry capability: If we miss one, others provide backup
   * - Allows idempotency: Same event multiple times = processed once
   * - Handles out-of-order arrivals: Can't assume event B after A
   *
   * ═════════════════════════════════════════════════════════════════════════════
   * METADATA EXTRACTION FOR ORDER LOOKUP
   * ═════════════════════════════════════════════════════════════════════════════
   *
   * METADATA STORAGE:
   * When creating Checkout Session, we embed metadata:
   * {
   *   orderId: "order_123",
   *   userId: "user_456",
   *   orderNumber: "ORD-2024-001"
   * }
   *
   * WHY METADATA?
   * - Bridge between Stripe and our database
   * - No need to search database by Stripe ID
   * - Faster lookup: Direct access to orderId
   * - More reliable: Order ID embedded in webhook
   *
   * WEBHOOK CONTAINS METADATA:
   * event.data.object.metadata.orderId = "order_123"
   * We extract and return to caller (PaymentService)
   * PaymentService uses orderId to find order for amount verification
   *
   * ═════════════════════════════════════════════════════════════════════════════
   * UNHANDLED EVENTS & GRACEFUL DEGRADATION
   * ═════════════════════════════════════════════════════════════════════════════
   *
   * STRIPE SENDS MANY EVENTS:
   * - charge.succeeded, charge.failed, charge.updated
   * - customer.created, customer.updated
   * - payment_method.attached, payment_method.detached
   * - ... and 50+ more types
   *
   * WE DON'T NEED ALL OF THEM:
   * We only need: checkout.session.completed + payment_intent.succeeded/failed
   *
   * WHAT WE DO WITH OTHERS:
   * - Log event type (for debugging)
   * - Return "skipped" status
   * - Don't process them further
   * - Don't mark webhook as failed
   *
   * WHY NOT FAIL ON UNKNOWN EVENTS?
   * - Stripe adds events over time
   * - If we fail on unknown: Webhooks marked as failed
   * - Stripe retries failed webhooks
   * - Retry traffic increases
   * - Eventually webhook marked as "persistently failing"
   * - Better: Log and skip (webhook still succeeds)
   *
   * ═════════════════════════════════════════════════════════════════════════════
   * ERROR HANDLING
   * ═════════════════════════════════════════════════════════════════════════════
   *
   * SIGNATURE VERIFICATION FAILURE:
   * - Missing header: "Missing Stripe signature or webhook secret"
   * - Invalid signature: "Webhook signature verification failed"
   * - Throw exception → Express error handler → 500 response
   * - Stripe sees 500 → Schedules retry
   * - Retry with exponential backoff
   *
   * MISSING ORDER METADATA:
   * - Still process (orderId might be null)
   * - PaymentService will handle lookup failure
   * - Return error or skip webhook
   *
   * ═════════════════════════════════════════════════════════════════════════════
   */
  async handleWebhook(req: Request): Promise<StatusResult> {
    const sig = req.headers["stripe-signature"];
    const webhookSecret = env.STRIPE_WEBHOOK_SECRET;

    if (!sig || !webhookSecret) {
      throw new Error("Missing Stripe signature or webhook secret");
    }

    let event: Stripe.Event;

    try {
      // Verify webhook signature
      event = this.stripe.webhooks.constructEvent(
        req.body,
        sig as string,
        webhookSecret,
      );
    } catch (err: any) {
      throw new Error(`Webhook signature verification failed: ${err.message}`);
    }

    // Handle checkout.session.completed event
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;

      // ℹ️ checkout.session.completed just means checkout was submitted
      // The actual payment won't be confirmed until payment_intent.succeeded arrives
      // So we return "pending" here - fulfillment will happen on payment_intent.succeeded
      const status: PaymentStatus = "pending";

      return {
        eventType: event.type,
        providerPaymentId: session.id,
        providerPaymentIntentId: session.payment_intent as string | undefined,
        orderId:
          (session.metadata?.orderId as string | undefined) ||
          (session.client_reference_id as string | undefined),
        amount: session.amount_total || 0, // Amount in cents
        status,
        raw: session,
      };
    }

    // Handle payment_intent.succeeded
    if (event.type === "payment_intent.succeeded") {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;

      return {
        eventType: event.type,
        providerPaymentId: paymentIntent.id,
        providerPaymentIntentId: paymentIntent.id,
        orderId: paymentIntent.metadata?.orderId as string | undefined,
        amount: paymentIntent.amount, // Amount in cents
        status: "succeeded",
        raw: paymentIntent,
      };
    }

    // Handle payment_intent.payment_failed
    if (event.type === "payment_intent.payment_failed") {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;

      return {
        eventType: event.type,
        providerPaymentId: paymentIntent.id,
        providerPaymentIntentId: paymentIntent.id,
        orderId: paymentIntent.metadata?.orderId as string | undefined,
        amount: paymentIntent.amount, // Amount in cents
        status: "failed",
        raw: paymentIntent,
      };
    }

    // ⚠️ Don't fail on unhandled events - just log and skip them
    // These are informational events we don't need to process:
    // - charge.succeeded, charge.failed, charge.updated
    // - payment_intent.created, payment_intent.amount_capturable_updated
    // etc.
    // We only care about: checkout.session.completed, payment_intent.succeeded/failed
    logger.debug(`⏭️ Skipping unhandled webhook event type: ${event.type}`);

    // Return a neutral response so webhook isn't marked as failed
    return {
      eventType: event.type,
      providerPaymentId: "skipped",
      status: "pending" as PaymentStatus,
      raw: event,
    };
  }
}
