import mongoose from "mongoose";
import { env } from "./env";
import { logger } from "../utils/logger";

/** Mask credentials from MongoDB URI for safe logging */
function maskUri(uri: string): string {
  try {
    return uri.replace(/\/\/([^:]+):([^@]+)@/, "//***:***@");
  } catch {
    return "***masked***";
  }
}

const MONGO_OPTIONS: mongoose.ConnectOptions = {
  serverSelectionTimeoutMS: 5000, // fail fast if no server found within 5s
  socketTimeoutMS: 45000, // close idle sockets after 45s
  maxPoolSize: 10, // max concurrent connections in the pool
};

export async function connectMongo(): Promise<void> {
  try {
    await mongoose.connect(env.MONGO_URI, MONGO_OPTIONS);
    logger.info({ uri: maskUri(env.MONGO_URI) }, "Mongo connected");
  } catch (err) {
    logger.error(
      { err, uri: maskUri(env.MONGO_URI) },
      "Mongo connection failed",
    );
    throw err;
  }
}

export async function disconnectMongo(): Promise<void> {
  try {
    await mongoose.disconnect();
    logger.info("Mongo disconnected");
  } catch (err) {
    logger.error({ err }, "Mongo disconnect failed");
  }
}
