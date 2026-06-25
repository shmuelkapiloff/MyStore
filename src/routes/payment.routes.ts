import { Router } from "express";
import { PaymentController } from "../controllers/payment.controller";
import { AuthMiddleware } from "../middlewares/auth.middleware";
import { webhookRateLimiter } from "../middlewares/rate-limiter.middleware";
import { validateRequest } from "../middlewares/validate.middleware";
import {
  createPaymentIntentSchema,
  paymentStatusParamsSchema,
} from "../validators";

const router = Router();

// Public webhook endpoint (no auth, with rate limiting)
router.post("/webhook", webhookRateLimiter, PaymentController.webhook);

// All routes below require authentication
router.use(AuthMiddleware.requireAuth);

// POST /api/payments/create-intent - Create payment intent for an order
// Validation: body.orderId must be valid MongoDB ObjectId
router.post(
  "/create-intent",
  validateRequest({ body: createPaymentIntentSchema }),
  PaymentController.createIntent,
);

// Alias for better naming: POST /api/payments/checkout
router.post(
  "/checkout",
  validateRequest({ body: createPaymentIntentSchema }),
  PaymentController.createIntent,
);

// GET /api/payments/:orderId/status - Get payment status for an order
// Validation: params.orderId must be valid MongoDB ObjectId
router.get(
  "/:orderId/status",
  validateRequest({ params: paymentStatusParamsSchema }),
  PaymentController.getStatus,
);

export default router;
