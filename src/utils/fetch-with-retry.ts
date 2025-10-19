import { exec } from "child_process";
import { promisify } from "util";
import { Logger } from "./logger.js";
import { Agent, fetch, ProxyAgent, type RequestInit as UndiciInit } from "undici";

const execAsync = promisify(exec);

type RequestOptions = Omit<UndiciInit, "headers"> & {
  /**
   * Force format of headers to be a record of strings, e.g. { "Authorization": "Bearer 123" }
   *
   * Avoids complexity of needing to deal with `instanceof Headers`, which is not supported in some environments.
   */
  headers?: Record<string, string>;
};

function shouldBypassProxy(url: string, noProxy: string): boolean {
  try {
    const { hostname } = new URL(url);
    const noProxyList = noProxy.split(",").map((s) => s.trim());

    return noProxyList.some((pattern) => {
      if (pattern === "*") return true;
      if (pattern.startsWith(".")) {
        // Match domain and subdomains
        return hostname === pattern.slice(1) || hostname.endsWith(pattern);
      }
      return hostname === pattern;
    });
  } catch (error) {
    console.error("Error checking NO_PROXY rules:", error);
    return false;
  }
}

/**
 * Get the appropriate dispatcher (proxy or direct) for a given URL
 */
function getDispatcher(url: string): ProxyAgent | undefined {
  const PROXY = process.env.HTTPS_PROXY ?? process.env.HTTP_PROXY;
  const NO_PROXY = process.env.NO_PROXY ?? process.env.no_proxy;

  // No proxy configured
  if (!PROXY) {
    return undefined;
  }

  // Check NO_PROXY rules
  if (NO_PROXY && shouldBypassProxy(url, NO_PROXY)) {
    return undefined; // Bypass proxy
  }

  // Use proxy
  return new ProxyAgent(PROXY);
}

export async function fetchWithRetry<T>(url: string, options: RequestOptions = {}): Promise<T> {
  try {
    // Get appropriate dispatcher based on URL and proxy settings
    const dispatcher = options.dispatcher ?? getDispatcher(url);

    const response = await fetch(url, { ...options, dispatcher });

    if (!response.ok) {
      throw new Error(`Fetch failed with status ${response.status}: ${response.statusText}`);
    }
    return (await response.json()) as T;
  } catch (fetchError: any) {
    Logger.log(
      `[fetchWithRetry] Initial fetch failed for ${url}: ${fetchError.message}. Likely a corporate proxy or SSL issue. Attempting curl fallback.`,
    );

    const curlHeaders = formatHeadersForCurl(options.headers);
    // Most options here are to ensure stderr only contains errors, so we can use it to confidently check if an error occurred.
    // -s: Silent mode—no progress bar in stderr
    // -S: Show errors in stderr
    // --fail-with-body: curl errors with code 22, and outputs body of failed request, e.g. "Fetch failed with status 404"
    // -L: Follow redirects
    const curlCommand = `curl -s -S --fail-with-body -L ${curlHeaders.join(" ")} "${url}"`;

    try {
      // Fallback to curl for  corporate networks that have proxies that sometimes block fetch
      Logger.log(`[fetchWithRetry] Executing curl command: ${curlCommand}`);
      const { stdout, stderr } = await execAsync(curlCommand);

      if (stderr) {
        // curl often outputs progress to stderr, so only treat as error if stdout is empty
        // or if stderr contains typical error keywords.
        if (
          !stdout ||
          stderr.toLowerCase().includes("error") ||
          stderr.toLowerCase().includes("fail")
        ) {
          throw new Error(`Curl command failed with stderr: ${stderr}`);
        }
        Logger.log(
          `[fetchWithRetry] Curl command for ${url} produced stderr (but might be informational): ${stderr}`,
        );
      }

      if (!stdout) {
        throw new Error("Curl command returned empty stdout.");
      }

      return JSON.parse(stdout) as T;
    } catch (curlError: any) {
      Logger.error(`[fetchWithRetry] Curl fallback also failed for ${url}: ${curlError.message}`);
      // Re-throw the original fetch error to give context about the initial failure
      // or throw a new error that wraps both, depending on desired error reporting.
      // For now, re-throwing the original as per the user example's spirit.
      throw fetchError;
    }
  }
}

/**
 * Converts HeadersInit to an array of curl header arguments.
 * @param headers Headers to convert.
 * @returns Array of strings, each a curl -H argument.
 */
function formatHeadersForCurl(headers: Record<string, string> | undefined): string[] {
  if (!headers) {
    return [];
  }

  return Object.entries(headers).map(([key, value]) => `-H "${key}: ${value}"`);
}
