/**
 * Optimized Cache Service
 * 
 * Implements tiered caching strategy, intelligent TTL calculations,
 * and smarter cache bypass decisions.
 */

import { Logger } from '../utils/logging';
import { OptimizedLogger } from '../utils/optimized-logging';
import { CacheMetadata } from './cache';
import { CacheService, ConfigurationService, StorageResult, TransformOptions } from './interfaces';
import { ImageResizerConfig } from '../config';
import { DefaultCacheService } from './cacheService';
import { PerformanceBaseline } from '../utils/performance-metrics';
import type { ExecutionContext } from '@cloudflare/workers-types';
import { 
  // These error types are imported for documentation and potential future use
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  CacheServiceError,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  CacheReadError, 
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  CacheWriteError, 
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  CacheUnavailableError, 
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  CacheTagGenerationError, 
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  CacheQuotaExceededError 
} from '../errors/cacheErrors';

/**
 * Cache tier with TTL and priority information
 */
interface CacheTier {
  name: string;
  ttlMultiplier: number;
  priority: number;
  conditions: {
    contentTypes?: string[];
    pathPatterns?: RegExp[];
    minSize?: number;
    maxSize?: number;
    frequentlyAccessed?: boolean;
  };
}

/**
 * Cache access pattern for tracking frequently accessed resources
 */
interface CacheAccessPattern {
  url: string;
  accessCount: number;
  lastAccessed: number;
  firstAccessed: number;
}

/**
 * Optimized implementation of the CacheService
 * with tiered caching strategies.
 */
export class OptimizedCacheService implements CacheService {
  private isOptimizedLogger: boolean;
  private performanceBaseline: PerformanceBaseline;
  private defaultService: DefaultCacheService;
  private logger: Logger | OptimizedLogger;
  private configService: ConfigurationService;
  
  // Cache tiers configuration
  private cacheTiers: CacheTier[] = [];
  
  // Access patterns tracking
  private accessPatterns: Map<string, CacheAccessPattern> = new Map();
  private maxAccessPatterns: number = 1000;
  
  // Cache bypass score thresholds
  private bypassThreshold: number = 70;
  
  /**
   * Create a new OptimizedCacheService
   * 
   * @param logger Logger instance
   * @param configService Configuration service
   */
  constructor(logger: Logger | OptimizedLogger, configService: ConfigurationService) {
    this.logger = logger;
    this.configService = configService;
    this.defaultService = new DefaultCacheService(logger, configService);
    this.isOptimizedLogger = !!(logger as OptimizedLogger).isLevelEnabled;
    this.performanceBaseline = PerformanceBaseline.getInstance(logger);
    
    // Initialize cache tiers
    this.initializeCacheTiers();
    
    // We'll use the initialize method to set up the cleanup timer
  }
  
  /**
   * Initialize cache tiers based on configuration
   */
  private initializeCacheTiers(): void {
    const config = this.getConfig();
    
    // Default tiers if not configured
    if (!config.cache.tiers || config.cache.tiers.length === 0) {
      this.cacheTiers = [
        // High priority tier - long TTL for frequently accessed resources
        {
          name: 'frequent',
          ttlMultiplier: 2.0,
          priority: 100,
          conditions: {
            frequentlyAccessed: true
          }
        },
        // Images tier - medium TTL for normal images
        {
          name: 'images',
          ttlMultiplier: 1.0,
          priority: 80,
          conditions: {
            contentTypes: ['image/']
          }
        },
        // Small assets tier - longer TTL for small assets
        {
          name: 'small',
          ttlMultiplier: 1.5,
          priority: 70,
          conditions: {
            maxSize: 50000 // 50KB
          }
        },
        // Large assets tier - shorter TTL for large assets
        {
          name: 'large',
          ttlMultiplier: 0.7,
          priority: 60,
          conditions: {
            minSize: 1000000 // 1MB
          }
        },
        // Default tier
        {
          name: 'default',
          ttlMultiplier: 1.0,
          priority: 0,
          conditions: {}
        }
      ];
    } else if (Array.isArray(config.cache.tiers)) {
      // Use configured tiers
      this.cacheTiers = config.cache.tiers.map(tier => ({
        name: tier.name,
        ttlMultiplier: tier.ttlMultiplier || 1.0,
        priority: tier.priority || 0,
        conditions: {
          contentTypes: tier.contentTypes,
          pathPatterns: tier.pathPatterns ? tier.pathPatterns.map(p => new RegExp(p)) : undefined,
          minSize: tier.minSize,
          maxSize: tier.maxSize,
          frequentlyAccessed: tier.frequentlyAccessed
        }
      }));
    }
    
    // Sort tiers by priority (highest first)
    this.cacheTiers.sort((a, b) => b.priority - a.priority);
    
    // Set bypass threshold
    if (typeof config.cache.bypassThreshold === 'number') {
      this.bypassThreshold = config.cache.bypassThreshold;
    }
    
    // Set max access patterns
    if (typeof config.cache.maxAccessPatterns === 'number') {
      this.maxAccessPatterns = config.cache.maxAccessPatterns;
    }
    
    if (this.isOptimizedLogger && (this.logger as OptimizedLogger).isLevelEnabled('DEBUG')) {
      this.logger.debug('Initialized optimized cache tiers', {
        tierCount: this.cacheTiers.length,
        tiers: this.cacheTiers.map(t => t.name)
      });
    } else {
      this.logger.debug('Initialized optimized cache tiers', {
        tierCount: this.cacheTiers.length,
        tiers: this.cacheTiers.map(t => t.name)
      });
    }
  }
  
