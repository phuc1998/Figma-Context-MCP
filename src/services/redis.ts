import Redis from "redis";
import { Logger } from "../utils/logger.js";

export class RedisService {
  private client: Redis.RedisClientType;
  private isConnected = false;

  constructor() {
    const REDIS_HOST = process.env.REDIS_HOST || 'localhost';
    const REDIS_PORT = parseInt(process.env.REDIS_PORT || '6379', 10);
    const REDIS_DB = parseInt(process.env.REDIS_DB || '0', 10);

    this.client = Redis.createClient({
      socket: {
        host: REDIS_HOST,
        port: REDIS_PORT,
      },
      database: REDIS_DB,
    });

    this.client.on("error", (err) => {
      Logger.error("Redis Client Error:", err);
    });

    this.client.on("connect", () => {
      Logger.log("Redis client connected");
      this.isConnected = true;
    });

    this.client.on("disconnect", () => {
      Logger.log("Redis client disconnected");
      this.isConnected = false;
    });
  }

  async connect(): Promise<void> {
    if (!this.isConnected) {
      try {
        await this.client.connect();
        Logger.log("Successfully connected to Redis");
      } catch (error) {
        Logger.error("Failed to connect to Redis:", error);
        throw error;
      }
    }
  }

  async disconnect(): Promise<void> {
    if (this.isConnected) {
      try {
        await this.client.disconnect();
        Logger.log("Successfully disconnected from Redis");
      } catch (error) {
        Logger.error("Failed to disconnect from Redis:", error);
        throw error;
      }
    }
  }

  /**
   * Retrieve Figma API key from Redis using session hash
   * @param sessionHash - The session hash key
   * @returns The Figma API key or null if not found
   */
  async getFigmaApiKey(sessionHash: string): Promise<string | null> {
    try {
      if (!this.isConnected) {
        await this.connect();
      }

      Logger.log(`Retrieving Figma API key for session hash: ${sessionHash}`);
      const apiKey = await this.client.get(sessionHash);
      
      if (apiKey) {
        Logger.log(`Successfully retrieved API key for session: ${sessionHash}`);
        return apiKey;
      } else {
        Logger.log(`No API key found for session hash: ${sessionHash}`);
        return null;
      }
    } catch (error) {
      Logger.error(`Error retrieving API key for session ${sessionHash}:`, error);
      throw error;
    }
  }

  /**
   * Check if Redis connection is active
   */
  get connected(): boolean {
    return this.isConnected;
  }
}

// Export a singleton instance
export const redisService = new RedisService();
