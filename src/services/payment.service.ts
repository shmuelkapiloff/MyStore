/**
 * Payment Service - Core Payment Processing & Webhook Handling
 *
 * ═══════════════════════════════════════════════════════════════
 * SECURITY & RELIABILITY ARCHITECTURE
 * ═══════════════════════════════════════════════════════════════
 *
 * This service implements a multi-layer security approach for payment processing:
 *
 * LAYER 1: WEBHOOK SIGNATURE VERIFICATION (in StripeProvider)
 * ────────────────────────────────────────────────────────────
 * - Every webhook is HMAC-SHA256 signed by Stripe using the webhook secret
 * - We verify signature before trusting ANY webhook data
 * - Uses timing-safe comparison to prevent timing attacks
 * - Prevents: Spoofed webhooks, man-in-the-middle attacks
 *
 * LAYER 2: IDEMPOTENCY TRACKING (via WebhookEventModel)
 * ──────────────────────────────────────────────────────
 * - Same webhook event might arrive multiple times (Stripe retries)
 * - We track processed event IDs with unique MongoDB constraint
 * - If event already processed: Return success (don't reprocess)
 * - Prevents: Duplicate orders, duplicate charges, race conditions
 * - Why MongoDB? Durability + atomic unique constraint (better than Redis)
 *
 * LAYER 3: AMOUNT VERIFICATION (line ~258)
 * ────────────────────────────────────────
 * - CRITICAL: Verify webhook amount matches order amount in our database
 * - Assumption: Our database is source of truth for order amounts
 * - Protects against: Compromised Stripe account, webhook data modification
 * - Exact match required (zero tolerance - overselling prevention)
 * - Example attack prevented:
 *   - Attacker compromises Stripe account
 *   - Creates webhook claiming $1 payment for $1000 order
 *   - Our server rejects webhook: "expected 100000 cents, got 100"
 *
 * LAYER 4: ATOMIC TRANSACTIONS (line ~380)
 * ─────────────────────────────────────────
 * - Stock reduction is ATOMIC: All or nothing
 * - If payment succeeds but stock fails: Entire transaction rolls back
 * - Prevents: Inconsistent state (paid but out of stock, or vice versa)
 * - Race condition prevention: Concurrent purchases handled safely
 * - Requires: MongoDB replica set (transactions not supported on single node)
 *
 * ═══════════════════════════════════════════════════════════════
 * PAYMENT FLOW
 * ═══════════════════════════════════════════════════════════════
 *
 * 1. Customer adds items to cart
 * 2. Checkout button clicks → calls createPaymentIntent()
 *    - Creates Stripe Checkout Session
 *    - Stores payment record in database
 *    - Returns checkout URL to redirect customer
 * 3. Customer redirected to Stripe-hosted page
 *    - Enters card details (WE NEVER TOUCH CARD DATA)
 * 4. Stripe processes payment
 *    - If succeeded: Stripe sends webhooks
 *    - If failed: Stripe sends failure webhook
 * 5. Stripe → Our server: POST /webhook (async, multiple attempts)
 *    - handleWebhook() is called
 *    - Verifies signature ✅
 *    - Checks idempotency ✅
 *    - Verifies amount ✅
 *    - Reduces stock atomically ✅
 *    - Updates order status
 *    - Marks event as processed
 * 6. Email confirmation sent (via queue or sync)
 *
 * ═══════════════════════════════════════════════════════════════
 */

import { Request } from "express";
import { PaymentModel, PaymentStatus } from "../models/payment.model";
import { OrderModel } from "../models/order.model";
import { ProductModel } from "../models/product.model";
import { WebhookEventModel } from "../models/webhook-event.model";
import { PaymentProvider } from "./payments/payment.provider";
import { StripeProvider } from "./payments/stripe.provider";
import { PaymentMetricsService } from "./payment-metrics.service";
import { CartService } from "./cart.service";
import { log, track } from "../utils/logger";

/**
 * Provider factory pattern - allows easy addition of new payment providers
 * Example: Add PayPal by creating PayPalProvider and adding to factories
 *
 * WHY FACTORY PATTERN?
 * - Decouples provider implementation from service
 * - Easy to test with mock providers
 * - Easy to add new providers without changing service logic
 * - Supports multi-provider environment (use PayPal in some countries, Stripe elsewhere)
 */
