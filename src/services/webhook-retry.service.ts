/**
 * WEBHOOK RETRY SERVICE - EXPONENTIAL BACKOFF & RESILIENCE
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * PURPOSE & DESIGN PATTERN
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The Problem:
 * ────────────
 * Sometimes our webhook handler fails:
 * - Database connection timeout
 * - Redis unavailable (cache write fails)
 * - External email service down
 * - Temporary network issue
 *
 * When webhook handler fails:
 * 1. We throw exception
 * 2. Express error handler catches it
 * 3. Returns 500 error to Stripe
 * 4. Stripe interprets as "delivery failed"
 * 5. Stripe retries webhook with exponential backoff (their side)
 * But what if we still fail after Stripe's retries?
 *
 * Solution: OUR OWN RETRY SERVICE
 * ────────────────────────────────
 * 1. When webhook handler fails → Store in FailedWebhookModel
 * 2. Background service checks every 60 seconds
 * 3. Retries failed webhooks with OUR exponential backoff
 * 4. Eventually succeeds when system is healthy
 * 5. Or escalates to manual investigation after max retries
 *
 * WHY EXPONENTIAL BACKOFF?
 * ───────────────────────
 * Immediate retry: If database is overloaded, immediate retry makes worse
 * Fixed retry (5min): Might wake up too soon before system recovers
 * Exponential backoff: Starts moderate (+15m), then gets more patient
 *
 * Backoff Schedule:
 * - Attempt 1: Immediate (webhook handler)
 * - Attempt 2: +15 minutes
 * - Attempt 3: +45 minutes
 * - Attempt 4: +2.25 hours
 * - Attempt 5: +6.75 hours
 * - Attempt 6: +20.25 hours (if maxRetries allows)
 * - After max: Alert ops for manual intervention
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * EXECUTION FLOW
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * STARTUP:
 * ────────
 * 1. Server starts (src/server.ts)
 * 2. WebhookRetryService.start() called
 * 3. Sets up interval (default: every 60 seconds)
 * 4. Service runs in background continuously
 *
 * EVERY 60 SECONDS:
 * ────────────────
 * 1. Query: Find all webhooks with status "pending" or "retrying"
 * 2. Filter: nextRetryAt is in the past (time to retry)
 * 3. Filter: retryCount < maxRetries (not exceeded retry budget)
 * 4. Limit: Process max 10 at a time (don't overwhelm system)
 * 5. For each webhook: Call retryWebhook()
 *
 * FOR EACH WEBHOOK:
 * ────────────────
 * 1. Mark as "retrying"
 * 2. Increment retryCount
 * 3. Call PaymentService.handleWebhook() again
 * 4. If success:
 *    - Mark as "succeeded"
 *    - Log success with duration
 * 5. If failure:
 *    - Calculate next retry time (exponential backoff)
 *    - Mark as "pending" (or "failed" if max retries reached)
 *    - Log error with retry time
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * EXPONENTIAL BACKOFF FORMULA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * CURRENT IMPLEMENTATION (3^n * 5 minutes):
 * backoff = 3^attemptNumber * 5 minutes
 *
 * Timeline:
 * Attempt 1: Now (webhook handler)
 * Attempt 1: Now
 * Attempt 2: Now + 3^1 * 5 = +15 minutes
 * Attempt 3: Now + 3^2 * 5 = +45 minutes
 * Attempt 4: Now + 3^3 * 5 = +2.25 hours
 * Attempt 5: Now + 3^4 * 5 = +6.75 hours
 * Total: ~10 hours to exhaust retries
 *
 * WHY THIS FORMULA IS USED HERE:
 * - Reduces pressure on unstable dependencies (DB/Redis/provider)
 * - Gives operations time to recover systems between retries
 * - Works alongside Stripe retries as an additional safety net
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THREAT MODEL & RESILIENCE
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Scenario 1: Database Temporarily Down (1 min)
 * ──────────────────────────────────────────────
 * - Webhook attempt 1: Fails (DB connection timeout)
 * - Store in FailedWebhookModel
 * - Retry in 15 minutes: DB recovered ✅ Success
 * - Result: Order fulfilled with delay, but no data loss
 *
 * Scenario 2: Redis Cache Down (permanent)
 * ─────────────────────────────────────────
 * - Webhook attempt 1: Fails (Redis connect timeout)
 * - Retries 2-5 with exponential backoff: Keep failing
 * - After 5 retries: Status marked as "failed"
 * - Alert sent to ops team
 * - Ops investigates and fixes Redis
 * - Manually trigger retry: Order fulfilled ✅
 * - Result: System escalates to human, no data loss
 *
 * Scenario 3: Stripe Webhooks Lost (network failure)
 * ──────────────────────────────────────────────────
 * - Stripe sends webhook but network drops response
 * - Stripe doesn't see 200 OK, marks as failed
 * - Stripe retries webhook (their side, with retries)
 * - Eventually Stripe gives up and stops sending
 * - But: We also have idempotency check
 * - If webhook finally arrives: Already processed ✅
 * - If webhook never arrives: Order stuck in "pending" status
 * - Recommendation: Admin dashboard shows pending orders
 *                   Ops can manually verify and update
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * MONITORING & OPERATIONS
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * HEALTHY SYSTEM:
 * - FailedWebhookModel mostly empty (immediate success)
 * - Occasionally has entries, but they succeed on retry 1-2
 * - No entries stuck with retryCount >= 4
 * - Logs show "Webhook retry succeeded" regularly
 *
 * UNHEALTHY SYSTEM WARNING SIGNS:
 * - FailedWebhookModel growing (more than 10 entries)
 * - Retries reaching max count (retryCount = 5)
 * - Same eventId retrying repeatedly
 * - Logs show repeated failures: database, redis, external service
 *
 * ALERTS TO SET UP:
 * - If FailedWebhookModel.count() > 100 → Alert ops
 * - If webhook retryCount = 5 → Alert ops (failed after all retries)
 * - If Stripe webhook latency > 10 seconds → Investigate
 * - If payment fulfillment takes > 5 seconds → Check database performance
 *
 * DEBUGGING FAILED WEBHOOKS:
 * - Query: db.failedwebhooks.find({ status: "failed" })
 * - Check: error message (what went wrong?)
 * - Check: lastAttemptAt (when was it last tried?)
 * - Check: retryCount (how many times retried?)
 * - Fix: Address root cause (database, redis, API)
 * - Retry: WebhookRetryService.retryById(webhookId)
 * - Verify: Check order status updated
 *
 * ═════════════════════════════════════════════════════════════════════════════
 */

