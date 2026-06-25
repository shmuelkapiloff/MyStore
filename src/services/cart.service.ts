import { CartModel, ICart, ICartItem } from "../models/cart.model";
import { ProductModel } from "../models/product.model";
import { redis as redisClient } from "../config/redisClient";
import { logger } from "../utils/logger";
import { CART_CACHE_TTL } from "../config/constants";
import mongoose from "mongoose";
import { ApiError, NotFoundError } from "../utils/asyncHandler";

/**
 * Cart Service — Write-Through Strategy
 *
 * Every mutation writes to MongoDB first (source of truth),
 * then updates the Redis cache. Reads try Redis first and
 * fall back to MongoDB on a cache miss.
 *
 * This guarantees data durability while still being fast for reads.
 */
export class CartService {
  private static readonly CACHE_TTL = CART_CACHE_TTL;

  // ── Redis helpers (best-effort, never throw) ──────────────────────────

  private static isRedisReady(): boolean {
    return redisClient.status === "ready";
  }

  private static cacheKey(userId: string): string {
    return `cart:user:${userId}`;
  }

  private static async cacheSet(key: string, data: unknown): Promise<void> {
    if (!this.isRedisReady()) return;
    try {
      await redisClient.setex(key, this.CACHE_TTL, JSON.stringify(data));
    } catch (err) {
      logger.warn({ err, key }, "Redis SET failed (swallowed)");
    }
  }

  private static async cacheGet(key: string): Promise<ICart | null> {
    if (!this.isRedisReady()) return null;
    try {
      const raw = await redisClient.get(key);
      if (!raw) return null;

      const parsed = JSON.parse(raw);

      // Ensure cached data has populated product details
      if (parsed.items?.length > 0) {
        const first = parsed.items[0];
        if (
          typeof first.product !== "object" ||
          !first.product?.name ||
          !first.product?.price
        ) {
          // Cache is stale / not populated — force a DB read
          return null;
        }
      }

      return parsed;
    } catch (err) {
      logger.warn({ err, key }, "Redis GET failed (swallowed)");
      return null;
    }
  }

  private static async cacheDel(key: string): Promise<void> {
    if (!this.isRedisReady()) return;
    try {
      await redisClient.del(key);
    } catch (err) {
      logger.warn({ err, key }, "Redis DEL failed (swallowed)");
    }
  }

  // ── Helper: fetch cart from DB with populated products & cache it ─────

  private static async fetchAndCache(userId: string): Promise<ICart | null> {
    const cart = await CartModel.findOne({ userId }).populate("items.product");
    if (!cart) return null;

    const obj = cart.toObject();
    await this.cacheSet(this.cacheKey(userId), obj);
    return obj;
  }

  // ── Public API ────────────────────────────────────────────────────────

  /** Get cart for authenticated user */
  static async getCart(userId: string): Promise<ICart | null> {
    // 1. Try Redis
    const cached = await this.cacheGet(this.cacheKey(userId));
    if (cached) return cached;

    // 2. Fallback to MongoDB
    return this.fetchAndCache(userId);
  }

