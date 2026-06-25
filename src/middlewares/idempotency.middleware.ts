import { Request, Response, NextFunction } from "express";
import { IdempotencyKeyModel } from "../models/idempotency-key.model";
import { log } from "../utils/logger";
import "../types/express"; // Import Express type extensions

/**
 * Idempotency middleware - prevents duplicate requests
 * Client should send Idempotency-Key header with unique UUID
 *
 * Usage:
 * app.post('/api/orders', idempotencyMiddleware('order'), orderController.create)
 */
export const idempotencyMiddleware = (resourceType: "order" | "payment") => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const idempotencyKey = req.headers["idempotency-key"] as string;
    const userId = req.userId;

    // Skip if no idempotency key provided (backwards compatibility)
    if (!idempotencyKey) {
      return next();
    }

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    try {
      // Check if this request was already processed
      const existing = await IdempotencyKeyModel.findOne({
        key: idempotencyKey,
        userId,
      });

      if (existing) {
        // Return cached response
        log.info("⚡ Idempotency cache hit - returning cached response", {
          key: idempotencyKey,
          resourceType: existing.resourceType,
          resourceId: existing.resourceId,
        });

        return res.status(existing.responseStatus).json(existing.responseBody);
      }

      // Store original res.json to intercept response
      const originalJson = res.json.bind(res);

      res.json = function (body: any) {
        // Save idempotency record asynchronously (don't block response)
        const resourceId = body?.data?.order?._id || body?.data?.payment?._id;

        if (resourceId) {
          IdempotencyKeyModel.create({
            key: idempotencyKey,
            userId,
            resourceType,
            resourceId,
            requestBody: req.body,
            responseStatus: res.statusCode,
            responseBody: body,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
          }).catch((err) => {
            log.error("Failed to save idempotency key", {
              error: err.message,
              key: idempotencyKey,
            });
          });
        }

        return originalJson(body);
      };

      next();
    } catch (error: any) {
      log.error("Idempotency middleware error", {
        error: error.message,
        key: idempotencyKey,
      });
      // Don't block request if idempotency check fails
      next();
    }
  };
};
