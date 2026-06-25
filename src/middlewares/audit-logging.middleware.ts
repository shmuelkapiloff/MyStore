import { Request, Response, NextFunction } from "express";
import { AuditLogService, AuditLogEntry } from "../services/audit-log.service";
import { log, logger } from "../utils/logger";
import "../types/express"; // Import centralized Express type extensions

/**
 * Express middleware: Adds audit logging context (ipAddress, userAgent, sessionId) to the request object.
 */
export function auditLoggingMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  // Extract IP address
  const xForwardedFor = req.headers["x-forwarded-for"];
  req.ipAddress = xForwardedFor
    ? (xForwardedFor as string).split(",")[0].trim()
    : req.socket?.remoteAddress || "unknown";

  // Extract user agent
  req.userAgent = req.headers["user-agent"] || "unknown";

  // Extract session ID if express-session is being used
  if (req.session && req.session.id) {
    req.sessionId = req.session.id;
  }

  log.debug("audit", "Audit logging context set", {
    ipAddress: req.ipAddress,
    userAgent: req.userAgent,
    sessionId: req.sessionId,
  });
  next();
}

export async function logAuditEvent(
  userId: string | null | undefined,
  action: string,
  resourceType: string,
  resourceId: string,
  status: "success" | "failure",
  req?: Request,
  options?: {
    adminId?: string;
    changes?: any;
    reason?: string;
    errorMessage?: string;
    context?: any;
  },
): Promise<void> {
  const entry: AuditLogEntry = {
    userId: userId || null,
    adminId: options?.adminId,
    action,
    resourceType,
    resourceId,
    status,
    timestamp: new Date(),
    ipAddress: req?.ipAddress,
    userAgent: req?.userAgent,
    sessionId: req?.sessionId,
    reason: options?.reason,
    errorMessage: options?.errorMessage,
    changes: options?.changes,
    context: options?.context,
  };
  AuditLogService.log(entry).catch((err) => {
    logger.error({ error: err }, "Unexpected error in audit logging");
  });
}

export function autoLogAction(action: string, resourceType: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const originalJson = res.json.bind(res);
    res.json = function (body: any) {
      const status = res.statusCode >= 400 ? "failure" : "success";
      const resourceId = req.params.id || req.params.userId || "unknown";
      logAuditEvent(
        req.user && typeof req.user._id === "string" ? req.user._id : undefined,
        action,
        resourceType,
        resourceId,
        status,
        req,
        {
          errorMessage:
            status === "failure" ? body.error || "Unknown error" : undefined,
        },
      );
      return originalJson(body);
    };
    next();
  };
}

export async function getFailedLoginsByIP(
  ipAddress: string,
  hours: number,
): Promise<number> {
  return AuditLogService.countSuspiciousActivity(
    { action: "LOGIN_FAILED", ipAddress },
    hours,
  );
}

export async function isBruteForceAttempt(ipAddress: string): Promise<boolean> {
  const failedAttempts = await getFailedLoginsByIP(ipAddress, 0.25);
  return failedAttempts > 5;
}

export async function getUserRecentActivity(
  userId: string,
  hours: number = 24,
) {
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);
  return AuditLogService.search({ userId, timestamp: { $gte: since } }, 100);
}
