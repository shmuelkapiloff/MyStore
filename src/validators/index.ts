/**
 * Centralized Validators Index
 *
 * This module re-exports all validators with a unified interface.
 * All validation schemas use Zod for strict runtime type checking.
 *
 * Usage:
 * ──────
 *   import { registerSchema, type RegisterInput } from "./validators";
 *   const result = registerSchema.parse(data);
 */

// ═══════════════════════════════════════════════════════════════════════════
// AUTH VALIDATORS
// ═══════════════════════════════════════════════════════════════════════════

export {
  registerSchema,
  type RegisterInput,
  loginSchema,
  type LoginInput,
  forgotPasswordSchema,
  type ForgotPasswordInput,
  resetPasswordSchema,
  type ResetPasswordInput,
  updateProfileSchema,
  type UpdateProfileInput,
} from "./auth.validator";

// ═══════════════════════════════════════════════════════════════════════════
// ADDRESS VALIDATORS
// ═══════════════════════════════════════════════════════════════════════════

export {
  addressSchema,
  type AddressInput,
  updateAddressSchema,
  type UpdateAddressInput,
} from "./address.validator";

// ═══════════════════════════════════════════════════════════════════════════
// ORDER VALIDATORS
// ═══════════════════════════════════════════════════════════════════════════

export {
  shippingAddressSchema,
  PaymentMethodEnum,
  type PaymentMethod,
  createOrderSchema,
  type CreateOrderInput,
  cancelOrderSchema,
  type CancelOrderInput,
} from "./order.validator";

// ═══════════════════════════════════════════════════════════════════════════
// PAYMENT VALIDATORS
// ═══════════════════════════════════════════════════════════════════════════

export {
  createPaymentIntentSchema,
  type CreatePaymentIntentInput,
  paymentStatusParamsSchema,
  type PaymentStatusParams,
  processRefundSchema,
  type ProcessRefundInput,
  confirmPaymentSchema,
  type ConfirmPaymentInput,
} from "./payment.validator";

// ═══════════════════════════════════════════════════════════════════════════
// VALIDATION UTILITIES
// ═══════════════════════════════════════════════════════════════════════════

import { ZodSchema, ZodError, ZodObject } from "zod";
import { ValidationError } from "../utils/asyncHandler";

// Helper to create ValidationError with field context
function createValidationError(
  message: string,
  field?: string,
): ValidationError {
  const errors = field ? [{ field, message }] : undefined;
  return new ValidationError(message, errors);
}

/**
 * Parse and validate data against a schema
 * Throws ValidationError on failure (professional error handling)
 *
 * @param schema - Zod validation schema
 * @param data - Data to validate
 * @returns Validated data
 * @throws ValidationError if validation fails
 */
export function validate<T>(schema: ZodSchema, data: unknown): T {
  try {
    return schema.parse(data) as T;
  } catch (error) {
    if (error instanceof ZodError) {
      const firstError = error.errors[0];
      const message = `${firstError.path.join(".")}: ${firstError.message}`;
      throw createValidationError(message, firstError.path[0]?.toString());
    }
    throw error;
  }
}

/**
 * Safely validate data without throwing
 * Returns tuple: [data, error]
 *
 * @param schema - Zod validation schema
 * @param data - Data to validate
 * @returns Tuple with validated data or error
 */
export function validateSafe<T>(
  schema: ZodSchema,
  data: unknown,
): [T | null, ValidationError | null] {
  try {
    return [schema.parse(data) as T, null];
  } catch (error) {
    if (error instanceof ZodError) {
      const firstError = error.errors[0];
      const message = `${firstError.path.join(".")}: ${firstError.message}`;
      return [
        null,
        createValidationError(message, firstError.path[0]?.toString()),
      ];
    }
    return [null, createValidationError("Validation failed")];
  }
}

/**
 * Validate object properties partially (for PATCH requests)
 * Only validates provided fields
 *
 * @param schema - Zod validation schema (must be ZodObject)
 * @param data - Partial data to validate
 * @returns Validated partial data
 */
export function validatePartial<T extends ZodObject<any>>(
  schema: T,
  data: unknown,
): Partial<T["_output"]> {
  const partialSchema = schema.partial();
  try {
    return partialSchema.parse(data) as Partial<T["_output"]>;
  } catch (error) {
    if (error instanceof ZodError) {
      const firstError = error.errors[0];
      const message = `${firstError.path.join(".")}: ${firstError.message}`;
      throw createValidationError(message, firstError.path[0]?.toString());
    }
    throw error;
  }
}
