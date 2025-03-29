/**
 * CacheResilienceManager Module
 * 
 * Responsible for implementing resilience patterns for cache operations,
 * including circuit breaking, retries, and error handling.
 */

import { Logger } from "../../utils/logging";
import {
  ConfigurationService,
  StorageResult,
  TransformOptions,
} from "../interfaces";
import { 
  CacheServiceError, 
  CacheUnavailableError, 
  CacheWriteError 
} from "../../errors/cacheErrors";
import { CircuitBreakerState } from "../../utils/retry";

// Type for callback functions passed by the main service
export interface CacheResilienceFunctions {
  applyCacheHeaders: (
    response: Response, 
    options?: TransformOptions, 
    storageResult?: StorageResult
  ) => Response;
  
  prepareCacheableResponse: (
    response: Response
  ) => Response;
  
  prepareTaggedRequest: (
    request: Request, 
    response: Response
  ) => { request: Request, response: Response };
  
  handleError: (
    error: unknown, 
    context: string, 
    request?: Request, 
    code?: string
  ) => CacheServiceError;
  
  executeCacheOperation: <T>(
    operation: () => Promise<T>,
    request: Request,
    operationName: string,
    circuitBreaker: CircuitBreakerState
  ) => Promise<T>;
}

export class CacheResilienceManager {
  private logger: Logger;
  private configService: ConfigurationService;

  constructor(logger: Logger, configService: ConfigurationService) {
    this.logger = logger;
    this.configService = configService;
  }

  /**
   * Cache a response using the Cache API with enhanced options
   *
   * @param request The original request
   * @param response The response to cache
   * @param ctx The execution context for waitUntil
   * @param functions Callback functions from the main service
   * @param circuitBreaker Circuit breaker state for tracking failures
   * @returns The potentially modified response
   * @throws {CacheUnavailableError} If the Cache API is not available
   * @throws {CacheWriteError} If writing to the cache fails
   */
  /**
   * Execute a cache operation with proper error handling
   *
   * @param operation The cache operation to perform
   * @param request The original request
   * @param operationName Name of the operation for logs and errors
   * @param circuitBreaker The circuit breaker state to use
   * @param functions Callback functions from the main service
   * @returns Result of the operation
   */
  async executeCacheOperation<T>(
    operation: () => Promise<T>,
    request: Request,
    operationName: string,
    circuitBreaker: CircuitBreakerState,
    options: {
      getRetryConfig: () => any,
      getCircuitBreakerConfig: () => any,
      handleError: (error: unknown, context: string, request?: Request) => any
    }
  ): Promise<T> {
    try {
      // Get resilience options by combining retry and circuit breaker config
      const resilienceOptions = {
        ...options.getRetryConfig(),
        ...options.getCircuitBreakerConfig(),
      };

      // Import withResilience here to avoid circular dependencies
      const { withResilience } = await import("../../utils/retry");

      // Execute the operation with resilience patterns
      return await withResilience(
        operation,
        circuitBreaker,
        resilienceOptions,
      );
    } catch (error) {
      // Handle operation errors
      throw options.handleError(error, operationName, request);
    } finally {
      // Any cleanup or finalization steps can go here
    }
  }

