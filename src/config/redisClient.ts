import Redis from "ioredis";
import { env } from "./env";
import { logger } from "../utils/logger";

export const redis = new Redis(env.REDIS_URL, {
  // lazyConnect: don't auto-open a socket on import (safe for tests and DI)
  lazyConnect: true,
  // Limit retries per individual command before failing it
  maxRetriesPerRequest: 3,
  // Fail fast if no connection within 5s
  connectTimeout: 5000,
  // Exponential backoff: 200ms, 400ms, ... capped at 3s; retry indefinitely
  retryStrategy: (times) => {
    if (times === 10) {
      logger.error(
        "Redis: 10 reconnect attempts failed - still retrying every 3s",
      );
    }
    return Math.min(times * 200, 3000);
  },
});

export async function connectRedis(): Promise<void> {
  // "wait" is the initial state when lazyConnect is true
  if (redis.status === "wait") {
    await redis.connect();
  }
}

export async function disconnectRedis(): Promise<void> {
  try {
    await redis.quit();
    logger.info("Redis disconnected");
  } catch (err) {
    logger.error({ err }, "Redis disconnect failed");
  }
}

redis.on("connect", () => logger.info("Redis connected"));
redis.on("reconnecting", () => logger.warn("Redis reconnecting..."));
redis.on("close", () => logger.warn("Redis connection closed"));
redis.on("error", (err) => logger.error({ err }, "Redis error"));
