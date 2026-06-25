import { Schema, model, InferSchemaType } from "mongoose";

const productSchema = new Schema(
  {
    sku: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    description: { type: String, required: true },
    price: { type: Number, required: true },
    category: { type: String, required: true },
    image: { type: String, required: true },
    featured: { type: Boolean, default: false },
    stock: { type: Number, default: 0 },
    rating: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Indexes for better query performance
productSchema.index({ category: 1, isActive: 1 }); // For filtering by category
productSchema.index({ featured: 1, isActive: 1 }); // For featured products
// SKU already has unique: true in schema, no need for explicit index

export type Product = InferSchemaType<typeof productSchema>;
export const ProductModel = model("Product", productSchema);
