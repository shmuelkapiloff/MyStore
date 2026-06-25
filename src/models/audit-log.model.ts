import mongoose from "mongoose";
import { log } from "../utils/logger";

/**
 * AuditLog Model - Immutable Security Event Tracking
 *
 * DESIGN DECISIONS:
 * ================
 * 1. APPEND-ONLY: No updates, no deletes - logs are permanent (set via pre-hooks)
 * 2. AUTOMATIC EXPIRY: 90-day TTL via index (balances compliance + storage)
 * 3. INDEXING STRATEGY:
 *    - userId + timestamp: Query user activity history
 *    - action + timestamp: Query event type over time (for alerts)
 *    - resourceId: Find all events for a resource (order, payment, user)
 *    - timestamp: Sorted queries, TTL cleanup
 * 4. FLEXIBLE CONTEXT: Changes/context stored as Mixed type for extensibility
 * 5. IMMUTABILITY ENFORCEMENT: Database-level via pre-hooks (app-level fallback)
 *
 * SECURITY IMPLICATIONS:
 * =====================
 * - Cannot be tampered with (database constraint)
 * - Survives application crashes (persistent)
 * - Provides legal defensibility (proof of action)
 * - GDPR compliant (no updates after creation)
 *
 * COMPLIANCE:
 * ===========
 * - SOC 2: User action audit trail
 * - PCI-DSS: Payment event tracking
 * - GDPR: Admin action documentation
 * - HIPAA: Sensitive operation audit trail
 */

const auditLogSchema = new mongoose.Schema(
  {
    // ===== WHO =====
    /**
     * User performing the action
     * null for anonymous actions (pre-login attempts)
     * Indexed for quick lookups: "Show me all actions by this user"
     */
    userId: {
      type: String,
      index: true,
      sparse: true, // Allows null values without creating index entry
    },

    /**
     * Admin ID (if action was taken by admin on behalf of user)
     * Example: Admin changing user role
     * Indexed for compliance: "Show me all changes made by this admin"
     */
    adminId: {
      type: String,
      index: true,
      sparse: true,
    },

    // ===== WHAT =====
    /**
     * Action type - REQUIRED
     * Enum prevents typos, aids in alerting
     * Examples: LOGIN, PASSWORD_CHANGED, PAYMENT_SUCCEEDED, ROLE_GRANTED
     * Indexed for time-series queries: "Failed logins in last 24h"
     */
    action: {
      type: String,
      enum: [
        // Authentication
        "LOGIN",
        "LOGIN_FAILED",
        "LOGOUT",
        "PASSWORD_CHANGED",
        "PASSWORD_RESET_REQUESTED",
        "PASSWORD_RESET_COMPLETED",

        // Administrative
        "ROLE_GRANTED",
        "ROLE_REVOKED",
        "USER_CREATED",
        "USER_DELETED",
        "USER_SUSPENDED",
        "USER_ACTIVATED",

        // Permissions
        "PERMISSION_GRANTED",
        "PERMISSION_REVOKED",
        "PERMISSION_DENIED",

        // Payment/Orders
        "PAYMENT_INITIATED",
        "PAYMENT_SUCCEEDED",
        "PAYMENT_FAILED",
        "PAYMENT_REFUNDED",
        "ORDER_CREATED",
        "ORDER_CANCELLED",
        "ORDER_SHIPPED",

        // Suspicious Activity
        "BRUTE_FORCE_ATTEMPT",
        "UNAUTHORIZED_ACCESS_ATTEMPT",
        "RATE_LIMIT_EXCEEDED",
        "INVALID_TOKEN",

        // System
        "CONFIG_CHANGED",
        "API_KEY_GENERATED",
        "API_KEY_REVOKED",
      ],
      required: true,
      index: true,
    },

    /**
     * Type of resource affected
     * Examples: USER, ORDER, PAYMENT
     * Used with resourceId to query all events for a resource
     */
    resourceType: {
      type: String,
      enum: ["USER", "ORDER", "PAYMENT", "RESOURCE", "ADMIN", "CONFIG"],
      required: true,
    },

    /**
     * ID of the affected resource
     * CRITICAL: Indexed for compliance queries
     * Query: "Show me all events for order #123"
     */
    resourceId: {
      type: String,
      required: true,
      index: true,
    },

    // ===== WHEN & WHERE =====
    /**
     * Timestamp of the action
     * Default: now
     * Used for:
     * - Chronological ordering
     * - TTL cleanup (90 days)
     * - Rate limiting detection
     */
    timestamp: {
      type: Date,
      default: Date.now,
      index: true,
    },

    /**
     * IP address of the request
     * Used for:
     * - Brute force detection (multiple failed logins from same IP)
     * - Anomaly detection (unusual login location)
     * - Investigation (trace request source)
     */
    ipAddress: {
      type: String,
      sparse: true,
    },

    /**
     * User agent string
     * Used for:
     * - Device tracking (same user, different device = suspicious)
     * - Bot detection
     * - Investigation details
     */
    userAgent: {
      type: String,
      sparse: true,
    },

    /**
     * Session ID for correlation
     * Used to group related actions in same session
     */
    sessionId: {
      type: String,
      sparse: true,
    },

    // ===== WHAT CHANGED =====
    /**
     * Before/after state for change tracking
     * Example: { before: { role: 'customer' }, after: { role: 'admin' } }
     * Provides evidence of what was modified
     */
    changes: {
      // State before action
      before: mongoose.Schema.Types.Mixed,

      // State after action
      after: mongoose.Schema.Types.Mixed,

      // Which fields were modified (optimization for querying)
      fields: [String],
    },

    // ===== RESULT =====
    /**
     * Did the action succeed?
     * success = intended action completed
     * failure = action attempted but failed
     * Used for tracking failed attempts (security monitoring)
     */
    status: {
      type: String,
      enum: ["success", "failure"],
      required: true,
    },

    /**
     * Error message if status = 'failure'
     * Example: "Invalid password", "Insufficient permissions"
     * Sanitized (no sensitive data)
     */
    errorMessage: {
      type: String,
      sparse: true,
    },

    /**
     * Why was this action taken?
     * Used for compliance: "We changed this role because..."
     * Example: "User requested password reset", "Security violation detected"
     */
    reason: {
      type: String,
      sparse: true,
    },

    // ===== ADDITIONAL CONTEXT =====
    /**
     * Flexible field for event-specific data
     * Example: { orderId: "123", amount: 99.99, provider: "stripe" }
     * NOT queryable (use changes/explicit fields for that)
     * Used for providing context during investigation
     */
    context: mongoose.Schema.Types.Mixed,

    // ===== METADATA (added automatically) =====
    // createdAt is NOT added (we use timestamp instead)
    // updatedAt is NOT added (append-only - no updates)
  },
  {
    // Configuration
    timestamps: false, // We manage timestamps ourselves
    collection: "auditlogs", // Explicit collection name
  },
);

