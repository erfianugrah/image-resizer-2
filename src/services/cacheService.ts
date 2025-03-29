/**
 * Modular implementation of the CacheService
 *
 * Enhanced with improved caching strategies, cache tagging,
 * and performance optimizations.
 * 
 * This implementation follows a modular approach with clear separation of concerns.
 */

import { Logger } from "../utils/logging";
import {
  CacheService,
  ConfigurationService,
  StorageResult,
  TransformOptions,
} from "./interfaces";
import { ImageResizerConfig } from "../config";
import {
  CacheQuotaExceededError,
  CacheReadError,
  CacheServiceError,
  CacheTagGenerationError,
  CacheUnavailableError,
  CacheWriteError,
} from "../errors/cacheErrors";
import {
  CircuitBreakerState,
  createCircuitBreakerState,
  withCircuitBreaker,
  withResilience,
  withRetry,
} from "../utils/retry";

// Import all cache modules from the central index file
import {
  CacheHeadersManager,
  CacheTagsManager,
  CacheBypassManager,
  CacheFallbackManager,
  CloudflareCacheManager,
  TTLCalculator,
  CacheResilienceManager,
  CachePerformanceManager
} from './cache';

// Type guard functions for TypeScript error handling
function isCacheServiceError(error: unknown): error is CacheServiceError {
  return error instanceof CacheServiceError;
}

function isCacheTagGenerationError(
  error: unknown,
): error is CacheTagGenerationError {
  return error instanceof CacheTagGenerationError;
}

function isError(error: unknown): error is Error {
  return error instanceof Error;
}

function isRequest(obj: unknown): obj is Request {
  return obj instanceof Request;
}

function isResponse(obj: unknown): obj is Response {
  return obj instanceof Response;
}

export class DefaultCacheService implements CacheService {
  private logger: Logger;
  private configService: ConfigurationService;

  // Circuit breaker states for different cache operations
  private cacheWriteCircuitBreaker: CircuitBreakerState;
  private cacheReadCircuitBreaker: CircuitBreakerState;

  // Track recent failures for adaptive behavior
  private recentFailures: { timestamp: number; errorCode: string }[] = [];

  // Modular components
  private headersManager: CacheHeadersManager;
  private _tagsManager: CacheTagsManager;  // renamed to _tagsManager to avoid conflict with getter
  private bypassManager: CacheBypassManager;
  private fallbackManager: CacheFallbackManager;
  
  // Getter for the tagsManager to make it accessible while keeping the implementation private
  get tagsManager(): CacheTagsManager {
    return this._tagsManager;
  }
  private cfCacheManager: CloudflareCacheManager;
  private ttlCalculator: TTLCalculator;
  private resilienceManager: CacheResilienceManager;
  private performanceManager: CachePerformanceManager;

  constructor(logger: Logger, configService: ConfigurationService) {
    this.logger = logger;
    this.configService = configService;

    // Initialize circuit breaker states
    this.cacheWriteCircuitBreaker = createCircuitBreakerState();
    this.cacheReadCircuitBreaker = createCircuitBreakerState();

    this.logger.info('Initializing modular cache service with components');

    // Initialize modular components
    this.headersManager = new CacheHeadersManager(logger, configService);
    this._tagsManager = new CacheTagsManager(logger, configService);
    this.bypassManager = new CacheBypassManager(logger, configService);
    this.fallbackManager = new CacheFallbackManager(logger, configService);
    this.cfCacheManager = new CloudflareCacheManager(logger, configService);
    this.ttlCalculator = new TTLCalculator(logger, configService);
    this.resilienceManager = new CacheResilienceManager(logger, configService);
    this.performanceManager = new CachePerformanceManager(logger, configService);
    
    this.logger.debug('Modular cache components initialized', {
      components: 'CacheHeadersManager, CacheTagsManager, CacheBypassManager, CacheFallbackManager, CloudflareCacheManager, TTLCalculator, CacheResilienceManager, CachePerformanceManager',
      componentsCount: 8
    });
  }

