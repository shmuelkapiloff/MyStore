import { Router } from "express";
import { requireAuth } from "../middlewares/auth.middleware";
import { PaymentMetricsService } from "../services/payment-metrics.service";
import { asyncHandler } from "../utils/asyncHandler";

const router = Router();

// Require authentication for all metrics endpoints
router.use(requireAuth);

/**
 * GET /api/metrics/payment
 * Get payment metrics summary
 */
router.get(
  "/payment",
  asyncHandler(async (req, res) => {
    const lastN = parseInt(req.query.lastN as string) || 100;
    const metrics = PaymentMetricsService.getMetrics(lastN);

    res.json({
      success: true,
      data: metrics,
    });
  })
);

/**
 * GET /api/metrics/webhook
 * Get webhook metrics
 */
router.get(
  "/webhook",
  asyncHandler(async (req, res) => {
    const lastN = parseInt(req.query.lastN as string) || 100;
    const metrics = PaymentMetricsService.getWebhookMetrics(lastN);

    res.json({
      success: true,
      data: metrics,
    });
  })
);

/**
 * GET /api/metrics/all
 * Export all metrics
 */
router.get(
  "/all",
  asyncHandler(async (req, res) => {
    const metrics = PaymentMetricsService.exportMetrics();

    res.json({
      success: true,
      data: metrics,
    });
  })
);

export default router;
