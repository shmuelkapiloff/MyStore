import { Request, Response } from "express";
import { OrderService } from "../services/order.service";
import { PaymentService } from "../services/payment.service";
import { createOrderSchema } from "../validators/order.validator";
import { asyncHandler, UnauthorizedError } from "../utils/asyncHandler";

// Handles order lifecycle: create, list, retrieve, track, and cancel
export class OrderController {
  /**
   * Create new order
   * POST /api/orders
   *
   * Flow:
   * 1. Create order with status "pending_payment"
   * 2. Create Stripe payment intent
   * 3. Return clientSecret to the client
   * 4. Client completes payment on Stripe
   * 5. Stripe sends webhook to our server
   * 6. Server verifies and marks order as fulfilled
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
  // Returns all orders for the authenticated user, optionally filtered by status
  static getUserOrders = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.userId;
    const { status } = req.query;
    if (!userId) throw new UnauthorizedError();

    const filters = status ? { status: status as string } : undefined;
    const orders = await OrderService.getUserOrders(userId, filters);
    res.status(200).json({ success: true, data: { orders } });
  });

  /** GET /api/orders/:orderId */
  // Returns a specific order by ID, scoped to the authenticated user
  static getOrderById = asyncHandler(async (req: Request, res: Response) => {
    const userId = req.userId;
    const { orderId } = req.params;
    if (!userId) throw new UnauthorizedError();

    const order = await OrderService.getOrderById(orderId, userId);
    res.status(200).json({ success: true, data: { order } });
  });

  /** GET /api/orders/track/:orderId (public) */
  // Public order tracking — no authentication required
  static trackOrder = asyncHandler(async (req: Request, res: Response) => {
    const { orderId } = req.params;
    const tracking = await OrderService.getOrderTracking(orderId);
    res.status(200).json({ success: true, data: tracking });
  });

  /** POST /api/orders/:orderId/cancel */
  // Cancels an existing order belonging to the authenticated user
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
