/**
 * Optimized Client Detection Service
 * 
 * Provides client detection with request-scoped caching and batch detection
 * to reduce redundant operations during request processing.
 */

import { ImageResizerConfig } from '../config';
import { ClientDetectionService, ClientInfo, TransformOptions } from './interfaces';
import { Logger } from '../utils/logging';
import { OptimizedLogger } from '../utils/optimized-logging';
import { detector, ClientCapabilities } from '../utils/detector';
import { DefaultClientDetectionService } from './clientDetectionService';

/**
 * Request cache for storing detection results within a single request
 */
interface RequestCache {
  clientInfo?: ClientInfo;
  formatSupport?: Record<string, boolean>;
  deviceClassification?: 'high-end' | 'mid-range' | 'low-end';
  networkQuality?: 'fast' | 'medium' | 'slow';
  capabilities?: ClientCapabilities;
  optimizedOptions?: Map<string, TransformOptions>;
}

/**
 * Optimized implementation of the ClientDetectionService interface
 * with request-scoped caching.
 */
export class OptimizedClientDetectionService implements ClientDetectionService {
  private logger: Logger | OptimizedLogger;
  private defaultService: DefaultClientDetectionService;
  private requestCaches: Map<string, RequestCache> = new Map();
  private maxCacheSize: number = 100;
  private isOptimizedLogger: boolean;
  
  /**
   * Create a new OptimizedClientDetectionService
   * 
   * @param logger Logger instance
   */
  constructor(logger: Logger | OptimizedLogger) {
    this.logger = logger;
    this.defaultService = new DefaultClientDetectionService(logger);
    this.isOptimizedLogger = !!(logger as OptimizedLogger).isLevelEnabled;
    
    // Set up cache cleanup
    setInterval(() => this.cleanupCache(), 60000); // Cleanup every minute
  }
  
  /**
   * Configure the client detection service
   * 
   * @param config Configuration options
   */
  configure(config: ImageResizerConfig): void {
    // Configure the default service first
    this.defaultService.configure(config);
    
    // Set cache size from config
    if (config.detector?.cache?.maxSize) {
      this.maxCacheSize = config.detector.cache.maxSize;
    }
    
    if (this.isOptimizedLogger && (this.logger as OptimizedLogger).isLevelEnabled('DEBUG')) {
      this.logger.debug('Optimized client detection service configured', {
        maxCacheSize: this.maxCacheSize
      });
    } else if (!this.isOptimizedLogger) {
      this.logger.debug('Optimized client detection service configured', {
        maxCacheSize: this.maxCacheSize
      });
    }
  }
  
  /**
   * Get cache key for a request
   * 
   * @param request The request to generate key for
   * @returns Cache key
   */
  private getCacheKey(request: Request): string {
    // Use a stable subset of headers as the cache key
    const cacheHeaders = [
      'User-Agent',
      'Accept', 
      'Viewport-Width', 
      'DPR', 
      'Save-Data',
      'Sec-CH-UA',
      'Sec-CH-UA-Mobile',
      'Sec-CH-UA-Platform',
      'Sec-CH-Viewport-Width',
      'Sec-CH-DPR'
    ];
    
    // Create key from relevant headers
    const headerValues = cacheHeaders.map(header => {
      const value = request.headers.get(header);
      return value ? `${header}:${value}` : '';
    }).filter(Boolean).join('|');
    
    // Include URL without query parameters (just hostname + path)
    const url = new URL(request.url);
    const urlKey = `${url.hostname}${url.pathname}`;
    
    return `${urlKey}|${headerValues}`;
  }
  
  /**
   * Get or create request cache for a request
   * 
   * @param request The request to get cache for
   * @returns Request cache object
   */
  private getRequestCache(request: Request): RequestCache {
    const key = this.getCacheKey(request);
    
    if (!this.requestCaches.has(key)) {
      // Create new cache entry
      this.requestCaches.set(key, {});
      
      // Cleanup if cache is too large
      if (this.requestCaches.size > this.maxCacheSize) {
        this.cleanupCache();
      }
    }
    
    return this.requestCaches.get(key)!;
  }
  
