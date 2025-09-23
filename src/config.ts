import { config as loadEnv } from "dotenv";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { resolve } from "path";
import type { FigmaAuthOptions } from "./services/figma.js";
import type { RedisConfig } from "./services/redis.js";

interface ServerConfig {
  auth: FigmaAuthOptions;
  port: number;
  outputFormat: "yaml" | "json";
  skipImageDownloads?: boolean;
  redis?: RedisConfig;
  configSources: {
    figmaApiKey: "cli" | "env";
    figmaOAuthToken: "cli" | "env" | "none";
    port: "cli" | "env" | "default";
    outputFormat: "cli" | "env" | "default";
    envFile: "cli" | "default";
    skipImageDownloads?: "cli" | "env" | "default";
    redis?: "env" | "default";
  };
}

function maskApiKey(key: string): string {
  if (!key || key.length <= 4) return "****";
  return `****${key.slice(-4)}`;
}

function getRedisConfigFromEnv(): RedisConfig | undefined {
  const REDIS_MODE = process.env.REDIS_MODE || 'single';
  
  if (REDIS_MODE === 'sentinel') {
    const sentinelsStr = process.env.REDIS_SENTINEL_HOSTS;
    if (!sentinelsStr) {
      return undefined;
    }

    const sentinels = sentinelsStr.split(',').map(sentinel => {
      const [host, port] = sentinel.trim().split(':');
      return {
        host: host.trim(),
        port: parseInt(port || '26379', 10),
      };
    });

    return {
      mode: 'sentinel',
      sentinels,
      name: process.env.REDIS_SENTINEL_NAME || 'mymaster',
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

interface CliArgs {
  "figma-api-key"?: string;
  "figma-oauth-token"?: string;
  env?: string;
  port?: number;
  json?: boolean;
  "skip-image-downloads"?: boolean;
}

export function getServerConfig(isStdioMode: boolean): ServerConfig {
  // Parse command line arguments
  const argv = yargs(hideBin(process.argv))
    .options({
      "figma-api-key": {
        type: "string",
        description: "Figma API key (Personal Access Token)",
      },
      "figma-oauth-token": {
        type: "string",
        description: "Figma OAuth Bearer token",
      },
      env: {
        type: "string",
        description: "Path to custom .env file to load environment variables from",
      },
      port: {
        type: "number",
        description: "Port to run the server on",
      },
      json: {
        type: "boolean",
        description: "Output data from tools in JSON format instead of YAML",
        default: false,
      },
      "skip-image-downloads": {
        type: "boolean",
        description: "Do not register the download_figma_images tool (skip image downloads)",
        default: false,
      },
    })
    .help()
    .version(process.env.NPM_PACKAGE_VERSION ?? "unknown")
    .parseSync() as CliArgs;

  // Load environment variables ASAP from custom path or default
  let envFilePath: string;
  let envFileSource: "cli" | "default";

  if (argv["env"]) {
    envFilePath = resolve(argv["env"]);
    envFileSource = "cli";
  } else {
    envFilePath = resolve(process.cwd(), ".env");
    envFileSource = "default";
  }

  // Override anything auto-loaded from .env if a custom file is provided.
  loadEnv({ path: envFilePath, override: true });

  const auth: FigmaAuthOptions = {
    figmaApiKey: "",
    figmaOAuthToken: "",
    useOAuth: false,
  };

  const redisConfig = getRedisConfigFromEnv();
  
  const config: Omit<ServerConfig, "auth"> = {
    port: 3333,
    outputFormat: "yaml",
    skipImageDownloads: false,
    redis: redisConfig,
    configSources: {
      figmaApiKey: "env",
      figmaOAuthToken: "none",
      port: "default",
      outputFormat: "default",
      envFile: envFileSource,
      skipImageDownloads: "default",
      redis: redisConfig ? "env" : "default",
    },
  };

  // Handle FIGMA_API_KEY
  if (argv["figma-api-key"]) {
    auth.figmaApiKey = argv["figma-api-key"];
    config.configSources.figmaApiKey = "cli";
  } else if (process.env.FIGMA_API_KEY) {
    auth.figmaApiKey = process.env.FIGMA_API_KEY;
    config.configSources.figmaApiKey = "env";
  }

  // Handle FIGMA_OAUTH_TOKEN
  if (argv["figma-oauth-token"]) {
    auth.figmaOAuthToken = argv["figma-oauth-token"];
    config.configSources.figmaOAuthToken = "cli";
    auth.useOAuth = true;
  } else if (process.env.FIGMA_OAUTH_TOKEN) {
    auth.figmaOAuthToken = process.env.FIGMA_OAUTH_TOKEN;
    config.configSources.figmaOAuthToken = "env";
    auth.useOAuth = true;
  }

  // Handle PORT
  if (argv.port) {
    config.port = argv.port;
    config.configSources.port = "cli";
  } else if (process.env.PORT) {
    config.port = parseInt(process.env.PORT, 10);
    config.configSources.port = "env";
  }

  // Handle JSON output format
  if (argv.json) {
    config.outputFormat = "json";
    config.configSources.outputFormat = "cli";
  } else if (process.env.OUTPUT_FORMAT) {
    config.outputFormat = process.env.OUTPUT_FORMAT as "yaml" | "json";
    config.configSources.outputFormat = "env";
  }

  // Handle skipImageDownloads
  if (argv["skip-image-downloads"]) {
    config.skipImageDownloads = true;
    config.configSources.skipImageDownloads = "cli";
  } else if (process.env.SKIP_IMAGE_DOWNLOADS === "true") {
    config.skipImageDownloads = true;
    config.configSources.skipImageDownloads = "env";
  }

  // Validate configuration - API key is now optional since it can be provided via Redis session
  if (!auth.figmaApiKey && !auth.figmaOAuthToken) {
    console.warn(
      "Warning: No FIGMA_API_KEY or FIGMA_OAUTH_TOKEN configured. API key will need to be provided via session_hash parameter in tool calls.",
    );
  }

  // Log configuration sources
  if (!isStdioMode) {
    console.log("\nConfiguration:");
    console.log(`- ENV_FILE: ${envFilePath} (source: ${config.configSources.envFile})`);
    if (auth.useOAuth) {
      console.log(
        `- FIGMA_OAUTH_TOKEN: ${maskApiKey(auth.figmaOAuthToken)} (source: ${config.configSources.figmaOAuthToken})`,
      );
      console.log("- Authentication Method: OAuth Bearer Token");
    } else {
      console.log(
        `- FIGMA_API_KEY: ${maskApiKey(auth.figmaApiKey)} (source: ${config.configSources.figmaApiKey})`,
      );
      console.log("- Authentication Method: Personal Access Token (X-Figma-Token)");
    }
    console.log(`- PORT: ${config.port} (source: ${config.configSources.port})`);
    console.log(
      `- OUTPUT_FORMAT: ${config.outputFormat} (source: ${config.configSources.outputFormat})`,
    );
    console.log(
      `- SKIP_IMAGE_DOWNLOADS: ${config.skipImageDownloads} (source: ${config.configSources.skipImageDownloads})`,
    );
    
    // Log Redis configuration
    if (config.redis) {
      if (config.redis.mode === 'sentinel') {
        console.log(`- REDIS_MODE: sentinel (source: ${config.configSources.redis})`);
        console.log(`- REDIS_SENTINEL_HOSTS: ${config.redis.sentinels.map(s => `${s.host}:${s.port}`).join(', ')}`);
        console.log(`- REDIS_SENTINEL_NAME: ${config.redis.name}`);
        if (config.redis.sentinelPassword) {
          console.log(`- REDIS_SENTINEL_PASSWORD: ${maskApiKey(config.redis.sentinelPassword)}`);
        }
      } else {
        console.log(`- REDIS_MODE: single (source: ${config.configSources.redis})`);
        console.log(`- REDIS_HOST: ${config.redis.host}`);
        console.log(`- REDIS_PORT: ${config.redis.port}`);
      }
      console.log(`- REDIS_DB: ${config.redis.db || 0}`);
      if (config.redis.password) {
        console.log(`- REDIS_PASSWORD: ${maskApiKey(config.redis.password)}`);
      }
    } else {
      console.log("- REDIS: Not configured");
    }
    
    console.log(); // Empty line for better readability
  }

  return {
    ...config,
    auth,
  };
}
