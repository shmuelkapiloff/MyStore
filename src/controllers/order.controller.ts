import { Request, Response } from "express";
import { OrderService } from "../services/order.service";
import { PaymentService } from "../services/payment.service";
import { createOrderSchema } from "../validators/order.validator";
import { asyncHandler, UnauthorizedError } from "../utils/asyncHandler";

// קונטרולר לניהול הזמנות: יצירה, צפייה, מעקב וביטול
export class OrderController {
  /**
   * Create new order
   * POST /api/orders
   *
   * Flow:
   * 1. יצור order עם סטטוס "pending_payment"
   * 2. יצור payment intent עבור Stripe
   * 3. מחזיר clientSecret ל-CLIENT
   * 4. CLIENT משלם דרך Stripe
   * 5. Stripe שולח webhook
   * 6. Server מאמת ועדכן order
   */
  static createOrder = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.userId;
    const validated = createOrderSchema.parse(req.body);
    if (!userId) throw new UnauthorizedError();

    // 1️⃣ Create order with status = "pending_payment"
    const order = await OrderService.createOrder(userId, validated);

    // 2️⃣ Create payment intent for Stripe
    const paymentIntentResult = await PaymentService.createPaymentIntent(
      userId,
      order._id.toString(),
    );

    // 3️⃣ Update order with paymentIntentId
    order.paymentIntentId =
      paymentIntentResult.payment.providerPaymentId ||
      paymentIntentResult.payment._id.toString();
    order.paymentProvider = "stripe";
    await order.save();

    res.status(201).json({
      success: true,
      data: {
        order,
        payment: {
          clientSecret: paymentIntentResult.clientSecret,
          checkoutUrl: paymentIntentResult.checkoutUrl,
          status: paymentIntentResult.status,
        },
      },
      message: "Order created. Complete payment to confirm.",
    });
  });

  /** GET /api/orders?status=pending */
  // מחזיר את כל ההזמנות של המשתמש המחובר, עם אפשרות לסנן לפי סטטוס
  static getUserOrders = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.userId;
    const { status } = req.query;
    if (!userId) throw new UnauthorizedError();

    const filters = status ? { status: status as string } : undefined;
    const orders = await OrderService.getUserOrders(userId, filters);
    res.status(200).json({ success: true, data: { orders } });
  });

  /** GET /api/orders/:orderId */
  // מחזיר הזמנה ספציפית של המשתמש לפי המזהה שלה
  static getOrderById = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.userId;
    const { orderId } = req.params;
    if (!userId) throw new UnauthorizedError();

    const order = await OrderService.getOrderById(orderId, userId);
    res.status(200).json({ success: true, data: { order } });
  });

  /** GET /api/orders/track/:orderId (public) */
  // מאפשר מעקב אחר הזמנה לפי המזהה שלה, גם בלי להיות מחובר למערכת
  static trackOrder = asyncHandler(async (req: Request, res: Response) => {
    const { orderId } = req.params;
    const tracking = await OrderService.getOrderTracking(orderId);
    res.status(200).json({ success: true, data: tracking });
  });

  /** POST /api/orders/:orderId/cancel */
  // מבטל הזמנה קיימת של המשתמש
  static cancelOrder = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.userId;
    const { orderId } = req.params;
    if (!userId) throw new UnauthorizedError();

    const order = await OrderService.cancelOrder(orderId, userId);
    res.status(200).json({
      success: true,
      data: { order },
      message: "Order cancelled successfully",
    });
  });
}
