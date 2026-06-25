/**
 * Metrics Middleware
 * 
 * Automatically tracks HTTP request metrics for all routes:
 * - Request duration
 * - Request count by method, route, and status code
 * - Response sizes
 */

import { Request, Response, NextFunction } from 'express';
import { trackHttpRequest } from '../utils/metrics';

/**
 * Middleware to track HTTP request metrics
 * 
 * Usage: app.use(metricsMiddleware);
 */
export function metricsMiddleware(req: Request, res: Response, next: NextFunction) {
  const startTime = Date.now();

  // Capture original end function
  const originalEnd = res.end;

  // Override end function to capture metrics
  res.end = function (this: Response, chunk?: any, encoding?: any, cb?: any): Response {
    // Calculate duration in seconds
    const duration = (Date.now() - startTime) / 1000;

    // Get route pattern (e.g., /api/products/:id instead of /api/products/123)
    const route = req.route?.path || req.path;
    const method = req.method;
    const statusCode = res.statusCode;

    // Track the metrics
    trackHttpRequest(method, route, statusCode, duration);

    // Call original end function
    return originalEnd.call(this, chunk, encoding, cb);
  };

  next();
}

/**
 * Middleware to expose /metrics endpoint for Prometheus scraping
 * 
 * Usage: app.get('/metrics', metricsEndpoint);
 */
export async function metricsEndpoint(req: Request, res: Response) {
  try {
    const { register } = await import('../utils/metrics');
    
    res.set('Content-Type', register.contentType);
    const metrics = await register.metrics();
    res.end(metrics);
  } catch (error) {
    res.status(500).end(error instanceof Error ? error.message : 'Failed to collect metrics');
  }
}
