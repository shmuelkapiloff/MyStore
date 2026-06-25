import { z } from "zod";

// Israeli phone regex: supports 05X-XXXXXXX, 05XXXXXXXX, +972...
const israeliPhoneRegex = /^(\+972|0)([23489]|5[0-9])[0-9]{7}$/;

/**
 * Shipping address = "כרטיס משלוח" מלא
 * כולל את כל המידע הדרוש לשליח: שם מקבל, טלפון, כתובת
 * בהזמנה זה מועתק מהכתובת שהמשתמש בחר
 */
export const shippingAddressSchema = z.object({
  // פרטי איש קשר - חובה!
  fullName: z
    .string()
    .min(2, "Recipient name must be at least 2 characters")
    .max(100, "Recipient name cannot exceed 100 characters"),
  phone: z
    .string()
    .regex(israeliPhoneRegex, "Please provide a valid Israeli phone number"),

  // פרטי כתובת
  street: z.string().min(1, "Street is required"),
  city: z.string().min(1, "City is required"),
  postalCode: z.string().min(1, "Postal code is required"),
  country: z.string().min(1, "Country is required"),
});

// Payment method enum - currently only Stripe; add more later if needed
export const PaymentMethodEnum = z.enum([
  "stripe", // Online payment via Stripe
]);

export type PaymentMethod = z.infer<typeof PaymentMethodEnum>;

// Create order validation - sessionId removed (guest mode disabled)
export const createOrderSchema = z.object({
  shippingAddress: shippingAddressSchema,
  billingAddress: shippingAddressSchema.optional(),
  paymentMethod: PaymentMethodEnum.default("stripe"),
  notes: z.string().optional(),
});

export type CreateOrderInput = z.infer<typeof createOrderSchema>;

// Cancel order validation (just needs orderId from params)
export const cancelOrderSchema = z.object({
  orderId: z.string().min(1, "Order ID is required"),
});

export type CancelOrderInput = z.infer<typeof cancelOrderSchema>;