  /**
   * Cleanup old cache entries
   */
  private cleanupCache(): void {
    if (this.requestCaches.size <= this.maxCacheSize) {
      return;
    }
    
    // Get cache keys sorted by age (using Map insertion order)
    const keys = Array.from(this.requestCaches.keys());
    const keysToRemove = keys.slice(0, Math.floor(this.maxCacheSize * 0.2)); // Remove oldest 20%
    
    // Remove old entries
    for (const key of keysToRemove) {
      this.requestCaches.delete(key);
    }
    
    if (this.isOptimizedLogger && (this.logger as OptimizedLogger).isLevelEnabled('DEBUG')) {
      this.logger.debug('Cleaned up client detection cache', {
        removedEntries: keysToRemove.length,
        remainingEntries: this.requestCaches.size
      });
    } else if (!this.isOptimizedLogger) {
      this.logger.debug('Cleaned up client detection cache', {
        removedEntries: keysToRemove.length,
        remainingEntries: this.requestCaches.size
      });
    }
  }
  
  /**
   * Detect client information from the request with caching
   * 
   * @param request Original request
   * @returns Client information
   */
  async detectClient(request: Request): Promise<ClientInfo> {
    // Check request cache first
    const cache = this.getRequestCache(request);
    
    if (cache.clientInfo) {
      if (this.isOptimizedLogger && (this.logger as OptimizedLogger).isLevelEnabled('DEBUG')) {
        this.logger.debug('Using cached client info');
      } else if (!this.isOptimizedLogger) {
        this.logger.debug('Using cached client info');
      }
      return cache.clientInfo;
    }
    
    if (this.isOptimizedLogger && (this.logger as OptimizedLogger).isLevelEnabled('DEBUG')) {
      this.logger.debug('Cache miss for client info, detecting');
    } else if (!this.isOptimizedLogger) {
      this.logger.debug('Cache miss for client info, detecting');
    }
    
    try {
      // Cache underlying capabilities to avoid redundant detection
      if (!cache.capabilities) {
        cache.capabilities = await detector.detect(request, true);
      }
      
      // Use the default service to create client info from capabilities
      const clientInfo = await this.defaultService.detectClient(request);
      
      // Store in cache
      cache.clientInfo = clientInfo;
      
      return clientInfo;
    } catch (error) {
      if (this.isOptimizedLogger && (this.logger as OptimizedLogger).isLevelEnabled('WARN')) {
        this.logger.warn('Error detecting client information', {
          error: error instanceof Error ? error.message : String(error)
        });
      } else if (!this.isOptimizedLogger) {
        this.logger.warn('Error detecting client information', {
          error: error instanceof Error ? error.message : String(error)
        });
      }
      
      // Fallback to default service
      return this.defaultService.detectClient(request);
    }
  }
  