  async cacheWithCacheApi(
    request: Request,
    response: Response,
    ctx: ExecutionContext,
    functions: CacheResilienceFunctions,
    circuitBreaker: CircuitBreakerState
  ): Promise<Response> {
    const config = this.configService.getConfig();

    // Skip if caching is disabled or not using Cache API
    if (config.cache.method !== "cache-api") {
      this.logger.debug("Skipping Cache API caching", {
        method: config.cache.method,
        url: request.url,
      });
      return response;
    }

    // Check if Cache API is available
    if (typeof caches === "undefined" || !caches.default) {
      throw new CacheUnavailableError(
        "Cache API is not available in this environment",
        {
          details: {
            cachesType: typeof caches,
            defaultCache: typeof caches !== "undefined"
              ? !!caches.default
              : false,
          },
        },
      );
    }

    this.logger.debug("Caching with Cache API", {
      url: request.url,
      status: response.status,
      contentType: response.headers.get("Content-Type") || "unknown",
    });

    // The core caching operation that will be executed with resilience patterns
    const cacheOperation = async (): Promise<Response> => {
      // Clone the response since it might be consumed in retries
      const responseClone = response.clone();

      try {
        // Apply cache headers
        const cacheStart = Date.now();
        const cachedResponse = functions.applyCacheHeaders(responseClone);
        const cacheEnd = Date.now();

        this.logger.breadcrumb(
          "Applied cache headers",
          cacheEnd - cacheStart,
          {
            status: cachedResponse.status,
            cacheControl: cachedResponse.headers.get("Cache-Control"),
          },
        );

        // Only cache successful responses
        if (cachedResponse.status >= 200 && cachedResponse.status < 300) {
          // Prepare response for caching
          const responseToCache = functions.prepareCacheableResponse(
            cachedResponse,
          );

          this.logger.breadcrumb(
            "Storing successful response in Cache API",
            undefined,
            {
              status: responseToCache.status,
              url: request.url,
            },
          );

          // Prepare request and response with cache tags
          const { request: taggedRequest, response: taggedResponse } = functions.prepareTaggedRequest(
            request,
            responseToCache,
          );

          // Use waitUntil to cache the response without blocking, using the tagged request and response
          ctx.waitUntil(
            caches.default.put(taggedRequest, taggedResponse).then(() => {
              this.logger.breadcrumb("Successfully stored in Cache API");
            }).catch((error) => {
              this.logger.breadcrumb(
                "Failed to store in Cache API",
                undefined,
                {
                  error: error instanceof Error
                    ? error.message
                    : String(error),
                },
              );
            }),
          );
        } else {
          this.logger.breadcrumb(
            "Not caching non-success response",
            undefined,
            {
              status: cachedResponse.status,
            },
          );
        }

        return cachedResponse;
      } catch (cacheError) {
        // Use specialized error handlers for different error types
        const contentLength = responseClone.headers.get("Content-Length");
        const errorContext = {
          url: request.url,
          status: responseClone.status,
          contentLength,
        };

        // Create a specific CacheWriteError with additional context
        const error = new CacheWriteError("Failed to write to cache", {
          originalError: cacheError instanceof Error
            ? cacheError.message
            : String(cacheError),
          ...errorContext,
        });

        // Let the error handler process it further and detect specific error types
        throw functions.handleError(
          error,
          "Cache write operation",
          request,
          "CACHE_WRITE_ERROR",
        );
      }
    };

    // Use executeCacheOperation with the circuit breaker for resilience
    return await functions.executeCacheOperation(
      cacheOperation,
      request,
      "Cache API operation",
      circuitBreaker
    );
  }

  /**
   * Store a response in cache in the background
   *
   * @param request The original request
   * @param response The response to cache
   * @param ctx The execution context
   * @param options Optional transformation options
   * @param functions Callback functions from the main service
   */
  async storeInCacheBackground(
    request: Request,
    response: Response,
    ctx: ExecutionContext,
    options?: TransformOptions,
    functions?: {
      prepareCacheableResponse: (response: Response) => Response;
      prepareTaggedRequest: (
        request: Request, 
        response: Response, 
        pathOverride?: string, 
        options?: TransformOptions
      ) => { request: Request, response: Response };
    }
  ): Promise<void> {
    try {
      // Check if Cache API is available
      if (typeof caches === "undefined" || !caches.default) {
        throw new CacheUnavailableError("Cache API is not available");
      }

      // Only cache successful responses
      if (response.status >= 200 && response.status < 300) {
        this.logger.debug("Storing in cache background", {
          url: request.url,
          status: response.status,
        });

        // Prepare response for caching (if functions provided)
        const responseToCache = functions?.prepareCacheableResponse 
          ? functions.prepareCacheableResponse(response)
          : response;

        // Prepare request and response with cache tags (if functions provided)
        const { request: taggedRequest, response: taggedResponse } = functions?.prepareTaggedRequest
          ? functions.prepareTaggedRequest(request, responseToCache, undefined, options)
          : { request, response: responseToCache };

        // Put in cache with the tagged request and response
        await caches.default.put(taggedRequest, taggedResponse);

        this.logger.debug("Successfully stored in cache background", {
          url: request.url,
          usedTags: taggedRequest !== request,
        });
      } else {
        this.logger.debug("Not caching non-success response in background", {
          url: request.url,
          status: response.status,
        });
      }
    } catch (error) {
      this.logger.warn("Failed to store in cache background", {
        error: error instanceof Error ? error.message : String(error),
        url: request.url,
      });
      // Background task, so we just log the error
    }
  }

