import { Schema, model, Document } from "mongoose";

/**
 * Failed Webhook Model - Track failed webhook processing for retry
 */
export interface IFailedWebhook extends Document {
  eventId: string;
  eventType: string;
  provider: string;
  payload: any;
  error: string;
  retryCount: number;
  maxRetries: number;
  nextRetryAt: Date;
  lastAttemptAt: Date;
  status: "pending" | "retrying" | "failed" | "succeeded";
  createdAt: Date;
  updatedAt: Date;
}

const FailedWebhookSchema = new Schema<IFailedWebhook>(
  {
    eventId: {
      type: String,
      required: true,
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
    payload: {
      type: Schema.Types.Mixed,
      required: true,
    },
    error: {
      type: String,
      required: true,
    },
    retryCount: {
      type: Number,
      default: 0,
    },
    maxRetries: {
      type: Number,
      default: 5,
    },
    nextRetryAt: {
      type: Date,
      required: true,
      index: true,
    },
    lastAttemptAt: {
      type: Date,
      default: Date.now,
    },
    status: {
      type: String,
      enum: ["pending", "retrying", "failed", "succeeded"],
      default: "pending",
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

// Index for finding webhooks ready for retry
FailedWebhookSchema.index({ status: 1, nextRetryAt: 1 });

export const FailedWebhookModel = model<IFailedWebhook>(
  "FailedWebhook",
  FailedWebhookSchema
);
