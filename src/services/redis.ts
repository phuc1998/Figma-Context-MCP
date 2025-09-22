import Redis from "redis";
import { Logger } from "../utils/logger.js";

export interface RedisSingleConfig {
  mode: 'single';
  host: string;
  port: number;
  db?: number;
  password?: string;
}

export interface RedisSentinelConfig {
  mode: 'sentinel';
  sentinels: Array<{
    host: string;
    port: number;
  }>;
  name: string;
  db?: number;
  password?: string;
}

export type RedisConfig = RedisSingleConfig | RedisSentinelConfig;

export class RedisService {
  private client: Redis.RedisClientType | Redis.RedisSentinelType;
  private isConnected = false;
  private config: RedisConfig;

  constructor(config?: RedisConfig) {
    this.config = config || this.getConfigFromEnv();
    this.client = this.createClient();

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

  private getConfigFromEnv(): RedisConfig {
    const REDIS_MODE = process.env.REDIS_MODE || 'single';
    
    if (REDIS_MODE === 'sentinel') {
      const sentinels = this.parseSentinelsFromEnv();
      const name = process.env.REDIS_SENTINEL_NAME || 'mymaster';
      
      if (sentinels.length === 0) {
        throw new Error('REDIS_SENTINELS environment variable is required for sentinel mode');
      }

      return {
        mode: 'sentinel',
        sentinels,
        name,
        db: parseInt(process.env.REDIS_DB || '0', 10),
        password: process.env.REDIS_PASSWORD,
      };
    } else {
      return {
        mode: 'single',
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        db: parseInt(process.env.REDIS_DB || '0', 10),
        password: process.env.REDIS_PASSWORD,
      };
    }
  }

  private parseSentinelsFromEnv(): Array<{ host: string; port: number }> {
    const sentinelsStr = process.env.REDIS_SENTINELS;
    if (!sentinelsStr) {
      return [];
    }

    return sentinelsStr.split(',').map(sentinel => {
      const [host, port] = sentinel.trim().split(':');
      return {
        host: host.trim(),
        port: parseInt(port || '26379', 10),
      };
    });
  }

  private createClient(): Redis.RedisClientType | Redis.RedisSentinelType {
    if (this.config.mode === 'sentinel') {
      // For Redis client v5, use createSentinel for Sentinel mode
      return Redis.createSentinel({
        name: this.config.name,
        sentinelRootNodes: this.config.sentinels,
        nodeClientOptions: {
          database: this.config.db,
          password: this.config.password,
        },
      });
    } else {
      return Redis.createClient({
        socket: {
          host: this.config.host,
          port: this.config.port,
        },
        database: this.config.db,
        password: this.config.password,
      });
    }
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
        // Use quit() method for Redis client v5
        await (this.client as any).quit();
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
      
      // Handle both regular client and sentinel client
      const apiKey = await (this.client as any).get(sessionHash);
      
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
