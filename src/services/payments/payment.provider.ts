import { Request } from "express";
import { PaymentStatus } from "../../models/payment.model";

export type CreateIntentParams = {
  orderId: string;
  orderNumber: string;
  userId: string;
  amount: number;
  currency: string;
  metadata?: Record<string, any>;
};

export type CreateIntentResult = {
  providerPaymentId: string;
  status: PaymentStatus;
  clientSecret?: string;
  checkoutUrl?: string;
  raw?: any;
};

export type StatusResult = {
  eventType?: string; // The webhook event type (e.g., "checkout.session.completed")
  providerPaymentId: string;
  status: PaymentStatus;
  amount?: number; // Payment amount in cents (for security verification)
  providerPaymentIntentId?: string; // For Stripe: payment_intent.id
  orderId?: string; // For Stripe: metadata.orderId or client_reference_id
  raw?: any;
};

export interface PaymentProvider {
  name: string;
  createPaymentIntent(params: CreateIntentParams): Promise<CreateIntentResult>;
  getPaymentStatus(providerPaymentId: string): Promise<StatusResult>;
  handleWebhook(req: Request): Promise<StatusResult>;
  refund?(providerPaymentId: string, amount?: number): Promise<StatusResult>;
}