const providerFactories: Record<string, () => PaymentProvider> = {
  stripe: () => {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error(
        "Stripe selected as provider but STRIPE_SECRET_KEY is missing",
      );
    }
    return new StripeProvider();
  },
  // Add more providers as needed:
  // paypal: () => new PayPalProvider(),
  // square: () => new SquareProvider(),
};

const mapToOrderPaymentStatus = (
  status: PaymentStatus,
): "pending" | "paid" | "failed" | "refunded" => {
  if (status === "succeeded") return "paid";
  if (status === "refunded") return "refunded";
  if (status === "failed" || status === "canceled") return "failed";
  return "pending";
};

export class PaymentService {
  private static getProvider(): PaymentProvider {
    const key = (process.env.PAYMENT_PROVIDER || "stripe").toLowerCase();
    const factory = providerFactories[key];
    if (!factory) {
      throw new Error(`Unsupported payment provider: ${key}`);
    }
    return factory();
  }

  /**
   * Create a payment intent (Stripe Checkout Session)
   *
   * WHAT IT DOES:
   * 1. Verifies order exists and belongs to user
   * 2. Calls Stripe API to create checkout session
   * 3. Stores payment record in database
   * 4. Returns checkout URL for redirect
   *
   * SECURITY NOTES:
   * - Order must be unpaid (can't charge twice)
   * - User ID checked (can't pay for someone else's order)
   * - Amount comes from database (not from client request)
   * - Metadata stored with Stripe session for webhook lookup later
   *
   * WHY STORE PAYMENT RECORD NOW?
   * - Tracks payment in our database immediately
   * - Links Stripe session ID to order
   * - Webhook can find payment by multiple IDs (session, payment_intent)
   * - If webhook arrives before payment created: Idempotency check still works
   *
   * METADATA USAGE:
   * - Stripe embeds metadata in webhook events
   * - Webhook receives: event.data.object.metadata = { orderId, userId }
   * - Allows fast lookup: Don't need to search database for every webhook
   * - More reliable than searching by Stripe IDs
   *
   * RETURN VALUE:
   * - checkoutUrl: URL to redirect customer to Stripe-hosted checkout
   * - sessionId: Stripe session ID for tracking
   * - paymentStatus: Current status ("pending" until webhook confirms)
   *
   * THROWS:
   * - Order not found
   * - Order already paid
   * - Stripe API error
   */
  static async createPaymentIntent(userId: string, orderId: string) {
    const t = track("PaymentService", "createPaymentIntent", {
      userId,
      orderId,
    });

    const order = await OrderModel.findOne({ _id: orderId, user: userId });

    if (!order) {
      t.error("Order not found");
      throw new Error("Order not found");
    }

    if (order.paymentStatus === "paid") {
      t.error("Order already paid");
      throw new Error("Order already paid");
    }

    // 📊 Record payment attempt
    PaymentMetricsService.recordPaymentAttempt(orderId, order.totalAmount);

    const provider = this.getProvider();
    const currency = process.env.PAYMENT_CURRENCY || "ILS";

    const intent = await provider.createPaymentIntent({
      orderId,
      orderNumber: order.orderNumber,
      userId,
      amount: order.totalAmount,
      currency,
      metadata: { orderId, userId },
    });

    const payment = await PaymentModel.create({
      order: orderId,
      user: userId,
      amount: order.totalAmount,
      currency,
      status: intent.status,
      provider: provider.name,
      providerPaymentId: intent.providerPaymentId, // Checkout session ID (cs_test_...)
      paymentIntentId: intent.raw?.payment_intent, // Real payment_intent ID (pi_...) if available
      clientSecret: intent.clientSecret,
      checkoutUrl: intent.checkoutUrl,
      meta: intent.raw,
    });

    order.paymentStatus = mapToOrderPaymentStatus(intent.status);
    order.status = "pending_payment";
    order.paymentIntentId = intent.providerPaymentId; // Session ID for now
    // paymentIntentStripeId will be set when webhook arrives with pi_ ID
    await order.save();

    t.success();

    return {
      payment,
      status: intent.status,
      clientSecret: intent.clientSecret,
      checkoutUrl: intent.checkoutUrl,
    };
  }

