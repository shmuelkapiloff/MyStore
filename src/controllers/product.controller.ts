import { Request, Response } from "express";
import {
  listProducts,
  getProductById,
  getCategories,
  ProductFilters,
} from "../services/product.service";
import { asyncHandler, NotFoundError } from "../utils/asyncHandler";

// קונטרולר ציבורי לקריאת מידע על מוצרים (אינו דורש התחברות)
export class ProductController {
  /** GET /api/products */
  // מחזיר רשימת מוצרים עם אפשרות לסנן לפי קטגוריה, טווח מחירים, חיפוש טקסט והדגשה (featured)
  static getProducts = asyncHandler(async (req: Request, res: Response) => {
    // בניית אובייקט הסינון מתוך פרמטרי השאילתה (query) שהתקבלו בכתובת ה-URL
    const filters: ProductFilters = {
      category: req.query.category as string,
      minPrice: req.query.minPrice
        ? parseFloat(req.query.minPrice as string)
        : undefined,
      maxPrice: req.query.maxPrice
        ? parseFloat(req.query.maxPrice as string)
        : undefined,
      search: req.query.search as string,
      featured:
        req.query.featured === "true"
          ? true
          : req.query.featured === "false"
            ? false
            : undefined,
      sort: req.query.sort as any,
    };

    const products = await listProducts(filters);
    res.json({ success: true, data: products });
  });

  /** GET /api/products/:id */
  // מחזיר מוצר בודד לפי המזהה שלו, או שגיאה אם המוצר לא נמצא
  static getProduct = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const product = await getProductById(id);
    if (!product) throw new NotFoundError("Product");
    res.json({ success: true, data: product });
  });

  /** GET /api/products/categories/list */
  // מחזיר רשימה של כל הקטגוריות הקיימות במוצרים
  static getCategoriesList = asyncHandler(
    async (_req: Request, res: Response) => {
      const categories = await getCategories();
      res.json({ success: true, data: categories });
    },
  );
}

// Named exports for backward compatibility with existing route imports
export const getProducts = ProductController.getProducts;
export const getProduct = ProductController.getProduct;
export const getCategoriesList = ProductController.getCategoriesList;
