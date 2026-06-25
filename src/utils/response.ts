import { Response } from "express";

/**
 * Unified API Response helpers.
 *
 * Every endpoint should return:
 *   { success: boolean, data?: T, message?: string, errors?: any[] }
 */

export type ApiResponse<T = unknown> = {
  success: boolean;
  message?: string;
  data?: T;
  errors?: any[];
};

/** Send a success response */
export function sendSuccess<T>(
  res: Response,
  data: T,
  message?: string,
  status: number = 200,
): void {
  res.status(status).json({
    success: true,
    data,
    message,
  });
}

/** Send an error response */
export function sendError(
  res: Response,
  status: number,
  message: string,
  errors?: any[],
): void {
  res.status(status).json({
    success: false,
    message,
    errors: errors || [],
  });
}

// Legacy aliases — kept for backward compatibility (auth middleware, etc.)
export const sendResponse = sendSuccess;
export const ok = <T>(data: T, message?: string): ApiResponse<T> => ({
  success: true,
  data,
  message,
});
export const fail = (message: string, errors?: any[]): ApiResponse<null> => ({
  success: false,
  message,
  errors: errors || [],
});
