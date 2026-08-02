import { Request, Response } from "express";
import { PaymentService } from "../services/payment.service";
import { FailedWebhookModel } from "../models/failed-webhook.model";
import { asyncHandler } from "../utils/asyncHandler";
import { log } from "../utils/logger";
import { sendSuccess, sendError } from "../utils/response";

// Handles payments: create intent, check status, and receive Stripe webhook events
export class PaymentController {
  /**
   * Create payment intent
   * POST /api/payments/create-intent
   *
   * Validated via validateRequest middleware with createPaymentIntentSchema
   * Body already validated: { orderId: string (valid MongoDB ObjectId) }
   */
  // Creates a Stripe payment intent for an existing order
  static createIntent = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.userId;
    const { orderId } = req.body;

    if (!userId) {
      return sendError(res, 401, "Not authenticated");
    }

    const result = await PaymentService.createPaymentIntent(userId, orderId);

    return sendSuccess(
      res,
      {
        payment: result.payment,
        status: result.status,
        clientSecret: result.clientSecret,
        checkoutUrl: result.checkoutUrl,
      },
      "Payment intent created successfully",
      200,
    );
  });

  /**
   * Get payment status by order
   * GET /api/payments/:orderId/status
   *
   * Validated via validateRequest middleware with paymentStatusParamsSchema
   * Params already validated: { orderId: string (valid MongoDB ObjectId) }
   */
  // Returns the current payment status for a given order
  static getStatus = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.userId;
    const { orderId } = req.params;

    if (!userId) {
      return sendError(res, 401, "Not authenticated");
    }

    const result = await PaymentService.getPaymentStatus(userId, orderId);

    return sendSuccess(res, result, "Payment status retrieved", 200);
  });

  /**
   * Webhook endpoint (public) - Stripe calls this
   * POST /api/payments/webhook
   * ✅ This is the CRITICAL endpoint that confirms payments!
   */
  // Receives Stripe webhook events — this is the critical endpoint that confirms payment success
  static webhook = asyncHandler(async (req: Request, res: Response) => {
    const startTime = Date.now();
    const rawBody = req.body;

    // 🔔 Log webhook arrival immediately
    log.info("🔔 Webhook received from Stripe", {
      service: "PaymentController",
      eventType: rawBody?.type || "unknown",
      eventId: rawBody?.id || "unknown",
      hasSignature: !!req.headers["stripe-signature"],
      timestamp: new Date().toISOString(),
    });

    try {
      // ✅ Use the payment service to handle webhook with signature verification
      const result = await PaymentService.handleWebhook(req);

      const duration = Date.now() - startTime;
      log.info("✅ Webhook processed successfully", {
        service: "PaymentController",
        duration,
        eventType: result.eventType,
      });

      res.status(200).json({ received: true });
    } catch (error: any) {
      const duration = Date.now() - startTime;
      const errorMessage = error?.message || "Unknown webhook processing error";

      log.error("❌ Webhook processing failed", {
        service: "PaymentController",
        duration,
        error: errorMessage,
      });

      // Duplicate event — return 200 so Stripe stops retrying
      if (errorMessage.includes("already processed")) {
        return res
          .status(200)
          .json({ received: true, message: "Duplicate event ignored" });
      }

      // Signature failure is a config error, not a transient one — return 400 so Stripe doesn't retry
      const isSignatureError =
        errorMessage.includes("Webhook signature verification failed") ||
        errorMessage.includes("Missing Stripe signature") ||
        errorMessage.includes("webhook secret");

      if (isSignatureError) {
        return res.status(400).json({ received: false, error: errorMessage });
      }

      // Save the failed webhook for later retry
      try {
        const provider = process.env.PAYMENT_PROVIDER || "stripe";
        const eventId = rawBody?.id || `unknown-${Date.now()}`;
        const eventType = rawBody?.type || "unknown";

        // Calculate exponential backoff for retry
        const nextRetryAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

        await FailedWebhookModel.create({
          eventId,
          eventType,
          provider,
          payload: rawBody,
          error: errorMessage,
          retryCount: 0,
          maxRetries: 5,
          nextRetryAt,
          status: "pending",
        });

        log.info("📝 Failed webhook saved for retry", {
          eventId,
          nextRetryAt,
        });
      } catch (saveError: any) {
        log.error("Failed to save webhook for retry", {
          error: saveError.message,
        });
      }

      // 500 tells Stripe this was a transient server error — it will retry automatically
      res.status(500).json({ received: false, error: errorMessage });
    }
  });
}
