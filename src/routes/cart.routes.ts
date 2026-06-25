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

// GET /api/cart - קבלת עגלה נוכחית
router.get("/", CartController.getCart);

// GET /api/cart/count - ספירת פריטים בעגלה
router.get("/count",     CartController.getCartCount);

// POST /api/cart/add - הוספת פריט לעגלה
router.post("/add", CartController.addToCart);

// PUT /api/cart/update - עדכון כמות פריט
router.put("/update",  CartController.updateQuantity);

// DELETE /api/cart/remove - הסרת פריט מעגלה
router.delete("/remove", CartController.removeFromCart);

// DELETE /api/cart/clear - ניקוי עגלה מלאה
router.delete("/clear", CartController.clearCart);

export default router;
