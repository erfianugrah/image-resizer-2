/**
 * Optimized Detector Service Implementation
 * 
 * An optimized version of the detector service that minimizes
 * allocations and uses faster algorithms for performance critical paths.
 */

import { 
  ClientDetectionService, 
  // These types are imported for type compatibility with the interface
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  ClientInfo, 
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  TransformOptions 
} from './interfaces';
import { ImageResizerConfig } from '../config';
import { Logger } from '../utils/logging';
import { DetectorServiceImpl } from './detectorService';

/**
 * Browser capabilities cache entry with format support and expiration
 */
interface BrowserCapabilities {
  supportsWebP: boolean;
  supportsAVIF: boolean;
  lastUpdated: number;
}

/**
 * Optimized implementation of the client detection service
 * Extends the base implementation with performance optimizations
 */
export class OptimizedDetectorService extends DetectorServiceImpl implements ClientDetectionService {
  // Browser signature-based capability caching with time-based expiration
  private browserCapabilitiesCache: Map<string, BrowserCapabilities> = new Map();
  private readonly CACHE_TTL = 86400000; // 24 hours in ms
  
  // Legacy specialized format caches (retained for backward compatibility)
  private acceptsWebpCache: Map<string, boolean> = new Map();
  private acceptsAvifCache: Map<string, boolean> = new Map();
  
  /**
   * Create a new optimized detector service
   * 
   * @param logger Logger instance for logging
   */
  constructor(logger: Logger) {
    super(logger);
    
    // Initialize specialized caches
    this.acceptsWebpCache = new Map();
    this.acceptsAvifCache = new Map();
    this.browserCapabilitiesCache = new Map();
  }
  
  /**
   * Configure the client detection service with optimized settings
   * 
   * @param config Application configuration
   */
  override configure(config: ImageResizerConfig): void {
    super.configure(config);
    
    // Apply additional optimized configuration
    // For now, we just pass through to the parent
  }
  
  /**
   * Extract meaningful browser signature from the request
   * Creates a compact signature that groups similar browsers together
   * to reduce cache size while maintaining high accuracy
   * 
   * @param request The original request
   * @returns Browser signature string
   */
  private getBrowserSignature(request: Request): string {
    const ua = request.headers.get('user-agent') || '';
    
    // Extract browser family and major version instead of using full UA
    // This reduces cache size while maintaining accuracy
    const browserMatch = ua.match(/(Chrome|Firefox|Safari|Edge|MSIE|Trident|Opera)\/(\d+)/i);
    
    if (browserMatch) {
      const browserFamily = browserMatch[1].toLowerCase();
      const majorVersion = parseInt(browserMatch[2], 10);
      
      // Include mobile/desktop distinction for more accurate format support
      const isMobile = /mobile|android|iphone|ipad|ipod/i.test(ua);
      const deviceType = isMobile ? 'mobile' : 'desktop';
      
      return `${browserFamily}_${majorVersion}_${deviceType}`;
    }
    
    // For unknown browsers, use a truncated hash of the UA to prevent cache explosion
    return `unknown_${ua.substring(0, 50).replace(/\s+/g, '')}`;
  }
  
  /**
   * Optimized format support detection
   * Uses browser signature-based capabilities cache with time-based expiration
   * 
   * @param request Original request
   * @param format Format to check support for (webp, avif, etc.)
   * @returns True if format is supported
   */
  override async supportsFormat(request: Request, format: string): Promise<boolean> {
    const normalizedFormat = format.toLowerCase();
    const browserSignature = this.getBrowserSignature(request);
    const now = Date.now();
    
    // Check persistent browser capabilities cache with time-based expiration
    if (this.browserCapabilitiesCache.has(browserSignature)) {
      const cached = this.browserCapabilitiesCache.get(browserSignature)!;
      
      // Use cached value if not expired
      if (now - cached.lastUpdated < this.CACHE_TTL) {
        if (normalizedFormat === 'webp') {
          return cached.supportsWebP;
        }
        if (normalizedFormat === 'avif') {
          return cached.supportsAVIF;
        }
      }
    }
    
    // Legacy cache access for backward compatibility and transition period
    const userAgent = request.headers.get('user-agent') || '';
    if (normalizedFormat === 'webp' && this.acceptsWebpCache.has(userAgent)) {
      return this.acceptsWebpCache.get(userAgent) || false;
    }
    if (normalizedFormat === 'avif' && this.acceptsAvifCache.has(userAgent)) {
      return this.acceptsAvifCache.get(userAgent) || false;
    }
    
    // Cache miss or expired - detect capabilities
    const result = await super.supportsFormat(request, normalizedFormat);
    
    // Update both caches for a smooth transition
    // 1. Update old format-specific cache (will be deprecated later)
    if (normalizedFormat === 'webp') {
      this.acceptsWebpCache.set(userAgent, result);
    } else if (normalizedFormat === 'avif') {
      this.acceptsAvifCache.set(userAgent, result);
    }
    
    // 2. Update browser capabilities cache
    const capabilities = this.browserCapabilitiesCache.get(browserSignature) || {
      supportsWebP: false,
      supportsAVIF: false,
      lastUpdated: now
    };
    
    if (normalizedFormat === 'webp') {
      capabilities.supportsWebP = result;
    } else if (normalizedFormat === 'avif') {
      capabilities.supportsAVIF = result;
    }
    
    capabilities.lastUpdated = now;
    this.browserCapabilitiesCache.set(browserSignature, capabilities);
    
    return result;
  }
  
  /**
   * Clear all caches including specialized format caches
   */
  override clearCache(): void {
    super.clearCache();
    this.acceptsWebpCache.clear();
    this.acceptsAvifCache.clear();
    this.browserCapabilitiesCache.clear();
  }
  
  /**
   * Service lifecycle method for initialization
   * Initializes the optimized detector service
   */
  async initialize(): Promise<void> {
    // No parent initialization to call since DetectorServiceImpl doesn't implement it
    
    // No external storage loading yet, but could be added in the future
    // to persist browser capabilities across worker restarts
    
    // Using the logger directly since it's protected in the base class
    const logger = this.getLogger();
    logger.debug('Optimized detector service initialized', {
      cacheTTL: Math.round(this.CACHE_TTL / 3600000) + 'h'
    });
    
    return Promise.resolve();
  }
  
  /**
   * Service lifecycle method for shutdown
   * Performs cleanup operations
   */
  async shutdown(): Promise<void> {
    // No parent shutdown to call since DetectorServiceImpl doesn't implement it
    
    const logger = this.getLogger();
    logger.debug('Optimized detector cache stats at shutdown', {
      browserCapabilitiesCount: this.browserCapabilitiesCache.size,
      webpCacheCount: this.acceptsWebpCache.size,
      avifCacheCount: this.acceptsAvifCache.size
    });
    
    // Clear all caches to free memory
    this.browserCapabilitiesCache.clear();
    this.acceptsWebpCache.clear();
    this.acceptsAvifCache.clear();
    
    logger.debug('Optimized detector service shutdown');
    
    return Promise.resolve();
  }
  
  /**
   * Access the logger from the base class
   * Helper method to workaround access to private logger
   */
  private getLogger(): Logger {
    // Cast to any to access the protected logger
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (this as any).logger;
  }
}