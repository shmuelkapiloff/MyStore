import { Router } from "express";
import { AuthController } from "../controllers/auth.controller";
import { authenticate } from "../middlewares/auth.middleware";
import { authRateLimiter } from "../middlewares/rate-limiter.middleware";

const router = Router();

// ── Public routes ───────────────────────────────────────────────────────
router.post("/register", authRateLimiter, AuthController.register);
router.post("/login", authRateLimiter, AuthController.login);
router.post("/forgot-password", authRateLimiter, AuthController.forgotPassword);
router.post(
  "/reset-password/:token",
  authRateLimiter,
  AuthController.resetPassword,
);
router.post("/refresh", authRateLimiter, AuthController.refreshToken);

// Google OAuth
router.post("/google", authRateLimiter, AuthController.googleLogin);

// ── Protected routes ────────────────────────────────────────────────────
router.get("/verify", authenticate, AuthController.verify);
router.get("/profile", authenticate, AuthController.getProfile);
router.put("/profile", authenticate, AuthController.updateProfile);
router.post("/change-password", authenticate, AuthController.changePassword);
router.post("/logout", authenticate, AuthController.logout);

export default router;
