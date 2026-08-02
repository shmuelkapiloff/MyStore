import { Request, Response } from "express";
import { AdminService } from "../services/admin.service";
import { asyncHandler } from "../utils/asyncHandler";

// Admin-only controller: product management, user management, orders, and stats
export class AdminController {
  // Products
  // Returns all products in the catalog, including inactive ones if requested
  static listProducts = asyncHandler(async (req: Request, res: Response) => {
    const includeInactive =
      req.query.includeInactive === "false" ? false : true;
    const products = await AdminService.listProducts(includeInactive);
    res.json({ success: true, data: { products } });
  });

  // Creates a new product in the catalog
  static createProduct = asyncHandler(async (req: Request, res: Response) => {
    const product = await AdminService.createProduct(req.body);
    res.status(201).json({ success: true, data: { product } });
  });

  // Updates an existing product by ID
  static updateProduct = asyncHandler(async (req: Request, res: Response) => {
    const product = await AdminService.updateProduct(req.params.id, req.body);
    res.json({ success: true, data: { product } });
  });

  // Soft-deletes a product — marks it inactive without removing from DB
  static deleteProduct = asyncHandler(async (req: Request, res: Response) => {
    const product = await AdminService.deleteProduct(req.params.id);
    res.json({
      success: true,
      data: { product },
      message: "Product disabled (soft delete)",
    });
  });

  // Users
  // Returns paginated list of users
  static listUsers = asyncHandler(async (req: Request, res: Response) => {
    const page = parseInt((req.query.page as string) || "1", 10);
    const limit = parseInt((req.query.limit as string) || "20", 10);
    const users = await AdminService.listUsers(page, limit);
    res.json({ success: true, data: users });
  });

  // Updates a user's role (e.g. promote to admin)
  static updateUserRole = asyncHandler(async (req: Request, res: Response) => {
    const actingUserId = req.userId;
    const { id } = req.params;
    const { role } = req.body;

    const user = await AdminService.updateUserRole(id, role, actingUserId);
    res.json({ success: true, data: { user } });
  });

  // Orders
  // Returns orders, optionally filtered by status or userId
  static listOrders = asyncHandler(async (req: Request, res: Response) => {
    const { status, userId } = req.query;
    const orders = await AdminService.listOrders(
      status as string,
      userId as string
    );
    res.json({ success: true, data: { orders } });
  });

  // Updates order status (e.g. shipped, delivered) with an optional message
  static updateOrderStatus = asyncHandler(
    async (req: Request, res: Response) => {
      const { id } = req.params;
      const { status, message } = req.body;

      const order = await AdminService.updateOrderStatus(id, status, message);
      res.json({ success: true, data: { order } });
    }
  );

  // Stats
  // Returns a summary of system-wide statistics (orders count, sales, etc.)
  static getStats = asyncHandler(async (req: Request, res: Response) => {
    const stats = await AdminService.getStatsSummary();
    res.json({ success: true, data: { stats } });
  });
}