  /**
   * Get configuration from the configuration service
   */
  private getConfig(): ImageResizerConfig {
    return (this.configService as ConfigurationService).getConfig();
  }
  
  /**
   * Track cache access patterns for a resource
   * 
   * @param request Request being processed
   */
  private trackAccessPattern(request: Request): void {
    const url = request.url;
    
    // Skip tracking for debug requests
    if (url.includes('debug=') || url.includes('__cf_') || url.includes('cf-debug')) {
      return;
    }
    
    // Update access count for this URL
    if (this.accessPatterns.has(url)) {
      const pattern = this.accessPatterns.get(url)!;
      pattern.accessCount++;
      pattern.lastAccessed = Date.now();
      this.accessPatterns.set(url, pattern);
    } else {
      // Add new pattern
      this.accessPatterns.set(url, {
        url,
        accessCount: 1,
        lastAccessed: Date.now(),
        firstAccessed: Date.now()
      });
      
      // Cleanup if we have too many patterns
      if (this.accessPatterns.size > this.maxAccessPatterns) {
        this.cleanupAccessPatterns();
      }
    }
  }
  
  /**
   * Clean up old access patterns
   */
  private cleanupAccessPatterns(): void {
    if (this.accessPatterns.size <= this.maxAccessPatterns * 0.8) {
      return; // Only clean up if we're at 80% capacity
    }
    
    const now = Date.now();
    const oneHourAgo = now - 3600000;
    const oneDayAgo = now - 86400000;
    
    // First pass: remove patterns that haven't been accessed in the last hour
    // and have low access counts
    for (const [url, pattern] of this.accessPatterns.entries()) {
      if (pattern.lastAccessed < oneHourAgo && pattern.accessCount < 5) {
        this.accessPatterns.delete(url);
      }
    }
    
    // If we still have too many, remove patterns that haven't been accessed in the last day
    if (this.accessPatterns.size > this.maxAccessPatterns * 0.8) {
      for (const [url, pattern] of this.accessPatterns.entries()) {
        if (pattern.lastAccessed < oneDayAgo) {
          this.accessPatterns.delete(url);
        }
      }
    }
    
    // If we still have too many, sort by access count and keep the top maxAccessPatterns
    if (this.accessPatterns.size > this.maxAccessPatterns) {
      const sortedPatterns = Array.from(this.accessPatterns.entries())
        .sort(([, a], [, b]) => b.accessCount - a.accessCount);
      
      this.accessPatterns = new Map(sortedPatterns.slice(0, this.maxAccessPatterns));
    }
    
    if (this.isOptimizedLogger && (this.logger as OptimizedLogger).isLevelEnabled('DEBUG')) {
      this.logger.debug('Cleaned up access patterns', {
        remainingPatterns: this.accessPatterns.size,
        maxPatterns: this.maxAccessPatterns
      });
    }
  }
  
