import { Schema, model, Document } from "mongoose";

// Tracking History Item Interface
export interface ITrackingHistory {
  status:
    | "pending"
    | "pending_payment"
    | "confirmed"
    | "processing"
    | "shipped"
    | "delivered"
    | "cancelled";
  timestamp: Date;
  message?: string;
}

// Interface for Order document
export interface IOrder extends Document {
  _id: string;
  orderNumber: string;
  user: string;
  items: Array<{
    product: string;
    name: string;
    price: number;
    quantity: number;
    image?: string;
  }>;
  totalAmount: number;
  status:
    | "pending"
    | "pending_payment"
    | "confirmed"
    | "processing"
    | "shipped"
    | "delivered"
    | "cancelled";
  paymentStatus: "pending" | "paid" | "failed" | "refunded";
  paymentMethod: string;
  shippingAddress: {
    fullName: string; // שם מקבל החבילה
    phone: string; // טלפון ליצירת קשר
    street: string;
    city: string;
    postalCode: string;
    country: string;
  };
  billingAddress?: {
    street: string;
    city: string;
    postalCode: string;
    country: string;
  };
  trackingHistory: ITrackingHistory[];
  estimatedDelivery?: Date;
  notes?: string;
  // Payment verification
  paymentIntentId?: string;
  paymentIntentStripeId?: string; // Real Stripe payment_intent ID (pi_...)
  paymentVerifiedAt?: Date;
  paymentProvider?: "stripe" | "paypal";
  fulfilled?: boolean;
  fulfilledAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// Order Schema
const OrderSchema = new Schema<IOrder>(
  {
    orderNumber: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    user: {
      type: String,
      required: [true, "User ID is required"],
      ref: "User",
      index: true,
    },

    items: [
      {
        product: {
          type: String,
          ref: "Product",
          required: true,
        },
        name: {
          type: String,
          required: true,
        },
        price: {
          type: Number,
          required: true,
          min: 0,
        },
        quantity: {
          type: Number,
          required: true,
          min: 1,
        },
        image: String,
      },
    ],

    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },

    status: {
      type: String,
      enum: [
        "pending",
        "pending_payment",
        "confirmed",
        "processing",
        "shipped",
        "delivered",
        "cancelled",
      ],
      default: "pending",
      index: true,
    },

    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed", "refunded"],
      default: "pending",
    },

    paymentMethod: {
      type: String,
      required: true,
      enum: ["credit_card", "paypal", "cash_on_delivery", "stripe"],
    },

    shippingAddress: {
      fullName: {
        type: String,
        required: [true, "Recipient name is required"],
      },
      phone: {
        type: String,
        required: [true, "Contact phone is required"],
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
        default: "Israel",
      },
    },

    billingAddress: {
      street: String,
      city: String,
      postalCode: String,
      country: {
        type: String,
        default: "Israel",
      },
    },

    // Tracking History
    trackingHistory: [
      {
        status: {
          
          type: String,
          enum: [
            "pending",
            "pending_payment",
            "confirmed",
            "processing",
            "shipped",
            "delivered",
            "cancelled",
          ],
          required: true,
        },
        timestamp: {
          type: Date,
          default: Date.now,
        },
        message: {
          type: String,
          maxlength: [500, "Message cannot exceed 500 characters"],
        },
      },
    ],

    // Estimated delivery date
    estimatedDelivery: {
      type: Date,
    },

    notes: {
      type: String,
      maxlength: [500, "Notes cannot exceed 500 characters"],
    },

    // Payment verification fields
    paymentIntentId: {
      type: String,
      index: true,
      description: "Stripe checkout session ID (cs_test_...)",
    },

    // Real Stripe Payment Intent ID (pi_...)
    paymentIntentStripeId: {
      type: String,
      index: true,
      description: "Real Stripe payment_intent ID (pi_...), set after webhook",
    },

    paymentVerifiedAt: {
      type: Date,
      description: "When payment was confirmed by server/webhook",
    },

    paymentProvider: {
      type: String,
      enum: ["stripe", "paypal", "mock"],
    },

    // Fulfillment flag (prevents double stock reduction)
    fulfilled: {
      type: Boolean,
      default: false,
      index: true,
      description: "Whether stock was already reduced and order fulfilled",
    },

    fulfilledAt: {
      type: Date,
      description: "When stock was reduced and cart cleared",
    },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: function (doc, ret) {
        delete (ret as any).__v;
        return ret;
      },
    },
  },
);

// Indexes for better query performance
OrderSchema.index({ user: 1, createdAt: -1 });
OrderSchema.index({ status: 1, createdAt: -1 });

// Pre-save middleware: add initial tracking entry
OrderSchema.pre("save", function (next) {
  if (this.isNew && this.trackingHistory.length === 0) {
    this.trackingHistory.push({
      status: "pending",
      timestamp: new Date(),
      message: "Order has been placed",
    });

    // Set estimated delivery (5 business days)
    const estimatedDate = new Date();
    estimatedDate.setDate(estimatedDate.getDate() + 5);
    this.estimatedDelivery = estimatedDate;
  }
  next();
});

// Static methods
OrderSchema.statics.findByUserId = function (userId: string) {
  return this.find({ user: userId }).sort({ createdAt: -1 });
};

OrderSchema.statics.findByOrderNumber = function (orderNumber: string) {
  return this.findOne({ orderNumber });
};

// Create and export the Order model
export const OrderModel = model<IOrder>("Order", OrderSchema);

// Export types
export type CreateOrderInput = {
  user: string;
  items: Array<{
    product: string;
    name: string;
    price: number;
    quantity: number;
    image?: string;
  }>;
  totalAmount: number;
  paymentMethod: string;
  shippingAddress: {
    street: string;
    city: string;
    postalCode: string;
    country?: string;
  };
  billingAddress?: {
    street: string;
    city: string;
    postalCode: string;
    country?: string;
  };
  notes?: string;
};

export type OrderResponse = {
  _id: string;
  orderNumber: string;
  user: string;
  items: any[];
  totalAmount: number;
  status: string;
  paymentStatus: string;
  paymentMethod: string;
  shippingAddress: any;
  trackingHistory: ITrackingHistory[];
  estimatedDelivery?: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
};

export type TrackingResponse = {
  orderNumber: string;
  status: string;
  estimatedDelivery?: Date;
  trackingHistory: ITrackingHistory[];
  items: any[];
  totalAmount: number;
};
