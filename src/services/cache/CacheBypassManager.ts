/**
 * CacheBypassManager Module
 * 
 * Responsible for determining when caching should be bypassed based on 
 * request parameters, headers, and configuration.
 */

import { Logger } from "../../utils/logging";
import {
  ConfigurationService,
  TransformOptions,
} from "../interfaces";
import { CacheServiceError } from "../../errors/cacheErrors";

// Type guard functions
function isRequest(obj: unknown): obj is Request {
  return obj instanceof Request;
}

export class CacheBypassManager {
  private logger: Logger;
  private configService: ConfigurationService;

  constructor(logger: Logger, configService: ConfigurationService) {
    this.logger = logger;
    this.configService = configService;
  }
  
  /**
   * Check if KV transform caching should be bypassed for this request
   * This is a specialized version of shouldBypassCache that ignores
   * client Cache-Control headers to ensure transforms are cached in KV
   * regardless of client caching preferences.
   *
   * @param request The request to check
   * @param options Optional transformation options for specific bypass checks
   * @returns True if KV transform caching should be bypassed
   */
  shouldBypassKVTransformCache(
    request: Request,
    options?: TransformOptions,
  ): boolean {
    const config = this.configService.getConfig();
    let url: URL;

    try {
      url = new URL(request.url);
    } catch (urlError) {
      this.logger.error("Invalid URL in request for KV transform cache check", {
        url: request.url,
        error: urlError instanceof Error ? urlError.message : String(urlError)
      });
      return true; // Bypass cache on error
    }

    // 1. Debug and development-specific bypass parameters
    
    // Check for debug mode cache bypass parameters
    if (url.searchParams.has("debug")) {
      const debugMode = url.searchParams.get("debug");
      if (
        debugMode === "cache" || debugMode === "true" || debugMode === "1" ||
        debugMode === "all"
      ) {
        this.logger.debug("Debug mode KV transform cache bypass detected", {
          url: request.url,
          debugMode,
          reason: "debug parameter indicates cache bypass",
        });
        return true;
      }
    }

    // Force cache refresh parameter - more explicit than no-cache
    if (
      url.searchParams.has("refresh") || url.searchParams.has("force-refresh")
    ) {
      this.logger.debug("Force refresh KV transform cache bypass detected", {
        url: request.url,
        reason: "refresh or force-refresh parameter",
      });
      return true;
    }

    // 4. Content-sensitive bypass rules

    // Check if we're dealing with frequently updated content based on path
    const path = url.pathname.toLowerCase();

    if (config.cache.bypassPaths && Array.isArray(config.cache.bypassPaths)) {
      for (const bypassPath of config.cache.bypassPaths) {
        if (path.includes(bypassPath.toLowerCase())) {
          this.logger.debug("Path-based KV transform cache bypass detected", {
            url: request.url,
            path: bypassPath,
            reason: "Path matches configured bypass path",
          });
          return true;
        }
      }
    }

    // 5. Format or quality specific bypass
    // Specific formats might need to bypass cache (e.g., during testing of new formats)
    if (
      options?.format &&
      config.cache.bypassFormats &&
      Array.isArray(config.cache.bypassFormats) &&
      config.cache.bypassFormats.includes(options.format)
    ) {
      this.logger.debug("Format-specific KV transform cache bypass detected", {
        url: request.url,
        format: options.format,
        reason: "Format is in bypass list",
      });
      return true;
    }

    // Check for disallowed paths in transform cache configuration
    if (config.cache.transformCache?.disallowedPaths && 
        Array.isArray(config.cache.transformCache.disallowedPaths)) {
      for (const disallowedPath of config.cache.transformCache.disallowedPaths) {
        if (path.includes(disallowedPath.toLowerCase())) {
          this.logger.debug("Path in transform cache disallowed paths list", {
            url: request.url,
            disallowedPath,
            reason: "Path matches transform cache disallowed path",
          });
          return true;
        }
      }
    }

    // IMPORTANT: We intentionally ignore Cache-Control and Pragma headers for KV transform caching
    // This ensures transformations are cached regardless of client caching preferences
    // Cache-Control header check is handled separately in the DefaultCacheService.storeTransformedImage method

    // Only check Cache-Control headers if we're explicitly configured to respect them
    // This property might not be defined in the type, so we use dynamic property access pattern
    const respectClientCacheControl = config.cache.transformCache && 
                                     'respectClientCacheControl' in config.cache.transformCache &&
                                     config.cache.transformCache.respectClientCacheControl === true;
    
    if (respectClientCacheControl) {
      const cacheControl = request.headers.get("Cache-Control");
      if (cacheControl && (cacheControl.includes("no-cache") || cacheControl.includes("no-store"))) {
        this.logger.debug("Cache-Control header causing KV transform cache bypass - respectClientCacheControl is enabled", {
          url: request.url,
          cacheControl,
          reason: "Configuration set to respect client Cache-Control headers",
        });
        return true;
      }
    }

    this.logger.debug("No KV transform cache bypass conditions detected", {
      url: request.url,
    });

    return false;
  }

