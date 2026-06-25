/**
 * Prometheus Metrics Configuration
 * 
 * Provides application metrics for monitoring:
 * - HTTP request duration and counts
 * - Payment processing metrics
 * - Order creation metrics
 * - Database operation duration
 * - Cache hit/miss rates
 */

import { Registry, Counter, Histogram, Gauge } from 'prom-client';

// Create a Registry which registers the metrics
export const register = new Registry();

// Add default metrics (CPU, memory, etc.)
import { collectDefaultMetrics } from 'prom-client';
collectDefaultMetrics({ register });

/**
 * HTTP Request Metrics
 */
export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.5, 1, 2, 5, 10], // Response time buckets in seconds
  registers: [register],
});

export const httpRequestTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

/**
 * Payment Metrics
 */
export const paymentProcessingDuration = new Histogram({
  name: 'payment_processing_duration_seconds',
  help: 'Duration of payment processing in seconds',
  labelNames: ['status'],
  buckets: [0.5, 1, 2, 5, 10, 30],
  registers: [register],
});

export const paymentTotal = new Counter({
  name: 'payments_total',
  help: 'Total number of payment attempts',
  labelNames: ['status', 'gateway'],
  registers: [register],
});

export const paymentAmount = new Histogram({
  name: 'payment_amount_dollars',
  help: 'Payment amounts in dollars',
  labelNames: ['status'],
  buckets: [10, 50, 100, 200, 500, 1000, 5000],
  registers: [register],
});

/**
 * Order Metrics
 */
export const orderCreationDuration = new Histogram({
  name: 'order_creation_duration_seconds',
  help: 'Duration of order creation in seconds',
  buckets: [0.1, 0.5, 1, 2, 5],
  registers: [register],
});

export const orderTotal = new Counter({
  name: 'orders_total',
  help: 'Total number of orders created',
  labelNames: ['status'],
  registers: [register],
});

export const activeOrders = new Gauge({
  name: 'orders_active',
  help: 'Number of active orders',
  registers: [register],
});

/**
 * Database Metrics
 */
export const dbQueryDuration = new Histogram({
  name: 'db_query_duration_seconds',
  help: 'Duration of database queries in seconds',
  labelNames: ['operation', 'collection'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2],
  registers: [register],
});

export const dbOperationTotal = new Counter({
  name: 'db_operations_total',
  help: 'Total number of database operations',
  labelNames: ['operation', 'collection'],
  registers: [register],
});

/**
 * Cache Metrics
 */
export const cacheHitTotal = new Counter({
  name: 'cache_hits_total',
  help: 'Total number of cache hits',
  labelNames: ['key_prefix'],
  registers: [register],
});

export const cacheMissTotal = new Counter({
  name: 'cache_misses_total',
  help: 'Total number of cache misses',
  labelNames: ['key_prefix'],
  registers: [register],
});

export const cacheOperationDuration = new Histogram({
  name: 'cache_operation_duration_seconds',
  help: 'Duration of cache operations in seconds',
  labelNames: ['operation'],
  buckets: [0.001, 0.005, 0.01, 0.05, 0.1],
  registers: [register],
});

/**
 * Business Metrics
 */
export const cartItemsGauge = new Gauge({
  name: 'cart_items_current',
  help: 'Current number of items in all active carts',
  registers: [register],
});

export const stockLevelGauge = new Gauge({
  name: 'product_stock_level',
  help: 'Current stock level for products',
  labelNames: ['product_id'],
  registers: [register],
});

/**
 * Helper function to track HTTP request metrics
 */
export function trackHttpRequest(
  method: string,
  route: string,
  statusCode: number,
  duration: number
) {
  httpRequestDuration.observe(
    { method, route, status_code: statusCode.toString() },
    duration
  );
  httpRequestTotal.inc({ method, route, status_code: statusCode.toString() });
}

/**
 * Helper function to track payment metrics
 */
export function trackPayment(
  status: 'success' | 'failure' | 'pending',
  gateway: string,
  amount: number,
  duration: number
) {
  paymentTotal.inc({ status, gateway });
  paymentAmount.observe({ status }, amount);
  paymentProcessingDuration.observe({ status }, duration);
}

/**
 * Helper function to track order creation
 */
export function trackOrderCreation(status: 'success' | 'failure', duration: number) {
  orderTotal.inc({ status });
  orderCreationDuration.observe(duration);
}

/**
 * Helper function to track database operations
 */
export function trackDbOperation(
  operation: string,
  collection: string,
  duration: number
) {
  dbOperationTotal.inc({ operation, collection });
  dbQueryDuration.observe({ operation, collection }, duration);
}

/**
 * Helper function to track cache operations
 */
export function trackCacheHit(keyPrefix: string) {
  cacheHitTotal.inc({ key_prefix: keyPrefix });
}

export function trackCacheMiss(keyPrefix: string) {
  cacheMissTotal.inc({ key_prefix: keyPrefix });
}

export function trackCacheOperation(operation: 'get' | 'set' | 'del', duration: number) {
  cacheOperationDuration.observe({ operation }, duration);
}
