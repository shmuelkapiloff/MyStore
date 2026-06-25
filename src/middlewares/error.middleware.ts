import { Request, Response, NextFunction } from "express";
import { logger } from "../utils/logger";
import { ApiError } from "../utils/asyncHandler";

export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  // Log error with context
  logger.error(
    {
      method: req.method,
      path: req.path,
      statusCode: err.statusCode || 500,
      message: err.message,
      code: err.code,
      errors: err.errors,
      stack: err.stack,
    },
    "Request error"
  );

  // Handle ApiError instances
  if (err instanceof ApiError) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      errors: err.errors,
      code: err.code,
    });
  }

  // Handle Zod validation errors
  if (err.name === "ZodError") {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: err.errors,
      code: "VALIDATION_ERROR",
    });
  }

  // Default error response
  const status = err.statusCode || err.status || 500;
  const message = err.message || "Internal Server Error";
  res.status(status).json({
    success: false,
    message,
    code: "INTERNAL_ERROR",
  });
}
