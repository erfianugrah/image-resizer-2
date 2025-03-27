/**
 * Optimized Detector Service Implementation
 * 
 * An optimized version of the detector service that minimizes
 * allocations and uses faster algorithms for performance critical paths.
 */

import { 
  ClientDetectionService, 
  ClientInfo, 
  TransformOptions 
} from './interfaces';
import { ImageResizerConfig } from '../config';
import { Logger } from '../utils/logging';
import { DetectorServiceImpl } from './detectorService';

/**
 * Optimized implementation of the client detection service
 * Extends the base implementation with performance optimizations
 */
export class OptimizedDetectorService extends DetectorServiceImpl implements ClientDetectionService {
  // Specialized caching strategy
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
   * Optimized format support detection
   * Uses specialized caching for common format checks
   * 
   * @param request Original request
   * @param format Format to check support for (webp, avif, etc.)
   * @returns True if format is supported
   */
  override async supportsFormat(request: Request, format: string): Promise<boolean> {
    const normalizedFormat = format.toLowerCase();
    const userAgent = request.headers.get('user-agent') || '';
    
    // Use specialized caches for common formats
    if (normalizedFormat === 'webp') {
      if (this.acceptsWebpCache.has(userAgent)) {
        return this.acceptsWebpCache.get(userAgent) || false;
      }
      
      const result = await super.supportsFormat(request, normalizedFormat);
      this.acceptsWebpCache.set(userAgent, result);
      return result;
    }
    
    if (normalizedFormat === 'avif') {
      if (this.acceptsAvifCache.has(userAgent)) {
        return this.acceptsAvifCache.get(userAgent) || false;
      }
      
      const result = await super.supportsFormat(request, normalizedFormat);
      this.acceptsAvifCache.set(userAgent, result);
      return result;
    }
    
    // Fall back to standard implementation for other formats
    return super.supportsFormat(request, normalizedFormat);
  }
  
  /**
   * Clear all caches including specialized format caches
   */
  override clearCache(): void {
    super.clearCache();
    this.acceptsWebpCache.clear();
    this.acceptsAvifCache.clear();
  }
}