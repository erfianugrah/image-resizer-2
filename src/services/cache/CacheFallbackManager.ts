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
  
  /**
   * Store a transformed image in the KV cache
   * 
   * This function is optional and will be checked at runtime
   */
  storeTransformedImage?: (
    request: Request,
    response: Response,
    storageResult: StorageResult,
    transformOptions: TransformOptions,
    ctx?: ExecutionContext
  ) => Promise<void>;
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

    // Store the transformed image in KV cache if storageResult and options are available
    // This is done outside regular cache flow to ensure KV caching works regardless of other caching
    // We store transformed images in KV regardless of cache bypass settings 
    // This allows us to cache transformations in KV even when the client requests no caching
    if (config.cache.transformCache?.enabled && storageResult && options) {
      try {
        // Check for client cache-control headers but continue anyway
        const cacheControl = request.headers.get("Cache-Control");
        if (cacheControl && (cacheControl.includes("no-cache") || cacheControl.includes("no-store"))) {
          this.logger.info("Client requested no cache but storing in KV transform cache anyway", {
            url: request.url,
            cacheControl,
            reason: "KV transform cache ignores client caching preferences"
          });
        }
        
        // Log detailed information about the KV cache attempt
        this.logger.debug("Preparing to store transformed image in KV cache", {
          url: request.url,
          hasStorageResult: !!storageResult,
          hasOptions: !!options,
          hasContext: !!ctx,
          hasWaitUntil: ctx ? (typeof ctx.waitUntil === 'function') : false,
          transformCacheEnabled: config.cache.transformCache.enabled,
          transformCacheBinding: config.cache.transformCache.binding
        });
        
        // Check if we have a context object for waitUntil
        if (!ctx) {
          this.logger.warn("No execution context available for KV transform cache - this will block the response", {
            url: request.url
          });
        }
        
        // If the parent DefaultCacheService has a storeTransformedImage method (checked at runtime)
        if (typeof (functions as any).storeTransformedImage === 'function') {
          this.logger.debug("storeTransformedImage function found in parent service", {
            functionType: typeof (functions as any).storeTransformedImage
          });
          
          // Check if we have a context with waitUntil for background processing
          if (ctx && typeof ctx.waitUntil === 'function') {
            this.logger.debug("Using waitUntil for background KV transform storage");
            
            // Use waitUntil to avoid blocking the response
            ctx.waitUntil(
              (functions as any).storeTransformedImage(
                request,
                response.clone(),
                storageResult,
                options,
                ctx  // Important: Pass the context through the chain
              ).catch((err: Error) => {
                this.logger.error("Error in background KV transform storage", { 
                  error: err.message,
                  stack: err.stack, 
                  url: request.url 
                });
              })
            );
            
            this.logger.debug("Background KV transform storage initiated");
          } else {
            // No context or waitUntil, fall back to synchronous operation
            this.logger.warn("No waitUntil available, falling back to synchronous KV transform storage", {
              url: request.url,
              hasContext: !!ctx
            });
            
            // This will be synchronous and could block the response
            await (functions as any).storeTransformedImage(
              request,
              response.clone(),
              storageResult,
              options,
              ctx  // Pass ctx even if it doesn't have waitUntil
            ).catch((err: Error) => {
              this.logger.error("Error in synchronous KV transform storage", { 
                error: err.message, 
                stack: err.stack,
                url: request.url 
              });
            });
          }
        } else {
          this.logger.warn("storeTransformedImage function not available in parent service", {
            url: request.url,
            availableFunctions: Object.keys(functions).join(',')
          });
        }
      } catch (error) {
        // Log but continue - this should not block the response
        this.logger.error("Error initiating KV transform cache storage", {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          url: request.url,
          phase: 'CacheFallbackManager.cacheWithFallback'
        });
      }
    } else {
      // Log why we're not storing in KV cache
      if (!config.cache.transformCache?.enabled) {
        this.logger.debug("KV transform cache is not enabled in config");
      }
      if (!storageResult) {
        this.logger.debug("No storage result available for KV transform cache", {
          url: request.url
        });
      }
      if (!options) {
        this.logger.debug("No transform options available for KV transform cache", {
          url: request.url
        });
      }
      if (!ctx) {
        this.logger.debug("No execution context available for KV transform cache", {
          url: request.url
        });
      }
    }

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