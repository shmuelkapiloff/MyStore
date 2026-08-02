import { Request, Response } from "express";
import mongoose from "mongoose";
import { redis } from "../config/redisClient";
import { FailedWebhookModel } from "../models/failed-webhook.model";
import { WebhookEventModel } from "../models/webhook-event.model";
import { asyncHandler } from "../utils/asyncHandler";

// Reports server health: database connections, Redis status, and webhook metrics
export class HealthController {
  // Checks MongoDB + Redis connectivity and webhook stats, returns overall health report
  static getHealth = asyncHandler(async (_req: Request, res: Response) => {
    const mongoOk = mongoose.connection.readyState === 1;
    const redisOk = redis.status === "ready";

    const webhookSecretConfigured = !!process.env.STRIPE_WEBHOOK_SECRET;
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // Count webhooks received in the last 24h and how many failed and are pending retry
    const recentWebhooks = await WebhookEventModel.countDocuments({
      processedAt: { $gte: last24h },
    });
    const failedWebhooks = await FailedWebhookModel.countDocuments({
      status: "pending",
    });

    // If any critical service is down, overall status is "degraded"
    const degraded = !(mongoOk && redisOk);

    res.json({
      success: true,
      data: {
        status: degraded ? "degraded" : "healthy",
        warning: degraded,
        mongodb: mongoOk ? "connected" : "disconnected",
        redis: redisOk ? "connected" : "disconnected",
        webhooks: {
          secretConfigured: webhookSecretConfigured,
          receivedLast24h: recentWebhooks,
          failedPending: failedWebhooks,
          warning: !webhookSecretConfigured
            ? "STRIPE_WEBHOOK_SECRET not configured"
            : failedWebhooks > 5
              ? `${failedWebhooks} failed webhooks pending retry`
              : null,
        },
        uptime: process.uptime(),
      },
    });
  });

  // Simple liveness check — returns immediately to confirm the server is up
  static ping = asyncHandler(async (_req: Request, res: Response) => {
    res.json({
      success: true,
      message: "pong",
      data: { time: Date.now() },
    });
  });
}

// Named exports for backward compatibility
export const getHealth = HealthController.getHealth;
export const ping = HealthController.ping;