  /**
   * Check if caching should be bypassed for this request
   *
   * Enhanced with more granular control through query parameters,
   * header-based bypass, and role-based bypass mechanisms.
   *
   * @param request The request to check
   * @param options Optional transformation options for specific bypass checks
   * @returns True if caching should be bypassed
   * @throws {CacheServiceError} If evaluating cache bypass status fails
   */
  shouldBypassCache(
    request: Request,
    options?: TransformOptions,
  ): boolean {
    const config = this.configService.getConfig();
    let url: URL;

    try {
      url = new URL(request.url);
    } catch (urlError) {
      throw new CacheServiceError("Invalid URL in request", {
        code: "INVALID_URL",
        status: 400,
        details: {
          url: request.url,
          error: urlError instanceof Error
            ? urlError.message
            : String(urlError),
        },
      });
    }

    // 1. Debug and development-specific bypass parameters

    // Check for debug mode cache bypass parameters
    if (url.searchParams.has("debug")) {
      const debugMode = url.searchParams.get("debug");
      if (
        debugMode === "cache" || debugMode === "true" || debugMode === "1" ||
        debugMode === "all"
      ) {
        this.logger.debug("Debug mode cache bypass detected", {
          url: request.url,
          debugMode,
          reason: "debug parameter indicates cache bypass",
        });
        return true;
      }
    }

    // Force cache refresh parameter - more explicit than no-cache
    if (
      url.searchParams.has("refresh") || url.searchParams.has("force-refresh")
    ) {
      this.logger.debug("Force refresh cache bypass detected", {
        url: request.url,
        reason: "refresh or force-refresh parameter",
      });
      return true;
    }

    // Development/preview mode bypass
    if (url.searchParams.has("preview") || url.searchParams.has("dev")) {
      this.logger.debug("Development/preview mode cache bypass detected", {
        url: request.url,
        reason: "preview or dev parameter",
      });
      return true;
    }

    // Version-based bypass for cache invalidation
    // If v={timestamp} changes, it forces a new cache entry
    const version = url.searchParams.get("v");
    if (version && config.cache.versionBypass) {
      // This doesn't actually bypass cache, but creates a new cache key
      // We log it but return false since we still want to cache the result
      this.logger.debug("Version parameter detected", {
        url: request.url,
        version,
        cacheStatus: "Using versioned caching",
      });
      // Do not return true here - we still want to cache the result
    }

    // 2. Special-purpose cache bypass parameters

    // Check for configured bypass parameters from config
    const bypassParams = config.cache.bypassParams || ["nocache"];
    for (const param of bypassParams) {
      if (url.searchParams.has(param)) {
        this.logger.debug("Configured cache bypass parameter detected", {
          url: request.url,
          parameter: param,
          reason: "Matched configured bypass parameter",
        });
        return true;
      }
    }

    // 3. Header-based cache bypass

    // Check standard cache-control headers on the request (not response)
    // Important: This only applies to the client request Cache-Control,
    // not the response Cache-Control which will be set by our service
    const cacheControl = request.headers.get("Cache-Control");
    if (cacheControl) {
      if (
        cacheControl.includes("no-cache") ||
        cacheControl.includes("no-store") ||
        cacheControl.includes("max-age=0")
      ) {
        this.logger.debug("Cache-Control header bypass detected in request", {
          url: request.url,
          cacheControl,
          reason: "Request Cache-Control header indicates no caching",
        });
        return true;
      }
    }

    // Check for Pragma: no-cache
    const pragma = request.headers.get("Pragma");
    if (pragma && pragma.includes("no-cache")) {
      this.logger.debug("Pragma: no-cache header detected", {
        url: request.url,
        reason: "Pragma header indicates no caching",
      });
      return true;
    }

    // 4. Role or authentication-based bypass

    // Check for authenticated or admin requests that might need fresh data
    // Authorization header is kept for future auth-based cache bypass logic
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const authorization = request.headers.get("Authorization");
    const adminHeader = request.headers.get("X-Admin") ||
      request.headers.get("X-Admin-Access");

    // Allow bypassing cache for admin users if configured
    if (
      config.cache.bypassForAdmin &&
      (adminHeader === "true" || adminHeader === "1")
    ) {
      this.logger.debug("Admin user cache bypass detected", {
        url: request.url,
        reason: "Request is from admin user",
      });
      return true;
    }

    // 5. Content-sensitive bypass rules

    // Check if we're dealing with frequently updated content based on path
    const path = url.pathname.toLowerCase();

    if (config.cache.bypassPaths && Array.isArray(config.cache.bypassPaths)) {
      for (const bypassPath of config.cache.bypassPaths) {
        if (path.includes(bypassPath.toLowerCase())) {
          this.logger.debug("Path-based cache bypass detected", {
            url: request.url,
            path: bypassPath,
            reason: "Path matches configured bypass path",
          });
          return true;
        }
      }
    }

    // 6. Format or quality specific bypass

    // Specific formats might need to bypass cache (e.g., during testing of new formats)
    if (
      options?.format &&
      config.cache.bypassFormats &&
      Array.isArray(config.cache.bypassFormats) &&
      config.cache.bypassFormats.includes(options.format)
    ) {
      this.logger.debug("Format-specific cache bypass detected", {
        url: request.url,
        format: options.format,
        reason: "Format is in bypass list",
      });
      return true;
    }

    // 7. Environment-sensitive bypass

    // Special handling for development environment
    if (
      config.environment === "development" && config.cache.bypassInDevelopment
    ) {
      this.logger.debug("Development environment cache bypass", {
        url: request.url,
        reason: "Development environment with bypassInDevelopment enabled",
      });
      return true;
    }

    this.logger.debug("No cache bypass conditions detected", {
      url: request.url,
    });

    return false;
  }
}