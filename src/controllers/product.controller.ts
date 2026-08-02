import { Request, Response } from "express";
import {
  listProducts,
  getProductById,
  getCategories,
  ProductFilters,
} from "../services/product.service";
import { asyncHandler, NotFoundError } from "../utils/asyncHandler";

// Public read-only product controller — no authentication required
export class ProductController {
  /** GET /api/products */
  // Returns products, with optional filters: category, price range, text search, featured
  static getProducts = asyncHandler(async (req: Request, res: Response) => {
    // Build filter object from URL query parameters
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
  // Returns a single product by ID, or 404 if not found
  static getProduct = asyncHandler(async (req: Request, res: Response) => {
    const { id } = req.params;
    const product = await getProductById(id);
    if (!product) throw new NotFoundError("Product");
    res.json({ success: true, data: product });
  });

  /** GET /api/products/categories/list */
  // Returns the list of all distinct product categories
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
