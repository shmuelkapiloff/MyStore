import { Request, Response } from "express";
import { AdminService } from "../services/admin.service";
import { asyncHandler } from "../utils/asyncHandler";

// קונטרולר לניהול המערכת על ידי מנהלים: ניהול מוצרים, משתמשים, הזמנות וצפייה בסטטיסטיקות
export class AdminController {
  // Products
  // מחזיר רשימת כל המוצרים בקטלוג, כולל מוצרים לא פעילים אם התבקש
  static listProducts = asyncHandler(async (req: Request, res: Response) => {
    const includeInactive =
      req.query.includeInactive === "false" ? false : true;
    const products = await AdminService.listProducts(includeInactive);
    res.json({ success: true, data: { products } });
  });

  // יוצר מוצר חדש בקטלוג
  static createProduct = asyncHandler(async (req: Request, res: Response) => {
    const product = await AdminService.createProduct(req.body);
    res.status(201).json({ success: true, data: { product } });
  });

  // מעדכן פרטים של מוצר קיים לפי המזהה שלו
  static updateProduct = asyncHandler(async (req: Request, res: Response) => {
    const product = await AdminService.updateProduct(req.params.id, req.body);
    res.json({ success: true, data: { product } });
  });

  // מבטל מוצר (מחיקה רכה) - המוצר לא נמחק בפועל, רק מסומן כלא פעיל
  static deleteProduct = asyncHandler(async (req: Request, res: Response) => {
    const product = await AdminService.deleteProduct(req.params.id);
    res.json({
      success: true,
      data: { product },
      message: "Product disabled (soft delete)",
    });
  });

  // Users
  // מחזיר רשימת משתמשים עם תמיכה בדפדוף (pagination) לפי עמוד וכמות לעמוד
  static listUsers = asyncHandler(async (req: Request, res: Response) => {
    const page = parseInt((req.query.page as string) || "1", 10);
    const limit = parseInt((req.query.limit as string) || "20", 10);
    const users = await AdminService.listUsers(page, limit);
    res.json({ success: true, data: users });
  });

  // מעדכן את התפקיד (role) של משתמש מסוים, למשל הפיכתו למנהל
  static updateUserRole = asyncHandler(async (req: Request, res: Response) => {
    const actingUserId = req.userId;
    const { id } = req.params;
    const { role } = req.body;

    const user = await AdminService.updateUserRole(id, role, actingUserId);
    res.json({ success: true, data: { user } });
  });

  // Orders
  // מחזיר רשימת הזמנות, עם אפשרות לסנן לפי סטטוס או לפי משתמש מסוים
  static listOrders = asyncHandler(async (req: Request, res: Response) => {
    const { status, userId } = req.query;
    const orders = await AdminService.listOrders(
      status as string,
      userId as string
    );
    res.json({ success: true, data: { orders } });
  });

  // מעדכן את סטטוס ההזמנה (למשל: נשלחה, נמסרה) ומוסיף הודעה נלווית
  static updateOrderStatus = asyncHandler(
    async (req: Request, res: Response) => {
      const { id } = req.params;
      const { status, message } = req.body;

      const order = await AdminService.updateOrderStatus(id, status, message);
      res.json({ success: true, data: { order } });
    }
  );

  // Stats
  // מחזיר סיכום סטטיסטיקות כלליות על המערכת (כגון מספר הזמנות, מכירות וכו')
  static getStats = asyncHandler(async (req: Request, res: Response) => {
    const stats = await AdminService.getStatsSummary();
    res.json({ success: true, data: { stats } });
  });
}

