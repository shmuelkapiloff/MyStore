import { Request, Response } from "express";
import { CartService } from "../services/cart.service";
import { sendSuccess, sendError } from "../utils/response";
import { logger } from "../utils/logger";
import { asyncHandler } from "../utils/asyncHandler";
import mongoose from "mongoose";

// Handles cart operations for the authenticated user
export class CartController {
  // Returns the user's cart, or an empty cart if none exists yet
  static getCart = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.userId; // From auth middleware

    if (!userId) {
      sendError(res, 401, "Authentication required");
      return;
    }

    logger.debug({ userId }, "Getting cart");

    const cart = await CartService.getCart(userId);

    if (!cart) {
      sendSuccess(res, {
        userId,
        items: [],
        total: 0,
      });
      return;
    }

    sendSuccess(res, cart);
  });

  // Adds a product to the cart after input validation
  static addToCart = asyncHandler(async (req: Request, res: Response) => {
    const { productId, quantity } = req.body;
    const userId = req.userId; // From auth middleware

    if (!userId) {
      sendError(res, 401, "Authentication required");
      return;
    }

    // Validate: required fields present, valid ObjectId format, positive quantity
    if (!productId || !quantity) {
      sendError(res, 400, "Missing required fields: productId and quantity");
      return;
    }

    if (!mongoose.isValidObjectId(productId)) {
      sendError(res, 400, "Invalid productId format");
      return;
    }

    if (quantity <= 0) {
      sendError(res, 400, "Quantity must be greater than 0");
      return;
    }

    logger.info({ userId, productId, quantity }, "Adding item to cart");

    const cart = await CartService.addToCart(productId, quantity, userId);

    sendSuccess(res, cart, "Item added to cart");
  });

  // Updates the quantity of an item already in the cart
  static updateQuantity = asyncHandler(async (req: Request, res: Response) => {
    const { productId, quantity } = req.body;
    const userId = req.userId; // From auth middleware

    if (!userId) {
      sendError(res, 401, "Authentication required");
      return;
    }

    if (!productId || quantity === undefined) {
      sendError(res, 400, "Missing required fields: productId and quantity");
      return;
    }

    logger.info({ userId, productId, quantity }, "Updating cart item quantity");

    const cart = await CartService.updateQuantity(productId, quantity, userId);

    if (!cart) {
      sendError(res, 404, "Cart not found");
      return;
    }

    sendSuccess(res, cart, "Quantity updated");
  });

  // Removes a specific product from the cart
  static removeFromCart = asyncHandler(async (req: Request, res: Response) => {
    const { productId } = req.body;
    const userId = req.userId; // From auth middleware

    if (!userId) {
      sendError(res, 401, "Authentication required");
      return;
    }

    if (!productId) {
      sendError(res, 400, "Missing required field: productId");
      return;
    }

    logger.info({ userId, productId }, "Removing item from cart");

    const cart = await CartService.removeFromCart(productId, userId);

    if (!cart) {
      sendError(res, 404, "Cart not found");
      return;
    }

    sendSuccess(res, cart, "Item removed from cart");
  });

  // Clears all items from the user's cart
  static clearCart = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.userId; // From auth middleware

    if (!userId) {
      sendError(res, 401, "Authentication required");
      return;
    }

    logger.info({ userId }, "Clearing cart");

    const success = await CartService.clearCart(userId);

    if (!success) {
      sendError(res, 500, "Failed to clear cart");
      return;
    }

    sendSuccess(res, { userId, items: [], total: 0 }, "Cart cleared");
  });

  // Returns total item count in the cart (useful for cart icon badge)
  static getCartCount = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.userId; // From auth middleware

    if (!userId) {
      sendSuccess(res, { count: 0 });
      return;
    }

    const cart = await CartService.getCart(userId);
    // Sum quantities across all cart items
    const count = cart
      ? cart.items.reduce((sum: number, item: any) => sum + item.quantity, 0)
      : 0;

    sendSuccess(res, { count });
  });
}
