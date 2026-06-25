// src/config/cors.ts
/**
 * CORS Configuration
 * Allows requests from specified origins with proper credentials handling
 */

import cors from "cors";
import { env } from "./env";

const allowedOrigins = env.ALLOWED_ORIGINS.split(",").map((origin) =>
  origin.trim()
);

export const corsConfig = cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS error: Origin ${origin} not allowed`));
    }
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  maxAge: 86400, // 24 hours
});

export default corsConfig;