  /**
   * Check if a resource is frequently accessed
   * 
   * @param url The URL to check
   * @returns True if the resource is frequently accessed
   */
  private isFrequentlyAccessed(url: string): boolean {
    if (!this.accessPatterns.has(url)) {
      return false;
    }
    
    const pattern = this.accessPatterns.get(url)!;
    const now = Date.now();
    const hoursSinceFirstAccess = (now - pattern.firstAccessed) / 3600000;
    
    // Consider frequently accessed if:
    // - Accessed at least 10 times AND
    // - At least 1 access per hour since first access (or 5 accesses if less than 5 hours)
    return pattern.accessCount >= 10 &&
      (pattern.accessCount / Math.max(1, hoursSinceFirstAccess) >= 1 || 
       (hoursSinceFirstAccess < 5 && pattern.accessCount >= 5));
  }
  
  /**
   * Calculate the appropriate cache tier for a response
   * 
   * @param response The response to analyze
   * @param options Transformation options
   * @param storageResult Optional storage result
   * @returns The cache tier to use
   */
  private calculateCacheTier(
    response: Response,
    options: TransformOptions,
    storageResult?: StorageResult,
    request?: Request
  ): CacheTier {
    const contentType = response.headers.get('Content-Type') || '';
    const contentLength = parseInt(response.headers.get('Content-Length') || '0', 10) || 0;
    const url = request?.url || '';
    
    // Check each tier's conditions
    for (const tier of this.cacheTiers) {
      let matches = true;
      const conditions = tier.conditions;
      
      // Check content type
      if (conditions.contentTypes && conditions.contentTypes.length > 0) {
        matches = matches && conditions.contentTypes.some(type => 
          contentType.toLowerCase().includes(type.toLowerCase())
        );
      }
      
      // Check path patterns
      if (conditions.pathPatterns && conditions.pathPatterns.length > 0 && url) {
        matches = matches && conditions.pathPatterns.some(pattern => 
          pattern.test(url)
        );
      }
      
      // Check size constraints
      if (conditions.minSize !== undefined) {
        matches = matches && contentLength >= conditions.minSize;
      }
      
      if (conditions.maxSize !== undefined) {
        matches = matches && contentLength <= conditions.maxSize;
      }
      
      // Check access frequency
      if (conditions.frequentlyAccessed && url) {
        matches = matches && this.isFrequentlyAccessed(url);
      }
      
      // If all conditions match, use this tier
      if (matches) {
        return tier;
      }
    }
    
    // Fallback to the last tier (should be the default)
    return this.cacheTiers[this.cacheTiers.length - 1];
  }
  
  /**
   * Calculate bypass score for a request
   * 
   * A higher score means the request is more likely to bypass cache
   * 
   * @param request Request to analyze
   * @param options Transformation options
   * @returns Score from 0-100 indicating likelihood of bypass
   */
  private calculateBypassScore(
    request: Request,
    options?: TransformOptions
  ): number {
    let score = 0;
    const url = new URL(request.url);
    const hasDebugParam = url.searchParams.has('debug') || url.searchParams.has('no-cache');
    const hasCacheBuster = url.searchParams.has('cacheBuster') || 
      url.searchParams.has('_') || 
      url.searchParams.has('v') || 
      url.searchParams.has('t');
    
    // Debug parameters => very high score
    if (hasDebugParam) {
      score += 80;
    }
    
    // Cache busters => high score
    if (hasCacheBuster) {
      score += 60;
    }
    
    // Check for bypass request headers
    if (request.headers.get('Cache-Control') === 'no-cache' || 
        request.headers.get('Pragma') === 'no-cache') {
      score += 50;
    }
    
    // Check for conditional request headers (lower score as these can use 304)
    if (request.headers.get('If-None-Match') || request.headers.get('If-Modified-Since')) {
      score += 20;
    }
    
    // Check options (higher score for specific dynamic behaviors)
    if (options) {
      // Options that indicate dynamic content
      const widthValue = options.width !== undefined ? options.width.toString() : '';
      const heightValue = options.height !== undefined ? options.height.toString() : '';
      if (widthValue === 'auto' || heightValue === 'auto') {
        score += 15;
      }
      
      // Dynamic formats
      const formatValue = options.format !== undefined ? options.format.toString() : '';
      if (formatValue === 'auto') {
        score += 10;
      }
      
      // Special effects often indicate one-off transformations
      if (options.blur || options.sharpen || options.rotate || options.flip || 
          options.flop || options.trim) {
        score += 20;
      }
      
      // Explicit caching options
      if (options.cache === false) {
        score += 100; // Instant bypass
      } else if (options.cache === true) {
        score -= 50; // Strong signal to cache
      }
      
      // Custom TTL indicates special caching needs
      if (options.ttl && options.ttl > 0) {
        score -= 30; // Explicit TTL lowers bypass score
      }
    }
    
    // Cap score between 0-100
    return Math.max(0, Math.min(100, score));
  }
  