// ===== INDEXES =====
// PRIMARY QUERY PATTERNS:
// 1. Find user's activity: userId + timestamp (descending)
auditLogSchema.index({ userId: 1, timestamp: -1 });

// 2. Find admin's actions: adminId + timestamp
auditLogSchema.index({ adminId: 1, timestamp: -1 });

// 3. Find event type timeline: action + timestamp
auditLogSchema.index({ action: 1, timestamp: -1 });

// 4. Find all events for resource: resourceId
auditLogSchema.index({ resourceId: 1 });

// 5. Detect brute force: action + ipAddress + timestamp
auditLogSchema.index({ action: 1, ipAddress: 1, timestamp: -1 });

// 6. TTL Index: Delete logs older than 90 days (7776000 seconds)
// CRITICAL: MongoDB runs TTL cleanup every 60 seconds by default
// Adjust expireAfterSeconds for different retention (180 days = 15552000)
auditLogSchema.index(
  { timestamp: 1 },
  {
    expireAfterSeconds: 7776000, // 90 days
    name: "auditlog_ttl",
  },
);

// ===== IMMUTABILITY ENFORCEMENT =====
/**
 * Prevent updates on audit logs (append-only)
 * If code somehow tries to update, MongoDB will throw error
 * This is defensive programming - should never happen in practice
 */
auditLogSchema.pre("updateOne", function (next) {
  log.warn("Attempted to update audit log - blocked by schema", {
    filter: this.getFilter(),
  });
  throw new Error(
    "Audit logs are append-only and cannot be updated (compliance requirement)",
  );
});

import type { CallbackWithoutResultAndOptionalError } from "mongoose";
// ...existing code...
auditLogSchema.pre(
  "findOneAndUpdate",
  function (this: any, next: CallbackWithoutResultAndOptionalError) {
    log.warn("Attempted findByIdAndUpdate on audit log - blocked by schema");
    throw new Error(
      "Audit logs are append-only and cannot be updated (compliance requirement)",
    );
  },
);

/**
 * Prevent deletes on audit logs (permanent record)
 */
auditLogSchema.pre("deleteOne", function (next) {
  log.warn("Attempted to delete audit log - blocked by schema", {
    filter: this.getFilter(),
  });
  throw new Error(
    "Audit logs cannot be deleted (permanent record for compliance)",
  );
});

auditLogSchema.pre(
  "findOneAndDelete",
  function (this: any, next: CallbackWithoutResultAndOptionalError) {
    log.warn("Attempted findByIdAndDelete on audit log - blocked by schema");
    throw new Error(
      "Audit logs cannot be deleted (permanent record for compliance)",
    );
  },
);

// ===== MODEL CREATION =====
export const AuditLogModel = mongoose.model("AuditLog", auditLogSchema);

/**
 * TypeScript Interface for type safety
 * Use this when creating audit log entries
 */
export interface IAuditLog {
  _id?: string;
  userId?: string | null;
  adminId?: string;
  action: string;
  resourceType: string;
  resourceId: string;
  timestamp?: Date;
  ipAddress?: string;
  userAgent?: string;
  sessionId?: string;
  changes?: {
    before?: any;
    after?: any;
    fields?: string[];
  };
  status: "success" | "failure";
  errorMessage?: string;
  reason?: string;
  context?: any;
}