  /**
   * Standardized error handling for cache service operations
   *
   * @param error The error that occurred
   * @param context The context in which the error occurred
   * @param request Optional request for adding URL to error details
   * @param defaultCode Default error code to use if not available
   * @returns A properly wrapped CacheServiceError
   * @private
   */
  private handleError(
    error: unknown,
    context: string,
    request?: Request,
    defaultCode: string = "CACHE_SERVICE_ERROR",
  ): CacheServiceError {
    // If it's already a CacheServiceError, just add request URL to error details if needed
    if (isCacheServiceError(error)) {
      // Add request URL to error details if not already there
      if (error.details && request && isRequest(request)) {
        error.details = {
          ...error.details,
          url: error.details.url || request.url,
        };
      }
      return error;
    }

    // Handle special error cases
    const errorMessage = isError(error) ? error.message : String(error);

    // Check for quota exceeded errors
    if (
      errorMessage.includes("quota") || errorMessage.includes("storage limit")
    ) {
      return new CacheQuotaExceededError(`Cache quota exceeded in ${context}`, {
        details: {
          originalError: errorMessage,
          url: request && isRequest(request) ? request.url : "unknown",
        },
      });
    }

    // For any other errors, wrap in a general CacheServiceError
    return new CacheServiceError(`${context} failed: ${errorMessage}`, {
      code: defaultCode,
      status: 500,
      details: {
        originalError: errorMessage,
        url: request && isRequest(request) ? request.url : "unknown",
        context,
      },
      retryable: true, // Most cache operations can be retried
    });
  }

  /**
   * Get the retry configuration from service settings
   * @returns Retry configuration options
   */
  private getRetryConfig() {
    const config = this.configService.getConfig();
    return {
      maxAttempts: config.cache.retry?.maxAttempts || 3,
      initialDelayMs: config.cache.retry?.initialDelayMs || 200,
      maxDelayMs: config.cache.retry?.maxDelayMs || 2000,
      logger: this.logger,
    };
  }

  /**
   * Get the circuit breaker configuration from service settings
   * @returns Circuit breaker configuration options
   */
  private getCircuitBreakerConfig() {
    const config = this.configService.getConfig();
    return {
      failureThreshold: config.cache.circuitBreaker?.failureThreshold || 5,
      resetTimeoutMs: config.cache.circuitBreaker?.resetTimeoutMs || 30000,
      successThreshold: config.cache.circuitBreaker?.successThreshold || 2,
      logger: this.logger,
    };
  }

  /**
   * Record a cache failure for adaptive behavior
   *
   * @param errorCode The error code from the failed operation
   */
  private recordFailure(errorCode: string) {
    const now = Date.now();

    // Add the failure to the list
    this.recentFailures.push({
      timestamp: now,
      errorCode,
    });

    // Prune old failures (older than 5 minutes)
    this.recentFailures = this.recentFailures.filter((failure) =>
      now - failure.timestamp < 5 * 60 * 1000
    );

    // Log high failure rates
    if (this.recentFailures.length > 10) {
      this.logger.warn("High cache failure rate detected", {
        failureCount: this.recentFailures.length,
        timeWindow: "5 minutes",
        mostCommonError: this.getMostCommonErrorCode(),
      });
    }
  }

  /**
   * Get the most common error code from recent failures
   *
   * @returns The most common error code or undefined if no failures
   */
  private getMostCommonErrorCode(): string | undefined {
    if (this.recentFailures.length === 0) {
      return undefined;
    }

    // Count occurrences of each error code
    const errorCounts: Record<string, number> = {};
    for (const failure of this.recentFailures) {
      errorCounts[failure.errorCode] = (errorCounts[failure.errorCode] || 0) +
        1;
    }

    // Find the error code with the highest count
    let mostCommonCode: string | undefined;
    let highestCount = 0;

    Object.entries(errorCounts).forEach(([code, count]) => {
      if (count > highestCount) {
        mostCommonCode = code;
        highestCount = count;
      }
    });

    return mostCommonCode;
  }

  /**
   * Check if we should use fallback behavior based on recent failures
   *
   * @returns True if fallback behavior should be used
   */
  private shouldUseFallback(): boolean {
    // If we have a high number of recent failures, use fallback behavior
    return this.recentFailures.length >= 5;
  }

