import dotenv from "dotenv";
dotenv.config();

const DEFAULT_JWT_SECRET =
  "your-super-secret-jwt-key-change-in-production-2024!";

function isValidUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
    
  }
}

/** Validates all env vars on startup. Throws on misconfiguration. */
function validateEnv(): "development" | "test" | "production" {
  const nodeEnv = process.env.NODE_ENV?.trim();
  const allowed = ["development", "test", "production"] as const;
  if (!nodeEnv || !allowed.includes(nodeEnv as (typeof allowed)[number])) {
    throw new Error(
      `❌ NODE_ENV must be one of ${allowed.join("|")}, got: ${nodeEnv ?? "(unset)"}`,
    );
  }

  const isProd = nodeEnv === "production";
  const paymentProvider =
    process.env.PAYMENT_PROVIDER?.toLowerCase() || "stripe";

  const port = Number(process.env.PORT || 4001);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`❌ PORT must be a valid TCP port (1-65535), got: ${port}`);
  }

  if (paymentProvider !== "stripe") {
    throw new Error(
      `❌ Unsupported PAYMENT_PROVIDER: ${paymentProvider}. Supported: stripe`,
    );
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    if (isProd)
      throw new Error("❌ STRIPE_SECRET_KEY is required in production");
    console.warn(
      "⚠️  STRIPE_SECRET_KEY not set - Stripe calls will fail at runtime",
    );
  }

  if (!process.env.STRIPE_WEBHOOK_SECRET) {
    if (isProd)
      throw new Error(
        "❌ STRIPE_WEBHOOK_SECRET is required in production for webhook verification",
      );
    console.warn(
      "⚠️  STRIPE_WEBHOOK_SECRET not set - webhook signature verification disabled",
    );
  }

  if (!process.env.JWT_SECRET) {
    if (isProd) throw new Error("❌ JWT_SECRET is required in production");
    console.warn(
      "⚠️  JWT_SECRET not set - using insecure default. Never do this in production.",
    );
  } else if (isProd) {
    if (
      process.env.JWT_SECRET === DEFAULT_JWT_SECRET ||
      process.env.JWT_SECRET.length < 32
    ) {
      throw new Error(
        "❌ JWT_SECRET must be at least 32 chars and not use the development default in production",
      );
    }
  }

  if (isProd && !process.env.MONGO_URI)
    throw new Error("❌ MONGO_URI is required in production");
  if (isProd && !process.env.REDIS_URL)
    throw new Error("❌ REDIS_URL is required in production");
  if (isProd && !process.env.CLIENT_URL)
    throw new Error("❌ CLIENT_URL is required in production");
  if (isProd && !process.env.ALLOWED_ORIGINS)
    throw new Error("❌ ALLOWED_ORIGINS is required in production");

  if (process.env.CLIENT_URL && !isValidUrl(process.env.CLIENT_URL)) {
    throw new Error("❌ CLIENT_URL must be a valid absolute URL");
  }

  return nodeEnv as (typeof allowed)[number];
}

// Run validation on startup — throws on any misconfiguration before server starts
const nodeEnv = validateEnv();

export const env = {
  NODE_ENV: nodeEnv,
  PORT: Number(process.env.PORT || 4001),
  MONGO_URI: process.env.MONGO_URI || "mongodb://127.0.0.1:27017/simple_shop",
  REDIS_URL: process.env.REDIS_URL || "redis://127.0.0.1:6379",
  LOG_LEVEL: process.env.LOG_LEVEL || "info",
  CLIENT_URL: process.env.CLIENT_URL || "",
  STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY || "",
  STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET || "",
  JWT_SECRET: process.env.JWT_SECRET || DEFAULT_JWT_SECRET,
  ALLOWED_ORIGINS:
    process.env.ALLOWED_ORIGINS ||
    "http://localhost:5173,http://localhost:3000",
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || "",
};