import { FailedWebhookModel } from "../models/failed-webhook.model";
import { PaymentService } from "./payment.service";
import { log } from "../utils/logger";

/**
 * WebhookRetryService - Background Retry Worker
 *
 * Runs continuously on server startup, checking for failed webhooks every 60 seconds
 * Implements exponential backoff to gracefully handle temporary failures
 *
 * USAGE:
 * ──────
 * In server.ts (startup):
 *   WebhookRetryService.start(); // Starts with default 60 second interval
 *
 * On shutdown:
 *   WebhookRetryService.stop(); // Graceful cleanup
 *
 * Manual retry:
 *   WebhookRetryService.retryById(webhookId); // Immediate retry of specific webhook
 */
export class WebhookRetryService {
  private static isRunning = false;
  private static intervalId: NodeJS.Timeout | null = null;

  /**
   * Start the retry worker (call this in server.ts on startup)
   */
  static start(intervalMs: number = 60000) {
    // Every 1 minute
    if (this.isRunning) {
      log.warn("Webhook retry service already running");
      return;
    }

    this.isRunning = true;
    log.info("🔄 Starting webhook retry service", { intervalMs });

    this.intervalId = setInterval(() => {
      this.processRetries().catch((err) => {
        log.error("Webhook retry processing error", { error: err.message });
      });
    }, intervalMs);
  }

  /**
   * Stop the retry worker
   */
  static stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      this.isRunning = false;
      log.info("⏹️ Stopped webhook retry service");
    }
  }

  /**
   * Process all webhooks ready for retry
   */
  static async processRetries() {
    const now = new Date();

    // Find webhooks ready for retry
    const failedWebhooks = await FailedWebhookModel.find({
      status: { $in: ["pending", "retrying"] },
      nextRetryAt: { $lte: now },
      retryCount: { $lt: 5 }, // Max 5 retries
    }).limit(10); // Process 10 at a time

    if (failedWebhooks.length === 0) {
      return;
    }

    log.info(`🔄 Processing ${failedWebhooks.length} failed webhooks`);

    for (const webhook of failedWebhooks) {
      await this.retryWebhook(webhook);
    }
  }

  /**
   * Retry a single webhook
   */
  private static async retryWebhook(webhook: any) {
    const startTime = Date.now();

    try {
      log.info("🔄 Retrying webhook", {
        eventId: webhook.eventId,
        attempt: webhook.retryCount + 1,
      });

      webhook.status = "retrying";
      webhook.retryCount += 1;
      webhook.lastAttemptAt = new Date();
      await webhook.save();

      // Simulate webhook request
      const mockReq = {
        body: webhook.payload,
        headers: webhook.payload.headers || {},
      } as any;

      await PaymentService.handleWebhook(mockReq);

      // Success!
      webhook.status = "succeeded";
      await webhook.save();

      const duration = Date.now() - startTime;
      log.info("✅ Webhook retry succeeded", {
        eventId: webhook.eventId,
        attempt: webhook.retryCount,
        duration,
      });
    } catch (error: any) {
      const duration = Date.now() - startTime;
      webhook.error = error.message;
      webhook.lastAttemptAt = new Date();

      // Calculate exponential backoff using 3^n * 5 minutes:
      // n=1 -> 15m, n=2 -> 45m, n=3 -> 135m, n=4 -> 405m
      const backoffMinutes = Math.pow(3, webhook.retryCount) * 5;
      webhook.nextRetryAt = new Date(Date.now() + backoffMinutes * 60 * 1000);

      if (webhook.retryCount >= webhook.maxRetries) {
        webhook.status = "failed";
        log.error("❌ Webhook retry failed - max retries reached", {
          eventId: webhook.eventId,
          maxRetries: webhook.maxRetries,
        });
      } else {
        webhook.status = "pending";
        log.warn("⚠️ Webhook retry failed - will retry", {
          eventId: webhook.eventId,
          attempt: webhook.retryCount,
          nextRetryAt: webhook.nextRetryAt,
          duration,
        });
      }

      await webhook.save();
    }
  }

  /**
   * Manually retry a specific webhook by ID
   */
  static async retryById(webhookId: string) {
    const webhook = await FailedWebhookModel.findById(webhookId);
    if (!webhook) {
      throw new Error("Webhook not found");
    }

    if (webhook.status === "succeeded") {
      throw new Error("Webhook already succeeded");
    }

    await this.retryWebhook(webhook);
  }
}
