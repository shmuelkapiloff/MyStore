import { Router } from "express";
import { OrderController } from "../controllers/order.controller";
import { requireAuth } from "../middlewares/auth.middleware";
import { idempotencyMiddleware } from "../middlewares/idempotency.middleware";
import { validateOrderId } from "../middlewares/validateObjectId.middleware";
import { publicReadRateLimiter } from "../middlewares/rate-limiter.middleware";

const router = Router();

// Public — track order (with rate limiting to prevent enumeration)
router.get(
  "/track/:orderId",
  publicReadRateLimiter,
  validateOrderId,
  OrderController.trackOrder,
);

// All routes below require authentication
router.use(requireAuth);

// POST /api/orders (with idempotency)
router.post("/", idempotencyMiddleware("order"), OrderController.createOrder);

// GET /api/orders
router.get("/", OrderController.getUserOrders);

// GET /api/orders/:orderId
router.get("/:orderId", validateOrderId, OrderController.getOrderById);

// POST /api/orders/:orderId/cancel
router.post("/:orderId/cancel", validateOrderId, OrderController.cancelOrder);

export default router;
