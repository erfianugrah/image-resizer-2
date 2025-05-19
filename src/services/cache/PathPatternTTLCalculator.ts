/**
 * Path Pattern TTL Calculator
 * 
 * Implements advanced path pattern-based TTL determination using regex patterns,
 * similar to the approach used in video-resizer.
 */

import { Logger } from "../../utils/logging";
import {
  ConfigurationService,
  StorageResult,
  TransformOptions,
} from "../interfaces";
import { RequestContext, getCurrentContext, addBreadcrumb } from "../../utils/requestContext";
import { CacheServiceError } from "../../errors/cacheErrors";

/**
 * Interface defining a path pattern rule for TTL determination
 */
export interface PathPattern {
  name: string;         // Pattern name for identification
  matcher: string;      // Regular expression pattern as string
  ttl: {                // TTL configuration for matched paths
    ok: number;         // TTL for successful responses (2xx)
    redirects?: number; // TTL for redirects (3xx)
    clientError?: number; // TTL for client errors (4xx)
    serverError?: number; // TTL for server errors (5xx)
  };
  priority?: number;    // Pattern priority (higher numbers take precedence) 
  description?: string; // Optional description for documentation
}

export class PathPatternTTLCalculator {
  private logger: Logger;
  private configService: ConfigurationService;
  private pathPatterns: PathPattern[] = [];
  private defaultPattern: PathPattern | null = null;
  private initialized: boolean = false;

  constructor(logger: Logger, configService: ConfigurationService) {
    this.logger = logger;
    this.configService = configService;
    this.initialize();
  }

