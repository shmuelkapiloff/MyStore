import { Request, Response, NextFunction } from "express";
import { ZodSchema, ZodError } from "zod";
import { sendError } from "../utils/response";
import { log } from "../utils/logger";

/**
 * Express middleware factory for validating request data against Zod schemas
 *
 * Validates: query params, body, params, headers
 * Attach validation errors: res.validationErrors
 *
 * Usage:
 * ──────
 * router.post(
 *   "/payments/create-intent",
 *   requireAuth,
 *   validateRequest({ body: createPaymentIntentSchema }),
 *   PaymentController.createIntent
 * )
 *
 * Inside controller:
 * const { orderId } = req.body; // Already validated and typed!
 */
export interface ValidateOptions {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
  headers?: ZodSchema;
}

export function validateRequest(options: ValidateOptions) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const errors: Record<string, string> = {};

    try {
      // Validate body
      if (options.body) {
        try {
          const validatedBody = options.body.parse(req.body);
          req.body = validatedBody;
        } catch (error) {
          if (error instanceof ZodError) {
            error.errors.forEach((err) => {
              const path = err.path.join(".");
              errors[path] = err.message;
            });
          }
        }
      }

      // Validate query parameters
      if (options.query) {
        try {
          const validatedQuery = options.query.parse(req.query);
          req.query = validatedQuery as any;
        } catch (error) {
          if (error instanceof ZodError) {
            error.errors.forEach((err) => {
              const path = `query.${err.path.join(".")}`;
              errors[path] = err.message;
            });
          }
        }
      }

      // Validate route parameters
      if (options.params) {
        try {
          const validatedParams = options.params.parse(req.params);
          req.params = validatedParams as any;
        } catch (error) {
          if (error instanceof ZodError) {
            error.errors.forEach((err) => {
              const path = `params.${err.path.join(".")}`;
              errors[path] = err.message;
            });
          }
        }
      }

      // Validate headers
      if (options.headers) {
        try {
          const validatedHeaders = options.headers.parse(req.headers);
          // Note: Setting headers directly may not work, so we just validate
        } catch (error) {
          if (error instanceof ZodError) {
            error.errors.forEach((err) => {
              const path = `headers.${err.path.join(".")}`;
              errors[path] = err.message;
            });
          }
        }
      }

      // If any validation errors, return 400
      if (Object.keys(errors).length > 0) {
        log.warn("Validation failed", {
          service: "ValidateRequest",
          endpoint: req.path,
          method: req.method,
          errors,
        });

        return sendError(res, 400, "Validation failed", Object.values(errors));
      }

      next();
    } catch (error) {
      log.error("Unexpected validation error", {
        service: "ValidateRequest",
        error: error instanceof Error ? error.message : "Unknown error",
      });

      return sendError(res, 500, "Internal validation error");
    }
  };
}

/**
 * Utility to validate single field in controller
 * Useful for complex validation logic
 */
export function validateField(
  schema: ZodSchema,
  data: unknown,
): [boolean, string | null] {
  try {
    schema.parse(data);
    return [true, null];
  } catch (error) {
    if (error instanceof ZodError) {
      const firstError = error.errors[0];
      return [false, firstError.message];
    }
    return [false, "Validation failed"];
  }
}