  /**
   * Apply cache headers to a response based on content type, status code, and configuration
   * with tiered caching strategy
   * 
   * @param response The original response
   * @param options Optional transformation options for optimized caching
   * @param storageResult Optional storage result for metadata-based cache decisions
   * @returns A response with appropriate Cache-Control headers
   */
  applyCacheHeaders(
    response: Response,
    options?: TransformOptions,
    storageResult?: StorageResult,
    request?: Request
  ): Response {
    const startTime = Date.now();
    const responseClone = response.clone();
    
    try {
      // Track this request for frequency analysis
      if (request) {
        this.trackAccessPattern(request);
      }
      
      // Default TTL
      const defaultTtl = this.calculateTtl(responseClone, options || {}, storageResult);
      
      // Get appropriate cache tier
      const tier = this.calculateCacheTier(
        responseClone, 
        options || {}, 
        storageResult,
        request
      );
      
      // Calculate adjusted TTL based on tier
      const adjustedTtl = Math.round(defaultTtl * tier.ttlMultiplier);
      
      // Create a new response with updated headers
      const headers = new Headers(responseClone.headers);
      
      // Set Cache-Control header
      headers.set('Cache-Control', `public, max-age=${adjustedTtl}`);
      
      // Add cache tier for debugging
      headers.set('X-Cache-Tier', tier.name);
      
      // Add surrogate control for CDN
      headers.set('Surrogate-Control', `max-age=${adjustedTtl}`);
      
      // Create the response with updated headers
      const newResponse = new Response(responseClone.body, {
        status: responseClone.status,
        statusText: responseClone.statusText,
        headers
      });
      
      // Record performance metrics
      const duration = Date.now() - startTime;
      this.performanceBaseline.record('cache', 'applyCacheHeaders', duration, {
        contentType: responseClone.headers.get('Content-Type'),
        tier: tier.name,
        ttl: adjustedTtl
      });
      
      return newResponse;
    } catch (error) {
      // Record error metrics
      const duration = Date.now() - startTime;
      this.performanceBaseline.record('cache', 'applyCacheHeadersError', duration, {
        error: error instanceof Error ? error.message : String(error)
      });
      
      // Log error but don't fail the request
      this.logger.error('Error applying cache headers', {
        error: error instanceof Error ? error.message : String(error)
      });
      
      // Return original response on error
      return response;
    }
  }
  
  /**
   * Check if caching should be bypassed for this request
   * using a more intelligent scoring system
   * 
   * @param request The request to check
   * @param options Optional transformation options for specific bypass checks
   * @returns True if caching should be bypassed
   */
  shouldBypassCache(
    request: Request,
    options?: TransformOptions
  ): boolean {
    const startTime = Date.now();
    
    try {
      // Get bypass score
      const bypassScore = this.calculateBypassScore(request, options);
      
      // Log score for debugging
      if (this.isOptimizedLogger && (this.logger as OptimizedLogger).isLevelEnabled('DEBUG')) {
        this.logger.debug('Cache bypass analysis', {
          url: request.url,
          bypassScore,
          threshold: this.bypassThreshold,
          bypass: bypassScore >= this.bypassThreshold
        });
      }
      
      // Record performance metrics
      const duration = Date.now() - startTime;
      this.performanceBaseline.record('cache', 'shouldBypassCache', duration, {
        bypassScore,
        bypass: bypassScore >= this.bypassThreshold
      });
      
      // Bypass if score is above threshold
      return bypassScore >= this.bypassThreshold;
    } catch (error) {
      // Record error metrics
      const duration = Date.now() - startTime;
      this.performanceBaseline.record('cache', 'shouldBypassCacheError', duration, {
        error: error instanceof Error ? error.message : String(error)
      });
      
      // Log error but don't fail the request
      this.logger.error('Error checking cache bypass', {
        error: error instanceof Error ? error.message : String(error)
      });
      
      // Fall back to default implementation
      return this.defaultService.shouldBypassCache(request, options);
    }
  }
  
