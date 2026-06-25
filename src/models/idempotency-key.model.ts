import { Schema, model, Document } from "mongoose";

/**
 * Idempotency Key Model - Track order creation requests
 * Prevents duplicate orders from double-submit or network retries
 */
export interface IIdempotencyKey extends Document {
  key: string;
  userId: string;
  resourceType: "order" | "payment";
  resourceId: string;
  requestBody?: any;
  responseStatus: number;
  responseBody?: any;
  expiresAt: Date;
  createdAt: Date;
}

const IdempotencyKeySchema = new Schema<IIdempotencyKey>(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    userId: {
      type: String,
      required: true,
      index: true,
    },
    resourceType: {
      type: String,
      enum: ["order", "payment"],
      required: true,
    },
    resourceId: {
      type: String,
      required: true,
    },
    requestBody: {
      type: Schema.Types.Mixed,
    },
    responseStatus: {
      type: Number,
      required: true,
    },
    responseBody: {
      type: Schema.Types.Mixed,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: { expires: 0 }, // TTL index - auto-delete when expires
    },
  },
  {
    timestamps: true,
  }
);

export const IdempotencyKeyModel = model<IIdempotencyKey>(
  "IdempotencyKey",
  IdempotencyKeySchema
);
