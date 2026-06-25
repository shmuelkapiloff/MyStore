import { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import { sendError } from "../utils/response";
import { logger } from "../utils/logger";

/**
 * Middleware to validate MongoDB ObjectId in request params
 * Usage: router.get("/:id", validateObjectId("id"), handler)
 */
export const validateObjectId = (paramName: string = "id") => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      const id = req.params[paramName];

      if (!id) {
        logger.warn(`Missing ${paramName} in request params`);
        return sendError(res, 400, `${paramName} is required`);
      }

      if (!mongoose.isValidObjectId(id)) {
        logger.warn(`Invalid ${paramName} format: ${id}`);
        return sendError(res, 400, `Invalid ${paramName} format`);
      }

      next();
    } catch (error: any) {
      logger.error({ error, paramName }, `Error validating ${paramName}`);
      return sendError(res, 500, "Internal server error");
    }
  };
};

// Export pre-configured validators for common use cases
export const validateProductId = validateObjectId("id");
export const validateOrderId = validateObjectId("orderId");
export const validateAddressId = validateObjectId("addressId");
export const validateUserId = validateObjectId("userId");
export const validateCartId = validateObjectId("cartId");