  /**
   * Try to get a stale (but still usable) response from the cache
   *
   * @param request The original request
   * @param ctx The execution context
   * @param options Optional transformation options
   * @returns A stale response if found, otherwise null
   */
  async tryGetStaleResponse(
    request: Request,
    _ctx: ExecutionContext,
    _options?: TransformOptions,
  ): Promise<Response | null> {
    try {
      // Check if Cache API is available
      if (typeof caches === "undefined" || !caches.default) {
        return null;
      }

      // Try to get the cached response
      const cachedResponse = await caches.default.match(request);
      if (!cachedResponse) {
        return null;
      }

      // Check if the cached response is expired but still usable under stale-while-revalidate
      const cacheControl = cachedResponse.headers.get("Cache-Control") || "";
      const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);
      const staleWhileRevalidateMatch = cacheControl.match(
        /stale-while-revalidate=(\d+)/,
      );

      if (!maxAgeMatch || !staleWhileRevalidateMatch) {
        return null; // Not using stale-while-revalidate pattern
      }

      const maxAge = parseInt(maxAgeMatch[1], 10);
      const staleTime = parseInt(staleWhileRevalidateMatch[1], 10);

      // Get cache timestamp from the response headers
      const cacheDate = cachedResponse.headers.get("Date");
      if (!cacheDate) {
        return null; // Can't determine age without Date header
      }

      const cacheTimestamp = new Date(cacheDate).getTime();
      const now = Date.now();
      const ageInSeconds = Math.floor((now - cacheTimestamp) / 1000);

      // If it's expired but within the stale window, use it
      if (ageInSeconds > maxAge && ageInSeconds <= (maxAge + staleTime)) {
        // Clone the response and add a header indicating it's stale
        const headers = new Headers(cachedResponse.headers);
        headers.set("X-Stale-Age", ageInSeconds.toString());
        headers.set("X-Cache-Status", "stale");

        return new Response(cachedResponse.body, {
          status: cachedResponse.status,
          statusText: cachedResponse.statusText,
          headers,
        });
      }

      return null; // Not stale or too stale
    } catch (error) {
      this.logger.warn("Error checking for stale response", {
        error: error instanceof Error ? error.message : String(error),
        url: request.url,
      });
      return null;
    }
  }

  /**
   * Revalidate a cached response in the background
   *
   * @param request The original request
   * @param response The fresh response to cache
   * @param ctx The execution context
   * @param options Optional transformation options
   * @param storageResult Optional storage result for cache decisions
   * @param functions Callback functions to apply cache headers and store in background
   */
  async revalidateInBackground(
    request: Request,
    response: Response,
    ctx: ExecutionContext,
    options?: TransformOptions,
    storageResult?: StorageResult,
    functions?: {
      applyCacheHeaders: (
        response: Response, 
        options?: TransformOptions, 
        storageResult?: StorageResult
      ) => Response;
      storeInCacheBackground: (
        request: Request,
        response: Response,
        ctx: ExecutionContext,
        options?: TransformOptions
      ) => Promise<void>;
    }
  ): Promise<void> {
    try {
      this.logger.debug("Revalidating cache in background", {
        url: request.url,
      });

      // Apply cache headers to the response (if function provided)
      const cachedResponse = functions?.applyCacheHeaders
        ? functions.applyCacheHeaders(response.clone(), options, storageResult)
        : response.clone();

      // Store in cache in the background (if function provided)
      if (functions?.storeInCacheBackground) {
        await functions.storeInCacheBackground(request, cachedResponse, ctx, options);
      } else {
        // Fallback to internal storeInCacheBackground method
        await this.storeInCacheBackground(request, cachedResponse, ctx, options);
      }

      this.logger.debug("Successfully revalidated cache in background", {
        url: request.url,
      });
    } catch (error) {
      this.logger.warn("Failed to revalidate cache in background", {
        error: error instanceof Error ? error.message : String(error),
        url: request.url,
      });
      // Background task, so we just log the error
    }
  }
}