  /**
   * Initialize the calculator by loading path patterns from configuration
   */
  private initialize(): void {
    try {
      const config = this.configService.getConfig();
      
      // Check if path patterns are defined in configuration
      if (config.cache.pathPatterns && Array.isArray(config.cache.pathPatterns)) {
        // Load patterns from configuration
        this.pathPatterns = config.cache.pathPatterns;
        
        // Sort patterns by priority (higher values first)
        this.pathPatterns.sort((a, b) => 
          (b.priority || 0) - (a.priority || 0)
        );
        
        // Find default pattern
        this.defaultPattern = this.pathPatterns.find(p => p.name === 'default') || null;
        
        this.logger.info("Path pattern TTL calculator initialized", {
          patternCount: this.pathPatterns.length,
          hasDefaultPattern: !!this.defaultPattern,
          patterns: this.pathPatterns.map(p => p.name).join(', ')
        });
      } else {
        // Create default pattern from basic TTL config
        this.defaultPattern = {
          name: 'default',
          matcher: '.*',
          ttl: {
            ok: config.cache.ttl.ok,
            clientError: config.cache.ttl.clientError,
            serverError: config.cache.ttl.serverError
          }
        };
        
        this.logger.info("Path pattern TTL calculator using default pattern only", {
          defaultTtlOk: config.cache.ttl.ok,
          defaultTtlClientError: config.cache.ttl.clientError,
          defaultTtlServerError: config.cache.ttl.serverError
        });
      }
      
      this.initialized = true;
    } catch (error) {
      this.logger.error("Failed to initialize path pattern TTL calculator", {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      throw new CacheServiceError("Failed to initialize path pattern TTL calculator", { 
        code: 'TTL_CALCULATOR_INIT_ERROR',
        details: {
          error: error instanceof Error ? error.message : String(error)
        }
      });
    }
  }

  /**
   * Calculate TTL based on path patterns, response status, and content type
   * 
   * @param response The HTTP response
   * @param options Transform options
   * @param storageResult Storage result with path information
   * @returns TTL in seconds
   */
  calculateTtl(
    response: Response,
    options: TransformOptions,
    storageResult?: StorageResult,
  ): number {
    const requestContext = getCurrentContext();
    const path = storageResult?.path || (options.path as string) || '';
    const status = response.status;
    const statusCategory = Math.floor(status / 100);
    
    // Add breadcrumb for TTL calculation start if context is available
    if (requestContext) {
      addBreadcrumb(requestContext, 'TTLCalculation', 'Starting path pattern TTL calculation', {
        path,
        status,
        statusCategory,
        hasStorageResult: !!storageResult
      });
    }
    
    this.logger.debug("Calculating TTL using path patterns", {
      path,
      status,
      statusCategory,
      patternCount: this.pathPatterns.length,
      hasDefaultPattern: !!this.defaultPattern
    });
    
    // Initialize result with default values
    let ttlConfig = null;
    let matchedPattern = null;
    
    // If we don't have a path, use default TTL
    if (!path) {
      this.logger.debug("No path available, using default TTL", {
        defaultTtl: this.defaultPattern?.ttl
      });
      
      ttlConfig = this.defaultPattern?.ttl || { 
        ok: 300,         // 5 minutes
        redirects: 300,  // 5 minutes
        clientError: 60, // 1 minute
        serverError: 10  // 10 seconds
      };
    } else {
      // Try to match against path patterns
      for (const pattern of this.pathPatterns) {
        // Skip the default pattern, we'll use it as fallback
        if (pattern.name === 'default') continue;

        if (pattern.matcher) {
          try {
            const regex = new RegExp(pattern.matcher);
            if (regex.test(path)) {
              ttlConfig = pattern.ttl;
              matchedPattern = pattern;
              
              this.logger.debug("Using TTL from specific path pattern", {
                path,
                patternName: pattern.name || 'unnamed',
                ttl: ttlConfig,
                matcher: pattern.matcher,
                source: 'path-pattern'
              });
              
              // Add breadcrumb for pattern match if context is available
              if (requestContext) {
                addBreadcrumb(requestContext, 'TTLCalculation', 'Matched path pattern', {
                  path,
                  patternName: pattern.name,
                  source: 'path-pattern'
                });
              }
              
              break;
            }
          } catch (err) {
            // If regex is invalid, log and continue
            this.logger.warn("Invalid regex in path pattern", {
              patternName: pattern.name || 'unnamed',
              matcher: pattern.matcher,
              error: err instanceof Error ? err.message : String(err)
            });
          }
        }
      }
      
      // If no specific pattern matched, use the default pattern
      if (!ttlConfig && this.defaultPattern?.ttl) {
        ttlConfig = this.defaultPattern.ttl;
        matchedPattern = this.defaultPattern;
        
        this.logger.debug("Using default path pattern TTL", {
          path,
          ttl: ttlConfig,
          source: 'default-path-pattern'
        });
        
        // Add breadcrumb for default pattern if context is available
        if (requestContext) {
          addBreadcrumb(requestContext, 'TTLCalculation', 'Using default path pattern', {
            path,
            source: 'default-path-pattern'
          });
        }
      }
    }
    
    // If no pattern matched at all, use hardcoded default values
    const defaultTTLs = {
      ok: 300,         // 5 minutes
      redirects: 300,  // 5 minutes
      clientError: 60, // 1 minute
      serverError: 10  // 10 seconds
    };
    
    if (!ttlConfig) {
      ttlConfig = defaultTTLs;
      this.logger.warn("No matching pattern or default pattern found, using hardcoded defaults", {
        path,
        defaultTTLs
      });
      
      // Add breadcrumb for fallback to hardcoded defaults if context is available
      if (requestContext) {
        addBreadcrumb(requestContext, 'TTLCalculation', 'Using hardcoded default TTLs', {
          source: 'hardcoded-defaults'
        });
      }
    }
    
    // Determine TTL based on status code and matched configuration
    let finalTTL: number;
    
    switch (statusCategory) {
      case 2: // Success (200-299)
        finalTTL = ttlConfig.ok;
        break;
      case 3: // Redirect (300-399)
        finalTTL = ttlConfig.redirects || ttlConfig.ok;
        break;
      case 4: // Client error (400-499)
        finalTTL = ttlConfig.clientError || defaultTTLs.clientError;
        break;
      case 5: // Server error (500-599)
        finalTTL = ttlConfig.serverError || defaultTTLs.serverError;
        break;
      default:
        // Fallback for unexpected status categories
        finalTTL = ttlConfig.clientError || defaultTTLs.clientError;
    }
    
    // Apply derivative-specific TTL adjustments if applicable
    if (options?.derivative && matchedPattern) {
      const config = this.configService.getConfig();
      if (config.cache.derivativeTTLs && config.cache.derivativeTTLs[options.derivative]) {
        // Get derivative-specific TTL
        const derivativeTTL = config.cache.derivativeTTLs[options.derivative];
        
        // Apply the derivative TTL, but don't exceed the matched pattern's max TTL
        const originalTTL = finalTTL;
        finalTTL = derivativeTTL;
        
        this.logger.debug("Applied derivative-specific TTL", {
          derivative: options.derivative,
          originalTTL,
          derivativeTTL,
          finalTTL
        });
        
        // Add breadcrumb for derivative TTL adjustment if context is available
        if (requestContext) {
          addBreadcrumb(requestContext, 'TTLCalculation', 'Applied derivative-specific TTL', {
            derivative: options.derivative,
            originalTTL,
            derivativeTTL,
            finalTTL
          });
        }
      }
    }
    
    // Apply content type specific TTL adjustments
    const contentType = response.headers.get("Content-Type") || "";
    if (contentType && this.shouldAdjustForContentType(contentType)) {
      const adjustedTTL = this.adjustTTLForContentType(finalTTL, contentType);
      
      if (adjustedTTL !== finalTTL) {
        this.logger.debug("Adjusted TTL based on content type", {
          contentType,
          originalTTL: finalTTL,
          adjustedTTL
        });
        
        // Add breadcrumb for content type adjustment if context is available
        if (requestContext) {
          addBreadcrumb(requestContext, 'TTLCalculation', 'Adjusted TTL for content type', {
            contentType,
            originalTTL: finalTTL,
            adjustedTTL
          });
        }
        
        finalTTL = adjustedTTL;
      }
    }
    
    // Log the final TTL decision
    this.logger.debug("Final TTL determination", {
      path,
      status,
      contentType,
      patternName: matchedPattern?.name || 'none',
      finalTTL,
      derivative: options?.derivative || 'none'
    });
    
    // Add breadcrumb for final TTL if context is available
    if (requestContext) {
      addBreadcrumb(requestContext, 'TTLCalculation', 'Determined final TTL', {
        path,
        patternName: matchedPattern?.name || 'none',
        finalTTL,
        status
      });
    }
    
    return finalTTL;
  }
  
  /**
   * Check if TTL should be adjusted based on content type
   */
  private shouldAdjustForContentType(contentType: string): boolean {
    // We only adjust for specific content types
    return (
      contentType.includes('image/') || 
      contentType.includes('video/') ||
      contentType.includes('application/json')
    );
  }
  
  /**
   * Adjust TTL based on content type
   */
  private adjustTTLForContentType(ttl: number, contentType: string): number {
    // Get the base format from content type
    const format = contentType.split('/')[1]?.split(';')[0]?.toLowerCase();
    if (!format) return ttl;
    
    // Adjustments for image formats
    if (contentType.includes('image/')) {
      switch (format) {
        case 'svg+xml':
          // SVGs are vector and rarely change
          return Math.max(ttl, 86400 * 14); // 2 weeks minimum
        
        case 'avif':
        case 'webp':
          // Modern formats indicate optimization focus, can cache longer
          return Math.max(ttl, 86400 * 7); // 1 week minimum
          
        case 'gif':
          // GIFs might be animations, slightly shorter TTL
          return Math.min(ttl, 86400 * 3); // 3 days maximum
      }
    } 
    // Adjustments for video formats
    else if (contentType.includes('video/')) {
      switch (format) {
        case 'mp4':
          // Standard videos, can be cached longer
          return Math.max(ttl, 86400 * 3); // 3 days minimum
          
        case 'webm':
          // Modern format, often indicates optimization focus
          return Math.max(ttl, 86400 * 5); // 5 days minimum
      }
    }
    
    // No adjustment needed
    return ttl;
  }
  
  /**
   * Update path patterns from configuration
   * This method allows for hot reloading of TTL patterns
   */
  updatePatterns(patterns: PathPattern[]): void {
    this.pathPatterns = patterns;
    
    // Sort patterns by priority (higher values first)
    this.pathPatterns.sort((a, b) => 
      (b.priority || 0) - (a.priority || 0)
    );
    
    // Find default pattern
    this.defaultPattern = this.pathPatterns.find(p => p.name === 'default') || null;
    
    this.logger.info("Updated path pattern TTL calculator", {
      patternCount: this.pathPatterns.length,
      hasDefaultPattern: !!this.defaultPattern,
      patterns: this.pathPatterns.map(p => p.name).join(', ')
    });
  }
}