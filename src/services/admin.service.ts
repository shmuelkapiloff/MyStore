import { FilterQuery } from "mongoose";
import { ProductModel } from "../models/product.model";
import { UserModel } from "../models/user.model";
import { OrderModel } from "../models/order.model";
import { OrderService } from "./order.service";

export class AdminService {
  // Products
  static async listProducts(includeInactive = true) {
    const query: FilterQuery<Record<string, any>> = includeInactive
      ? {}
      : { isActive: true };

    return ProductModel.find(query).sort({ createdAt: -1 }).lean();
  }

  static async createProduct(data: any) {
    const required = [
      "sku",
      "name",
      "description",
      "price",
      "category",
      "image",
    ];
    for (const field of required) {
      if (!data[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    return ProductModel.create(data);
  }

  static async updateProduct(id: string, data: any) {
    const product = await ProductModel.findByIdAndUpdate(id, data, {
      new: true,
    });
    if (!product) {
      throw new Error("Product not found");
    }
    return product;
  }

  static async deleteProduct(id: string) {
    // Soft delete by marking inactive to keep history integrity
    const product = await ProductModel.findByIdAndUpdate(
      id,
      { isActive: false },
      { new: true },
    );

    if (!product) {
      throw new Error("Product not found");
    }

    return product;
  }

  // Users
  static async listUsers(page = 1, limit = 20) {
    const skip = (page - 1) * limit;
    const [users, total] = await Promise.all([
      UserModel.find().sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      UserModel.countDocuments(),
    ]);

    return {
      users,
      total,
      page,
      pages: Math.ceil(total / limit) || 1,
    };
  }

  static async updateUserRole(
    targetUserId: string,
    role: "user" | "admin",
    actingUserId?: string,
  ) {
    if (!role || !["user", "admin"].includes(role)) {
      throw new Error("Invalid role");
    }

    if (actingUserId && targetUserId === actingUserId) {
      throw new Error("Admins cannot change their own role");
    }

    const user = await UserModel.findById(targetUserId);
    if (!user) {
      throw new Error("User not found");
    }

    user.role = role;
    await user.save();

    return user;
  }

  // Orders
  static async listOrders(status?: string, userId?: string) {
    const query: any = {};
    if (status) query.status = status;
    if (userId) query.user = userId;

    return OrderModel.find(query)
      .sort({ createdAt: -1 })
      .populate("user", "email name")
      .lean();
  }

  static async updateOrderStatus(
    orderId: string,
    newStatus: string,
    message?: string,
  ) {
    return OrderService.updateOrderStatus(orderId, newStatus, message);
  }

  // Stats
  static async getStatsSummary() {
    const today = new Date();
    const startOfDay = new Date(today.setHours(0, 0, 0, 0));

    const [
      deliveredAgg,
      openOrders,
      ordersToday,
      lowStockProducts,
      usersCount,
      productsCount,
    ] = await Promise.all([
      OrderModel.aggregate([
        { $match: { status: "delivered" } },
        {
          $group: {
            _id: null,
            total: { $sum: "$totalAmount" },
            count: { $sum: 1 },
          },
        },
      ]),
      OrderModel.countDocuments({
        status: { $in: ["pending", "confirmed", "processing", "shipped"] },
      }),
      OrderModel.countDocuments({ createdAt: { $gte: startOfDay } }),
      ProductModel.find({ isActive: true, stock: { $lt: 5 } })
        .select("_id name stock")
        .lean(),
      UserModel.countDocuments({}),
      ProductModel.countDocuments({ isActive: true }),
    ]);

    const delivered = deliveredAgg?.[0] || { total: 0, count: 0 };

    return {
      sales: {
        total: delivered.total || 0,
        deliveredCount: delivered.count || 0,
      },
      orders: {
        open: openOrders,
        today: ordersToday,
      },
      inventory: {
        lowStockCount: lowStockProducts.length,
        lowStockProducts,
        activeProducts: productsCount,
      },
      users: {
        total: usersCount,
      },
    };
  }
}
