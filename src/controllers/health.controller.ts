import { Request, Response } from "express";
import mongoose from "mongoose";
import { redis } from "../config/redisClient";
import { FailedWebhookModel } from "../models/failed-webhook.model";
import { WebhookEventModel } from "../models/webhook-event.model";
import { asyncHandler } from "../utils/asyncHandler";

// קונטרולר שבודק את מצב התקינות (health) של השרת והשירותים שהוא תלוי בהם
export class HealthController {
  // בודק את החיבור למסדי הנתונים (MongoDB, Redis) ואת מצב ה-webhooks, ומחזיר דוח תקינות כללי
  static getHealth = asyncHandler(async (_req: Request, res: Response) => {
    const mongoOk = mongoose.connection.readyState === 1;
    const redisOk = redis.status === "ready";

    const webhookSecretConfigured = !!process.env.STRIPE_WEBHOOK_SECRET;
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    // סופר כמה webhooks התקבלו ב-24 השעות האחרונות וכמה נכשלו וממתינים לטיפול
    const recentWebhooks = await WebhookEventModel.countDocuments({
      processedAt: { $gte: last24h },
    });
    const failedWebhooks = await FailedWebhookModel.countDocuments({
      status: "pending",
    });

    // אם אחד מהשירותים החיוניים לא תקין, המצב הכללי נחשב "פגום" (degraded)
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

  // בדיקת חיים פשוטה - מחזיר תשובה מיידית שמאשרת שהשרת פעיל ומגיב
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
