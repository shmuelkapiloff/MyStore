import { z } from "zod";

// ═══════════════════════════════════════════════════════════════════════════
// PAYMENT VALIDATORS
// ═══════════════════════════════════════════════════════════════════════════
//
// These schemas validate payment operations to prevent:
// - Invalid order IDs (malformed MongoDB ObjectIds)
// - Missing required fields (orderId)
// - Invalid refund data
// - Type mismatches
//
// Payment webhook validation is NOT here because:
// 1. Webhook payload is provider-specific (Stripe format)
// 2. Signature verification happens in StripeProvider.handleWebhook()
// 3. Webhook body must be raw Buffer for HMAC verification
// 4. Validation happens AFTER signature verification passes

/**
 * Validate MongoDB ObjectId format (24 hex characters)
 * Examples: 507f1f77bcf86cd799439011, 5ead2245a45b6e6d8c7c8d5e
 */
const objectIdSchema = z
  .string()
  .regex(/^[a-f0-9]{24}$/, "Invalid MongoDB ObjectId format");

/**
 * CREATE PAYMENT INTENT
 * ─────────────────────
 * POST /api/payments/create-intent
 * Body: { orderId }
 *
 * Purpose: Create Stripe Checkout Session for customer payment
 * Security:
 * - orderId must exist in database (checked by service, not validator)
 * - Amount verification happens in handleWebhook (LAYER 3 security)
 * - User authentication required via middleware
 */
export const createPaymentIntentSchema = z.object({
  orderId: objectIdSchema.describe("MongoDB ObjectId of the order"),
});

export type CreatePaymentIntentInput = z.infer<
  typeof createPaymentIntentSchema
>;

/**
 * GET PAYMENT STATUS
 * ──────────────────
 * GET /api/payments/:orderId/status
 * Params: orderId
 *
 * Purpose: Check payment status for an order (after checkout redirect)
 * Used by client to poll for payment confirmation from webhook
 * Security:
 * - User can only see their own payment status (service layer check)
 * - orderId must exist (service layer check)
 */
export const paymentStatusParamsSchema = z.object({
  orderId: objectIdSchema.describe("MongoDB ObjectId of the order"),
});

export type PaymentStatusParams = z.infer<typeof paymentStatusParamsSchema>;

/**
 * PROCESS REFUND
 * ──────────────
 * POST /api/payments/:paymentId/refund
 * Body: { reason, amount }
 *
 * Purpose: Admin-only endpoint to process refunds
 * Security:
 * - Authorization: requireAdmin middleware
 * - Amount validation: Must be > 0 and <= order total
 * - Reason required for audit trail
 */
export const processRefundSchema = z.object({
  paymentId: objectIdSchema.describe("MongoDB ObjectId of the payment"),
  reason: z
    .string()
    .min(5, "Refund reason must be at least 5 characters")
    .max(500, "Refund reason must not exceed 500 characters")
    .describe("Reason for refund (for audit trail)"),
  amount: z
    .number()
    .positive("Refund amount must be positive")
    .describe("Amount to refund in cents (e.g., 9999 = $99.99)")
    .optional(),
});

export type ProcessRefundInput = z.infer<typeof processRefundSchema>;

/**
 * CONFIRM PAYMENT
 * ───────────────
 * POST /api/payments/:paymentId/confirm
 * Body: { clientSecret }
 *
 * Purpose: Client-side confirmation after Stripe 3D Secure flow
 * Used when Stripe requires additional authentication
 * Security:
 * - clientSecret proves customer has legitimate access
 * - Prevents unauthorized confirmation of other users' payments
 */
export const confirmPaymentSchema = z.object({
  paymentId: objectIdSchema.describe("MongoDB ObjectId of the payment"),
  clientSecret: z
    .string()
    .min(1, "clientSecret is required")
    .describe("Stripe payment intent client secret"),
});

export type ConfirmPaymentInput = z.infer<typeof confirmPaymentSchema>;

/**
 * WEBHOOK PAYLOAD SCHEMA (Informational, not actively used)
 * ─────────────────────────────────────────────────────────
 * WARNING: Do NOT use this to validate webhook payload!
 *
 * Reason: Webhook signature verification must happen on RAW BODY (bytes),
 * not parsed JSON. If you parse the body first, HMAC verification fails.
 *
 * Flow:
 * 1. Express middleware receives raw req.body (Buffer)
 * 2. StripeProvider.handleWebhook() verifies HMAC signature on raw body
 * 3. THEN parse the body and validate against provider schema
 * 4. THEN check idempotency in database
 *
 * This schema documents the expected structure only:
 */
export const stripeWebhookPayloadSchema = z.object({
  id: z.string().describe("Stripe event ID (evt_...)"),
  type: z
    .enum([
      "payment_intent.succeeded",
      "payment_intent.payment_failed",
      "checkout.session.completed",
    ])
    .describe("Webhook event type"),
  data: z.object({
    object: z.object({
      id: z.string().describe("Stripe payment intent ID (pi_...)"),
      status: z
        .enum([
          "succeeded",
          "processing",
          "requires_action",
          "requires_payment_method",
        ])
        .describe("Payment status"),
      amount: z.number().describe("Amount in cents"),
      metadata: z
        .object({
          orderId: z.string().optional(),
          userId: z.string().optional(),
        })
        .optional(),
    }),
  }),
});

export type StripeWebhookPayload = z.infer<typeof stripeWebhookPayloadSchema>;
