import { Redis } from "ioredis";
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
  password?: string; // Password for Redis master/slave
  sentinelPassword?: string; // Password for Sentinel nodes
}

export type RedisConfig = RedisSingleConfig | RedisSentinelConfig;

export class RedisService {
  private client: Redis;
  private isConnected = false;
  private config: RedisConfig;

  constructor(config?: RedisConfig) {
    this.config = config || this.getConfigFromEnv();
    this.client = this.createClient();

    this.client.on("error", (err: Error) => {
      Logger.error("Redis Client Error:", err);
      this.isConnected = false;
    });

    this.client.on("connect", () => {
      Logger.log("Redis client connected");
      this.isConnected = true;
    });

    this.client.on("ready", () => {
      Logger.log("Redis client ready");
      this.isConnected = true;
    });

    this.client.on("close", () => {
      Logger.log("Redis client disconnected");
      this.isConnected = false;
    });

    this.client.on("end", () => {
      Logger.log("Redis client connection ended");
      this.isConnected = false;
    });
  }

  private getConfigFromEnv(): RedisConfig {
    const REDIS_MODE = process.env.REDIS_MODE || 'single';
    
    if (REDIS_MODE === 'sentinel') {
      const sentinels = this.parseSentinelsFromEnv();
      const name = process.env.REDIS_SENTINEL_NAME || 'mymaster';
      
      if (sentinels.length === 0) {
        throw new Error('REDIS_SENTINEL_HOSTS environment variable is required for sentinel mode');
      }

      return {
        mode: 'sentinel',
        sentinels,
        name,
        db: parseInt(process.env.REDIS_DB || '0', 10),
        password: process.env.REDIS_PASSWORD, // Password for Redis master/slave
        sentinelPassword: process.env.REDIS_SENTINEL_PASSWORD, // Password for Sentinel nodes
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
    const sentinelsStr = process.env.REDIS_SENTINEL_HOSTS;
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

  private createClient(): Redis {
    if (this.config.mode === 'sentinel') {
      // For ioredis, use Sentinel mode
      const sentinelConfig: any = {
        sentinels: this.config.sentinels,
        name: this.config.name,
        db: this.config.db,
        password: this.config.password, // Password for Redis master/slave
        lazyConnect: true, // Don't connect immediately
        maxRetriesPerRequest: 3,
      };

      // Add Sentinel password if provided
      if (this.config.sentinelPassword) {
        sentinelConfig.sentinelPassword = this.config.sentinelPassword;
      }

      return new Redis(sentinelConfig);
    } else {
      // For single Redis instance
      return new Redis({
        host: this.config.host,
        port: this.config.port,
        db: this.config.db,
        password: this.config.password,
        lazyConnect: true, // Don't connect immediately
        maxRetriesPerRequest: 3,
      });
    }
  }

  async connect(): Promise<void> {
    if (!this.isConnected) {
      try {
        // ioredis connects automatically when first command is issued
        // or we can explicitly connect
        await this.client.connect();
        Logger.log("Successfully connected to Redis");
      } catch (error) {
        Logger.error("Failed to connect to Redis:", error);
        throw error;
      }
    }
  }

  async disconnect(): Promise<void> {
    if (this.isConnected || this.client.status !== 'end') {
      try {
        await this.client.quit();
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
      // ioredis will auto-connect if not connected
      if (!this.isConnected && this.client.status === 'end') {
        await this.connect();
      }

      Logger.log(`Retrieving Figma API key for session hash: ${sessionHash}`);
      
      // ioredis has native TypeScript support and proper return types
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
    return this.isConnected && this.client.status === 'ready';
  }
}

// Export a singleton instance
export const redisService = new RedisService();
