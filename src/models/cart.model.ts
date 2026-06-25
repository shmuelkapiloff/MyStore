import { Schema, model, InferSchemaType, Types } from "mongoose";
import { ProductModel } from "./product.model";

// Cart Item Schema - פריט בעגלה
const cartItemSchema = new Schema(
  {
    product: {
      type: Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
    },
    // מחיר מנעול רק בזמן תשלום
    lockedPrice: {
      type: Number,
      default: null, // null = משתמש בחנות, value = נעול בתשלום
    },
  },
  { _id: false },
);

// Cart Schema - עגלת קניות
const cartSchema = new Schema(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true, // unique already creates an index in MongoDB
    },
    items: [cartItemSchema],
    total: {
      type: Number,
      default: 0,
    },
  },

  {
    timestamps: true,
  },
);

// Pre-save middleware to calculate total
cartSchema.pre("save", async function (next) {
  if (this.isModified("items")) {
    // Query products directly — avoids fragile populate() inside pre-save hook
    const productIds = this.items.map((item) => item.product as Types.ObjectId);
    const products = await ProductModel.find(
      { _id: { $in: productIds } },
      { price: 1 },
    ).lean();

    const priceMap = new Map(products.map((p) => [p._id.toString(), p.price]));

    let total = 0;
    for (const item of this.items) {
      const price =
        item.lockedPrice ?? priceMap.get(item.product.toString()) ?? 0;
      total += price * item.quantity;
    }

    this.total = total;
  }
  next();
});

// Types
export interface ICartItem {
  product: Types.ObjectId;
  quantity: number;
  lockedPrice: number | null; // null = משתמש בחנות, value = נעול בתשלום
}

export type ICart = InferSchemaType<typeof cartSchema>;
export const CartModel = model("Cart", cartSchema);

// Default export for compatibility
export default CartModel;