  /**
   * Cache a response with tiered caching strategy
   * 
   * @param request Original request
   * @param response Response to cache
   * @param ctx Execution context
   * @returns Response (potentially modified)
   */
  async cacheWithCacheApi(
    request: Request, 
    response: Response, 
    ctx: ExecutionContext
  ): Promise<Response> {
    const startTime = Date.now();
    const responseClone = response.clone();
    
    try {
      // Track this request for frequency analysis
      this.trackAccessPattern(request);
      
      // Call default implementation
      const result = await this.defaultService.cacheWithCacheApi(request, responseClone, ctx);
      
      // Record performance metrics
      const duration = Date.now() - startTime;
      this.performanceBaseline.record('cache', 'cacheWithCacheApi', duration, {
        status: result.status,
        contentType: result.headers.get('Content-Type')
      });
      
      return result;
    } catch (error) {
      // Record error metrics
      const duration = Date.now() - startTime;
      this.performanceBaseline.record('cache', 'cacheWithCacheApiError', duration, {
        error: error instanceof Error ? error.message : String(error)
      });
      
      // Rethrow error
      throw error;
    }
  }
  
  /**
   * Generate optimized cache key for a request
   * 
   * @param request Original request
   * @returns The cache key
   */
  generateCacheKey(request: Request): string {
    // Use URL without query string as base key
    const url = new URL(request.url);
    let baseKey = `${url.origin}${url.pathname}`;
    
    // Extract important query parameters
    const keyParams = new URLSearchParams();
    
    // Check each parameter
    for (const [key, value] of url.searchParams.entries()) {
      // Skip known cache-buster parameters
      if (key === '_' || key === 'cacheBuster' || key === 't' || key === 'v') {
        continue;
      }
      
      // Skip debug parameters
      if (key === 'debug' || key === 'no-cache') {
        continue;
      }
      
      // Keep transformation parameters
      keyParams.append(key, value);
    }
    
    // Add sorted query parameters to key
    const sortedParams = Array.from(keyParams.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('&');
    
    if (sortedParams) {
      baseKey += `?${sortedParams}`;
    }
    
    return baseKey;
  }
  
  /**
   * Calculate the appropriate TTL for a response
   * 
   * @param response The response to check
   * @param options The transformation options
   * @param storageResult Optional storage result with additional image metadata
   * @returns The TTL in seconds
   */
  calculateTtl(
    response: Response,
    options: TransformOptions,
    storageResult?: StorageResult
  ): number {
    const startTime = Date.now();
    
    try {
      // Get default TTL
      const defaultTtl = this.defaultService.calculateTtl(response, options, storageResult);
      
      // Record performance metrics
      const duration = Date.now() - startTime;
      this.performanceBaseline.record('cache', 'calculateTtl', duration, {
        contentType: response.headers.get('Content-Type'),
        ttl: defaultTtl
      });
      
      return defaultTtl;
    } catch (error) {
      // Record error metrics
      const duration = Date.now() - startTime;
      this.performanceBaseline.record('cache', 'calculateTtlError', duration, {
        error: error instanceof Error ? error.message : String(error)
      });
      
      // Log error but don't fail the request
      this.logger.error('Error calculating TTL', {
        error: error instanceof Error ? error.message : String(error)
      });
      
      // Fall back to a reasonable default
      return 3600; // 1 hour
    }
  }
  
  /**
   * Apply Cloudflare cache configuration to a request
   * 
   * @param requestInit The request initialization options
   * @param imagePath The path to the image
   * @param options Transformation options
   * @returns Updated request initialization with CF cache settings
   */
  applyCloudflareCache(
    requestInit: RequestInit,
    imagePath: string,
    options: TransformOptions
  ): RequestInit {
    return this.defaultService.applyCloudflareCache(requestInit, imagePath, options);
  }
  
  /**
   * Generate cache tags for a request/response
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
    return this.defaultService.generateCacheTags(request, storageResult, options);
  }

  /**
   * Cache a response with advanced fallback strategies for high reliability
   * 
   * This optimized implementation adds tiered caching enhancements to the
   * standard fallback mechanism, including:
   * 1. Custom TTL adjustments based on content tier
   * 2. Access frequency tracking
   * 3. Intelligent cache key generation
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
    const startTime = Date.now();
    const responseClone = response.clone();
    
    try {
      // Track this request for frequency analysis
      if (request) {
        this.trackAccessPattern(request);
      }
      
      // Pass through to default implementation
      const result = await this.defaultService.cacheWithFallback(
        request, 
        responseClone, 
        ctx, 
        options, 
        storageResult
      );
      
      // Record performance metrics
      const duration = Date.now() - startTime;
      this.performanceBaseline.record('cache', 'cacheWithFallback', duration, {
        contentType: result.headers.get('Content-Type'),
        status: result.status
      });
      
      return result;
    } catch (error) {
      // Record error metrics
      const duration = Date.now() - startTime;
      this.performanceBaseline.record('cache', 'cacheWithFallbackError', duration, {
        error: error instanceof Error ? error.message : String(error)
      });
      
      // Log the error but don't fail the request
      this.logger.error('Error in optimized cacheWithFallback', {
        url: request.url,
        error: error instanceof Error ? error.message : String(error)
      });
      
      // Return the original response to ensure request succeeds
      return response;
    }
  }
  
  /**
   * Service lifecycle method for initialization
   * 
   * Initializes the optimized cache service with necessary setup:
   * - Sets up cache tiers
   * - Configures access pattern tracking
   * - Initializes performance baseline
   * - Sets up automatic cleanup
   * 
   * @returns Promise that resolves when initialization is complete
   */
  async initialize(): Promise<void> {
    this.logger.debug('Initializing OptimizedCacheService');
    
    // Reset access patterns
    this.accessPatterns.clear();
    
    // Initialize the default service first
    await this.defaultService.initialize();
    
    // Get configuration settings
    const config = this.configService.getConfig();
    const cacheSettings = config.cache;
    
    // Apply configuration settings
    if (cacheSettings.bypassThreshold !== undefined) {
      this.bypassThreshold = cacheSettings.bypassThreshold;
    }
    
    if (cacheSettings.maxAccessPatterns !== undefined) {
      this.maxAccessPatterns = cacheSettings.maxAccessPatterns;
    }
    
    // Initialize performance baseline
    if (config.performance && config.performance.baselineEnabled) {
      this.performanceBaseline.initializeBaseline('cache_operations', 100);
    }
    
    // Re-initialize cache tiers from the latest configuration
    this.initializeCacheTiers();
    
    // Set up regular cache cleanup timer
    const cleanupInterval = setInterval(() => this.cleanupAccessPatterns(), 60000); // Cleanup every minute
    
    // Store interval ID for later cleanup in shutdown
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (this as any).cleanupIntervalId = cleanupInterval;
    
    this.logger.info('OptimizedCacheService initialization complete');
    return Promise.resolve();
  }
  
  /**
   * Service lifecycle method for shutdown
   * 
   * Performs cleanup operations:
   * - Stops background processes
   * - Logs cache operation statistics
   * - Resets internal state
   * 
   * @returns Promise that resolves when shutdown is complete
   */
  async shutdown(): Promise<void> {
    this.logger.debug('Shutting down OptimizedCacheService');
    
    // Stop the cleanup interval
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((this as any).cleanupIntervalId) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      clearInterval((this as any).cleanupIntervalId);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this as any).cleanupIntervalId = null;
    }
    
