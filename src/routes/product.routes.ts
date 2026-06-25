import { Router } from "express";
import {
  getProducts,
  getProduct,
  getCategoriesList,
} from "../controllers/product.controller";
import { validateProductId } from "../middlewares/validateObjectId.middleware";
import { publicReadRateLimiter } from "../middlewares/rate-limiter.middleware";

export const productRouter = Router();

// Public product routes with rate limiting
productRouter.get("/", publicReadRateLimiter, getProducts);
productRouter.get("/categories/list", publicReadRateLimiter, getCategoriesList);
productRouter.get("/:id", publicReadRateLimiter, validateProductId, getProduct);

export default productRouter;
