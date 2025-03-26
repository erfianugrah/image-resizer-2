/**
 * Default implementation of the CacheService
 * 
 * Enhanced with improved caching strategies, cache tagging,
 * and performance optimizations.
 */

import { Logger } from '../utils/logging';
import { CacheService, ConfigurationService, StorageResult, TransformOptions } from './interfaces';
import { ImageResizerConfig } from '../config';
import { 
  CacheServiceError,
  CacheReadError, 
  CacheWriteError, 
  CacheUnavailableError, 
  CacheTagGenerationError, 
  CacheQuotaExceededError 
} from '../errors/cacheErrors';
import { 
  withRetry, 
  withCircuitBreaker, 
  withResilience,
  createCircuitBreakerState,
  CircuitBreakerState
} from '../utils/retry';

// Type guard functions for TypeScript error handling
function isCacheServiceError(error: unknown): error is CacheServiceError {
  return error instanceof CacheServiceError;
}

function isCacheTagGenerationError(error: unknown): error is CacheTagGenerationError {
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
  private recentFailures: {timestamp: number, errorCode: string}[] = [];

  constructor(logger: Logger, configService: ConfigurationService) {
    this.logger = logger;
    this.configService = configService;
    
    // Initialize circuit breaker states
    this.cacheWriteCircuitBreaker = createCircuitBreakerState();
    this.cacheReadCircuitBreaker = createCircuitBreakerState();
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
      logger: this.logger
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
      logger: this.logger
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
      errorCode
    });
    
    // Prune old failures (older than 5 minutes)
    this.recentFailures = this.recentFailures.filter(failure => 
      now - failure.timestamp < 5 * 60 * 1000
    );
    
    // Log high failure rates
    if (this.recentFailures.length > 10) {
      this.logger.warn('High cache failure rate detected', {
        failureCount: this.recentFailures.length,
        timeWindow: '5 minutes',
        mostCommonError: this.getMostCommonErrorCode()
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
      errorCounts[failure.errorCode] = (errorCounts[failure.errorCode] || 0) + 1;
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
    fallback: () => Promise<T>
  ): Promise<T> {
    try {
      // If we're seeing a lot of failures, go straight to fallback
      if (this.shouldUseFallback()) {
        this.logger.debug('Using fallback behavior due to recent failures');
        return await fallback();
      }
      
      // Try the primary operation
      return await operation();
    } catch (error) {
      // Record the failure
      if (error instanceof CacheServiceError) {
        this.recordFailure(error.code);
      } else {
        this.recordFailure('UNKNOWN_ERROR');
      }
      
      // Log the fallback
      this.logger.debug('Cache operation failed, using fallback', {
        error: error instanceof Error ? error.message : String(error)
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
    storageResult?: StorageResult
  ): Response {
    try {
      const config = this.configService.getConfig();
      
      this.logger.debug('Applying cache headers', { 
        cacheMethod: config.cache.method,
        status: response.status,
        contentType: response.headers.get('Content-Type') || 'unknown',
        hasOptions: !!options && Object.keys(options).length > 0
      });

      if (!response || !isResponse(response)) {
        throw new CacheServiceError('Invalid response object provided', {
          code: 'INVALID_RESPONSE',
          status: 500,
          details: { 
            responseType: response ? typeof response : 'undefined',
            isResponse: isResponse(response) 
          }
        });
      }

      // If caching is disabled, return the response as is
      if (!config.cache.cacheability) {
        return response;
      }
      
      // Create a new response that we can modify
      const newResponse = new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: new Headers(response.headers)
      });
      
      // Calculate appropriate TTL based on our advanced logic
      const ttl = this.calculateTtl(newResponse, options || {}, storageResult);
      
      // Set cache control header based on status code
      const status = newResponse.status;
      let cacheControl = '';
      
      if (status >= 200 && status < 300) {
        // Success responses - public with our calculated TTL
        cacheControl = `public, max-age=${ttl}`;
        
        // Add stale-while-revalidate directive for successful responses if enabled
        if (config.cache.enableStaleWhileRevalidate) {
          // Add stale-while-revalidate, which allows serving stale content during revalidation
          // The value is a percentage of the main TTL - typically 50%
          const staleTime = Math.round(ttl * 0.5); // 50% of the TTL
          cacheControl += `, stale-while-revalidate=${staleTime}`;
        }
        
        // Add immutable directive for static content that never changes
        // This prevents browsers from revalidating even on reload
        if (this.isImmutableContent(newResponse, options, storageResult)) {
          cacheControl += ', immutable';
        }
        
        // Add CDN-specific cache directives if configured
        if (config.cache.cdnDirectives?.enabled) {
          // Common CDN directives like Cloudflare's, Fastly's, or Akamai's
          if (config.cache.cdnDirectives.noTransform) {
            cacheControl += ', no-transform';
          }
          
          // Fastly and other CDNs support stale-if-error
          if (config.cache.cdnDirectives.staleIfError) {
            const staleErrorTime = config.cache.cdnDirectives.staleIfErrorTime || ttl * 2;
            cacheControl += `, stale-if-error=${staleErrorTime}`;
          }
        }
      } else if (status >= 400 && status < 500) {
        // Client error responses - shorter caching, private
        cacheControl = `private, max-age=${config.cache.ttl.clientError}`;
        
        // Special case for 404s which might change frequently during development
        if (status === 404 && config.environment === 'development') {
          cacheControl = 'no-store';
        }
      } else if (status >= 500) {
        // Server error responses - minimal caching, private
        cacheControl = `private, max-age=${config.cache.ttl.serverError}`;
      }
      
      // Apply the constructed Cache-Control header
      newResponse.headers.set('Cache-Control', cacheControl);
      
      // Add Cloudflare-specific headers for duplicate processing prevention
      if (config.cache.method === 'cf') {
        // Add marker to prevent duplicate processing
        newResponse.headers.set('x-img-resizer-processed', 'true');
        
        // Add worker identifier to help with debugging
        newResponse.headers.set('cf-worker', 'image-resizer');
      }
      
      // Add Vary headers for proper cache differentiation
      this.addVaryHeaders(newResponse, options);
      
      // Add cache tags if configured and available
      if (config.cache.cacheTags?.enabled && storageResult) {
        try {
          const tags = this.generateCacheTags(
            new Request(storageResult.originalUrl || 'https://example.com/unknown'),
            storageResult,
            options || {}
          );
          
          if (tags.length > 0) {
            // Set Cache-Tag header on response (used by Cloudflare Cache API and other CDNs)
            newResponse.headers.set('Cache-Tag', tags.join(','));
            
            // Add for Cloudflare legacy CDN if both headers are enabled
            if (config.cache.useMultipleCacheTagHeaders) {
              newResponse.headers.set('Cloudflare-CDN-Cache-Control', `tag=${tags.join(',')}`);
            }
            
            this.logger.debug('Added cache tags to response via Cache-Tag header', {
              tagCount: tags.length,
              firstFewTags: tags.slice(0, 3).join(', ') + (tags.length > 3 ? '...' : '')
            });
          }
        } catch (tagError) {
          this.logger.warn('Failed to generate or apply cache tags', {
            error: tagError instanceof Error ? tagError.message : String(tagError)
          });
          // Continue without tags rather than failing the whole operation
        }
      }
      
      // Add a custom header to indicate we applied our caching strategy
      if (config.debug?.enabled) {
        newResponse.headers.set('X-Cache-Strategy', 'enhanced');
        newResponse.headers.set('X-Cache-TTL', ttl.toString());
      }
      
      // Log the final cache headers
      this.logger.debug('Applied enhanced cache headers', {
        cacheControl: newResponse.headers.get('Cache-Control'),
        cacheTagHeader: newResponse.headers.get('Cache-Tag'),
        status: newResponse.status,
        ttl
      });

      return newResponse;
    } catch (error: unknown) {
      // If it's already a CacheServiceError, re-throw it
      if (isCacheServiceError(error)) {
        throw error;
      }
      
      // Otherwise, wrap the error in a CacheServiceError
      const errorMessage = isError(error) ? error.message : String(error);
      throw new CacheServiceError(`Failed to apply cache headers: ${errorMessage}`, {
        code: 'CACHE_HEADERS_ERROR',
        status: 500,
        details: {
          originalError: errorMessage,
          responseStatus: response?.status,
          contentType: response?.headers?.get('Content-Type') || 'unknown'
        }
      });
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
    storageResult?: StorageResult
  ): boolean {
    // Get config for immutable content patterns
    const config = this.configService.getConfig();
    
    // If immutable caching is disabled, always return false
    if (!config.cache.immutableContent?.enabled) {
      return false;
    }
    
    // Check if content type is considered immutable
    const contentType = response.headers.get('Content-Type') || '';
    const immutableTypes = config.cache.immutableContent.contentTypes || [
      'image/svg+xml',
      'font/',
      'application/font'
    ];
    
    if (immutableTypes.some(type => contentType.includes(type))) {
      return true;
    }
    
    // Check if path indicates immutable content (like versioned static assets)
    if (storageResult?.path) {
      const path = storageResult.path.toLowerCase();
      const immutablePaths = config.cache.immutableContent.paths || [
        '/static/',
        '/assets/',
        '/dist/'
      ];
      
      // Check for versioned file patterns like /assets/v2/, /static/1.2.3/, etc.
      const hasVersionPattern = /\/(v\d+|v\d+\.\d+|v\d+\.\d+\.\d+)\//.test(path);
      
      // Check for content hash patterns like .a1b2c3d4.js, .abcdef123456.css
      const hasHashPattern = /\.[a-f0-9]{6,32}\.[a-z]+$/i.test(path);
      
      if (hasVersionPattern || hasHashPattern) {
        return true;
      }
      
      // Check for configured immutable paths
      if (immutablePaths.some(immutablePath => path.includes(immutablePath))) {
        return true;
      }
    }
    
    // Check if specific derivatives should be treated as immutable
    if (options?.derivative) {
      const immutableDerivatives = config.cache.immutableContent.derivatives || [
        'icon',
        'logo',
        'favicon'
      ];
      
      if (immutableDerivatives.includes(options.derivative)) {
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * Add appropriate Vary headers to a response to ensure proper cache differentiation
   * Vary headers tell CDNs and browsers to cache different versions based on request headers
   * 
   * @param response The response to modify
   * @param options The transformation options
   */
  private addVaryHeaders(response: Response, options?: TransformOptions): void {
    const config = this.configService.getConfig();
    const currentVary = response.headers.get('Vary') || '';
    const varyHeaders: string[] = currentVary ? currentVary.split(', ') : [];
    
    // Always vary on Accept for content negotiation
    if (!varyHeaders.includes('Accept')) {
      varyHeaders.push('Accept');
    }
    
    // Add client hint headers for responsive images
    if (config.cache.varyOnClientHints) {
      const clientHintHeaders = [
        'Sec-CH-DPR',
        'DPR',
        'Sec-CH-Width',
        'Viewport-Width'
      ];
      
      for (const header of clientHintHeaders) {
        if (!varyHeaders.includes(header)) {
          varyHeaders.push(header);
        }
      }
    }
    
    // Add User-Agent if we're varying on device type
    if (config.cache.varyOnUserAgent) {
      if (!varyHeaders.includes('User-Agent')) {
        varyHeaders.push('User-Agent');
      }
    }
    
    // Add Save-Data if we're optimizing for data saving mode
    if (config.cache.varyOnSaveData) {
      if (!varyHeaders.includes('Save-Data')) {
        varyHeaders.push('Save-Data');
      }
    }
    
    // If we have format or quality auto-selection based on the Accept header
    if (options?.format === 'auto') {
      if (!varyHeaders.includes('Accept')) {
        varyHeaders.push('Accept');
      }
    }
    
    // Set the new Vary header if we added anything
    if (varyHeaders.length > 0) {
      response.headers.set('Vary', varyHeaders.join(', '));
    }
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
    ctx: ExecutionContext
  ): Promise<Response> {
    try {
      const config = this.configService.getConfig();
      
      // Validate inputs
      if (!request || !isRequest(request)) {
        throw new CacheServiceError('Invalid request object provided', {
          code: 'INVALID_REQUEST',
          status: 500,
          details: { 
            requestType: request ? typeof request : 'undefined',
            isRequest: isRequest(request) 
          }
        });
      }

      if (!response || !isResponse(response)) {
        throw new CacheServiceError('Invalid response object provided', {
          code: 'INVALID_RESPONSE',
          status: 500,
          details: { 
            responseType: response ? typeof response : 'undefined',
            isResponse: isResponse(response) 
          }
        });
      }

      if (!ctx || typeof ctx.waitUntil !== 'function') {
        throw new CacheUnavailableError('Invalid execution context provided', {
          details: {
            contextType: ctx ? typeof ctx : 'undefined',
            hasWaitUntil: ctx ? (typeof ctx.waitUntil === 'function') : false
          }
        });
      }
      
      // Skip if caching is disabled or not using Cache API
      if (config.cache.method !== 'cache-api') {
        this.logger.debug('Skipping Cache API caching', { 
          method: config.cache.method,
          url: request.url
        });
        return response;
      }
      
      // Check if Cache API is available
      if (typeof caches === 'undefined' || !caches.default) {
        throw new CacheUnavailableError('Cache API is not available in this environment', {
          details: {
            cachesType: typeof caches,
            defaultCache: typeof caches !== 'undefined' ? !!caches.default : false
          }
        });
      }
      
      this.logger.debug('Caching with Cache API', { 
        url: request.url,
        status: response.status,
        contentType: response.headers.get('Content-Type') || 'unknown'
      });

      // The core caching operation that will be executed with resilience patterns
      const cacheOperation = async (): Promise<Response> => {
        // Clone the response since it might be consumed in retries
        const responseClone = response.clone();
        
        try {
          // Apply cache headers
          const cacheStart = Date.now();
          const cachedResponse = this.applyCacheHeaders(responseClone);
          const cacheEnd = Date.now();
          
          this.logger.breadcrumb('Applied cache headers', cacheEnd - cacheStart, {
            status: cachedResponse.status,
            cacheControl: cachedResponse.headers.get('Cache-Control')
          });
          
          // Only cache successful responses
          if (cachedResponse.status >= 200 && cachedResponse.status < 300) {
            // Prepare response for caching
            const responseToCache = this.prepareCacheableResponse(cachedResponse);
            
            this.logger.breadcrumb('Storing successful response in Cache API', undefined, {
              status: responseToCache.status,
              url: request.url
            });
            
            // Prepare request with cache tags
            const requestWithTags = this.prepareTaggedRequest(request, responseToCache);
            
            // Use waitUntil to cache the response without blocking, using the tagged request
            ctx.waitUntil(
              caches.default.put(requestWithTags, responseToCache).then(() => {
                this.logger.breadcrumb('Successfully stored in Cache API');
              }).catch(error => {
                this.logger.breadcrumb('Failed to store in Cache API', undefined, {
                  error: error instanceof Error ? error.message : String(error)
                });
              })
            );
          } else {
            this.logger.breadcrumb('Not caching non-success response', undefined, {
              status: cachedResponse.status
            });
          }
          
          // The Cache-Tag header should already be set on the response by applyCacheHeaders 
          // before we store it in the cache, so no need to add it again here
          return cachedResponse;
        } catch (cacheError) {
          // Check for quota exceeded errors
          const errorMessage = cacheError instanceof Error ? cacheError.message : String(cacheError);
          if (errorMessage.includes('quota') || errorMessage.includes('storage limit')) {
            throw new CacheQuotaExceededError('Cache storage quota exceeded', {
              details: {
                originalError: errorMessage,
                url: request.url,
                contentLength: responseClone.headers.get('Content-Length')
              }
            });
          }
          
          // Other cache write errors
          throw new CacheWriteError(`Failed to write to cache: ${errorMessage}`, {
            details: {
              originalError: errorMessage,
              url: request.url,
              status: responseClone.status
            }
          });
        }
      };

      // Get resilience options by combining retry and circuit breaker config
      const resilienceOptions = {
        ...this.getRetryConfig(),
        ...this.getCircuitBreakerConfig()
      };
      
      // Execute the cache operation with retry and circuit breaker patterns
      return await withResilience(
        cacheOperation,
        this.cacheWriteCircuitBreaker,
        resilienceOptions
      );
    } catch (error: unknown) {
      // If it's already a CacheServiceError, re-throw it
      if (isCacheServiceError(error)) {
        // Add request URL to error details if not already there
        if (error.details && isRequest(request)) {
          error.details = {
            ...error.details,
            url: error.details.url || request.url
          };
        }
        throw error;
      }
      
      // Otherwise, wrap the error in a CacheServiceError
      const errorMessage = isError(error) ? error.message : String(error);
      throw new CacheServiceError(`Cache API operation failed: ${errorMessage}`, {
        code: 'CACHE_API_ERROR',
        status: 500,
        details: {
          originalError: errorMessage,
          url: isRequest(request) ? request.url : 'unknown',
          responseStatus: isResponse(response) ? response.status : 'unknown'
        },
        retryable: true // Most cache operations can be retried
      });
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
    options?: TransformOptions
  ): boolean {
    try {
      // Validate input
      if (!request || !isRequest(request)) {
        throw new CacheServiceError('Invalid request object provided to shouldBypassCache', {
          code: 'INVALID_REQUEST',
          status: 500,
          details: { 
            requestType: request ? typeof request : 'undefined',
            isRequest: isRequest(request) 
          }
        });
      }
      
      const config = this.configService.getConfig();
      let url: URL;
      
      try {
        url = new URL(request.url);
      } catch (urlError) {
        throw new CacheServiceError('Invalid URL in request', {
          code: 'INVALID_URL',
          status: 400,
          details: {
            url: request.url,
            error: urlError instanceof Error ? urlError.message : String(urlError)
          }
        });
      }
      
      // 1. Debug and development-specific bypass parameters
      
      // Check for debug mode cache bypass parameters
      if (url.searchParams.has('debug')) {
        const debugMode = url.searchParams.get('debug');
        if (debugMode === 'cache' || debugMode === 'true' || debugMode === '1' || debugMode === 'all') {
          this.logger.debug('Debug mode cache bypass detected', {
            url: request.url,
            debugMode,
            reason: 'debug parameter indicates cache bypass'
          });
          return true;
        }
      }
      
      // Force cache refresh parameter - more explicit than no-cache
      if (url.searchParams.has('refresh') || url.searchParams.has('force-refresh')) {
        this.logger.debug('Force refresh cache bypass detected', {
          url: request.url,
          reason: 'refresh or force-refresh parameter'
        });
        return true;
      }
      
      // Development/preview mode bypass
      if (url.searchParams.has('preview') || url.searchParams.has('dev')) {
        this.logger.debug('Development/preview mode cache bypass detected', {
          url: request.url,
          reason: 'preview or dev parameter'
        });
        return true;
      }
      
      // Version-based bypass for cache invalidation
      // If v={timestamp} changes, it forces a new cache entry
      const version = url.searchParams.get('v');
      if (version && config.cache.versionBypass) {
        // This doesn't actually bypass cache, but creates a new cache key
        // We log it but return false since we still want to cache the result
        this.logger.debug('Version parameter detected', {
          url: request.url,
          version,
          cacheStatus: 'Using versioned caching'
        });
        // Do not return true here - we still want to cache the result
      }
      
      // 2. Special-purpose cache bypass parameters
      
      // Check for configured bypass parameters from config
      const bypassParams = config.cache.bypassParams || ['nocache'];
      for (const param of bypassParams) {
        if (url.searchParams.has(param)) {
          this.logger.debug('Configured cache bypass parameter detected', {
            url: request.url,
            parameter: param,
            reason: 'Matched configured bypass parameter'
          });
          return true;
        }
      }
      
      // 3. Header-based cache bypass
      
      // Check standard cache-control headers  
      const cacheControl = request.headers.get('Cache-Control');
      if (cacheControl) {
        if (cacheControl.includes('no-cache') || 
            cacheControl.includes('no-store') || 
            cacheControl.includes('max-age=0')) {
          this.logger.debug('Cache-Control header bypass detected', {
            url: request.url,
            cacheControl,
            reason: 'Cache-Control header indicates no caching'
          });
          return true;
        }
      }
      
      // Check for Pragma: no-cache
      const pragma = request.headers.get('Pragma');
      if (pragma && pragma.includes('no-cache')) {
        this.logger.debug('Pragma: no-cache header detected', {
          url: request.url,
          reason: 'Pragma header indicates no caching'
        });
        return true;
      }
      
      // 4. Role or authentication-based bypass
      
      // Check for authenticated or admin requests that might need fresh data
      const authorization = request.headers.get('Authorization');
      const adminHeader = request.headers.get('X-Admin') || request.headers.get('X-Admin-Access');
      
      // Allow bypassing cache for admin users if configured
      if (config.cache.bypassForAdmin && 
          (adminHeader === 'true' || adminHeader === '1')) {
        this.logger.debug('Admin user cache bypass detected', {
          url: request.url,
          reason: 'Request is from admin user'
        });
        return true;
      }
      
      // 5. Content-sensitive bypass rules
      
      // Check if we're dealing with frequently updated content based on path
      const path = url.pathname.toLowerCase();
      
      if (config.cache.bypassPaths && Array.isArray(config.cache.bypassPaths)) {
        for (const bypassPath of config.cache.bypassPaths) {
          if (path.includes(bypassPath.toLowerCase())) {
            this.logger.debug('Path-based cache bypass detected', {
              url: request.url,
              path: bypassPath,
              reason: 'Path matches configured bypass path'
            });
            return true;
          }
        }
      }
      
      // 6. Format or quality specific bypass
      
      // Specific formats might need to bypass cache (e.g., during testing of new formats)
      if (options?.format && 
          config.cache.bypassFormats && 
          Array.isArray(config.cache.bypassFormats) && 
          config.cache.bypassFormats.includes(options.format)) {
        
        this.logger.debug('Format-specific cache bypass detected', {
          url: request.url,
          format: options.format,
          reason: 'Format is in bypass list'
        });
        return true;
      }
      
      // 7. Environment-sensitive bypass
      
      // Special handling for development environment
      if (config.environment === 'development' && config.cache.bypassInDevelopment) {
        this.logger.debug('Development environment cache bypass', {
          url: request.url,
          reason: 'Development environment with bypassInDevelopment enabled'
        });
        return true;
      }
      
      this.logger.debug('No cache bypass conditions detected', {
        url: request.url
      });
      
      return false;
    } catch (error: unknown) {
      // If it's already a CacheServiceError, re-throw it
      if (isCacheServiceError(error)) {
        throw error;
      }
      
      // Otherwise, wrap the error in a CacheServiceError
      const errorMessage = isError(error) ? error.message : String(error);
      throw new CacheServiceError(`Failed to evaluate cache bypass status: ${errorMessage}`, {
        code: 'CACHE_BYPASS_ERROR',
        status: 500,
        details: {
          originalError: errorMessage,
          requestUrl: isRequest(request) ? request.url : 'unknown'
        }
      });
    }
  }

  /**
   * Extract transform options from URL parameters
   * 
   * @param url URL to extract parameters from
   * @returns TransformOptions object with parsed parameters
   * @private
   */
  private extractOptionsFromUrl(url: URL): TransformOptions {
    const searchParams = url.searchParams;
    const options: TransformOptions = {};
    
    // Extract basic parameters from the URL
    if (searchParams.has('width')) options.width = parseInt(searchParams.get('width') || '0', 10);
    if (searchParams.has('height')) options.height = parseInt(searchParams.get('height') || '0', 10);
    if (searchParams.has('format')) options.format = searchParams.get('format') || undefined;
    if (searchParams.has('quality')) options.quality = parseInt(searchParams.get('quality') || '0', 10);
    if (searchParams.has('fit')) options.fit = searchParams.get('fit') || undefined;
    if (searchParams.has('gravity')) options.gravity = searchParams.get('gravity') || undefined;
    
    return options;
  }

  /**
   * Apply cache tags to a request for Cloudflare's Cache API
   * 
   * @param request Original request
   * @param tags Array of cache tags to apply
   * @returns A new request with cache tags in CF object
   * @private
   */
  private applyTagsToRequest(request: Request, tags: string[]): Request {
    if (!tags.length) {
      return request;
    }
    
    // Create a new request with the cache tags in the cf property
    const cfData = request.cf || {};
    return new Request(request, {
      cf: {
        ...cfData,
        cacheTags: tags
      }
    });
  }

  /**
   * Generate cache tags for a request/response with enhanced categorization
   * 
   * @param request The original request
   * @param storageResult The storage result with image data
   * @param options The transformation options
   * @returns An array of cache tags
   * @throws {CacheTagGenerationError} If generating cache tags fails
   */
  generateCacheTags(
    request: Request,
    storageResult: StorageResult,
    options: TransformOptions
  ): string[] {
    try {
      // Validate inputs
      if (!request || !isRequest(request)) {
        throw new CacheServiceError('Invalid request object provided to generateCacheTags', {
          code: 'INVALID_REQUEST',
          status: 500,
          details: { 
            requestType: request ? typeof request : 'undefined',
            isRequest: isRequest(request) 
          }
        });
      }

      if (!storageResult) {
        throw new CacheTagGenerationError('Missing storage result for tag generation', {
          details: {
            requestUrl: request.url
          }
        });
      }
      
      const config = this.configService.getConfig();
      
      // Check if cache tags are enabled
      if (!config.cache.cacheTags?.enabled) {
        this.logger.debug('Cache tags are disabled');
        return [];
      }
      
      let imagePath: string;
      try {
        const url = new URL(request.url);
        imagePath = storageResult.path || url.pathname;
      } catch (urlError) {
        throw new CacheTagGenerationError('Invalid URL in request for tag generation', {
          details: {
            url: request.url,
            error: urlError instanceof Error ? urlError.message : String(urlError)
          }
        });
      }
      
      this.logger.debug('Generating cache tags', {
        imagePath,
        sourceType: storageResult.sourceType,
        hasOptions: options && Object.keys(options).length > 0
      });
      
      // Generate cache tags directly rather than using utility function
      const startTime = Date.now();
      const tags: string[] = [];
      const prefix = config.cache.cacheTags?.prefix || '';
      
      // Path-based tags generation
      try {
        // Add base tag for the image path (normalized to avoid special chars)
        const leadingSlashPattern = config.cache.cacheTags?.pathNormalization?.leadingSlashPattern || '^/+';
        const invalidCharsPattern = config.cache.cacheTags?.pathNormalization?.invalidCharsPattern || '[^a-zA-Z0-9-_/.]';
        const replacementChar = config.cache.cacheTags?.pathNormalization?.replacementChar || '-';
        
        const normalizedPath = imagePath
          .replace(new RegExp(leadingSlashPattern), '') // Remove leading slashes
          .replace(new RegExp(invalidCharsPattern, 'g'), replacementChar) // Replace special chars
          .split('/')
          .filter(Boolean);
        
        // Add a tag for the full path
        // First join the path segments, then replace dots with dashes for consistency
        tags.push(`${prefix}path-${normalizedPath.join('-').replace(/\./g, '-')}`);
        
        // Add tags for each path segment
        normalizedPath.forEach((segment, index) => {
          // Only add segment tags if there are multiple segments
          if (normalizedPath.length > 1) {
            // Also replace dots with dashes for segments for consistency
            tags.push(`${prefix}segment-${index}-${segment.replace(/\./g, '-')}`);
          }
        });
      } catch (pathError) {
        this.logger.warn('Error processing path for cache tags', {
          error: pathError instanceof Error ? pathError.message : String(pathError),
          imagePath
        });
        // Continue without path tags rather than failing completely
      }
      
      // Add a tag for the derivative if configured
      if (config.cache.cacheTags?.includeDerivative && options.derivative) {
        tags.push(`${prefix}derivative-${options.derivative}`);
      }
      
      // Add a tag for image format if configured
      if (config.cache.cacheTags?.includeFormat && options.format) {
        tags.push(`${prefix}format-${options.format}`);
      }
      
      // Add tags for dimensions if configured
      if (config.cache.cacheTags?.includeImageDimensions) {
        if (options.width) {
          tags.push(`${prefix}width-${options.width}`);
        }
        
        if (options.height) {
          tags.push(`${prefix}height-${options.height}`);
        }
        
        // Add combined dimensions tag if both width and height are specified
        if (options.width && options.height) {
          tags.push(`${prefix}dimensions-${options.width}x${options.height}`);
        }
      }
      
      // Add a tag for quality if configured
      if (config.cache.cacheTags?.includeQuality && options.quality) {
        tags.push(`${prefix}quality-${options.quality}`);
      }
      
      // Add custom tags from configuration if available
      if (config.cache.cacheTags?.customTags && Array.isArray(config.cache.cacheTags.customTags)) {
        this.logger.breadcrumb('Adding custom tags from configuration', undefined, {
          tagCount: config.cache.cacheTags.customTags.length
        });
        
        const invalidCharsPattern = config.cache.cacheTags?.pathNormalization?.invalidCharsPattern || '[^a-zA-Z0-9-_/.]';
        const replacementChar = config.cache.cacheTags?.pathNormalization?.replacementChar || '-';
        
        config.cache.cacheTags.customTags.forEach((tag: string) => {
          // Normalize tag to ensure it's safe for cache tags
          const safeTag = tag.replace(new RegExp(invalidCharsPattern, 'g'), replacementChar);
          tags.push(`${prefix}${safeTag}`);
        });
      }
      
      // Add path-based tags if configured
      if (config.cache.cacheTags?.pathBasedTags) {
        this.logger.breadcrumb('Processing path-based tags', undefined, {
          pathBasedTagsCount: Object.keys(config.cache.cacheTags.pathBasedTags).length
        });
        
        const pathBasedTags = config.cache.cacheTags.pathBasedTags as Record<string, string[]>;
        const invalidCharsPattern = config.cache.cacheTags?.pathNormalization?.invalidCharsPattern || '[^a-zA-Z0-9-_/.]';
        const replacementChar = config.cache.cacheTags?.pathNormalization?.replacementChar || '-';
        
        Object.entries(pathBasedTags).forEach(([pattern, patternTags]) => {
          if (imagePath.includes(pattern)) {
            patternTags.forEach((tag: string) => {
              // Normalize tag to ensure it's safe for cache tags
              const safeTag = tag.replace(new RegExp(invalidCharsPattern, 'g'), replacementChar);
              tags.push(`${prefix}${safeTag}`);
            });
          }
        });
      }
      
      // Parse metadata headers if enabled and headers are provided
      if (storageResult.response?.headers && 
          config.cache.cacheTags?.parseMetadataHeaders?.enabled) {
        
        const metadataConfig = config.cache.cacheTags.parseMetadataHeaders;
        const headerPrefixes = metadataConfig.headerPrefixes || ['x-meta-'];
        const excludeHeaders = metadataConfig.excludeHeaders || ['credentials', 'token', 'key'];
        const invalidCharsPattern = config.cache.cacheTags?.pathNormalization?.invalidCharsPattern || '[^a-zA-Z0-9-_/.]';
        const replacementChar = config.cache.cacheTags?.pathNormalization?.replacementChar || '-';
        
        // Process headers to extract metadata as tags
        storageResult.response.headers.forEach((value, key) => {
          // Check if this header contains metadata based on its prefix
          const headerKey = key.toLowerCase();
          const isMetadataHeader = headerPrefixes.some((prefix: string) => headerKey.startsWith(prefix));
          
          if (isMetadataHeader) {
            // Extract the metadata name by removing the prefix
            let metaName = headerKey;
            for (const prefix of headerPrefixes) {
              if (headerKey.startsWith(prefix)) {
                metaName = headerKey.substring(prefix.length);
                break;
              }
            }
            
            // Skip sensitive metadata
            const isSensitive = excludeHeaders.some((excluded: string) => 
              metaName.includes(excluded.toLowerCase())
            );
            
            if (!isSensitive) {
              // Normalize value to ensure it's safe for cache tags
              const safeValue = value.replace(new RegExp(invalidCharsPattern, 'g'), replacementChar);
              tags.push(`${prefix}meta-${metaName}-${safeValue}`);
            }
          }
        });
        
        // Include content-type as a tag if configured
        if (metadataConfig.includeContentType) {
          const contentType = storageResult.response.headers.get('content-type');
          
          if (contentType) {
            // Extract main type and subtype
            const [mainType, fullSubType] = contentType.split('/');
            const subType = fullSubType?.split(';')[0]; // Remove parameters
            
            if (mainType) {
              tags.push(`${prefix}type-${mainType}`);
            }
            
            if (subType) {
              tags.push(`${prefix}subtype-${subType}`);
            }
          }
        }
        
        // Include cache-control directives as tags if configured
        if (metadataConfig.includeCacheControl) {
          const cacheControl = storageResult.response.headers.get('cache-control');
          
          if (cacheControl) {
            // Extract useful cache control directives as tags
            if (cacheControl.includes('immutable')) tags.push(`${prefix}cc-immutable`);
            if (cacheControl.includes('public')) tags.push(`${prefix}cc-public`);
            if (cacheControl.includes('private')) tags.push(`${prefix}cc-private`);
            if (cacheControl.includes('no-store')) tags.push(`${prefix}cc-no-store`);
            if (cacheControl.includes('no-cache')) tags.push(`${prefix}cc-no-cache`);
            if (cacheControl.includes('must-revalidate')) tags.push(`${prefix}cc-must-revalidate`);
            
            // Extract max-age if present
            const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);
            if (maxAgeMatch && maxAgeMatch[1]) {
              const maxAge = parseInt(maxAgeMatch[1], 10);
              
              // Group max-age into ranges to avoid too many unique tags
              if (maxAge <= 60) {
                tags.push(`${prefix}cc-max-age-1min`);
              } else if (maxAge <= 3600) {
                tags.push(`${prefix}cc-max-age-1hr`);
              } else if (maxAge <= 86400) {
                tags.push(`${prefix}cc-max-age-1day`);
              } else if (maxAge <= 604800) {
                tags.push(`${prefix}cc-max-age-1week`);
              } else {
                tags.push(`${prefix}cc-max-age-long`);
              }
            }
          }
        }
      }
      
      // Add source type category tag for easier purging
      if (storageResult.sourceType) {
        tags.push(`${prefix}origin-${storageResult.sourceType}`);
      }
      
      // Add request method tag
      tags.push(`${prefix}method-${request.method.toLowerCase()}`);
      
      // Add status code category tags for better cache management
      if (storageResult.response && typeof storageResult.response.status === 'number') {
        const status = storageResult.response.status;
        const statusCategory = status >= 200 && status < 300 ? 'success' :
          status >= 300 && status < 400 ? 'redirect' :
            status >= 400 && status < 500 ? 'client-error' :
              'server-error';
        
        tags.push(`${prefix}status-${statusCategory}`);
        
        // Add specific status code tag
        tags.push(`${prefix}code-${status}`);
      }
      
      // Add content type categorization for broader purging
      const contentType = storageResult.contentType;
      if (contentType) {
        try {
          // Extract main mime type
          const mainType = contentType.split('/')[0];
          if (mainType) {
            tags.push(`${prefix}mime-${mainType}`);
          }
          
          // Add specific format tag based on content type
          if (contentType.includes('image/')) {
            const format = contentType.split('/')[1]?.split(';')[0];
            if (format) {
              tags.push(`${prefix}imgfmt-${format}`);
            }
          }
        } catch (contentTypeError) {
          this.logger.warn('Error parsing content type for cache tags', {
            contentType,
            error: contentTypeError instanceof Error ? contentTypeError.message : String(contentTypeError)
          });
          // Continue without these tags rather than failing completely
        }
      }
      
      // Size category tags for easier size-based operations
      if (storageResult.size) {
        try {
          // Group by size ranges
          let sizeCategory = '';
          
          if (storageResult.size < 10000) { // < 10KB
            sizeCategory = 'tiny';
          } else if (storageResult.size < 100000) { // < 100KB
            sizeCategory = 'small';
          } else if (storageResult.size < 1000000) { // < 1MB
            sizeCategory = 'medium';
          } else if (storageResult.size < 5000000) { // < 5MB
            sizeCategory = 'large';
          } else {
            sizeCategory = 'huge';
          }
          
          tags.push(`${prefix}size-${sizeCategory}`);
        } catch (sizeError) {
          this.logger.warn('Error categorizing size for cache tags', {
            size: storageResult.size,
            error: sizeError instanceof Error ? sizeError.message : String(sizeError)
          });
          // Continue without these tags rather than failing completely
        }
      }
      
      // Add dimension category tags if available
      if (storageResult.width && storageResult.height) {
        try {
          // Aspect ratio categorization
          const aspectRatio = storageResult.width / storageResult.height;
          let aspectCategory = '';
          
          if (aspectRatio < 0.8) {
            aspectCategory = 'portrait';
          } else if (aspectRatio > 1.2) {
            aspectCategory = 'landscape';
          } else {
            aspectCategory = 'square';
          }
          
          tags.push(`${prefix}aspect-${aspectCategory}`);
          
          // Size categorization
          const pixelCount = storageResult.width * storageResult.height;
          let resolutionCategory = '';
          
          if (pixelCount < 100000) { // < 0.1MP
            resolutionCategory = 'tiny';
          } else if (pixelCount < 1000000) { // < 1MP
            resolutionCategory = 'small';
          } else if (pixelCount < 4000000) { // < 4MP
            resolutionCategory = 'medium';
          } else if (pixelCount < 16000000) { // < 16MP
            resolutionCategory = 'large';
          } else {
            resolutionCategory = 'huge';
          }
          
          tags.push(`${prefix}resolution-${resolutionCategory}`);
        } catch (dimensionError) {
          this.logger.warn('Error categorizing dimensions for cache tags', {
            width: storageResult.width,
            height: storageResult.height,
            error: dimensionError instanceof Error ? dimensionError.message : String(dimensionError)
          });
          // Continue without these tags rather than failing completely
        }
      }
      
      const endTime = Date.now();
      
      // Log the resulting tags
      this.logger.debug('Generated cache tags', { 
        tagCount: tags.length,
        generationTime: endTime - startTime,
        sampleTags: tags.slice(0, 5).join(', ') + (tags.length > 5 ? '...' : '')
      });
      
      return tags;
    } catch (error: unknown) {
      // If it's already a CacheTagGenerationError, re-throw it
      if (isCacheTagGenerationError(error)) {
        throw error;
      }
      
      // If it's a different CacheServiceError, wrap it in a CacheTagGenerationError
      if (isCacheServiceError(error)) {
        // Create a new details object to avoid type issues
        const errorDetails = error.details ? Object.entries(error.details).reduce((acc, [key, value]) => {
          acc[key] = value;
          return acc;
        }, {} as Record<string, any>) : undefined;
        
        throw new CacheTagGenerationError(`Failed to generate cache tags: ${error.message}`, {
          details: errorDetails
        });
      }
      
      // Otherwise, wrap the error in a CacheTagGenerationError
      const errorMessage = isError(error) ? error.message : String(error);
      throw new CacheTagGenerationError(`Failed to generate cache tags: ${errorMessage}`, {
        details: {
          originalError: errorMessage,
          requestUrl: isRequest(request) ? request.url : 'unknown',
          storageResultAvailable: !!storageResult
        }
      });
    }
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
    options: TransformOptions
  ): RequestInit {
    try {
      // Validate inputs
      if (!requestInit) {
        throw new CacheServiceError('Invalid requestInit object provided', {
          code: 'INVALID_REQUEST_INIT',
          status: 500,
          details: { 
            requestInitType: typeof requestInit
          }
        });
      }
      
      if (!imagePath) {
        throw new CacheServiceError('Missing image path for Cloudflare cache configuration', {
          code: 'MISSING_IMAGE_PATH',
          status: 500,
          details: {
            hasOptions: !!options && Object.keys(options).length > 0
          }
        });
      }
      
      const config = this.configService.getConfig();
      
      // Skip if not using Cloudflare caching
      if (config.cache.method !== 'cf') {
        this.logger.debug('Skipping Cloudflare cache as cache method is not CF');
        return requestInit;
      }
      
      // Start tracking time for performance
      const startTime = Date.now();
      
      this.logger.debug('Applying Cloudflare cache settings', {
        imagePath,
        hasOptions: options && Object.keys(options).length > 0,
        cfMethod: config.cache.method,
        cacheEverything: config.cache.cacheEverything
      });
      
      // Generate cache tags if enabled and we have options
      const cacheTagsEnabled = config.cache.cacheTags?.enabled === true;
      this.logger.breadcrumb('Checking cache tag generation requirements', undefined, {
        cacheTagsEnabled,
        hasImagePath: !!imagePath,
        hasOptions: !!options
      });
      
      let cacheTags: string[] = [];
      
      if (cacheTagsEnabled && imagePath && options) {
        try {
          // Create a dummy request for tag generation
          const dummyRequest = new Request(`https://example.com${imagePath}`);
          const dummyResponse = new Response();
          
          // Create a minimal storage result for tag generation
          const dummyStorageResult: StorageResult = {
            response: dummyResponse,
            sourceType: 'remote',
            contentType: null,
            size: 0,
            path: imagePath
          };
          
          // Generate tags using the existing method
          cacheTags = this.generateCacheTags(dummyRequest, dummyStorageResult, options);
          
          if (cacheTags.length > 0) {
            this.logger.debug('Generated cache tags for Cloudflare fetch API', {
              tagCount: cacheTags.length,
              sampleTags: cacheTags.slice(0, 3).join(', ') + (cacheTags.length > 3 ? '...' : '')
            });
          }
        } catch (tagError) {
          this.logger.warn('Error generating cache tags for Cloudflare fetch', {
            error: tagError instanceof Error ? tagError.message : String(tagError),
            fallback: 'Continuing without cache tags'
          });
          // Continue without tags rather than failing
          cacheTags = [];
        }
      }
      
      // Create a new request init with CF cache settings
      const result = {
        ...requestInit,
        cf: {
          ...requestInit.cf,
          // Use cacheEverything from config if available, default to true
          cacheEverything: config.cache.cacheEverything !== undefined 
            ? config.cache.cacheEverything 
            : true
        }
      };
      
      /**
       * IMPORTANT NOTE ON CLOUDFLARE CACHE CONFIGURATION:
       * 
       * Cloudflare's cache has two mutually exclusive modes:
       * 
       * 1. SIMPLE MODE (cacheTtl): One TTL for all responses regardless of status code
       *    - Used when config.cache.useTtlByStatus = false
       *    - Only config.cache.ttl.ok is used for Cloudflare's edge cache
       *    - Other TTL values (clientError, serverError) are only used for Cache-Control headers
       * 
       * 2. STATUS-BASED MODE (cacheTtlByStatus): Different TTLs for different status code ranges
       *    - Used when config.cache.useTtlByStatus = true
       *    - Uses config.cache.cacheTtlByStatus which maps status code ranges to TTL values
       *    - When this is true, config.cache.ttl.ok is IGNORED for Cloudflare's edge cache
       * 
       * You MUST choose one approach or the other - they CANNOT be combined!
       */
      if (config.cache.useTtlByStatus && 
          config.cache.cacheTtlByStatus && 
          Object.keys(config.cache.cacheTtlByStatus).length > 0) {
        // STATUS-BASED CACHING: Different TTLs for different status codes
        this.logger.breadcrumb('Using cacheTtlByStatus for granular cache control', undefined, {
          statusRanges: Object.keys(config.cache.cacheTtlByStatus).join(',')
        });
        
        // Add detailed debug info for better visibility
        this.logger.debug('Status-based cache TTLs', {
          mode: 'cacheTtlByStatus',
          mappings: Object.entries(config.cache.cacheTtlByStatus)
            .map(([range, ttl]) => `${range}: ${ttl}s`)
            .join(', ')
        });
        
        result.cf = {
          ...result.cf,
          cacheTtlByStatus: config.cache.cacheTtlByStatus
        };
        
        // Add debug header to make the cache mode clear
        if (config.debug?.enabled) {
          // Add debug properties to result.cf
          const cf = result.cf as Record<string, any>;
          cf.cacheMode = 'status-based';
          cf.statusRanges = Object.keys(config.cache.cacheTtlByStatus).join(',');
        }
      } else {
        // SIMPLE CACHING: One TTL for all responses
        this.logger.breadcrumb('Using simple cacheTtl', undefined, {
          ttl: config.cache.ttl.ok
        });
        
        this.logger.debug('Simple cache TTL', {
          mode: 'cacheTtl',
          ttl: `${config.cache.ttl.ok}s`,
          note: 'All status codes will use this TTL in Cloudflare cache'
        });
        
        result.cf = {
          ...result.cf,
          cacheTtl: config.cache.ttl.ok
        };
        
        // Add debug header to make the cache mode clear
        if (config.debug?.enabled) {
          // Add debug properties to result.cf
          const cf = result.cf as Record<string, any>;
          cf.cacheMode = 'simple';
          cf.simpleTtl = config.cache.ttl.ok;
        }
      }
      
      // Add cache tags if available - for Cloudflare's fetch API
      if (cacheTags.length > 0) {
        this.logger.debug('Adding cache tags to Cloudflare request CF object', {
          tagCount: cacheTags.length,
          firstFewTags: cacheTags.slice(0, 5).join(', ') + (cacheTags.length > 5 ? '...' : '')
        });
        
        // Set cacheTags in the CF object for Cloudflare's fetch API
        result.cf = {
          ...result.cf,
          cacheTags
        };
      }
      
      const endTime = Date.now();
      this.logger.breadcrumb('Applied Cloudflare cache settings', endTime - startTime, {
        cacheEverything: result.cf.cacheEverything,
        hasCacheTtl: !!result.cf.cacheTtl,
        hasCacheTtlByStatus: !!result.cf.cacheTtlByStatus,
        tagCount: cacheTags.length
      });
      
      return result;
    } catch (error: unknown) {
      // If it's already a CacheServiceError, re-throw it
      if (isCacheServiceError(error)) {
        throw error;
      }
      
      // Otherwise, wrap the error in a CacheServiceError
      const errorMessage = isError(error) ? error.message : String(error);
      throw new CacheServiceError(`Failed to apply Cloudflare cache configuration: ${errorMessage}`, {
        code: 'CF_CACHE_CONFIG_ERROR',
        status: 500,
        details: {
          originalError: errorMessage,
          imagePath: imagePath || 'unknown'
        },
        retryable: true // Configuration errors might be transient
      });
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
    storageResult?: StorageResult
  ): Promise<Response> {
    const config = this.configService.getConfig();
    
    // Check if caching should be bypassed for this request
    if (this.shouldBypassCache(request, options)) {
      this.logger.debug('Bypassing cache for request', {
        url: request.url, 
        reason: 'shouldBypassCache returned true'
      });
      
      // Apply cache headers but don't store in cache
      return this.applyCacheHeaders(response, options, storageResult);
    }
    
    // Begin the caching process
    this.logger.debug('Starting cache with fallback process', {
      url: request.url,
      cacheMethod: config.cache.method,
      hasOptions: !!options && Object.keys(options).length > 0
    });
    
    // Primary operation - try to use Cache API with full resilience
    const primaryOperation = async () => {
      try {
        // Check for stale-while-revalidate scenario if enabled
        if (config.cache.enableStaleWhileRevalidate) {
          // Try to implement stale-while-revalidate pattern using Cache API
          const staleResponse = await this.tryGetStaleResponse(request, ctx, options);
          
          if (staleResponse) {
            // We found a stale response, serve it immediately and refresh in background
            this.logger.debug('Serving stale response while revalidating', {
              url: request.url,
              staleAge: staleResponse.headers.get('X-Stale-Age') || 'unknown'
            });
            
            // Revalidate in the background
            ctx.waitUntil(this.revalidateInBackground(request, response, ctx, options, storageResult));
            
            // Return the stale response immediately
            return staleResponse;
          }
        }
        
        // Check if we should do background caching (non-blocking)
        if (config.cache.enableBackgroundCaching && 
            response.status >= 200 && response.status < 300) {
          
          // Apply cache headers to the response
          const cachedResponse = this.applyCacheHeaders(response, options, storageResult);
          
          // Store in cache in the background
          ctx.waitUntil(this.storeInCacheBackground(request, cachedResponse.clone(), ctx, options));
          
          // Return the response immediately
          return cachedResponse;
        }
        
        // Regular caching approach - blocks until cache write completes
        return await this.cacheWithCacheApi(request, response, ctx);
      } catch (error) {
        // If Cache API is unavailable, rethrow to trigger fallback
        if (error instanceof CacheUnavailableError) {
          throw error;
        }
        
        // For quota exceeded errors, we want to adjust our strategy
        if (error instanceof CacheQuotaExceededError) {
          this.logger.warn('Cache quota exceeded, will reduce caching aggressiveness', {
            url: request.url
          });
          
          // Record this specific failure type
          this.recordFailure('QUOTA_EXCEEDED');
          throw error;
        }
        
        // For other errors, rethrow to trigger fallback
        throw error;
      }
    };
    
    // Fallback operation - just apply cache headers
    const fallbackOperation = async () => {
      this.logger.debug('Using cache header fallback strategy', {
        url: request.url
      });
      
      // Just apply cache headers to the original response
      return this.applyCacheHeaders(response, options, storageResult);
    };
    
    // Execute with fallback pattern
    const result = await this.executeWithFallback(
      primaryOperation,
      fallbackOperation
    );
    
    // Apply cache optimizations like preloading related resources if configured
    if (config.cache.enableResourceHints && 
        response.status >= 200 && response.status < 300) {
      try {
        return this.addResourceHints(result, request, options, storageResult);
      } catch (hintError) {
        this.logger.warn('Failed to add resource hints', {
          error: hintError instanceof Error ? hintError.message : String(hintError),
          url: request.url
        });
        // Continue without resource hints
      }
    }
    
    // Log cache hits/misses for monitoring
    if (config.logging?.enableCacheMetrics && ctx) {
      try {
        ctx.waitUntil(this.recordCacheMetric(request, result));
      } catch (metricError) {
        this.logger.warn('Failed to record cache metric', {
          error: metricError instanceof Error ? metricError.message : String(metricError),
          url: request.url
        });
        // Continue without recording metric
      }
    }
    
    return result;
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
    options?: TransformOptions
  ): Promise<Response | null> {
    try {
      // Check if Cache API is available
      if (typeof caches === 'undefined' || !caches.default) {
        return null;
      }
      
      // Try to get the cached response
      const cachedResponse = await caches.default.match(request);
      if (!cachedResponse) {
        return null;
      }
      
      // Check if the cached response is expired but still usable under stale-while-revalidate
      const cacheControl = cachedResponse.headers.get('Cache-Control') || '';
      const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);
      const staleWhileRevalidateMatch = cacheControl.match(/stale-while-revalidate=(\d+)/);
      
      if (!maxAgeMatch || !staleWhileRevalidateMatch) {
        return null; // Not using stale-while-revalidate pattern
      }
      
      const maxAge = parseInt(maxAgeMatch[1], 10);
      const staleTime = parseInt(staleWhileRevalidateMatch[1], 10);
      
      // Get cache timestamp from the response headers
      const cacheDate = cachedResponse.headers.get('Date');
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
        headers.set('X-Stale-Age', ageInSeconds.toString());
        headers.set('X-Cache-Status', 'stale');
        
        return new Response(cachedResponse.body, {
          status: cachedResponse.status,
          statusText: cachedResponse.statusText,
          headers
        });
      }
      
      return null; // Not stale or too stale
    } catch (error) {
      this.logger.warn('Error checking for stale response', {
        error: error instanceof Error ? error.message : String(error),
        url: request.url
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
   */
  private async revalidateInBackground(
    request: Request,
    response: Response,
    ctx: ExecutionContext,
    options?: TransformOptions,
    storageResult?: StorageResult
  ): Promise<void> {
    try {
      this.logger.debug('Revalidating cache in background', {
        url: request.url
      });
      
      // Apply cache headers to the response
      const cachedResponse = this.applyCacheHeaders(response.clone(), options, storageResult);
      
      // Reuse the storeInCacheBackground method to avoid duplicating logic
      await this.storeInCacheBackground(request, cachedResponse, ctx, options);
      
      this.logger.debug('Successfully revalidated cache in background', {
        url: request.url
      });
    } catch (error) {
      this.logger.warn('Failed to revalidate cache in background', {
        error: error instanceof Error ? error.message : String(error),
        url: request.url
      });
      // Background task, so we just log the error
    }
  }
  
  /**
   * Prepare a response for caching by adding timestamp and proper cache headers
   * 
   * @param response Original response
   * @returns Response ready for caching
   * @private
   */
  private prepareCacheableResponse(response: Response): Response {
    // Clone the response to avoid consuming the body
    const clonedResponse = response.clone();
    
    // Add timestamp header for age calculation
    const headers = new Headers(clonedResponse.headers);
    if (!headers.has('Date')) {
      headers.set('Date', new Date().toUTCString());
    }
    
    return new Response(clonedResponse.body, {
      status: clonedResponse.status,
      statusText: clonedResponse.statusText,
      headers
    });
  }
  
  /**
   * Prepare a request with cache tags if enabled
   * 
   * @param request Original request
   * @param response Response to be cached 
   * @param pathOverride Optional path override
   * @param options Optional transformation options
   * @returns Request with cache tags applied if enabled
   * @private
   */
  private prepareTaggedRequest(
    request: Request,
    response: Response,
    pathOverride?: string,
    options?: TransformOptions
  ): Request {
    const config = this.configService.getConfig();
    
    // If cache tags are not enabled, return the original request
    if (!config.cache.cacheTags?.enabled) {
      return request;
    }
    
    try {
      const url = new URL(request.url);
      const path = pathOverride || url.pathname;
      
      // Extract options from URL parameters
      const extractedOptions = this.extractOptionsFromUrl(url);
      
      // Merge with passed options if available
      const mergedOptions = options ? { ...extractedOptions, ...options } : extractedOptions;
      
      // Generate tags for this request
      const tags = this.generateCacheTags(request, {
        response: new Response(''), // Dummy response
        sourceType: 'remote',
        contentType: response.headers.get('Content-Type') || 'application/octet-stream',
        size: parseInt(response.headers.get('Content-Length') || '0', 10) || 0,
        path
      }, mergedOptions);
      
      if (tags.length > 0) {
        this.logger.debug('Adding cache tags to request', {
          tagCount: tags.length,
          sampleTags: tags.slice(0, 3).join(', ') + (tags.length > 3 ? '...' : '')
        });
        
        // Apply tags to request
        return this.applyTagsToRequest(request, tags);
      }
    } catch (tagsError) {
      // If tag generation fails, log but continue with the original request
      this.logger.warn('Failed to generate cache tags for request', {
        error: tagsError instanceof Error ? tagsError.message : String(tagsError),
        url: request.url
      });
    }
    
    return request;
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
    options?: TransformOptions
  ): Promise<void> {
    try {
      // Check if Cache API is available
      if (typeof caches === 'undefined' || !caches.default) {
        throw new CacheUnavailableError('Cache API is not available');
      }
      
      // Only cache successful responses
      if (response.status >= 200 && response.status < 300) {
        this.logger.debug('Storing in cache background', {
          url: request.url,
          status: response.status
        });
        
        // Prepare response for caching
        const responseToCache = this.prepareCacheableResponse(response);
        
        // Prepare request with cache tags
        const requestWithTags = this.prepareTaggedRequest(request, responseToCache, undefined, options);
        
        // Put in cache with the tagged request
        await caches.default.put(requestWithTags, responseToCache);
        
        this.logger.debug('Successfully stored in cache background', {
          url: request.url,
          usedTags: requestWithTags !== request
        });
      } else {
        this.logger.debug('Not caching non-success response in background', {
          url: request.url,
          status: response.status
        });
      }
    } catch (error) {
      this.logger.warn('Failed to store in cache background', {
        error: error instanceof Error ? error.message : String(error),
        url: request.url
      });
      // Background task, so we just log the error
    }
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
  private addResourceHints(
    response: Response,
    request: Request,
    options?: TransformOptions,
    storageResult?: StorageResult
  ): Response {
    const config = this.configService.getConfig();
    
    // Only add hints to HTML responses
    const contentType = response.headers.get('Content-Type') || '';
    if (!contentType.includes('text/html')) {
      return response;
    }
    
    // Create a new response with the hints added
    const headers = new Headers(response.headers);
    
    // Add preconnect hints for CDN domains
    if (config.cache.resourceHints?.preconnect && 
        Array.isArray(config.cache.resourceHints.preconnect)) {
      
      const preconnectLinks = config.cache.resourceHints.preconnect.map(
        (domain: string) => `<${domain}>; rel=preconnect`
      ).join(', ');
      
      headers.set('Link', preconnectLinks);
    }
    
    // Add preload hints for critical resources
    if (storageResult?.path && 
        config.cache.resourceHints?.preloadPatterns && 
        typeof config.cache.resourceHints.preloadPatterns === 'object') {
      
      const path = storageResult.path.toLowerCase();
      const preloads: string[] = [];
      
      // Check each pattern to see if resources should be preloaded
      Object.entries(config.cache.resourceHints.preloadPatterns).forEach(([pattern, resources]) => {
        if (path.includes(pattern.toLowerCase()) && Array.isArray(resources)) {
          resources.forEach((resource: string) => {
            preloads.push(`<${resource}>; rel=preload; as=image`);
          });
        }
      });
      
      if (preloads.length > 0) {
        const currentLink = headers.get('Link');
        if (currentLink) {
          headers.set('Link', `${currentLink}, ${preloads.join(', ')}`);
        } else {
          headers.set('Link', preloads.join(', '));
        }
      }
    }
    
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }
  
  /**
   * Record cache metrics for monitoring
   * 
   * @param request The original request
   * @param response The response
   */
  private async recordCacheMetric(
    request: Request,
    response: Response
  ): Promise<void> {
    // Check if the response has a cache status header
    const cacheStatus = response.headers.get('X-Cache-Status') || 'unknown';
    const url = new URL(request.url);
    const path = url.pathname;
    
    // Simple path-based metric bucketing to avoid too many unique metrics
    const pathBucket = path.split('/').slice(0, 3).join('/') || '/';
    
    // Generate metric key
    const metricKey = `cache_${cacheStatus}_${pathBucket}`;
    
    // Log the metric
    this.logger.debug('Cache metric', {
      url: request.url,
      cacheStatus,
      pathBucket,
      metricKey
    });
    
    // In a real implementation, this would send to a metrics service
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
    storageResult?: StorageResult
  ): number {
    try {
      // Validate inputs
      if (!response || !isResponse(response)) {
        throw new CacheServiceError('Invalid response object provided to calculateTtl', {
          code: 'INVALID_RESPONSE',
          status: 500,
          details: { 
            responseType: response ? typeof response : 'undefined',
            isResponse: isResponse(response) 
          }
        });
      }
      
      const config = this.configService.getConfig();
      const status = response.status;
      const contentType = response.headers.get('Content-Type') || '';
      
      this.logger.debug('Calculating TTL for response', {
        status,
        contentType,
        hasStorageResult: !!storageResult
      });
      
      // Determine base ttl based on status
      let ttl = config.cache.ttl.ok; // Default to success TTL
      
      if (status >= 200 && status < 300) {
        ttl = config.cache.ttl.ok;
      } else if (status >= 400 && status < 500) {
        ttl = config.cache.ttl.clientError;
      } else if (status >= 500) {
        ttl = config.cache.ttl.serverError;
      }
      
      // Check for explicit Cache-Control max-age to honor origin cache settings
      // This ensures we don't override explicit origin cache directives
      const cacheControl = response.headers.get('Cache-Control');
      if (cacheControl) {
        const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);
        if (maxAgeMatch && maxAgeMatch[1]) {
          const originMaxAge = parseInt(maxAgeMatch[1], 10);
          
          // Only use origin max-age if it's reasonable (not too short or too long)
          // This prevents very short TTLs or extremely long ones from being used blindly
          if (originMaxAge >= 60 && originMaxAge <= 31536000) { // 1 minute to 1 year
            this.logger.debug('Using origin max-age for TTL', {
              originMaxAge,
              originalTtl: ttl
            });
            
            // Use the minimum of our calculated TTL and origin max-age
            // This ensures we don't cache longer than the origin intended
            ttl = Math.min(ttl, originMaxAge);
          }
        }
      }
      
      // Adjust TTL based on image format from content-type
      if (contentType.includes('image/')) {
        const format = contentType.split('/')[1]?.split(';')[0]?.toLowerCase();
        
        // Format-specific TTL adjustments
        switch (format) {
        case 'svg+xml':
          // SVGs are vector and rarely change, so cache longer
          ttl = Math.max(ttl, 86400 * 14); // 2 weeks
          break;
            
        case 'avif':
        case 'webp':
          // Modern formats indicate optimization focus, can cache longer
          ttl = Math.max(ttl, 86400 * 7); // 1 week
          break;
            
        case 'jpeg':
        case 'jpg':
        case 'png':
          // Standard formats, use normal TTL
          break;
            
        case 'gif':
          // GIFs might be animations, slightly shorter TTL
          ttl = Math.min(ttl, 86400 * 3); // 3 days
          break;
        }
      }
      
      // Adjust TTL based on derivative type
      if (options?.derivative) {
        // Custom TTL mapping for different derivatives with business value consideration
        const derivativeTTLs: Record<string, number> = {
          // User-centric derivatives
          'thumbnail': 86400 * 14,  // 2 weeks - thumbnails change rarely
          'avatar': 86400 * 7,      // 1 week - avatars update occasionally
          'profile': 86400 * 5,     // 5 days - profile images update occasionally
          
          // Content-centric derivatives
          'preview': 3600 * 12,     // 12 hours - previews may update more often
          'banner': 86400 * 2,      // 2 days - banners are more frequently updated
          'hero': 86400 * 2,        // 2 days - hero images are more frequently updated
          
          // Special-purpose derivatives
          'og-image': 86400 * 30,   // 30 days - social sharing images rarely change
          'icon': 86400 * 30,       // 30 days - icons rarely change
          'logo': 86400 * 30,       // 30 days - logos rarely change
          
          // Short-lived derivatives
          'temp': 3600,             // 1 hour - temporary images
          'preview-draft': 300,     // 5 minutes - draft previews
        };
        
        if (derivativeTTLs[options.derivative]) {
          // Apply the derivative-specific TTL
          ttl = derivativeTTLs[options.derivative];
          
          this.logger.debug('Applied derivative-specific TTL', {
            derivative: options.derivative,
            derivativeTtl: ttl
          });
        }
      }
      
      // Use image dimensions to adjust TTL if available
      if (storageResult?.width && storageResult?.height) {
        const pixelCount = storageResult.width * storageResult.height;
        
        // Large images are often hero/banner images that change more frequently
        // Small images are often icons, thumbnails, etc. that change less frequently
        if (pixelCount > 4000000) { // > 4 megapixels (e.g., 2000x2000)
          // Reduce TTL for very large images as they're often hero/feature images
          ttl = Math.min(ttl, 86400 * 3); // Max 3 days
        } else if (pixelCount < 10000) { // < 10,000 pixels (e.g., 100x100)
          // Small images are usually icons, logos, avatars - cacheable longer
          ttl = Math.max(ttl, 86400 * 14); // Min 14 days
        }
      }
      
      // Adjust TTL based on transform quality
      // Higher quality images are often for important display purposes
      // Lower quality images are often for thumbnails or previews
      if (options?.quality) {
        if (options.quality >= 90) {
          // High quality images may be more important, keep TTL moderate
          ttl = Math.min(ttl, 86400 * 5); // Max 5 days
        } else if (options.quality <= 60) {
          // Low quality images are often thumbnails, can cache longer
          ttl = Math.max(ttl, 86400 * 7); // Min 7 days
        }
      }
      
      // Apply path-based TTL adjustments if configured
      if (storageResult?.path && config.cache.pathBasedTtl) {
        const path = storageResult.path.toLowerCase();
        const pathBasedTtl = config.cache.pathBasedTtl as Record<string, number>;
        
        // Check each path pattern for a match
        Object.entries(pathBasedTtl).forEach(([pattern, patternTtl]) => {
          if (path.includes(pattern.toLowerCase())) {
            this.logger.debug('Applying path-based TTL adjustment', {
              pattern,
              patternTtl,
              originalTtl: ttl
            });
            
            // Override TTL with path-specific value
            ttl = patternTtl;
          }
        });
      }
      
      // Adjust for image path patterns that indicate specific content types
      if (storageResult?.path) {
        const path = storageResult.path.toLowerCase();
        
        // Images that tend to change frequently
        if (path.includes('/news/') || 
            path.includes('/blog/') || 
            path.includes('/events/') || 
            path.includes('/temporary/')) {
          ttl = Math.min(ttl, 86400); // Max 1 day for news/blog/events content
        }
        
        // Images that rarely change
        if (path.includes('/static/') || 
            path.includes('/assets/') || 
            path.includes('/icons/') || 
            path.includes('/logos/')) {
          ttl = Math.max(ttl, 86400 * 30); // Min 30 days for static assets
        }
      }
      
      // Apply stale-while-revalidate pattern for successful responses
      // This adds a stale-while-revalidate directive to the Cache-Control header
      // allowing the CDN to serve stale content while fetching a fresh copy
      if (status >= 200 && status < 300 && config.cache.enableStaleWhileRevalidate) {
        // Create a new response with the stale-while-revalidate directive
        // The value is typically a percentage of the main TTL
        const staleTime = Math.round(ttl * 0.5); // 50% of the TTL
        
        try {
          const headers = new Headers(response.headers);
          const currentCacheControl = headers.get('Cache-Control') || '';
          
          // Add stale-while-revalidate directive if not already present
          if (!currentCacheControl.includes('stale-while-revalidate')) {
            headers.set('Cache-Control', 
              `${currentCacheControl}, stale-while-revalidate=${staleTime}`);
            
            this.logger.debug('Added stale-while-revalidate directive', {
              staleTime,
              newCacheControl: headers.get('Cache-Control')
            });
          }
        } catch (headerError) {
          this.logger.warn('Failed to add stale-while-revalidate directive', {
            error: headerError instanceof Error ? headerError.message : String(headerError)
          });
          // Continue without the directive
        }
      }
      
      this.logger.debug('Calculated final TTL', {
        ttl,
        status,
        contentType,
        derivative: options?.derivative || 'none',
        quality: options?.quality || 'default'
      });
      
      // Ensure TTL is a positive number and within reasonable bounds
      if (isNaN(ttl) || ttl < 0) {
        this.logger.warn('Invalid TTL calculated, using default', {
          calculatedTtl: ttl,
          defaultTtl: config.cache.ttl.ok
        });
        return config.cache.ttl.ok;
      }
      
      // Apply TTL limits if configured
      if (config.cache.maxTtl && ttl > config.cache.maxTtl) {
        this.logger.debug('Capping TTL to configured maximum', {
          calculatedTtl: ttl,
          maxTtl: config.cache.maxTtl
        });
        ttl = config.cache.maxTtl;
      }
      
      if (config.cache.minTtl && ttl < config.cache.minTtl) {
        this.logger.debug('Raising TTL to configured minimum', {
          calculatedTtl: ttl,
          minTtl: config.cache.minTtl
        });
        ttl = config.cache.minTtl;
      }
      
      return ttl;
    } catch (error: unknown) {
      // If it's already a CacheServiceError, re-throw it
      if (isCacheServiceError(error)) {
        throw error;
      }
      
      // Otherwise, wrap the error in a CacheServiceError
      const errorMessage = isError(error) ? error.message : String(error);
      throw new CacheServiceError(`Failed to calculate TTL: ${errorMessage}`, {
        code: 'TTL_CALCULATION_ERROR',
        status: 500,
        details: {
          originalError: errorMessage,
          responseStatus: isResponse(response) ? response.status : 'unknown',
          contentType: isResponse(response) ? (response.headers.get('Content-Type') || 'unknown') : 'unknown',
          optionsPresent: !!options
        },
        retryable: true // TTL calculation can be retried with default values
      });
    }
  }
}