  /**
   * Execute a cache operation with fallback behavior
   *
   * @param operation The primary cache operation to attempt
   * @param fallback The fallback operation to use if primary fails or circuit is open
   * @returns The result of the operation or fallback
   */
  private async executeWithFallback<T>(
    operation: () => Promise<T>,
    fallback: () => Promise<T>,
  ): Promise<T> {
    try {
      // If we're seeing a lot of failures, go straight to fallback
      if (this.shouldUseFallback()) {
        this.logger.debug("Using fallback behavior due to recent failures");
        return await fallback();
      }

      // Try the primary operation
      return await operation();
    } catch (error) {
      // Record the failure
      if (error instanceof CacheServiceError) {
        this.recordFailure(error.code);
      } else {
        this.recordFailure("UNKNOWN_ERROR");
      }

      // Log the fallback
      this.logger.debug("Cache operation failed, using fallback", {
        error: error instanceof Error ? error.message : String(error),
      });

      // Execute the fallback
      return await fallback();
    }
  }

  /**
   * Apply cache headers to a response based on content type, status code, and configuration
   *
   * Enhanced with stale-while-revalidate pattern, CDN-specific directives,
   * and image-specific cache optimizations
   *
   * @param response The original response
   * @param options Optional transformation options for optimized caching
   * @param storageResult Optional storage result for metadata-based cache decisions
   * @returns A response with appropriate Cache-Control headers
   * @throws {CacheServiceError} If applying cache headers fails
   */
  applyCacheHeaders(
    response: Response,
    options?: TransformOptions,
    storageResult?: StorageResult,
  ): Response {
    try {
      // Validate inputs
      if (!response || !isResponse(response)) {
        throw new CacheServiceError("Invalid response object provided", {
          code: "INVALID_RESPONSE",
          status: 500,
          details: {
            responseType: response ? typeof response : "undefined",
            isResponse: isResponse(response),
          },
        });
      }

      // Delegate to the headers manager
      return this.headersManager.applyCacheHeaders(
        response, 
        options, 
        storageResult, 
        // Pass functions that the manager might need
        {
          calculateTtl: (resp: Response, opts: TransformOptions, storage?: StorageResult) => 
            this.calculateTtl(resp, opts, storage),
          generateCacheTags: (req: Request, storage: StorageResult, opts: TransformOptions) => 
            this.generateCacheTags(req, storage, opts),
          isImmutableContent: (resp: Response, opts?: TransformOptions, storage?: StorageResult) => 
            this.isImmutableContent(resp, opts, storage),
        }
      );
    } catch (error: unknown) {
      // Create error context variables for the logger
      const errorStatus = response?.status;
      const errorContentType = response?.headers?.get("Content-Type") ||
        "unknown";

      // Log error details before throwing
      this.logger.debug("Error applying cache headers", {
        responseStatus: errorStatus,
        contentType: errorContentType,
        hasOptions: !!options && Object.keys(options).length > 0,
        hasStorageResult: !!storageResult,
      });

      // Use our standardized error handler
      throw this.handleError(
        error,
        "Apply cache headers",
        undefined,
        "CACHE_HEADERS_ERROR",
      );
    }
  }

  /**
   * Determines if content should be considered immutable for caching purposes
   * Immutable content can be cached indefinitely without revalidation
   *
   * @param response The response to check
   * @param options The transformation options
   * @param storageResult The storage result with metadata
   * @returns True if the content can be considered immutable
   */
  private isImmutableContent(
    response: Response,
    options?: TransformOptions,
    storageResult?: StorageResult,
  ): boolean {
    // Delegate to the headers manager
    return this.headersManager.isImmutableContent(response, options, storageResult);
  }

  /**
   * Add appropriate Vary headers to a response to ensure proper cache differentiation
   * Vary headers tell CDNs and browsers to cache different versions based on request headers
   *
   * @param response The response to modify
   * @param options The transformation options
   */
  private addVaryHeaders(response: Response, options?: TransformOptions): void {
    // Note: This is a private method called from the CacheHeadersManager
    // In CacheHeadersManager.applyCacheHeaders
    this.headersManager.addVaryHeaders(response, options);
  }

