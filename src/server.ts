import app from "./app";
import { env } from "./config/env";
import { connectMongo, disconnectMongo } from "./config/db";
import { connectRedis, disconnectRedis } from "./config/redisClient";
import { WebhookRetryService } from "./services/webhook-retry.service";
import { logger } from "./utils/logger";

async function main() {
  const isProd = env.NODE_ENV === "production";

  try {
    await connectMongo();

    // 🔄 Start webhook retry service
    WebhookRetryService.start(60000); // Check every 1 minute
    logger.info("Webhook retry service started");
  } catch (err) {
    if (isProd) {
      logger.error(
        { err },
        "MongoDB connection failed in production - aborting startup",
      );
      throw err;
    }

    logger.warn(
      { err },
      "Continuing without Mongo connection outside production",
    );
  }

  try {
    await connectRedis();
  } catch (err) {
    if (isProd) {
      logger.error(
        { err },
        "Redis connection failed in production - aborting startup",
      );
      throw err;
    }

    logger.warn(
      { err },
      "Continuing without Redis connection outside production",
    );
  }

  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, "Server listening");

    // 🔔 Log webhook configuration status
    const webhookSecret = env.STRIPE_WEBHOOK_SECRET;
    const clientUrl = env.CLIENT_URL;

    if (!webhookSecret) {
      logger.warn(
        "⚠️ STRIPE_WEBHOOK_SECRET not configured - webhook signature verification disabled!",
      );
      logger.warn("   Set STRIPE_WEBHOOK_SECRET in your environment variables");
    } else {
      logger.info("✅ Stripe webhook secret configured");
    }

    if (!clientUrl) {
      logger.warn(
        "⚠️ CLIENT_URL not configured - using fallback: http://localhost:3000",
      );
      logger.warn(
        "   Set CLIENT_URL in your environment variables for production",
      );
    } else {
      logger.info({ clientUrl }, "✅ Client URL configured");
    }

    logger.info("🎯 Webhook endpoint ready at: /api/payments/webhook");
  });

  // Handle listen errors (e.g., EADDRINUSE)
  server.on("error", (err: any) => {
    const code = err?.code;
    if (code === "EADDRINUSE") {
      logger.error({ port: env.PORT, err }, "Port is already in use");
      logger.error("Try changing PORT in your .env or free the port (4001)");
    } else {
      logger.error({ err }, "HTTP server error");
    }
    process.exit(1);
  });

  // Graceful shutdown
  const shutdown = (signal: string) => {
    logger.info({ signal }, "Shutting down");

    // Force-exit if graceful shutdown takes too long (e.g. stuck keep-alive connections)
    const forceExit = setTimeout(() => {
      logger.error("Graceful shutdown timed out — forcing exit");
      process.exit(1);
    }, 10_000).unref();

    // Stop webhook retry service
    WebhookRetryService.stop();

    server.close(async () => {
      clearTimeout(forceExit);
      logger.info("HTTP server closed");
      await disconnectMongo();
      await disconnectRedis();
      process.exit(0);
    });
  };

  process.on("SIGINT", shutdown.bind(null, "SIGINT"));
  process.on("SIGTERM", shutdown.bind(null, "SIGTERM"));
}

main().catch((err) => {
  logger.error({ err }, "[CRITICAL] Startup failed");
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  logger.error({ reason }, "Unhandled Promise rejection");
  process.exit(1);
});

process.on("uncaughtException", (err) => {
  logger.error({ err }, "Uncaught exception");
  process.exit(1);
});