  /**
   * Get optimized transformation options based on client capabilities with caching
   * 
   * @param request Original request
   * @param baseOptions Base transformation options
   * @param config Application configuration
   * @returns Optimized transformation options
   */
  async getOptimizedOptions(
    request: Request,
    baseOptions: TransformOptions,
    config: ImageResizerConfig
  ): Promise<TransformOptions> {
    // Check request cache first
    const cache = this.getRequestCache(request);
    
    if (!cache.optimizedOptions) {
      cache.optimizedOptions = new Map();
    }
    
    // Create a simple key for the baseOptions
    const optionsKey = JSON.stringify(baseOptions);
    
    // Check cache for this specific options combination
    if (cache.optimizedOptions.has(optionsKey)) {
      if (this.isOptimizedLogger && (this.logger as OptimizedLogger).isLevelEnabled('DEBUG')) {
        this.logger.debug('Using cached optimized options');
      } else if (!this.isOptimizedLogger) {
        this.logger.debug('Using cached optimized options');
      }
      return cache.optimizedOptions.get(optionsKey)!;
    }
    
    if (this.isOptimizedLogger && (this.logger as OptimizedLogger).isLevelEnabled('DEBUG')) {
      this.logger.debug('Cache miss for optimized options, generating');
    } else if (!this.isOptimizedLogger) {
      this.logger.debug('Cache miss for optimized options, generating');
    }
    
    try {
      // Get optimized options from default service
      const optimizedOptions = await this.defaultService.getOptimizedOptions(
        request,
        baseOptions,
        config
      );
      
      // Store in cache
      cache.optimizedOptions.set(optionsKey, optimizedOptions);
      
      return optimizedOptions;
    } catch (error) {
      if (this.isOptimizedLogger && (this.logger as OptimizedLogger).isLevelEnabled('WARN')) {
        this.logger.warn('Error generating optimized options', {
          error: error instanceof Error ? error.message : String(error)
        });
      } else if (!this.isOptimizedLogger) {
        this.logger.warn('Error generating optimized options', {
          error: error instanceof Error ? error.message : String(error)
        });
      }
      
      // Fallback to base options
      return baseOptions;
    }
  }
  
  /**
   * Batch check format support for multiple formats
   * 
   * @param request Original request
   * @param formats Array of formats to check
   * @returns Object with format support results
   */
  async getFormatSupport(request: Request, formats: string[]): Promise<Record<string, boolean>> {
    // Check request cache first
    const cache = this.getRequestCache(request);
    
    // Initialize format support cache if needed
    if (!cache.formatSupport) {
      cache.formatSupport = {};
    }
    
    // Check which formats we need to detect
    const missingFormats = formats.filter(format => cache.formatSupport![format] === undefined);
    
    // If all formats are in cache, return cached result
    if (missingFormats.length === 0) {
      // Create result from cache
      const result: Record<string, boolean> = {};
      for (const format of formats) {
        result[format] = cache.formatSupport![format];
      }
      
      if (this.isOptimizedLogger && (this.logger as OptimizedLogger).isLevelEnabled('DEBUG')) {
        this.logger.debug('Using cached format support for all formats');
      } else if (!this.isOptimizedLogger) {
        this.logger.debug('Using cached format support for all formats');
      }
      
      return result;
    }
    
    if (this.isOptimizedLogger && (this.logger as OptimizedLogger).isLevelEnabled('DEBUG')) {
      this.logger.debug(`Cache miss for ${missingFormats.length} formats, detecting`, {
        formats: missingFormats.join(',')
      });
    } else if (!this.isOptimizedLogger) {
      this.logger.debug(`Cache miss for ${missingFormats.length} formats, detecting`, {
        formats: missingFormats.join(',')
      });
    }
    
    try {
      // Check missing formats
      for (const format of missingFormats) {
        const isSupported = await this.defaultService.supportsFormat(request, format);
        cache.formatSupport![format] = isSupported;
      }
      
      // Create result from cache
      const result: Record<string, boolean> = {};
      for (const format of formats) {
        result[format] = cache.formatSupport![format];
      }
      
      return result;
    } catch (error) {
      if (this.isOptimizedLogger && (this.logger as OptimizedLogger).isLevelEnabled('WARN')) {
        this.logger.warn('Error detecting format support', {
          error: error instanceof Error ? error.message : String(error)
        });
      } else if (!this.isOptimizedLogger) {
        this.logger.warn('Error detecting format support', {
          error: error instanceof Error ? error.message : String(error)
        });
      }
      
      // Fallback to safe defaults for common formats
      const result: Record<string, boolean> = {};
      for (const format of formats) {
        // Only JPEG/PNG/GIF are universally supported
        result[format] = ['jpeg', 'jpg', 'png', 'gif'].includes(format.toLowerCase());
      }
      
      return result;
    }
  }
  