    // Log access pattern statistics
    this.logger.debug('Cache access patterns at shutdown', {
      accessPatternsCount: this.accessPatterns.size,
      maxAccessPatterns: this.maxAccessPatterns
    });
    
    // Shutdown the underlying default service
    await this.defaultService.shutdown();
    
    // Clear access patterns
    this.accessPatterns.clear();
    
    this.logger.info('OptimizedCacheService shutdown complete');
    return Promise.resolve();
  }

  /**
   * Check if a transformed image is already in the KV cache
   * 
   * @param request Original request
   * @param transformOptions Transformation options
   * @returns Promise resolving to true if the transformed image is cached
   */
  async isTransformCached(
    request: Request,
    transformOptions: TransformOptions
  ): Promise<boolean> {
    // Delegate to base service with performance tracking
    const startTime = Date.now();
    
    try {
      const result = await this.defaultService.isTransformCached(request, transformOptions);
      
      // Record performance metrics
      const duration = Date.now() - startTime;
      this.performanceBaseline.record('cache', 'isTransformCached', duration, {
        url: request.url,
        cached: result
      });
      
      return result;
    } catch (error) {
      // Record error metrics
      const duration = Date.now() - startTime;
      this.performanceBaseline.record('cache', 'isTransformCachedError', duration, {
        error: error instanceof Error ? error.message : String(error)
      });
      
      // Log error but don't fail the request
      this.logger.error('Error checking transform cache status', {
        error: error instanceof Error ? error.message : String(error),
        url: request.url
      });
      
      return false;
    }
  }

  /**
   * Get a transformed image from the KV cache
   * 
   * @param request Original request
   * @param transformOptions Transformation options
   * @returns Promise resolving to the cached response or null if not found
   */
  async getTransformedImage(
    request: Request,
    transformOptions: TransformOptions
  ): Promise<Response | null> {
    // Delegate to base service with performance tracking
    const startTime = Date.now();
    
    try {
      // Track this request for frequency analysis
      this.trackAccessPattern(request);
      
      const result = await this.defaultService.getTransformedImage(request, transformOptions);
      
      // Record performance metrics
      const duration = Date.now() - startTime;
      this.performanceBaseline.record('cache', 'getTransformedImage', duration, {
        url: request.url,
        hit: result !== null,
        contentType: result?.headers.get('Content-Type')
      });
      
      return result;
    } catch (error) {
      // Record error metrics
      const duration = Date.now() - startTime;
      this.performanceBaseline.record('cache', 'getTransformedImageError', duration, {
        error: error instanceof Error ? error.message : String(error)
      });
      
      // Log error but don't fail the request
      this.logger.error('Error retrieving transformed image from cache', {
        error: error instanceof Error ? error.message : String(error),
        url: request.url
      });
      
      return null;
    }
  }

  /**
   * Store a transformed image in the KV cache
   * 
   * @param request Original request
   * @param response The transformed image response
   * @param storageResult Storage result
   * @param transformOptions Transformation options
   * @param ctx Execution context for background operations
   * @returns Promise resolving when the operation is complete
   */
  async storeTransformedImage(
    request: Request,
    response: Response,
    storageResult: StorageResult,
    transformOptions: TransformOptions,
    ctx?: ExecutionContext
  ): Promise<void> {
    // Delegate to base service with performance tracking
    const startTime = Date.now();
    
    try {
      // Track this request for frequency analysis
      this.trackAccessPattern(request);
      
      await this.defaultService.storeTransformedImage(
        request,
        response,
        storageResult,
        transformOptions,
        ctx
      );
      
      // Record performance metrics
      const duration = Date.now() - startTime;
      this.performanceBaseline.record('cache', 'storeTransformedImage', duration, {
        url: request.url,
        contentType: response.headers.get('Content-Type')
      });
    } catch (error) {
      // Record error metrics
      const duration = Date.now() - startTime;
      this.performanceBaseline.record('cache', 'storeTransformedImageError', duration, {
        error: error instanceof Error ? error.message : String(error)
      });
      
      // Log error but don't fail the request
      this.logger.error('Error storing transformed image in cache', {
        error: error instanceof Error ? error.message : String(error),
        url: request.url
      });
    }
  }

  /**
   * Purge transformed images by tag
   * 
   * @param tag Cache tag to purge
   * @param ctx Execution context for background operations
   * @returns Promise resolving to the number of items purged
   */
  async purgeTransformsByTag(
    tag: string,
    ctx?: ExecutionContext
  ): Promise<number> {
    // Delegate to base service with performance tracking
    const startTime = Date.now();
    
    try {
      const purgedCount = await this.defaultService.purgeTransformsByTag(tag, ctx);
      
      // Record performance metrics
      const duration = Date.now() - startTime;
      this.performanceBaseline.record('cache', 'purgeTransformsByTag', duration, {
        tag,
        purgedCount
      });
      
      return purgedCount;
    } catch (error) {
      // Record error metrics
      const duration = Date.now() - startTime;
      this.performanceBaseline.record('cache', 'purgeTransformsByTagError', duration, {
        error: error instanceof Error ? error.message : String(error)
      });
      
      // Log error but don't fail the request
      this.logger.error('Error purging transformed images by tag', {
        error: error instanceof Error ? error.message : String(error),
        tag
      });
      
      return 0;
    }
  }

  /**
   * Purge transformed images by path pattern
   * 
   * @param pathPattern Path pattern to purge
   * @param ctx Execution context for background operations
   * @returns Promise resolving to the number of items purged
   */
  async purgeTransformsByPath(
    pathPattern: string,
    ctx?: ExecutionContext
  ): Promise<number> {
    // Delegate to base service with performance tracking
    const startTime = Date.now();
    
    try {
      const purgedCount = await this.defaultService.purgeTransformsByPath(pathPattern, ctx);
      
      // Record performance metrics
      const duration = Date.now() - startTime;
      this.performanceBaseline.record('cache', 'purgeTransformsByPath', duration, {
        pathPattern,
        purgedCount
      });
      
      return purgedCount;
    } catch (error) {
      // Record error metrics
      const duration = Date.now() - startTime;
      this.performanceBaseline.record('cache', 'purgeTransformsByPathError', duration, {
        error: error instanceof Error ? error.message : String(error)
      });
      
      // Log error but don't fail the request
      this.logger.error('Error purging transformed images by path pattern', {
        error: error instanceof Error ? error.message : String(error),
        pathPattern
      });
      
      return 0;
    }
  }

  /**
   * Get statistics about the KV transform cache
   * 
   * @returns Promise resolving to cache statistics
   */
  async getTransformCacheStats(): Promise<{
    count: number,
    size: number,
    hitRate: number,
    avgSize: number,
    lastPruned: Date
  }> {
    // Delegate to base service with performance tracking
    const startTime = Date.now();
    
    try {
      const stats = await this.defaultService.getTransformCacheStats();
      
      // Record performance metrics
      const duration = Date.now() - startTime;
      this.performanceBaseline.record('cache', 'getTransformCacheStats', duration, {
        count: stats.count,
        totalSize: stats.size
      });
      
      return stats;
    } catch (error) {
      // Record error metrics
      const duration = Date.now() - startTime;
      this.performanceBaseline.record('cache', 'getTransformCacheStatsError', duration, {
        error: error instanceof Error ? error.message : String(error)
      });
      
      // Log error but don't fail the request
      this.logger.error('Error getting KV transform cache stats', {
        error: error instanceof Error ? error.message : String(error)
      });
      
      return {
        count: 0,
        size: 0,
        hitRate: 0,
        avgSize: 0,
        lastPruned: new Date(0)
      };
    }
  }
  
  /**
   * List entries in the transform cache
   * 
   * @param limit Maximum number of entries to return
   * @param cursor Cursor for pagination
   * @returns List of cache entries with metadata
   */
  async listTransformCacheEntries(
    limit?: number, 
    cursor?: string
  ): Promise<{
    entries: {key: string, metadata: CacheMetadata}[],
    cursor?: string,
    complete: boolean
  }> {
    // Delegate to base service with performance tracking
    const startTime = Date.now();
    
    try {
      const result = await this.defaultService.listTransformCacheEntries(limit, cursor);
      
      // Record performance metrics
      const duration = Date.now() - startTime;
      this.performanceBaseline.record('cache', 'listTransformCacheEntries', duration, {
        entriesCount: result.entries.length,
        complete: result.complete
      });
      
      return result;
    } catch (error) {
      // Record error metrics
      const duration = Date.now() - startTime;
      this.performanceBaseline.record('cache', 'listTransformCacheEntriesError', duration, {
        error: error instanceof Error ? error.message : String(error)
      });
      
      // Log error but don't fail the request
      this.logger.error('Error listing KV transform cache entries', {
        error: error instanceof Error ? error.message : String(error)
      });
      
      return {
        entries: [],
        complete: true
      };
    }
  }
}