  /**
   * Cache a response using the Cache API with enhanced options
   *
   * @param request The original request
   * @param response The response to cache
   * @param ctx The execution context for waitUntil
   * @returns The potentially modified response
   * @throws {CacheUnavailableError} If the Cache API is not available
   * @throws {CacheWriteError} If writing to the cache fails
   */
  async cacheWithCacheApi(
    request: Request,
    response: Response,
    ctx: ExecutionContext,
  ): Promise<Response> {
    try {
      // Validate inputs
      if (!request || !isRequest(request)) {
        throw new CacheServiceError("Invalid request object provided", {
          code: "INVALID_REQUEST",
          status: 500,
          details: {
            requestType: request ? typeof request : "undefined",
            isRequest: isRequest(request),
          },
        });
      }

      if (!response || !isResponse(response)) {
        throw new CacheServiceError("Invalid response object provided", {
          code: "INVALID_RESPONSE",
          status: 500,
          details: {
            responseType: response ? typeof response : "undefined",
            isResponse: isResponse(response),
          },
        });
      }

      if (!ctx || typeof ctx.waitUntil !== "function") {
        throw new CacheUnavailableError("Invalid execution context provided", {
          details: {
            contextType: ctx ? typeof ctx : "undefined",
            hasWaitUntil: ctx ? (typeof ctx.waitUntil === "function") : false,
          },
        });
      }

      // Delegate to the resilience manager
      return this.resilienceManager.cacheWithCacheApi(
        request,
        response,
        ctx,
        // Pass callback functions needed by the resilience manager
        {
          applyCacheHeaders: (resp: Response, opts?: TransformOptions, storage?: StorageResult) => 
            this.applyCacheHeaders(resp, opts, storage),
          prepareCacheableResponse: (resp: Response) => 
            this.prepareCacheableResponse(resp),
          prepareTaggedRequest: (req: Request, resp: Response) => 
            this.prepareTaggedRequest(req, resp),
          handleError: (err: unknown, context: string, req?: Request, code?: string) => 
            this.handleError(err, context, req, code),
          executeCacheOperation: <T>(op: () => Promise<T>, req: Request, name: string, breaker: CircuitBreakerState) => 
            this.executeCacheOperation(op, req, name, breaker),
        },
        // Pass the circuit breaker
        this.cacheWriteCircuitBreaker
      );
    } catch (error) {
      throw this.handleError(
        error,
        "Cache API caching",
        request,
        "CACHE_API_ERROR",
      );
    }
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
    try {
      // Validate input
      if (!request || !isRequest(request)) {
        throw new CacheServiceError(
          "Invalid request object provided to shouldBypassCache",
          {
            code: "INVALID_REQUEST",
            status: 500,
            details: {
              requestType: request ? typeof request : "undefined",
              isRequest: isRequest(request),
            },
          },
        );
      }

      // Delegate to the bypass manager
      return this.bypassManager.shouldBypassCache(request, options);
    } catch (error: unknown) {
      // If it's already a CacheServiceError, re-throw it
      if (isCacheServiceError(error)) {
        throw error;
      }

      // Otherwise, wrap the error in a CacheServiceError
      const errorMessage = isError(error) ? error.message : String(error);
      throw new CacheServiceError(
        `Failed to evaluate cache bypass status: ${errorMessage}`,
        {
          code: "CACHE_BYPASS_ERROR",
          status: 500,
          details: {
            originalError: errorMessage,
            requestUrl: isRequest(request) ? request.url : "unknown",
          },
        },
      );
    }
  }

  /**
   * Extract transform options from URL parameters
   * @private
   * @deprecated This method has been moved to CacheTagsManager
   */
  private extractOptionsFromUrl(url: URL): TransformOptions {
    this.logger.debug('Using deprecated extractOptionsFromUrl in CacheService, use CacheTagsManager instead');
    // This is kept for backward compatibility but delegates to the CacheTagsManager
    // We're using private method access which is not ideal, but this method is deprecated
    return (this._tagsManager as any).extractOptionsFromUrl(url);
  }

  /**
   * Apply cache tags to a request or response depending on cache method
   * - For 'cf' method: Apply tags to the request's CF object
   * - For 'cache-api' method: Apply tags to the response's Cache-Tag header
   *
   * @param request Original request (for CF method)
   * @param response Original response (for Cache API method)
   * @param tags Array of cache tags to apply
   * @returns A new request or response with cache tags applied
   * @private
   */
  private applyTags(request: Request, response: Response, tags: string[]): { request: Request, response: Response } {
    return this._tagsManager.applyTags(request, response, tags);
  }

