import { z } from "zod";

// Israeli phone regex: supports 05X-XXXXXXX, 05XXXXXXXX, +972...
const israeliPhoneRegex = /^(\+972|0)([23489]|5[0-9])[0-9]{7}$/;

/**
 * Address = "כרטיס משלוח" מלא
 * כולל את כל המידע הדרוש לשליח: שם מקבל, טלפון, כתובת
 */
export const addressSchema = z.object({
  // פרטי איש קשר - חובה!
  fullName: z
    .string()
    
    .min(2, "Full name must be at least 2 characters")
    .max(100, "Full name cannot exceed 100 characters"),
  phone: z
    .string()
    .regex(
      israeliPhoneRegex,
      "Please provide a valid Israeli phone number (e.g., 0501234567)",
    ),

  // פרטי כתובת
  street: z.string().min(1, "Street is required"),
  city: z.string().min(1, "City is required"),
  postalCode: z.string().min(1, "Postal code is required"),
  country: z.string().min(1, "Country is required"),
  isDefault: z.boolean().optional(),
});

export type AddressInput = z.infer<typeof addressSchema>;

// Update address validation - all fields optional for partial updates
export const updateAddressSchema = addressSchema.partial();

export type UpdateAddressInput = z.infer<typeof updateAddressSchema>;
