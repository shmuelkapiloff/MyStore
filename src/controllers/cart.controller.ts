import { Request, Response } from "express";
import { CartService } from "../services/cart.service";
import { sendSuccess, sendError } from "../utils/response";
import { logger } from "../utils/logger";
import { asyncHandler } from "../utils/asyncHandler";
import mongoose from "mongoose";

// קונטרולר לניהול עגלת הקניות של המשתמש
export class CartController {
  // מחזיר את עגלת הקניות של המשתמש המחובר, או עגלה ריקה אם אין לו עגלה עדיין
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

  // מוסיף מוצר לעגלת הקניות, אחרי בדיקת תקינות הנתונים שהתקבלו
  static addToCart = asyncHandler(async (req: Request, res: Response) => {
    const { productId, quantity } = req.body;
    const userId = req.userId; // From auth middleware

    if (!userId) {
      sendError(res, 401, "Authentication required");
      return;
    }

    // בדיקות תקינות: שדות חובה קיימים, מזהה המוצר בפורמט תקין, והכמות חיובית
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

  // מעדכן את הכמות של מוצר קיים בעגלה
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

  // מסיר מוצר מסוים מעגלת הקניות
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

  // מנקה את כל הפריטים מעגלת הקניות של המשתמש
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

  // מחזיר את מספר הפריטים הכולל בעגלה (שימושי למשל לתצוגה על אייקון העגלה)
  static getCartCount = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.userId; // From auth middleware

    if (!userId) {
      sendSuccess(res, { count: 0 });
      return;
    }

    const cart = await CartService.getCart(userId);
    // סוכם את הכמויות של כל הפריטים בעגלה למספר אחד
    const count = cart
      ? cart.items.reduce((sum: number, item: any) => sum + item.quantity, 0)
      : 0;

    sendSuccess(res, { count });
  });
}
