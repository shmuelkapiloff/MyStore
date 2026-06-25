/**
 * Centralized Configuration Constants
 *
 * This module defines all magic numbers, timeouts, limits, and other
 * configuration values in one place for easy maintenance and consistency.
 *
 * Organization:
 * ──────────────
 * - Rate Limiting Constants
 * - Cache & TTL Constants
 * - JWT & Auth Constants
 * - Payment Constants
 * - Webhook Constants
 * - Validation Constants
 * - Request/Response Constants
 */

// ═══════════════════════════════════════════════════════════════════════════
// RATE LIMITING CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

/** Authentication endpoints rate limit: 5 requests per 15 minutes */
export const AUTH_RATE_LIMIT = {
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 5,
};

/** Webhook endpoint rate limit: 100 requests per 15 minutes */
export const WEBHOOK_RATE_LIMIT = {
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 100,
};

/** General API rate limit: 200 requests per 15 minutes */
export const API_RATE_LIMIT = {
  windowMs: 15 * 60 * 1000, // 15 minutes
  maxRequests: 200,
};

/** Public read operations rate limit: 60 requests per minute */
export const PUBLIC_READ_RATE_LIMIT = {
  windowMs: 1 * 60 * 1000, // 1 minute
  maxRequests: 60,
};

// ═══════════════════════════════════════════════════════════════════════════
// CACHE & TTL CONSTANTS (in seconds)
// ═══════════════════════════════════════════════════════════════════════════

/** Redis cache TTL for shopping carts: 1 hour */
export const CART_CACHE_TTL = 3600; // 1 hour

/** Debounce delay for saving cart to MongoDB: 5 seconds */
export const CART_SAVE_DELAY = 5000; // 5 seconds

/** Webhook events TTL: 30 days (auto-cleanup) */
export const WEBHOOK_EVENT_TTL = 30 * 24 * 60 * 60; // 30 days in seconds

/** Idempotency key TTL: 24 hours */
export const IDEMPOTENCY_KEY_TTL = 24 * 60 * 60; // 24 hours in seconds

/** Audit logs TTL: 90 days (compliance requirement) */
export const AUDIT_LOG_TTL = 90 * 24 * 60 * 60; // 90 days in seconds

// ═══════════════════════════════════════════════════════════════════════════
// JWT & AUTHENTICATION CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * JWT access token expiration: 7 days
 *
 * ⚠️ INTENTIONALLY LONG — the client currently uses a single token strategy.
 * Instant revocation is handled via `tokenVersion` on each user document:
 * when a user logs out or changes password, tokenVersion is incremented,
 * immediately invalidating all existing tokens without waiting for expiry.
 *
 * ⚠️  Access token intentionally set to 7 days (not 15m) because this server
 *     serves multiple clients — including a separate client that does NOT use
 *     the /auth/refresh endpoint. A short-lived token would force that client
 *     to re-authenticate frequently without any mechanism to renew silently.
 *
 *     Instant revocation is handled by tokenVersion: on logout or password
 *     change, tokenVersion increments in the DB and all existing tokens
 *     (regardless of expiry) are rejected immediately by the auth middleware.
 *
 *     Clients that DO support refresh tokens can use POST /auth/refresh to
 *     obtain a new access token proactively before the 7-day window expires.
 */
export const JWT_EXPIRATION = "7d";

/** JWT refresh token expiration: 7 days (long-lived, used to get new access tokens) */
export const JWT_REFRESH_EXPIRATION = "7d";

/** Password reset token expiration: 1 hour */
export const PASSWORD_RESET_EXPIRATION = 60 * 60 * 1000; // 1 hour in milliseconds

/** Auth rate limit attempts: 5 attempts */
export const AUTH_MAX_ATTEMPTS = 5;

/** Auth rate limit window: 15 minutes */
export const AUTH_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

// ═══════════════════════════════════════════════════════════════════════════
// PAYMENT CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

/** Stripe webhook IP whitelist for production */
export const STRIPE_IPS = [
  "3.18.12.63",
  "3.130.192.231",
  "13.235.14.237",
  "13.235.122.149",
  "18.211.135.69",
  "35.154.171.200",
  "52.15.183.38",
  "54.88.130.119",
  "54.88.130.237",
  "54.187.174.169",
  "54.187.205.235",
  "54.187.216.72",
];

// ═══════════════════════════════════════════════════════════════════════════
// WEBHOOK RETRY CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

/** Maximum webhook retry attempts */
export const WEBHOOK_MAX_RETRIES = 5;

/** Maximum webhooks to process per batch */
export const WEBHOOK_BATCH_SIZE = 10;

/** Initial retry delay: 30 seconds (exponential backoff) */
export const WEBHOOK_INITIAL_DELAY = 30 * 1000; // 30 seconds

/** Retry processing interval: 5 minutes */
export const WEBHOOK_RETRY_INTERVAL = 5 * 60 * 1000; // 5 minutes

// ═══════════════════════════════════════════════════════════════════════════
// VALIDATION CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

/** Maximum search string length to prevent DoS */
export const MAX_SEARCH_LENGTH = 100;

/** Maximum product name length */
export const MAX_PRODUCT_NAME_LENGTH = 200;

/** Maximum product description length */
export const MAX_PRODUCT_DESC_LENGTH = 5000;

/** Maximum cart items per user */
export const MAX_CART_ITEMS = 1000;

/** Minimum order total (in cents, for Stripe: minimum $0.50 = 50 cents) */
export const MIN_ORDER_TOTAL_CENTS = 50;

// ═══════════════════════════════════════════════════════════════════════════
// REQUEST/RESPONSE CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

/** Maximum JSON payload size: 10MB */
export const MAX_JSON_SIZE = "10mb";

/** Default pagination limit */
export const DEFAULT_PAGE_LIMIT = 20;

/** Maximum pagination limit */
export const MAX_PAGE_LIMIT = 100;

/** Default sorting order: descending by creation date */
export const DEFAULT_SORT_ORDER = -1;

// ═══════════════════════════════════════════════════════════════════════════
// ADMIN CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

/** Audit log retention: 90 days */
export const AUDIT_LOG_RETENTION_DAYS = 90;

/** Default audit log query limit */
export const AUDIT_LOG_DEFAULT_LIMIT = 100;

/** Maximum audit logs per query */
export const AUDIT_LOG_MAX_LIMIT = 1000;

// ═══════════════════════════════════════════════════════════════════════════
// ERROR RETRY CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

/** Database operation retry attempts */
export const DB_RETRY_ATTEMPTS = 3;

/** Database operation retry delay: 1 second */
export const DB_RETRY_DELAY = 1000; // milliseconds

/** Redis operation retry attempts */
export const REDIS_RETRY_ATTEMPTS = 2;

/** Redis operation retry delay: 500ms */
export const REDIS_RETRY_DELAY = 500; // milliseconds
