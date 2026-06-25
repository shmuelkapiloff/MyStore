/**
 * Payment Metrics Service
 * Tracks payment statistics for monitoring and analytics
 */

interface PaymentMetrics {
  totalPayments: number;
  successfulPayments: number;
  failedPayments: number;
  totalAmount: number;
  averageAmount: number;
  successRate: number;
  averageProcessingTime: number;
}

interface TimeSeriesMetric {
  timestamp: Date;
  value: number;
  metadata?: any;
}

class MetricsCollector {
  private metrics: Map<string, TimeSeriesMetric[]> = new Map();
  private readonly MAX_METRICS_PER_KEY = 1000; // Keep last 1000 data points

  /**
   * Record a metric
   */
  record(key: string, value: number, metadata?: any) {
    if (!this.metrics.has(key)) {
      this.metrics.set(key, []);
    }

    const metricsArray = this.metrics.get(key)!;
    metricsArray.push({
      timestamp: new Date(),
      value,
      metadata,
    });

    // Keep only last N metrics
    if (metricsArray.length > this.MAX_METRICS_PER_KEY) {
      metricsArray.shift();
    }
  }

  /**
   * Get average of last N metrics
   */
  getAverage(key: string, lastN: number = 100): number {
    const metricsArray = this.metrics.get(key) || [];
    const recent = metricsArray.slice(-lastN);

    if (recent.length === 0) return 0;

    const sum = recent.reduce((acc, m) => acc + m.value, 0);
    return sum / recent.length;
  }

  /**
   * Get sum of last N metrics
   */
  getSum(key: string, lastN: number = 100): number {
    const metricsArray = this.metrics.get(key) || [];
    const recent = metricsArray.slice(-lastN);
    return recent.reduce((acc, m) => acc + m.value, 0);
  }

  /**
   * Get count of metrics
   */
  getCount(key: string): number {
    return (this.metrics.get(key) || []).length;
  }

  /**
   * Get all metrics for a key
   */
  getAll(key: string): TimeSeriesMetric[] {
    return this.metrics.get(key) || [];
  }

  /**
   * Clear metrics
   */
  clear(key?: string) {
    if (key) {
      this.metrics.delete(key);
    } else {
      this.metrics.clear();
    }
  }
}

export class PaymentMetricsService {
  private static collector = new MetricsCollector();

  /**
   * Record payment attempt
   */
  static recordPaymentAttempt(orderId: string, amount: number) {
    this.collector.record("payment.attempts", 1, { orderId, amount });
  }

  /**
   * Record successful payment
   */
  static recordPaymentSuccess(orderId: string, amount: number, durationMs: number) {
    this.collector.record("payment.success", 1, { orderId, amount });
    this.collector.record("payment.amount.success", amount, { orderId });
    this.collector.record("payment.duration", durationMs, { orderId });
  }

  /**
   * Record failed payment
   */
  static recordPaymentFailure(orderId: string, amount: number, reason: string) {
    this.collector.record("payment.failure", 1, {
      orderId,
      amount,
      reason,
    });
    this.collector.record("payment.amount.failed", amount, { orderId });
  }

  /**
   * Record webhook processing time
   */
  static recordWebhookDuration(eventId: string, durationMs: number) {
    this.collector.record("webhook.duration", durationMs, { eventId });
  }

  /**
   * Get payment metrics summary
   */
  static getMetrics(lastN: number = 100): PaymentMetrics {
    const totalAttempts = this.collector.getSum("payment.attempts", lastN);
    const successfulPayments = this.collector.getSum("payment.success", lastN);
    const failedPayments = this.collector.getSum("payment.failure", lastN);
    const totalAmount = this.collector.getSum("payment.amount.success", lastN);

    return {
      totalPayments: totalAttempts,
      successfulPayments,
      failedPayments,
      totalAmount,
      averageAmount:
        successfulPayments > 0 ? totalAmount / successfulPayments : 0,
      successRate:
        totalAttempts > 0 ? (successfulPayments / totalAttempts) * 100 : 0,
      averageProcessingTime: this.collector.getAverage("payment.duration", lastN),
    };
  }

  /**
   * Get webhook metrics
   */
  static getWebhookMetrics(lastN: number = 100) {
    return {
      averageDuration: this.collector.getAverage("webhook.duration", lastN),
      count: this.collector.getCount("webhook.duration"),
    };
  }

  /**
   * Export all metrics (for external monitoring systems)
   */
  static exportMetrics() {
    return {
      payment: this.getMetrics(),
      webhook: this.getWebhookMetrics(),
      timestamp: new Date(),
    };
  }

  /**
   * Clear all metrics
   */
  static clearMetrics() {
    this.collector.clear();
  }
}
