import express, { Application, Request, Response } from "express";
import mongoose from "mongoose";
import helmet from "helmet";
import swaggerUi from "swagger-ui-express";
import { specs } from "./swagger";
import corsConfig from "./config/cors";
import { redis } from "./config/redisClient";
import { errorHandler } from "./middlewares/error.middleware";
import {
  requestIdMiddleware,
  requestLoggerMiddleware,
} from "./middlewares/logging.middleware";
import { auditLoggingMiddleware } from "./middlewares/audit-logging.middleware";
import {
  metricsMiddleware,
  metricsEndpoint,
} from "./middlewares/metrics.middleware";
import { MAX_JSON_SIZE } from "./config/constants";
import "./types/express"; // Import Express type extensions at app startup

// Import routes
import healthRoutes from "./routes/health.routes";
import authRoutes from "./routes/auth.routes";
import productRoutes from "./routes/product.routes";
import cartRoutes from "./routes/cart.routes";
import orderRoutes from "./routes/order.routes";
import addressRoutes from "./routes/address.routes";
import adminRoutes from "./routes/admin.routes";
import paymentRoutes from "./routes/payment.routes";
import metricsRoutes from "./routes/metrics.routes";

const app: Application = express();

/**
 * Trust proxy for Render.com and other reverse proxies
 * Required to properly read X-Forwarded-For header from upstream proxies
 */
app.set("trust proxy", 1);

/**
 * Middleware - Security and Parsing
 */
app.use(helmet()); // Security headers
app.use(corsConfig); // CORS configuration for all clients

// ✅ Webhook route needs RAW body for Stripe signature verification
app.use("/api/payments/webhook", express.raw({ type: "application/json" }));

app.use(express.json({ limit: MAX_JSON_SIZE })); // Parse JSON bodies
app.use(express.urlencoded({ extended: true, limit: MAX_JSON_SIZE })); // Parse URL-encoded bodies
app.use(requestIdMiddleware); // Assign X-Request-ID
app.use(auditLoggingMiddleware); // Enrich request with audit context (IP, UA, session)
app.use(requestLoggerMiddleware); // Structured request/response logging
app.use(metricsMiddleware); // Prometheus metrics tracking

/**
 * Metrics endpoint for Prometheus scraping
 */
app.get("/metrics", metricsEndpoint);

/**
 *
 * Health check for load balancers
 */
app.get("/health", (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

/**
 * Readiness check - dependency aware
 * Returns 200 only when critical dependencies are ready
 */
app.get("/ready", (_req: Request, res: Response) => {
  const mongoOk = mongoose.connection.readyState === 1;
  const redisOk = redis.status === "ready";
  const ready = mongoOk && redisOk;

  res.status(ready ? 200 : 503).json({
    success: ready,
    status: ready ? "ready" : "not-ready",
    dependencies: {
      mongodb: mongoOk ? "connected" : "disconnected",
      redis: redisOk ? "connected" : "disconnected",
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Swagger / OpenAPI Documentation
 * UI:   http://localhost:5000/api/docs
 * JSON: http://localhost:5000/api/docs.json
 */
app.use(
  "/api/docs",
  swaggerUi.serve,
  swaggerUi.setup(specs, {
    customSiteTitle: "MyStore API Docs",
    customCss: ".swagger-ui .topbar { display: none }",
  }),
);
app.get("/api/docs.json", (_req: Request, res: Response) => {
  res.setHeader("Content-Type", "application/json");
  res.send(specs);
});

/**
 * API Routes - Versioned for future compatibility
 */
app.use("/api/health", healthRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/addresses", addressRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/metrics", metricsRoutes);

/**
 * Root endpoint - API documentation
 */
app.get("/", (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      name: "MyStore API",
      version: "1.0.0",
      status: "running",
      endpoints: {
        health: "/health or /api/health",
        auth: "/api/auth",
        products: "/api/products",
        cart: "/api/cart",
        orders: "/api/orders",
        addresses: "/api/addresses",
        payments: "/api/payments",
        admin: "/api/admin",
      },
      documentation: "/api/docs",
      documentationJSON: "/api/docs.json",
    },
    message: "Welcome to MyStore API",
  });
});

/**
 * 404 handler - Not Found
 */
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.path} not found`,
  });
});

/**
 * Global error handler (must be last)
 */
app.use(errorHandler);

export default app;

// Expose factory for tests to create a configured app instance
export const createApp = () => app;
