import { Router } from "express";
import { CartController } from "../controllers/cart.controller";
import { requireAuth } from "../middlewares/auth.middleware";
import { apiRateLimiter } from "../middlewares/rate-limiter.middleware";

const router = Router();

/**
 * Cart Routes
 * Base URL: /api/cart
 * All cart routes require authentication — no guest mode
 */
router.use(requireAuth);
router.use(apiRateLimiter);

// GET /api/cart - get current cart
router.get("/", CartController.getCart);

// GET /api/cart/count - total item count (for cart icon badge)
router.get("/count", CartController.getCartCount);

// POST /api/cart/add - add item to cart
router.post("/add", CartController.addToCart);

// PUT /api/cart/update - update item quantity
router.put("/update", CartController.updateQuantity);

// DELETE /api/cart/remove - remove item from cart
router.delete("/remove", CartController.removeFromCart);

// DELETE /api/cart/clear - clear entire cart
router.delete("/clear", CartController.clearCart);

export default router;
