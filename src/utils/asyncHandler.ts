import { Request, Response, NextFunction } from "express";
import { logger, log } from "./logger";

// Re-export logger and log for convenience
export { logger, log };

/**
 * Wrapper for async route handlers to catch errors
 * Prevents unhandled promise rejections
 * All errors are passed to error handler middleware
 */
export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      Promise.resolve(fn(req, res, next)).catch((error: any) => {
        logger.error(
          {
            path: req.path,
            method: req.method,
            error: error.message,
            stack: error.stack,
          },
          `Async handler error on ${req.method} ${req.path}`
        );
        next(error);
      });
    } catch (error) {
      logger.error(
        {
          path: req.path,
          method: req.method,
          error,
        },
        `Sync error in async handler`
      );
      next(error);
    }
  };
};

/**
 * Custom error class for API errors
 */
export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public errors?: any[],
    public code?: string
  ) {
    super(message);
    this.name = "ApiError";
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

/**
 * Validation error helper
 */
export class ValidationError extends ApiError {
  constructor(message: string, errors?: any[]) {
    super(400, message, errors, "VALIDATION_ERROR");
    this.name = "ValidationError";
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

/**
 * Not found error helper
 */
export class NotFoundError extends ApiError {
  constructor(resource: string) {
    super(404, `${resource} not found`, undefined, "NOT_FOUND");
    this.name = "NotFoundError";
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

/**
 * Unauthorized error helper
 */
export class UnauthorizedError extends ApiError {
  constructor(message: string = "Not authenticated") {
    super(401, message, undefined, "UNAUTHORIZED");
    this.name = "UnauthorizedError";
    Object.setPrototypeOf(this, UnauthorizedError.prototype);
  }
}

/**
 * Forbidden error helper
 */
export class ForbiddenError extends ApiError {
  constructor(message: string = "Access denied") {
    super(403, message, undefined, "FORBIDDEN");
    this.name = "ForbiddenError";
    Object.setPrototypeOf(this, ForbiddenError.prototype);
  }
}
