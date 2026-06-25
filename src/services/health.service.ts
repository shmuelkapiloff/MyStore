import mongoose from "mongoose";
import { logger } from "../utils/logger";

export class HealthService {
  static async checkHealth() {
    try {
      logger.info({ service: "HealthCheck" }, "Checking database status");

      const mongoConnection = mongoose.connection;
      const isConnected = mongoConnection.readyState === 1;

      if (!isConnected) {
        throw new Error("MongoDB not connected");
      }

      // Try a simple operation to verify connection is working
      const db = mongoose.connection.db;
      if (!db) {
        throw new Error("Cannot access database");
      }

      // Get collection list as a health check
      const collections = await db.listCollections().toArray();

      logger.debug(
        {
          service: "HealthCheck",
          collectionCount: collections.length,
          collectionNames: collections.map((c) => c.name),
        },
        "Database collections retrieved"
      );

      logger.info(
        {
          service: "HealthCheck",
          status: "healthy",
          timestamp: new Date().toISOString(),
        },
        "✅ Database health verified"
      );

      return {
        status: "healthy",
        timestamp: new Date().toISOString(),
        database: "connected",
        collections: collections.length,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Unknown error";
      logger.error(
        {
          service: "HealthCheck",
          error: errorMsg,
        },
        "Database health check failed"
      );

      return {
        status: "unhealthy",
        timestamp: new Date().toISOString(),
        error: errorMsg,
      };
    }
  }
}