  /** Add item to cart (with optimistic-concurrency retry) */
  static async addToCart(
    productId: string,
    quantity: number,
    userId: string,
  ): Promise<ICart> {
    const MAX_RETRIES = 3;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await this._addToCartOnce(productId, quantity, userId);
      } catch (err: any) {
        // Retry only on Mongoose VersionError (optimistic-lock conflict)
        if (err.name === "VersionError" && attempt < MAX_RETRIES) {
          logger.warn(
            { attempt, userId, productId },
            "Cart VersionError — retrying",
          );
          continue;
        }
        throw err;
      }
    }

    // Unreachable, but satisfies TS
    throw new ApiError(500, "Failed to add to cart after retries");
  }

  /** Single attempt at adding an item (extracted for retry wrapper) */
  private static async _addToCartOnce(
    productId: string,
    quantity: number,
    userId: string,
  ): Promise<ICart> {
    // Fetch product and cart in parallel — they are independent
    const [product, existingCart] = await Promise.all([
      ProductModel.findById(productId),
      CartModel.findOne({ userId }),
    ]);

    if (!product) {
      throw new NotFoundError("Product");
    }

    // Find or create cart
    let cart = existingCart;

    if (!cart) {
      cart = new CartModel({
        userId: new mongoose.Types.ObjectId(userId),
        items: [],
        total: 0,
      });
    }

    // Check if item already in cart
    const existingIdx = cart.items.findIndex(
      (item: ICartItem) => item.product.toString() === productId,
    );

    if (existingIdx >= 0) {
      const newQty = cart.items[existingIdx].quantity + quantity;
      if (product.stock < newQty) {
        throw new ApiError(
          400,
          `Insufficient stock. Available: ${product.stock}, Requested: ${newQty}`,
          undefined,
          "VALIDATION_ERROR",
        );
      }
      cart.items[existingIdx].quantity = newQty;
    } else {
      if (product.stock < quantity) {
        throw new ApiError(
          400,
          "Insufficient stock",
          undefined,
          "VALIDATION_ERROR",
        );
      }
      cart.items.push({
        product: productId as any,
        quantity,
        lockedPrice: null,
      });
    }

    // Save to MongoDB (source of truth)
    await cart.save();

    // The pre-save hook already populated items.product to calculate total.
    // Reuse the in-memory populated document instead of a redundant DB round-trip.
    const cartObj = cart.toObject();
    await this.cacheSet(this.cacheKey(userId), cartObj);
    return cartObj as ICart;
  }

  /** Remove item from cart */
  static async removeFromCart(
    productId: string,
    userId: string,
  ): Promise<ICart | null> {
    const cart = await CartModel.findOne({ userId });
    if (!cart) return null;

    cart.items = cart.items.filter(
      (item: ICartItem) => item.product.toString() !== productId,
    ) as any;

    await cart.save();
    const cartObj = cart.toObject();
    await this.cacheSet(this.cacheKey(userId), cartObj);
    return cartObj as ICart;
  }

  /** Update item quantity */
  static async updateQuantity(
    productId: string,
    quantity: number,
    userId: string,
  ): Promise<ICart | null> {
    if (quantity <= 0) {
      return this.removeFromCart(productId, userId);
    }

    const cart = await CartModel.findOne({ userId });
    if (!cart) return null;

    const idx = cart.items.findIndex(
      (item: ICartItem) => item.product.toString() === productId,
    );
    if (idx < 0) return cart.toObject();

    // Validate stock
    const product = await ProductModel.findById(productId);
    if (!product) {
      throw new NotFoundError("Product");
    }
    if (product.stock < quantity) {
      throw new ApiError(
        400,
        `Insufficient stock. Available: ${product.stock}, Requested: ${quantity}`,
        undefined,
        "VALIDATION_ERROR",
      );
    }

    cart.items[idx].quantity = quantity;
    await cart.save();
    const cartObj = cart.toObject();
    await this.cacheSet(this.cacheKey(userId), cartObj);
    return cartObj as ICart;
  }

  /** Clear cart */
  static async clearCart(userId: string): Promise<boolean> {
    try {
      await CartModel.deleteOne({ userId });
      await this.cacheDel(this.cacheKey(userId));
      return true;
    } catch (err) {
      logger.error({ err, userId }, "Failed to clear cart");
      return false;
    }
  }

  /** Cart stats (admin) */
  static async getCartStats() {
    const stats = await CartModel.aggregate([
      {
        $group: {
          _id: null,
          totalCarts: { $sum: 1 },
          averageTotal: { $avg: "$total" },
          averageItems: { $avg: { $size: "$items" } },
        },
      },
    ]);

    return stats[0] || { totalCarts: 0, averageTotal: 0, averageItems: 0 };
  }
}