  /**
   * Check if client supports a specific format with caching
   * 
   * @param request Original request
   * @param format Format to check
   * @returns True if format is supported
   */
  async supportsFormat(request: Request, format: string): Promise<boolean> {
    // Use our batch support method for efficient checking
    const support = await this.getFormatSupport(request, [format]);
    return support[format] || false;
  }
  
  /**
   * Get device classification with caching
   * 
   * @param request Original request
   * @returns Device classification
   */
  async getDeviceClassification(request: Request): Promise<'high-end' | 'mid-range' | 'low-end'> {
    // Check request cache first
    const cache = this.getRequestCache(request);
    
    if (cache.deviceClassification) {
      if (this.isOptimizedLogger && (this.logger as OptimizedLogger).isLevelEnabled('DEBUG')) {
        this.logger.debug('Using cached device classification');
      } else if (!this.isOptimizedLogger) {
        this.logger.debug('Using cached device classification');
      }
      return cache.deviceClassification;
    }
    
    if (this.isOptimizedLogger && (this.logger as OptimizedLogger).isLevelEnabled('DEBUG')) {
      this.logger.debug('Cache miss for device classification, detecting');
    } else if (!this.isOptimizedLogger) {
      this.logger.debug('Cache miss for device classification, detecting');
    }
    
    try {
      // Get from default service
      const classification = await this.defaultService.getDeviceClassification(request);
      
      // Store in cache
      cache.deviceClassification = classification;
      
      return classification;
    } catch (error) {
      if (this.isOptimizedLogger && (this.logger as OptimizedLogger).isLevelEnabled('WARN')) {
        this.logger.warn('Error detecting device classification', {
          error: error instanceof Error ? error.message : String(error)
        });
      } else if (!this.isOptimizedLogger) {
        this.logger.warn('Error detecting device classification', {
          error: error instanceof Error ? error.message : String(error)
        });
      }
      
      // Fallback to mid-range
      return 'mid-range';
    }
  }
  
  /**
   * Get network quality with caching
   * 
   * @param request Original request
   * @returns Network quality
   */
  async getNetworkQuality(request: Request): Promise<'fast' | 'medium' | 'slow'> {
    // Check request cache first
    const cache = this.getRequestCache(request);
    
    if (cache.networkQuality) {
      if (this.isOptimizedLogger && (this.logger as OptimizedLogger).isLevelEnabled('DEBUG')) {
        this.logger.debug('Using cached network quality');
      } else if (!this.isOptimizedLogger) {
        this.logger.debug('Using cached network quality');
      }
      return cache.networkQuality;
    }
    
    if (this.isOptimizedLogger && (this.logger as OptimizedLogger).isLevelEnabled('DEBUG')) {
      this.logger.debug('Cache miss for network quality, detecting');
    } else if (!this.isOptimizedLogger) {
      this.logger.debug('Cache miss for network quality, detecting');
    }
    
    try {
      // Get from default service
      const quality = await this.defaultService.getNetworkQuality(request);
      
      // Store in cache
      cache.networkQuality = quality;
      
      return quality;
    } catch (error) {
      if (this.isOptimizedLogger && (this.logger as OptimizedLogger).isLevelEnabled('WARN')) {
        this.logger.warn('Error detecting network quality', {
          error: error instanceof Error ? error.message : String(error)
        });
      } else if (!this.isOptimizedLogger) {
        this.logger.warn('Error detecting network quality', {
          error: error instanceof Error ? error.message : String(error)
        });
      }
      
      // Fallback to medium
      return 'medium';
    }
  }
  
  /**
   * Clear all caches
   */
  clearCache(): void {
    this.requestCaches.clear();
    this.defaultService.clearCache();
    
    if (this.isOptimizedLogger && (this.logger as OptimizedLogger).isLevelEnabled('DEBUG')) {
      this.logger.debug('Cleared client detection caches');
    } else if (!this.isOptimizedLogger) {
      this.logger.debug('Cleared client detection caches');
    }
  }
}