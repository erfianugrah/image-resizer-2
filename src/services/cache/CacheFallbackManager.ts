/**
 * CacheFallbackManager Module
 * 
 * Responsible for implementing robust fallback strategies for caching
 * to ensure reliability even when primary caching mechanisms fail.
 */

import { Logger } from "../../utils/logging";
import {
  ConfigurationService,
  StorageResult,
  TransformOptions,
} from "../interfaces";
import { CacheQuotaExceededError, CacheUnavailableError } from "../../errors/cacheErrors";

// Define the interface for the callback functions needed by this manager
export interface CacheFallbackFunctions {
  applyCacheHeaders: (
    response: Response, 
    options?: TransformOptions, 
    storageResult?: StorageResult
  ) => Response;
  
  cacheWithCacheApi: (
    request: Request, 
    response: Response, 
    context: ExecutionContext
  ) => Promise<Response>;
  
  tryGetStaleResponse: (
    request: Request, 
    context: ExecutionContext, 
    options?: TransformOptions
  ) => Promise<Response | null>;
  
  revalidateInBackground: (
    request: Request, 
    response: Response, 
    context: ExecutionContext, 
    options?: TransformOptions, 
    storageResult?: StorageResult
  ) => Promise<void>;
  
  storeInCacheBackground: (
    request: Request, 
    response: Response, 
    context: ExecutionContext, 
    options?: TransformOptions
  ) => Promise<void>;
  
  addResourceHints: (
    response: Response, 
    request: Request, 
    options?: TransformOptions, 
    storageResult?: StorageResult
  ) => Response;
  
  recordCacheMetric: (
    request: Request, 
    response: Response
  ) => Promise<void>;
  
  recordFailure: (
    errorCode: string
  ) => void;
  
  executeWithFallback: <T>(
    primary: () => Promise<T>,
    fallback: () => Promise<T>
  ) => Promise<T>;
}

export class CacheFallbackManager {
  private logger: Logger;
  private configService: ConfigurationService;

  constructor(logger: Logger, configService: ConfigurationService) {
    this.logger = logger;
    this.configService = configService;
  }

  /**
   * Cache a response with advanced fallback strategies for high reliability
   *
   * This method combines multiple resilience patterns:
   * 1. Retry mechanism for transient failures
   * 2. Circuit breaker to prevent overloading failing systems
   * 3. Fallback mechanism for when primary caching fails completely
   * 4. Stale-while-revalidate pattern for seamless cache refreshes
   * 5. Cache warming for frequently accessed resources
   *
   * @param request The original request
   * @param response The response to cache
   * @param ctx The execution context for waitUntil
   * @param options Optional transformation options for optimized caching
   * @param storageResult Optional storage result for metadata-based cache decisions
   * @param functions Callback functions from the main service
   * @returns The potentially modified response
   */
  async cacheWithFallback(
    request: Request,
    response: Response,
    ctx: ExecutionContext,
    options?: TransformOptions,
    storageResult?: StorageResult,
    functions?: CacheFallbackFunctions,
  ): Promise<Response> {
    const config = this.configService.getConfig();

    if (!functions) {
      this.logger.warn("Missing functions in cacheWithFallback, applying basic cache headers");
      // Apply simple cache control headers if no functions were provided
      const headers = new Headers(response.headers);
      headers.set("Cache-Control", "public, max-age=3600");
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers
      });
    }

    // Begin the caching process
    this.logger.debug("Starting cache with fallback process", {
      url: request.url,
      cacheMethod: config.cache.method,
      hasOptions: !!options && Object.keys(options).length > 0,
    });

    // Primary operation - try to use Cache API with full resilience
    const primaryOperation = async () => {
      try {
        // Check for stale-while-revalidate scenario if enabled
        if (config.cache.enableStaleWhileRevalidate) {
          // Try to implement stale-while-revalidate pattern using Cache API
          const staleResponse = await functions.tryGetStaleResponse(
            request,
            ctx,
            options,
          );

          if (staleResponse) {
            // We found a stale response, serve it immediately and refresh in background
            this.logger.debug("Serving stale response while revalidating", {
              url: request.url,
              staleAge: staleResponse.headers.get("X-Stale-Age") || "unknown",
            });

            // Revalidate in the background
            ctx.waitUntil(
              functions.revalidateInBackground(
                request,
                response,
                ctx,
                options,
                storageResult,
              ),
            );

            // Return the stale response immediately
            return staleResponse;
          }
        }

        // Check if we should do background caching (non-blocking)
        if (
          config.cache.enableBackgroundCaching &&
          response.status >= 200 && response.status < 300
        ) {
          // Apply cache headers to the response
          const cachedResponse = functions.applyCacheHeaders(
            response,
            options,
            storageResult,
          );

          // Store in cache in the background
          ctx.waitUntil(
            functions.storeInCacheBackground(
              request,
              cachedResponse.clone(),
              ctx,
              options,
            ),
          );

          // Return the response immediately
          return cachedResponse;
        }

        // Regular caching approach - blocks until cache write completes
        return await functions.cacheWithCacheApi(request, response, ctx);
      } catch (error) {
        // If Cache API is unavailable, rethrow to trigger fallback
        if (error instanceof CacheUnavailableError) {
          throw error;
        }

        // For quota exceeded errors, we want to adjust our strategy
        if (error instanceof CacheQuotaExceededError) {
          this.logger.warn(
            "Cache quota exceeded, will reduce caching aggressiveness",
            {
              url: request.url,
            },
          );

          // Record this specific failure type
          functions.recordFailure("QUOTA_EXCEEDED");
          throw error;
        }

        // For other errors, rethrow to trigger fallback
        throw error;
      }
    };

    // Fallback operation - just apply cache headers
    const fallbackOperation = async () => {
      this.logger.debug("Using cache header fallback strategy", {
        url: request.url,
      });

      // Just apply cache headers to the original response
      return functions.applyCacheHeaders(response, options, storageResult);
    };

    // Execute with fallback pattern
    const result = await functions.executeWithFallback(
      primaryOperation,
      fallbackOperation,
    );

    // Apply cache optimizations like preloading related resources if configured
    if (
      config.cache.enableResourceHints &&
      response.status >= 200 && response.status < 300
    ) {
      try {
        return functions.addResourceHints(result, request, options, storageResult);
      } catch (error) {
        this.logger.warn("Failed to add resource hints", {
          error: error instanceof Error
            ? error.message
            : String(error),
          url: request.url,
        });
        // Continue without resource hints
      }
    }

    // Log cache hits/misses for monitoring
    if (config.logging?.enableCacheMetrics && ctx) {
      try {
        ctx.waitUntil(functions.recordCacheMetric(request, result));
      } catch (error) {
        this.logger.warn("Failed to record cache metric", {
          error: error instanceof Error
            ? error.message
            : String(error),
          url: request.url,
        });
        // Continue without recording metric
      }
    }

    return result;
  }
}