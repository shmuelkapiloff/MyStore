import pino from "pino";
import { env } from "../config/env";

export const logger = pino({
  level: env.LOG_LEVEL,
  transport:
    env.NODE_ENV === "development" ? { target: "pino-pretty" } : undefined,
});

// Enhanced logger with service context
export const log = {
  in: (service: string, func: string, ...data: any[]) => {
    const context =
      data.length > 0 ? { service, func, data } : { service, func };
    logger.info(context, `🔄 ${service}.${func} - START`);
    return Date.now();
  },
  out: (service: string, func: string, startTime: number) => {
    const duration = Date.now() - startTime;
    logger.info(
      { service, func, duration },
      `✅ ${service}.${func} - END (${duration}ms)`,
    );
  },
  err: (service: string, func: string, startTime: number, error: any) => {
    const duration = Date.now() - startTime;
    logger.error(
      { service, func, duration, error },
      `❌ ${service}.${func} - ERROR (${duration}ms)`,
    );
  },
  debug: (service: string, message: string, data?: any) => {
    logger.debug({ service, data }, message);
  },
  // Simple log methods: message-first convenience wrappers around pino
  info: (message: string, data?: object) => logger.info(data ?? {}, message),
  error: (message: string, data?: object) => logger.error(data ?? {}, message),
  warn: (message: string, data?: object) => logger.warn(data ?? {}, message),
};

// Helper for automatic tracking - returns object with success/error methods
export const track = (
  service: string,
  funcName: string,
  data?: Record<string, unknown>,
) => {
  const startTime =
    data !== undefined
      ? log.in(service, funcName, data)
      : log.in(service, funcName);
  return {
    success: () => log.out(service, funcName, startTime),
    error: (error: any) => log.err(service, funcName, startTime, error),
  };
};
