/**
 * Fallback implementations for cache components
 * 
 * These are used as a last resort if the main implementations fail to load
 * or initialize properly.
 */

import { Logger } from '../../utils/logging';
import { ConfigurationService, StorageResult, TransformOptions } from '../interfaces';

/**
 * Fallback implementation of PathPatternTTLCalculator
 * 
 * This is used if the main implementation is not available for some reason,
 * providing basic functionality to prevent application crashes.
 */
export class PathPatternTTLCalculatorFallback {
  private logger: Logger;
  
  constructor(logger: Logger, _configService: ConfigurationService) {
    this.logger = logger;
    this.logger.warn("Using fallback PathPatternTTLCalculator implementation", {
      reason: "Main implementation could not be loaded",
      impact: "Cache TTLs will use simple defaults instead of path patterns"
    });
  }
  
  /**
   * Calculate TTL with a simple fallback approach that uses status codes only
   * 
   * @param response The HTTP response
   * @returns TTL in seconds
   */
  calculateTtl(
    response: Response, 
    _options: TransformOptions, 
    _storageResult?: StorageResult
  ): number {
    // Log that we're using the fallback
    this.logger.debug("Using fallback TTL calculator", {
      status: response.status,
      url: "unavailable in fallback"
    });
    
    // Simple TTL calculation based on status code
    const statusCategory = Math.floor(response.status / 100);
    
    switch (statusCategory) {
      case 2: // Success (200-299)
        return 300; // 5 minutes
      case 3: // Redirect (300-399)
        return 60;  // 1 minute
      case 4: // Client error (400-499)
        return 10;  // 10 seconds
      case 5: // Server error (500-599)
        return 5;   // 5 seconds
      default:
        return 30;  // 30 seconds default
    }
  }
  
  /**
   * Update patterns (no-op in fallback)
   */
  updatePatterns(_patterns: any[]): void {
    this.logger.warn("Attempt to update patterns in fallback TTL calculator", {
      impact: "Patterns will not be updated, using defaults"
    });
  }
}