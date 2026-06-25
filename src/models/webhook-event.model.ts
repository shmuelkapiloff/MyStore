import { Schema, model, Document } from "mongoose";

/**
 * Webhook Event Model - Track processed webhooks for idempotency
 */
export interface IWebhookEvent extends Document {
  eventId: string;
  eventType: string;
  provider: string;
  processedAt: Date;
  metadata?: any;
  createdAt: Date;
  updatedAt: Date;
}

const WebhookEventSchema = new Schema<IWebhookEvent>(
  {
    eventId: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    eventType: {
      type: String,
      required: true,
    },
    provider: {
      type: String,
      required: true,
      enum: ["stripe", "paypal"],
    },
    processedAt: {
      type: Date,
      default: Date.now,
    },
    metadata: {
      type: Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
  },
);

// TTL index - automatically delete old webhook events after 30 days
WebhookEventSchema.index({ processedAt: 1 }, { expireAfterSeconds: 2592000 });

export const WebhookEventModel = model<IWebhookEvent>(
  "WebhookEvent",
  WebhookEventSchema,
);