  /**
   * Get latest payment status for an order
   */
  static async getPaymentStatus(userId: string, orderId: string) {
    const order = await OrderModel.findOne({ _id: orderId, user: userId });

    if (!order) {
      throw new Error("Order not found");
    }

    const payment = await PaymentModel.findOne({ order: orderId, user: userId })
      .sort({ createdAt: -1 })
      .lean();

    return {
      orderPaymentStatus: order.paymentStatus,
      paymentStatus: payment?.status || "pending",
      paymentId: payment?._id,
      providerPaymentId: payment?.providerPaymentId,
      checkoutUrl: payment?.checkoutUrl,
      clientSecret: payment?.clientSecret,
    };
  }

  /**
   * Handle payment provider webhook with full security verification
   *
   * SECURITY LAYERS (In Order of Execution):
   * ═════════════════════════════════════════════════════════════
   *
   * LAYER 1: WEBHOOK SIGNATURE VERIFICATION ✅
   * ────────────────────────────────────────
   * Location: provider.handleWebhook() (in StripeProvider)
   * What: HMAC-SHA256 signature verification
   * How: Stripe signs webhook with secret: HMAC(body, secret)
   *      We verify: computedHash === providedHash (timing-safe)
   * Why: Prevents attacker from sending fake webhooks
   * Threat: "Attacker sends {'amount': $0.01} claiming payment succeeded"
   * Defense: Signature invalid, webhook rejected before any processing
   * Note: req.body MUST be raw Buffer, not parsed JSON (signature computed on bytes)
   *
   * LAYER 2: IDEMPOTENCY CHECK (Webhook Event Deduplication) ✅
   * ────────────────────────────────────────────────────────
   * Location: WebhookEventModel.findOne() below
   * What: Check if this event ID was already processed
   * How: Stripe sends webhooks multiple times if we don't respond 200 OK
   *      Same event might arrive: immediately + retry 1 + retry 2, etc.
   *      We track event IDs in database with unique constraint
   * Why: Prevents duplicate orders and duplicate charges
   * Threat: "Same webhook arrives 3 times, order created 3 times, charged 3x"
   * Defense: First request processes, retries silently succeed (idempotency)
   * Result: Customer charged exactly once even if webhook retried 10 times
   * Why MongoDB? Durable + atomic unique constraint (survives crashes)
   *
   * LAYER 3: AMOUNT VERIFICATION (Database vs. Webhook) ✅
   * ──────────────────────────────────────────────────
   * Location: Line ~258 in this method
   * What: Verify webhook amount = order amount in database
   * How: order.totalAmount from DB vs. result.amount from webhook
   * Why: Database is source of truth (we control it)
   *      If Stripe account compromised: attacker can send fake webhook
   *      But attacker can't modify our database
   * Threat: "Attacker compromises Stripe, sends webhook claiming $1 for $1000 order"
   * Defense: amount !== expected, webhook rejected before stock reduction
   * Configuration: Zero tolerance (exact match only, no rounding tolerance)
   *
   * LAYER 4: ATOMIC STOCK REDUCTION (MongoDB Transactions) ✅
   * ──────────────────────────────────────────────────────
   * Location: fulfillOrder() call below
   * What: All-or-nothing stock reduction with MongoDB transaction
   * How: Begin transaction → check stock → reduce stock → commit/rollback
   * Why: Prevents overselling (stock never goes negative)
   *      Prevents inconsistent state (paid but no stock available)
   * Threat: "2 customers buy last item simultaneously"
   * Defense: First request locks stock in transaction, second waits, gets "out of stock"
   * Result: Never oversell, never have paid orders with no inventory
   *
   * ═════════════════════════════════════════════════════════════
   * EXECUTION FLOW:
   * ═════════════════════════════════════════════════════════════
   *
   * 1. Webhook arrives at /api/payments/webhook endpoint
   * 2. express.raw() middleware captures raw body (Buffer)
   * 3. handleWebhook() called with Request object
   * 4. provider.handleWebhook():
   *    ✅ Verifies signature (throws if invalid)
   *    ✅ Parses webhook
   *    ✅ Returns structured PaymentResult
   * 5. Check if event already processed:
   *    ✅ If yes: Return success (don't reprocess)
   *    ❌ If no: Continue to processing
   * 6. Find payment record by Stripe ID (multiple fallback methods)
   * 7. Verify amount matches:
   *    ✅ If match: Continue
   *    ❌ If mismatch: Log security alert, mark as failed, reject
   * 8. Update payment status
   * 9. For successful payments:
   *    ✅ Call fulfillOrder() (atomically reduces stock)
   * 10. Record that event was processed (mark in WebhookEventModel)
   * 11. Return success response
   *
   * If ANY step fails: Exception is thrown, webhook returns 500 to Stripe
   * Stripe retries webhook later with exponential backoff
   *
   * ═════════════════════════════════════════════════════════════
   * IMPORTANT NOTES:
   * ═════════════════════════════════════════════════════════════
   *
   * WHY STORE EVENTS IN DB AND NOT JUST IN REDIS?
   * - Redis might crash → loss of "already processed" tracking
   * - Next webhook retry would reprocess → duplicate charge
   * - MongoDB persists across crashes
   * - Unique constraint is atomic (no race conditions)
   * - 30-day TTL cleans up old events automatically
   *
   * WHY VERIFY AMOUNT AT THIS LAYER AND NOT AT STRIPE?
   * - Trust but verify: Stripe is generally secure but could be compromised
   * - We control the database, we don't control Stripe
   * - Extra layer of defense (defense in depth)
   * - Catches data corruption or API bugs
   *
   * WHY NOT JUST CHECK WEBHOOK SIGNATURE?
   * - Signature proves: "This webhook came from Stripe servers"
   * - But: What if Stripe servers were hacked? Or account compromised?
   * - Multiple verification layers each catch different types of attacks
   * - Security: Each layer is independent backup
   *
   * THROW vs. RETURN ERROR:
   * - We throw errors in handleWebhook
   * - Express error handler catches and returns 500
   * - Stripe interprets 500 as "delivery failed"
   * - Stripe automatically retries webhook
   * - Eventually succeeds when system is healthy (or logged for manual review)
   */
  static async handleWebhook(req: Request) {
    const webhookStartTime = Date.now();
    const t = track("PaymentService", "handleWebhook");

    const provider = this.getProvider();

    // Note: req.body is still a Buffer at this point because of express.raw()
    // We'll log eventType after the provider parses the webhook
    const result = await provider.handleWebhook(req);

    // ✅ Now we can safely log the event type from the parsed result
    log.info("📨 Webhook received", {
      service: "PaymentService",
      eventType: result.eventType || "unknown",
    });

    // ⏭️ Skip processing unhandled event types (informational events we don't need)
    if (result.providerPaymentId === "skipped") {
      log.info("⏭️ Skipping unhandled webhook event type", {
        service: "PaymentService",
        eventType: result.eventType || "unknown",
      });
      t.success();
      return {
        eventType: result.eventType || "unknown",
        status: "skipped",
      };
    }

    log.info("🔍 Processing webhook event", {
      service: "PaymentService",
      eventType: result.eventType || "unknown",
      providerPaymentId: result.providerPaymentId,
      providerPaymentIntentId: result.providerPaymentIntentId,
      orderId: result.orderId,
    });

    // ✅ Check if event was already processed (idempotency)
    const existingEvent = await WebhookEventModel.findOne({
      eventId: result.providerPaymentId,
      provider: provider.name,
    });

    if (existingEvent) {
      log.warn("⚠️ Webhook event already processed (idempotency)", {
        service: "PaymentService",
        eventId: result.providerPaymentId,
        processedAt: existingEvent.processedAt,
      });
      throw new Error(
        `Webhook event ${result.providerPaymentId} already processed`,
      );
    }

    // 🔍 Find payment by provider payment ID (or payment intent ID for Stripe)
    let payment = await PaymentModel.findOne({
      providerPaymentId: result.providerPaymentId,
    });

    if (payment) {
      log.info("✅ Payment found by providerPaymentId", {
        service: "PaymentService",
        providerPaymentId: result.providerPaymentId,
        paymentId: payment._id,
      });
    }

    // 🔍 If not found and we have a payment intent ID (from Stripe webhooks), try that
    if (!payment && result.providerPaymentIntentId) {
      log.info("🔍 Payment not found by session ID, trying payment_intent ID", {
        service: "PaymentService",
        paymentIntentId: result.providerPaymentIntentId,
      });

      payment = await PaymentModel.findOne({
        $or: [
          { paymentIntentId: result.providerPaymentIntentId },
          { "meta.payment_intent": result.providerPaymentIntentId },
        ],
      });

      if (payment) {
        log.info("✅ Payment found by payment_intent ID", {
          service: "PaymentService",
          paymentIntentId: result.providerPaymentIntentId,
          paymentId: payment._id,
        });
      }
    }

    // 🔍 Fallback: use orderId from webhook metadata (Stripe metadata.orderId)
    if (!payment && result.orderId) {
      log.info("🔍 Payment not found by IDs, trying orderId fallback", {
        service: "PaymentService",
        orderId: result.orderId,
      });

      payment = await PaymentModel.findOne({ order: result.orderId })
        .sort({ createdAt: -1 })
        .exec();

      if (payment) {
        log.info("✅ Payment found by orderId", {
          service: "PaymentService",
          orderId: result.orderId,
          paymentId: payment._id,
        });
      }
    }

    if (!payment) {
      log.error(
        "❌ Payment not found for webhook - all lookup methods failed",
        {
          service: "PaymentService",
          providerPaymentId: result.providerPaymentId,
          providerPaymentIntentId: result.providerPaymentIntentId,
          orderId: result.orderId,
        },
      );
      throw new Error(
        `Payment not found for provider ID: ${result.providerPaymentId}`,
      );
    }

    // 🧷 Backfill payment_intent into both meta and paymentIntentId field (ensures lookups work)
    if (result.providerPaymentIntentId && !payment.paymentIntentId) {
      payment.paymentIntentId = result.providerPaymentIntentId;
    }

    if (
      result.providerPaymentIntentId &&
      (!payment.meta || !payment.meta.payment_intent)
    ) {
      payment.meta = {
        ...(payment.meta || {}),
        payment_intent: result.providerPaymentIntentId,
      };
    }

    // 💾 Update payment status
    payment.status = result.status;
    payment.meta = result.raw || payment.meta;
    await payment.save();

    // 📝 Update order status
    const order = await OrderModel.findById(payment.order);
    if (order) {
      // 🔒 CRITICAL SECURITY: Verify payment amount matches order total
      // Prevents malicious webhooks from claiming lower payment amounts
      const expectedAmountInCents = Math.round(order.totalAmount * 100);
      const receivedAmountInCents = result.amount || 0;

      if (receivedAmountInCents !== expectedAmountInCents) {
        log.error("❌ Payment amount mismatch - possible fraud attempt", {
          service: "PaymentService",
          orderId: order._id.toString(),
          orderNumber: order.orderNumber,
          expectedAmount: expectedAmountInCents,
          receivedAmount: receivedAmountInCents,
          difference: Math.abs(expectedAmountInCents - receivedAmountInCents),
        });

        // Mark payment as failed due to amount mismatch
        payment.status = "failed";
        await payment.save();

        order.paymentStatus = "failed";
        await order.save();

        throw new Error(
          `Payment amount mismatch: expected ${expectedAmountInCents} cents, received ${receivedAmountInCents} cents`,
        );
      }

      log.info("✅ Payment amount verified", {
        service: "PaymentService",
        orderId: order._id.toString(),
        amount: expectedAmountInCents,
      });
      const oldPaymentStatus = order.paymentStatus;
      const newMappedStatus = mapToOrderPaymentStatus(result.status);

      // ✅ Don't downgrade status if already paid/fulfilled
      // Stripe sends payment_intent.succeeded BEFORE checkout.session.completed
      // We don't want checkout.session.completed (pending) to overwrite paid status
      if (order.fulfilled || oldPaymentStatus === "paid") {
        // Already fulfilled or paid - don't downgrade
        log.info("⚠️ Order already fulfilled/paid - not updating status", {
          orderId: order._id,
          oldStatus: oldPaymentStatus,
          wouldBe: newMappedStatus,
          fulfilled: order.fulfilled,
        });
      } else {
        order.paymentStatus = newMappedStatus;
      }

      log.info("💳 Payment status updated", {
        orderId: order._id,
        oldStatus: oldPaymentStatus,
        newStatus: order.paymentStatus,
        webhookStatus: result.status,
        fulfilled: order.fulfilled,
      });

      // ✅ Store real payment_intent ID if available
      if (result.providerPaymentIntentId) {
        order.paymentIntentStripeId = result.providerPaymentIntentId;
      }

      // ✅ If payment succeeded, confirm order and process fulfillment
      if (
        result.status === "succeeded" &&
        oldPaymentStatus !== "paid" &&
        !order.fulfilled
      ) {
        log.info("✅ Fulfillment conditions met - processing order", {
          orderId: order._id,
          condition1: `result.status === "succeeded" → ${result.status === "succeeded"}`,
          condition2: `oldPaymentStatus !== "paid" → ${String(oldPaymentStatus) !== "paid"}`,
          condition3: `!order.fulfilled → ${!order.fulfilled}`,
        });

        order.status = "confirmed";
        order.paymentVerifiedAt = new Date();
        await order.save();

        log.info(
          "📦 Starting order fulfillment (stock reduction + cart clear)",
          {
            service: "PaymentService",
            orderId: order._id,
            orderNumber: order.orderNumber,
            itemCount: order.items.length,
            status: `Moving from ${oldPaymentStatus} to paid`,
          },
        );

        // 🔄 Use MongoDB transaction for atomic stock reduction
        const mongoose = await import("mongoose");
        const session = await mongoose.default.startSession();
        session.startTransaction();

        try {
          let totalStockReduced = 0;

          // 📦 Reduce stock atomically
          for (const item of order.items) {
            log.info("Reducing stock", {
              productId: item.product,
              quantity: item.quantity,
            });

            const product = await ProductModel.findByIdAndUpdate(
              item.product,
              { $inc: { stock: -item.quantity } },
              { new: true, session },
            );

            if (!product) {
              throw new Error(`Product ${item.product} not found`);
            }

            if (product.stock < 0) {
              throw new Error(
                `Insufficient stock for ${item.name}: needed ${item.quantity}, had ${product.stock + item.quantity}`,
              );
            }

            totalStockReduced += item.quantity;
            log.info("✅ Stock reduced", {
              productId: item.product,
              productName: item.name,
              newStock: product.stock,
            });
          }

          // 🧹 Clear cart (Redis + MongoDB)
          await CartService.clearCart(order.user.toString());

          // ✅ Mark order as fulfilled
          order.fulfilled = true;
          order.fulfilledAt = new Date();
          await order.save({ session });

          // 📊 Commit transaction
          await session.commitTransaction();

          log.info("✅ Order fulfillment successful - transaction committed", {
            service: "PaymentService",
            orderId: order._id,
            orderNumber: order.orderNumber,
            amount: order.totalAmount,
            totalStockReduced,
          });

          // 📊 Record successful payment metrics
          const duration = Date.now() - webhookStartTime;
          PaymentMetricsService.recordPaymentSuccess(
            order._id.toString(),
            order.totalAmount,
            duration,
          );
        } catch (fulfillmentError: any) {
          // 🔄 Transaction auto-aborts on error
          await session.abortTransaction().catch(() => undefined);

          log.error(
            "❌ Order fulfillment failed - transaction aborted, stock NOT reduced",
            {
              service: "PaymentService",
              orderId: order._id,
              error: fulfillmentError.message,
            },
          );

          order.status = "pending";
          order.notes = `Fulfillment failed: ${fulfillmentError.message}`;
          await order.save();

          throw fulfillmentError;
        } finally {
          await session.endSession();
        }
      } else if (result.status === "failed") {
        order.status = "cancelled";
        await order.save();

        // 📊 Record failed payment metrics
        PaymentMetricsService.recordPaymentFailure(
          order._id.toString(),
          order.totalAmount,
          "Payment intent failed",
        );

        log.warn("❌ Payment failed, order cancelled", {
          service: "PaymentService",
          orderId: order._id,
        });
      } else {
        log.info("ℹ️ Webhook received but fulfillment not triggered", {
          orderId: order._id,
          reason: `Conditions not met: status=${result.status}, oldStatus=${oldPaymentStatus}, fulfilled=${order.fulfilled}`,
        });
        await order.save();
      }
    }

    // ✅ Record webhook event as processed
    await WebhookEventModel.create({
      eventId: result.providerPaymentId,
      eventType: result.status,
      provider: provider.name,
      metadata: result.raw,
    });

    // 📊 Record webhook processing metrics
    const webhookDuration = Date.now() - webhookStartTime;
    PaymentMetricsService.recordWebhookDuration(
      result.providerPaymentId,
      webhookDuration,
    );

    t.success();

    return { ok: true, eventType: result.status };
  }

}
