import { Schema, model, Document } from "mongoose";

export type PaymentStatus =
  | "pending"
  | "requires_action"
  | "succeeded"
  | "failed"
  | "refunded"
  | "canceled";

export interface IPayment extends Document {
  _id: string;
  order: string;
  user: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  provider: string;
  providerPaymentId?: string;
  paymentIntentId?: string; // Real Stripe payment_intent ID (pi_...)
  clientSecret?: string;
  checkoutUrl?: string;
  meta?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const PaymentSchema = new Schema<IPayment>(
  {
    order: {
      type: String,
      ref: "Order",
      required: true,
      index: true,
    },
    user: {
      type: String,
      ref: "User",
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      required: true,
      default: "ILS",
    },
    status: {
      type: String,
      enum: [
        "pending",
        "requires_action",
        "succeeded",
        "failed",
        "refunded",
        "canceled",
      ],
      default: "pending",
      index: true,
    },
    provider: {
      type: String,
      required: true,
      default: "mock",
      index: true,
    },
    providerPaymentId: {
      type: String,
      index: true,
    },
    paymentIntentId: {
      type: String,
      index: true,
      description:
        "Real Stripe payment_intent ID (pi_...), extracted from meta.payment_intent",
    },
    clientSecret: String,
    checkoutUrl: String,
    meta: {
      type: Schema.Types.Mixed,
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: function (_doc, ret) {
        delete (ret as any).__v;
        return ret;
      },
    },
  },
);

PaymentSchema.index({ order: 1, provider: 1 });
PaymentSchema.index({ status: 1, createdAt: -1 });

export const PaymentModel = model<IPayment>("Payment", PaymentSchema);

export type CreatePaymentInput = {
  order: string;
  user: string;
  amount: number;
  currency: string;
  provider: string;
  providerPaymentId?: string;
  clientSecret?: string;
  checkoutUrl?: string;
  meta?: Record<string, any>;
};

export type PaymentResponse = {
  _id: string;
  order: string;
  user: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
  provider: string;
  providerPaymentId?: string;
  clientSecret?: string;
  checkoutUrl?: string;
  meta?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
};
