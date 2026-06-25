import { Schema, model, Document } from "mongoose";

// Israeli phone regex: 05X-XXXXXXX or 05XXXXXXXX or +972...
const PHONE_REGEX = /^(\+972|0)([23489]|5[0-9])[0-9]{7}$/;

export interface IAddress extends Document {
  user: string;
  fullName: string; // שם מקבל החבילה (חובה!)
  phone: string; // טלפון ליצירת קשר (חובה!)
  street: string;
  city: string;
  postalCode: string;
  country: string;
  isDefault: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const AddressSchema = new Schema<IAddress>(
  {
    user: {
      type: String,
      required: true,
      ref: "User",
      index: true,
    },
    fullName: {
      type: String,
      required: [true, "Recipient name is required"],
      minlength: [2, "Name must be at least 2 characters"],
      maxlength: [100, "Name cannot exceed 100 characters"],
    },
    phone: {
      type: String,
      required: [true, "Phone number is required"],
      match: [PHONE_REGEX, "Please provide a valid Israeli phone number"],
    },
    street: {
      type: String,
      required: true,
    },
    city: {
      type: String,
      required: true,
    },
    postalCode: {
      type: String,
      required: true,
    },
    country: {
      type: String,
      required: true,
      default: "Israel",
    },
    isDefault: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  {
    timestamps: true,
  },
);

export const AddressModel = model<IAddress>("Address", AddressSchema);
export type CreateAddressInput = Omit<
  IAddress,
  "_id" | "createdAt" | "updatedAt"
>;
export type UpdateAddressInput = Partial<CreateAddressInput>;