  /**
   * Apply Cloudflare cache configuration to a request
   *
   * @param requestInit The request initialization options
   * @param imagePath The path to the image
   * @param options Transformation options
   * @returns Updated request initialization with CF cache settings
   * @throws {CacheServiceError} If applying Cloudflare cache settings fails
   */
  applyCloudflareCache(
    requestInit: RequestInit,
    imagePath: string,
    options: TransformOptions,
  ): RequestInit {
    try {
      // Validate inputs
      if (!requestInit) {
        throw new CacheServiceError("Invalid requestInit object provided", {
          code: "INVALID_REQUEST_INIT",
          status: 500,
          details: {
            requestInitType: typeof requestInit,
          },
        });
      }

      if (!imagePath) {
        throw new CacheServiceError(
          "Missing image path for Cloudflare cache configuration",
          {
            code: "MISSING_IMAGE_PATH",
            status: 500,
            details: {
              hasOptions: !!options && Object.keys(options).length > 0,
            },
          },
        );
      }

      // Delegate to the Cloudflare cache manager
      return this.cfCacheManager.applyCloudflareCache(
        requestInit, 
        imagePath, 
        options,
        // Pass a callback for generating cache tags
        (req: Request, store: StorageResult, opts: TransformOptions) => 
          this.generateCacheTags(req, store, opts)
      );
    } catch (error: unknown) {
      // Create additional context specific to Cloudflare cache configuration
      const errorContext = {
        imagePath: imagePath || "unknown",
        hasOptions: !!options && Object.keys(options).length > 0,
      };

      // Use our standardized error handler
      const wrappedError = this.handleError(
        error,
        "Apply Cloudflare cache configuration",
        undefined,
        "CF_CACHE_CONFIG_ERROR",
      );

      // Add Cloudflare-specific context to the error details
      if (wrappedError.details) {
        wrappedError.details = {
          ...wrappedError.details,
          ...errorContext,
        };
      }

      throw wrappedError;
    }
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
   * @returns The potentially modified response
   */
  async cacheWithFallback(
    request: Request,
    response: Response,
    ctx: ExecutionContext,
    options?: TransformOptions,
    storageResult?: StorageResult,
  ): Promise<Response> {
    try {
      // Check if caching should be bypassed for this request
      if (this.shouldBypassCache(request, options)) {
        this.logger.debug("Bypassing cache for request", {
          url: request.url,
          reason: "shouldBypassCache returned true",
        });

        // Apply cache headers but don't store in cache
        return this.applyCacheHeaders(response, options, storageResult);
      }

      // Delegate to the fallback manager
      return this.fallbackManager.cacheWithFallback(
        request,
        response,
        ctx,
        options,
        storageResult,
        // Pass the callback functions that the manager might need
        {
          applyCacheHeaders: (resp: Response, opts?: TransformOptions, storage?: StorageResult) => 
            this.applyCacheHeaders(resp, opts, storage),
          cacheWithCacheApi: (req: Request, resp: Response, context: ExecutionContext) => 
            this.cacheWithCacheApi(req, resp, context),
          tryGetStaleResponse: (req: Request, context: ExecutionContext, opts?: TransformOptions) => 
            this.tryGetStaleResponse(req, context, opts),
          revalidateInBackground: (req: Request, resp: Response, context: ExecutionContext, opts?: TransformOptions, storage?: StorageResult) => 
            this.revalidateInBackground(req, resp, context, opts, storage),
          storeInCacheBackground: (req: Request, resp: Response, context: ExecutionContext, opts?: TransformOptions) => 
            this.storeInCacheBackground(req, resp, context, opts),
          addResourceHints: (resp: Response, req: Request, opts?: TransformOptions, storage?: StorageResult) => 
            this.performanceManager.addResourceHints(resp, req, opts, storage),
          recordCacheMetric: (req: Request, resp: Response) => 
            this.performanceManager.recordCacheMetric(req, resp),
          recordFailure: (errorCode: string) => 
            this.recordFailure(errorCode),
          executeWithFallback: <T>(primary: () => Promise<T>, fallback: () => Promise<T>) => 
            this.executeWithFallback(primary, fallback),
        }
      );
    } catch (error) {
      this.logger.error("Cache with fallback failed", {
        url: request.url,
        error: error instanceof Error ? error.message : String(error),
      });
      
      // Just apply cache headers and return if fallback fails
      return this.applyCacheHeaders(response, options, storageResult);
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
  private async tryGetStaleResponse(
    request: Request,
    ctx: ExecutionContext,
    options?: TransformOptions,
  ): Promise<Response | null> {
    return this.resilienceManager.tryGetStaleResponse(request, ctx, options);
  }

  /**
   * Revalidate a cached response in the background
   *
   * @param request The original request
   * @param response The fresh response to cache
   * @param ctx The execution context
   * @param options Optional transformation options
   * @param storageResult Optional storage result for cache decisions
   */
  private async revalidateInBackground(
    request: Request,
    response: Response,
    ctx: ExecutionContext,
    options?: TransformOptions,
    storageResult?: StorageResult,
  ): Promise<void> {
    return this.resilienceManager.revalidateInBackground(
      request,
      response,
      ctx,
      options,
      storageResult,
      {
        applyCacheHeaders: (resp, opts, storage) => this.applyCacheHeaders(resp, opts, storage),
        storeInCacheBackground: (req, resp, context, opts) => this.storeInCacheBackground(req, resp, context, opts)
      }
    );
  }

  /**
   * Prepare a response for caching by adding timestamp and proper cache headers
   *
   * @param response Original response
   * @returns Response ready for caching
   * @private
   */
  private prepareCacheableResponse(response: Response): Response {
    // Delegate to the headers manager
    return this.headersManager.prepareCacheableResponse(response);
  }

  /**
   * Extract tags from a request's CF object
   * @param request The request with tags in CF object
   * @returns Array of tags extracted from the request
   * @private
   */
  private extractTagsFromRequest(request: Request): string[] {
    return this._tagsManager.extractTagsFromRequest(request);
  }
  
  /**
   * Prepare a request and response with cache tags
   *
   * @param request Original request
   * @param response Response to be cached
   * @param pathOverride Optional path override
   * @param options Optional transformation options
   * @returns Object containing tagged request and response
   * @private
   */
  private prepareTaggedRequest(
    request: Request,
    response: Response,
    pathOverride?: string,
    options?: TransformOptions,
  ): { request: Request, response: Response } {
    return this._tagsManager.prepareTaggedRequest(request, response, pathOverride, options);
  }

  /**
   * Execute a cache operation with proper error handling
   *
   * @param operation The cache operation to perform
   * @param request The original request
   * @param operationName Name of the operation for logs and errors
   * @param circuitBreaker The circuit breaker state to use
   * @returns Result of the operation
   * @private
   */
  private async executeCacheOperation<T>(
    operation: () => Promise<T>,
    request: Request,
    operationName: string,
    circuitBreaker: CircuitBreakerState,
  ): Promise<T> {
    return this.resilienceManager.executeCacheOperation(
      operation,
      request,
      operationName,
      circuitBreaker,
      {
        getRetryConfig: () => this.getRetryConfig(),
        getCircuitBreakerConfig: () => this.getCircuitBreakerConfig(),
        handleError: (error, context, req) => this.handleError(error, context, req)
      }
    );
  }

  /**
   * Store a response in cache in the background
   *
   * @param request The original request
   * @param response The response to cache
   * @param ctx The execution context
   * @param options Optional transformation options
   */
  private async storeInCacheBackground(
    request: Request,
    response: Response,
    ctx: ExecutionContext,
    options?: TransformOptions,
  ): Promise<void> {
    return this.resilienceManager.storeInCacheBackground(
      request,
      response,
      ctx,
      options,
      {
        prepareCacheableResponse: (resp) => this.prepareCacheableResponse(resp),
        prepareTaggedRequest: (req, resp, pathOverride, opts) => 
          this.prepareTaggedRequest(req, resp, pathOverride, opts)
      }
    );
  }

  /**
   * Add resource hints to a response for performance optimization
   *
   * @param response The response to enhance
   * @param request The original request
   * @param options The transformation options
   * @param storageResult The storage result
   * @returns The enhanced response
   */
  addResourceHints(
    response: Response,
    request: Request,
    options?: TransformOptions,
    storageResult?: StorageResult,
  ): Response {
    return this.performanceManager.addResourceHints(
      response,
      request,
      options,
      storageResult
    );
  }

  /**
   * Record cache metrics for monitoring
   *
   * @param request The original request
   * @param response The response
   */
  async recordCacheMetric(
    request: Request,
    response: Response,
  ): Promise<void> {
    return this.performanceManager.recordCacheMetric(request, response);
  }

  /**
   * Calculate the appropriate TTL for a response with intelligent adjustment
   * based on content type, response status, and image properties
   *
   * @param response The response to check
   * @param options The transformation options
   * @param storageResult Optional storage result with additional image metadata
   * @returns The TTL in seconds
   * @throws {CacheServiceError} If calculating TTL fails
   */
  calculateTtl(
    response: Response,
    options: TransformOptions,
    storageResult?: StorageResult,
  ): number {
    try {
      // Validate inputs
      if (!response || !isResponse(response)) {
        throw new CacheServiceError(
          "Invalid response object provided to calculateTtl",
          {
            code: "INVALID_RESPONSE",
            status: 500,
            details: {
              responseType: response ? typeof response : "undefined",
              isResponse: isResponse(response),
            },
          },
        );
      }

      this.logger.debug("Delegating TTL calculation to TTLCalculator module", {
        status: response.status,
        contentType: response.headers.get("Content-Type") || "unknown"
      });
      
      // Delegate to the TTL calculator module
      return this.ttlCalculator.calculateTtl(response, options, storageResult);
    } catch (error: unknown) {
      // If it's already a CacheServiceError, re-throw it
      if (isCacheServiceError(error)) {
        throw error;
      }

      // Otherwise, wrap the error in a CacheServiceError
      const errorMessage = isError(error) ? error.message : String(error);
      throw new CacheServiceError(`Failed to calculate TTL: ${errorMessage}`, {
        code: "TTL_CALCULATION_ERROR",
        status: 500,
        details: {
          originalError: errorMessage,
          responseStatus: isResponse(response) ? response.status : "unknown",
          contentType: isResponse(response)
            ? (response.headers.get("Content-Type") || "unknown")
            : "unknown",
          optionsPresent: !!options,
        },
        retryable: true, // TTL calculation can be retried with default values
      });
    }
  }

  /**
   * Service lifecycle method for initialization
   *
   * Initializes the cache service with necessary setup:
   * - Resets circuit breaker states
   * - Clears failure tracking
   * - Initializes cache metrics
   *
   * @returns Promise that resolves when initialization is complete
   */
  async initialize(): Promise<void> {
    this.logger.debug("Initializing DefaultCacheService");

    // Reset circuit breaker states
    this.cacheWriteCircuitBreaker = createCircuitBreakerState();
    this.cacheReadCircuitBreaker = createCircuitBreakerState();

    // Clear failure tracking
    this.recentFailures = [];

    // Get configuration settings
    const config = this.configService.getConfig();
    const cacheSettings = config.cache;

    // Apply circuit breaker settings from configuration if available
    if (cacheSettings.circuitBreaker) {
      // We don't directly modify the circuit breaker state based on config,
      // but we can use the settings when creating new ones
      const failureThreshold = cacheSettings.circuitBreaker.failureThreshold ||
        5;
      const resetTimeoutMs = cacheSettings.circuitBreaker.resetTimeoutMs ||
        30000;
      const successThreshold = cacheSettings.circuitBreaker.successThreshold ||
        2;

      // Log the configuration we'll use for circuit breakers
      this.logger.debug("Configured circuit breakers for cache operations", {
        failureThreshold,
        resetTimeoutMs,
        successThreshold,
      });
    }

    this.logger.info("DefaultCacheService initialization complete");
    return Promise.resolve();
  }

  /**
   * Service lifecycle method for shutdown
   *
   * Performs cleanup operations:
   * - Logs cache operation statistics
   * - Resets internal state
   *
   * @returns Promise that resolves when shutdown is complete
   */
  async shutdown(): Promise<void> {
    this.logger.debug("Shutting down DefaultCacheService");

    // Log circuit breaker state
    this.logger.debug("Cache circuit breaker state at shutdown", {
      writeCircuitOpen: this.cacheWriteCircuitBreaker.isOpen,
      readCircuitOpen: this.cacheReadCircuitBreaker.isOpen,
      writeFailures: this.cacheWriteCircuitBreaker.failureCount,
      readFailures: this.cacheReadCircuitBreaker.failureCount,
      recentFailures: this.recentFailures.length,
    });

    // Reset failure tracking
    this.recentFailures = [];

    this.logger.info("DefaultCacheService shutdown complete");
    return Promise.resolve();
  }
  
  /**
   * Generate cache tags for a request/response
   *
   * Delegates to the tagsManager component for consistent tag generation
   *
   * @param request Original request
   * @param storageResult Storage result
   * @param options Transformation options
   * @returns Array of cache tags
   */
  generateCacheTags(
    request: Request,
    storageResult: StorageResult,
    options: TransformOptions
  ): string[] {
    return this._tagsManager.generateCacheTags(request, storageResult, options);
  }
}
