/**
 * Express Type Extensions
 *
 * This module extends the Express Request interface with all custom properties
 * used throughout the application. This replaces scattered (req as any) casts
 * with strict, type-safe properties.
 *
 * All middleware that adds properties to req should be documented here.
 */

import { Request } from "express";
import { Document } from "mongoose";

// ═══════════════════════════════════════════════════════════════════════════
// AUTHENTICATION PROPERTIES
// ═══════════════════════════════════════════════════════════════════════════

export interface AuthenticatedUser {
  _id: string;
  email: string;
  name: string;
  role: "user" | "admin";
  isVerified: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════
// AUDIT LOG PROPERTIES
// ═══════════════════════════════════════════════════════════════════════════

export interface AuditAction {
  userId: string;
  email: string;
  ipAddress: string;
  userAgent: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// EXTENDED EXPRESS REQUEST
// ═══════════════════════════════════════════════════════════════════════════

declare global {
  namespace Express {
    interface Request {
      /**
       * Unique request identifier (UUID)
       * Set by: requestIdMiddleware
       * Used for: Correlation in logs, tracing
       */
      requestId?: string;

      /**
       * Authenticated user from JWT token
       * Set by: authenticate middleware
       * Used for: Authorization checks, audit logging
       */
      user?: AuthenticatedUser;

      /**
       * User ID extracted from JWT
       * Set by: authenticate, requireAuth middleware
       * Used for: Direct user identification
       */
      userId?: string;

      /**
       * Request timestamp
       * Set by: requestLoggerMiddleware
       * Used for: Performance logging, duration calculation
       */
      timestamp?: number;

      /**
       * Idempotency key for preventing duplicate requests
       * Set by: idempotencyMiddleware
       * Used for: Webhook retry detection, payment deduplication
       */
      idempotencyKey?: string;

      /**
       * Idempotency key response (cached response)
       * Set by: idempotencyMiddleware
       * Used for: Returning cached response for duplicate requests
       */
      idempotentResponse?: {
        statusCode: number;
        body: any;
      };

      /**
       * Request scope for audit logging
       * Set by: auditLoggingMiddleware
       * Used for: Recording user actions
       */
      auditScope?: {
        userId: string;
        email: string;
        ipAddress: string;
        userAgent: string;
      };

      /**
       * Session ID for guest users
       * Set by: Various request handlers
       * Used for: Guest cart tracking
       */
      sessionId?: string;

      /**
       * Raw session object (if using express-session)
       */
      session?: any;

      /**
       * Client IP address (set by auditLoggingMiddleware)
       */
      ipAddress?: string;

      /**
       * Client user agent (set by auditLoggingMiddleware)
       */
      userAgent?: string;

      /**
       * Request start time for performance tracking
       * Set by: metricsMiddleware
       * Used for: Duration calculation, performance monitoring
       */
      startTime?: number;

      /**
       * Whether this is a webhook request
       * Set by: validation middleware
       * Used for: Special webhook handling
       */
      isWebhook?: boolean;

      /**
       * Raw body buffer for webhook signature verification
       * Set by: express.raw() middleware for /webhook route
       * Used for: Stripe signature verification
       */
      rawBody?: Buffer;
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TYPE GUARDS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check if request has authenticated user
 */
export function isAuthenticated(
  req: Request,
): req is Request & { user: AuthenticatedUser } {
  return !!req.user;
}

/**
 * Check if request has user ID
 */
export function hasUserId(req: Request): req is Request & { userId: string } {
  return !!req.userId;
}

/**
 * Check if request has request ID (should always be true with middleware)
 */
export function hasRequestId(
  req: Request,
): req is Request & { requestId: string } {
  return !!req.requestId;
}

/**
 * Check if request has idempotency key
 */
export function hasIdempotencyKey(
  req: Request,
): req is Request & { idempotencyKey: string } {
  return !!req.idempotencyKey;
}

/**
 * Check if request has cached idempotent response
 */
export function hasIdempotentResponse(
  req: Request,
): req is Request & { idempotentResponse: { statusCode: number; body: any } } {
  return !!req.idempotentResponse;
}

/**
 * Check if request is a webhook
 */
export function isWebhookRequest(
  req: Request,
): req is Request & { isWebhook: true; rawBody: Buffer } {
  return req.isWebhook === true && !!req.rawBody;
}

/**
 * Check if request has audit scope
 */
export function hasAuditScope(
  req: Request,
): req is Request & { auditScope: AuditAction } {
  return !!req.auditScope;
}

/**
 * Assert that request has authenticated user
 * Throws error if user is not authenticated
 */
export function assertAuthenticated(
  req: Request,
): asserts req is Request & { user: AuthenticatedUser } {
  if (!req.user) {
    throw new Error("User authentication required");
  }
}

/**
 * Assert that request has user ID
 * Throws error if userId is not present
 */
export function assertUserId(
  req: Request,
): asserts req is Request & { userId: string } {
  if (!req.userId) {
    throw new Error("User ID required");
  }
}

/**
 * Assert that request has request ID
 * Throws error if requestId is not present
 */
export function assertRequestId(
  req: Request,
): asserts req is Request & { requestId: string } {
  if (!req.requestId) {
    throw new Error("Request ID required");
  }
}
