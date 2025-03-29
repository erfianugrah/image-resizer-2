/**
 * CacheTagsManager Module
 * 
 * Responsible for generating and managing cache tags for content to enable
 * more granular cache purging and organization.
 */

import { Logger } from "../../utils/logging";
import {
  ConfigurationService,
  StorageResult,
  TransformOptions,
} from "../interfaces";
import { CacheTagGenerationError } from "../../errors/cacheErrors";

export class CacheTagsManager {
  // Type guard for Request
  private isRequest(obj: unknown): obj is Request {
    return obj instanceof Request;
  }
  private logger: Logger;
  private configService: ConfigurationService;

  constructor(logger: Logger, configService: ConfigurationService) {
    this.logger = logger;
    this.configService = configService;
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
    options: TransformOptions,
  ): string[] {
    try {
      this.logger.debug("CacheTagsManager module generating cache tags", {
        path: storageResult.path,
        sourceType: storageResult.sourceType,
        moduleInstance: "CacheTagsManager"
      });
      
      const config = this.configService.getConfig();

      // Check if cache tags are enabled
      if (!config.cache.cacheTags?.enabled) {
        this.logger.debug("Cache tags are disabled");
        return [];
      }

      const tags: string[] = [];
      const prefix = config.cache.cacheTags?.prefix || "";
      // Get maximum tags configuration or use default
      const maxTags = config.cache.cacheTags?.maxTags || 20;
      // Check if we should use simplified tags
      const useSimplifiedTags = config.cache.cacheTags?.simplifiedTags === true;
      const url = new URL(request.url);

      // Add path-based tags
      if (storageResult.path) {
        // Get normalization patterns from config
        const leadingSlashPattern = config.cache.cacheTags?.pathNormalization?.leadingSlashPattern || '^/+';
        const invalidCharsPattern = config.cache.cacheTags?.pathNormalization?.invalidCharsPattern || '[^a-zA-Z0-9-_/.]';
        const replacementChar = config.cache.cacheTags?.pathNormalization?.replacementChar || '-';
        
        // Normalize path consistently with debugService
        const normalizedPath = storageResult.path
          .replace(new RegExp(leadingSlashPattern), '') // Remove leading slashes
          .replace(new RegExp(invalidCharsPattern, 'g'), replacementChar) // Replace special chars
          .split('/')
          .filter(Boolean);
        
        // Add unified path tag
        tags.push(`${prefix}path-${normalizedPath.join('-')}`);
        
        // Add filename tag if simplified tags or add segment tags if not simplified
        const filename = normalizedPath[normalizedPath.length - 1];
        if (filename && useSimplifiedTags) {
          tags.push(`${prefix}file-${filename}`);
        } else if (normalizedPath.length > 0 && !useSimplifiedTags) {
          // Add each path segment as a tag with its position for more granular purging
          normalizedPath.forEach((segment, index) => {
            // Only add segment tags if they're reasonably sized
            if (segment.length < 50) {
              tags.push(`${prefix}segment-${index}-${segment}`);
            }
          });

          // Add directory tags for content organization
          if (normalizedPath.length > 1) {
            // Get parent directory
            const directory = normalizedPath.slice(0, -1).join('/');
            tags.push(`${prefix}dir-${directory}`);
          }
          
          // Add filename as a separate tag
          if (filename) {
            tags.push(`${prefix}file-${filename}`);
          }
        }
      }

      // Add content-type based tags
      if (storageResult.contentType && !useSimplifiedTags) {
        const contentTypeParts = storageResult.contentType.split('/');
        if (contentTypeParts.length === 2) {
          const [category, subtype] = contentTypeParts;
          
          // Add main content type category
          tags.push(`${prefix}type-${category}`);
          
          // Add full content type
          tags.push(`${prefix}content-${category}-${subtype}`);
        } else {
          // Fallback for irregular content types
          tags.push(`${prefix}content-${storageResult.contentType.replace(/[^a-zA-Z0-9-_/.]/g, "-")}`);
        }
      } else if (storageResult.contentType && useSimplifiedTags) {
        // For simplified tags, just add the main type
        const contentTypeParts = storageResult.contentType.split('/');
        if (contentTypeParts.length > 0) {
          // Always include the type tag with consistent format
          tags.push(`${prefix}type-${contentTypeParts[0]}`);
        }
      }

      // Add source type tags if not using simplified tags
      if (storageResult.sourceType && !useSimplifiedTags) {
        tags.push(`${prefix}origin-${storageResult.sourceType}`);
      }

      // Add transformation option tags
      if (options.format) {
        tags.push(`${prefix}format-${options.format}`);
      }

      if (options.width) {
        // Always add the width tag
        tags.push(`${prefix}width-${options.width}`);
        
        // Add bucket tag only if not using simplified tags
        if (!useSimplifiedTags) {
          const widthBucket = this.getSizeBucket(options.width);
          tags.push(`${prefix}width-bucket-${widthBucket}`);
        }
      }

      if (options.height) {
        // Always add the height tag
        tags.push(`${prefix}height-${options.height}`);
        
        // Add bucket tag only if not using simplified tags
        if (!useSimplifiedTags) {
          const heightBucket = this.getSizeBucket(options.height);
          tags.push(`${prefix}height-bucket-${heightBucket}`);
        }
      }

      if (options.quality) {
        tags.push(`${prefix}quality-${options.quality}`);
      }

      if (options.fit) {
        tags.push(`${prefix}fit-${options.fit}`);
      }

      if (options.derivative) {
        tags.push(`${prefix}derivative-${options.derivative}`);
      }

      // If using simplified tags, skip all these additional tags
      if (!useSimplifiedTags) {
        // Add host-based tags for cross-domain purging
        if (url.hostname) {
          tags.push(`${prefix}host-${url.hostname.replace(/[^a-zA-Z0-9-_.]/g, "-")}`);
        }
  
        // Add custom tags from query string
        const customTags = url.searchParams.get('cache-tags');
        if (customTags) {
          customTags.split(',').forEach(tag => {
            const sanitizedTag = tag.trim().replace(/[^a-zA-Z0-9-_/.]/g, "-");
            if (sanitizedTag) {
              tags.push(`${prefix}custom-${sanitizedTag}`);
            }
          });
        }
  
        // Add tenant tags if present in options or request
        const tenant = options.tenant || url.searchParams.get('tenant');
        if (tenant) {
          tags.push(`${prefix}tenant-${tenant.replace(/[^a-zA-Z0-9-_/.]/g, "-")}`);
        }
  
        // Add size bucket tag based on file size if available
        if (storageResult.size) {
          const sizeBucket = this.getFileSizeBucket(storageResult.size);
          tags.push(`${prefix}size-${sizeBucket}`);
        }
  
        // Add hash-based tag if a hash property exists
        // Type assertion used since hash is not defined in StorageResult interface
        const extendedResult = storageResult as StorageResult & { hash?: string };
        if (extendedResult.hash) {
          tags.push(`${prefix}hash-${extendedResult.hash}`);
        }
  
        // Add date-based tag for time-based purging strategies
        const now = new Date();
        const datePart = now.toISOString().split('T')[0]; // YYYY-MM-DD
        tags.push(`${prefix}date-${datePart}`);
  
        // Add feature flags from options
        if (options.features && Array.isArray(options.features)) {
          options.features.forEach(feature => {
            tags.push(`${prefix}feature-${feature}`);
          });
        }
  
        // Add watermark tag if used
        if (options.watermark) {
          tags.push(`${prefix}watermarked`);
          if (typeof options.watermark === 'string') {
            tags.push(`${prefix}watermark-${options.watermark.replace(/[^a-zA-Z0-9-_/.]/g, "-")}`);
          }
        }
  
        // Add environment tag
        const environment = process.env.NODE_ENV || 'development';
        tags.push(`${prefix}env-${environment}`);
      }

      // Add custom tags from configuration
      if (config.cache.cacheTags?.customTags && Array.isArray(config.cache.cacheTags.customTags)) {
        config.cache.cacheTags.customTags.forEach(customTag => {
          if (typeof customTag === 'string') {
            tags.push(`${prefix}${customTag}`);
          }
        });
      }
      
      // Add path-based tags for group purging
      if (config.cache.cacheTags?.pathBasedTags && storageResult.path) {
        // Get path without leading slash for matching
        const normalizedPath = storageResult.path.replace(/^\/+/, '');
        
        // Check each path pattern for matches
        Object.entries(config.cache.cacheTags.pathBasedTags).forEach(([pattern, tagGroup]) => {
          // More sophisticated matching based on the pattern type
          let isMatch = false;
          
          // Check if it's a segment-prefixed pattern (e.g., "products/")
          if (pattern.endsWith('/')) {
            // It's a directory prefix - match if normalized path starts with this pattern
            isMatch = normalizedPath.startsWith(pattern);
          } else if (pattern.startsWith('^') && pattern.includes('$')) {
            // It's a regex pattern - test against the path
            try {
              const regex = new RegExp(pattern);
              isMatch = regex.test(normalizedPath);
            } catch (e) {
              // If regex is invalid, fall back to simple inclusion
              this.logger.warn(`Invalid regex pattern in cache tags: ${pattern}`, {
                error: e instanceof Error ? e.message : String(e)
              });
              isMatch = normalizedPath.includes(pattern);
            }
          } else if (pattern.includes('*')) {
            // It's a glob pattern - convert to regex and test
            try {
              // Simple glob to regex conversion
              const regexPattern = pattern
                .replace(/\./g, '\\.')  // Escape dots
                .replace(/\*/g, '.*');  // Convert * to .*
              
              const regex = new RegExp(`^${regexPattern}$`);
              isMatch = regex.test(normalizedPath);
            } catch (e) {
              // If conversion fails, fall back to simple inclusion
              this.logger.warn(`Invalid glob pattern in cache tags: ${pattern}`, {
                error: e instanceof Error ? e.message : String(e)
              });
              isMatch = normalizedPath.includes(pattern);
            }
          } else {
            // Default to partial path matching when no specific pattern syntax is used
            isMatch = normalizedPath.includes(pattern);
          }
          
          // If match found, add all associated tags
          if (isMatch && Array.isArray(tagGroup)) {
            this.logger.debug(`Path "${normalizedPath}" matched pattern "${pattern}", adding tags: ${tagGroup.join(', ')}`);
            tagGroup.forEach(groupTag => {
              if (typeof groupTag === 'string') {
                // Add the group tag with prefix
                tags.push(`${prefix}${groupTag}`);
              }
            });
          }
        });
      }

      // Add custom conditional tags from configuration if they exist
      // Note: conditionalTags isn't in the interface, so we use type assertion
      const cacheTagsConfig = config.cache.cacheTags as any;
      if (cacheTagsConfig?.conditionalTags && typeof cacheTagsConfig.conditionalTags === 'object') {
        Object.entries(cacheTagsConfig.conditionalTags).forEach(([condition, conditionTags]) => {
          if (this.evaluateCondition(condition, request, storageResult, options) && Array.isArray(conditionTags)) {
            conditionTags.forEach(tag => {
              if (typeof tag === 'string') {
                tags.push(`${prefix}${tag}`);
              }
            });
          }
        });
      }

      // Ensure no duplicate tags
      const uniqueTags = [...new Set(tags)];

      // Limit the number of tags to prevent exceeding Cloudflare limits
      let finalTags = uniqueTags;
      if (uniqueTags.length > maxTags) {
        this.logger.warn(`Generated ${uniqueTags.length} cache tags, exceeding the maximum of ${maxTags}. Tags will be truncated.`);
        finalTags = uniqueTags.slice(0, maxTags);
      }

      // Log tag generation for debugging
      this.logger.debug("Generated cache tags", {
        count: finalTags.length,
        tags: finalTags.length <= 5 ? finalTags : finalTags.slice(0, 5).concat(['... and more']),
        url: request.url,
        truncated: uniqueTags.length > maxTags
      });

      return finalTags;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // Safe access to URL in case request is null or undefined
      const url = request && typeof request === 'object' && 'url' in request ? 
        request.url : 'unknown';
      
      this.logger.error("Failed to generate cache tags", {
        error: errorMessage,
        url,
      });
      
      throw new CacheTagGenerationError(`Failed to generate cache tags: ${errorMessage}`, {
        details: {
          url,
          storageResultPresent: !!storageResult,
          optionsPresent: !!options && Object.keys(options).length > 0
        }
      });
    }
  }

  /**
   * Get appropriate size bucket for a dimension
   * Used to group similar dimensions for more efficient cache purging
   *
   * @param dimension The width or height value
   * @returns The size bucket string
   * @private
   */
  private getSizeBucket(dimension: number): string {
    if (dimension <= 100) return "tiny"; // 1-100px
    if (dimension <= 400) return "small"; // 101-400px
    if (dimension <= 800) return "medium"; // 401-800px
    if (dimension <= 1200) return "large"; // 801-1200px
    if (dimension <= 2000) return "xlarge"; // 1201-2000px
    return "huge"; // >2000px
  }

  /**
   * Get appropriate file size bucket
   * Used to group similar file sizes for cache management
   *
   * @param sizeInBytes The file size in bytes
   * @returns The file size bucket string
   * @private
   */
  private getFileSizeBucket(sizeInBytes: number): string {
    const kb = sizeInBytes / 1024;
    if (kb <= 10) return "mini"; // 0-10KB
    if (kb <= 50) return "tiny"; // 10-50KB
    if (kb <= 200) return "small"; // 50-200KB
    if (kb <= 500) return "medium"; // 200-500KB
    if (kb <= 1024) return "large"; // 500KB-1MB
    if (kb <= 5120) return "xlarge"; // 1-5MB
    return "huge"; // >5MB
  }

  /**
   * Evaluate a condition string against the current context
   * Used for conditional tag generation from configuration
   *
   * @param condition The condition string to evaluate
   * @param request The current request
   * @param storageResult The storage result
   * @param options The transformation options
   * @returns True if the condition is met
   * @private
   */
  private evaluateCondition(
    condition: string,
    request: Request,
    storageResult: StorageResult,
    options: TransformOptions
  ): boolean {
    try {
      const url = new URL(request.url);
      
      // Simple condition format: property:value
      const [property, value] = condition.split(':');
      
      switch (property) {
        case 'path':
          return storageResult.path?.includes(value) || false;
        case 'format':
          return options.format === value;
        case 'width':
          return options.width?.toString() === value;
        case 'height':
          return options.height?.toString() === value;
        case 'contentType':
          return storageResult.contentType?.includes(value) || false;
        case 'host':
          return url.hostname.includes(value);
        case 'derivative':
          return options.derivative === value;
        case 'query':
          // Check if a specific query parameter exists
          return url.searchParams.has(value);
        case 'source':
          return storageResult.sourceType === value;
        case 'feature':
          // Check if a feature is enabled in options
          return options.features?.includes(value) || false;
        default:
          return false;
      }
    } catch (error) {
      this.logger.warn(`Error evaluating condition ${condition}`, {
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }

  /**
   * Extract tags from a request's CF object
   * @param request The request with tags in CF object
   * @returns Array of tags extracted from the request
   */
  extractTagsFromRequest(request: Request): string[] {
    if (!request.cf || !request.cf.cacheTags) {
      return [];
    }
    
    return Array.isArray(request.cf.cacheTags) 
      ? request.cf.cacheTags 
      : typeof request.cf.cacheTags === 'string'
        ? request.cf.cacheTags.split(',')
        : [];
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
   */
  applyTags(request: Request, response: Response, tags: string[]): { request: Request, response: Response } {
    if (!tags.length) {
      return { request, response };
    }

    const config = this.configService.getConfig();
    const cacheMethod = config.cache.method;
    let modifiedRequest = request;
    let modifiedResponse = response;

    // Apply tags based on cache method
    if (cacheMethod === 'cf') {
      // For Cloudflare's managed caching, apply tags to the request's CF object
      const cfData = request.cf || {};
      modifiedRequest = new Request(request, {
        cf: {
          ...cfData,
          cacheTags: tags,
        },
      });
    }
    
    // Only add the Cache-Tag header when appropriate:
    // 1. When using the Cache API method
    // 2. OR when explicitly configured to use multiple tag headers
    if (cacheMethod === 'cache-api' || config.cache.useMultipleCacheTagHeaders) {
      const tagsHeader = tags.join(',');
      const headers = new Headers(response.headers);
      headers.set('Cache-Tag', tagsHeader);
      
      // Create a new response with the updated headers
      modifiedResponse = new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers
      });
    }

    this.logger.debug("Applied cache tags", {
      tagCount: tags.length,
      sampleTags: tags.slice(0, 3).join(", ") + (tags.length > 3 ? "..." : ""),
      cacheMethod: config.cache.method,
      usedCacheTagHeader: (cacheMethod === 'cache-api' || config.cache.useMultipleCacheTagHeaders),
      usedCfObject: (cacheMethod === 'cf')
    });

    return { 
      request: modifiedRequest, 
      response: modifiedResponse 
    };
  }

  /**
   * Extract transform options from URL parameters
   *
   * @param url URL to extract parameters from
   * @returns TransformOptions object with parsed parameters
   */
  private extractOptionsFromUrl(url: URL): TransformOptions {
    const searchParams = url.searchParams;
    const options: TransformOptions = {};

    // Extract basic parameters from the URL
    if (searchParams.has("width")) {
      options.width = parseInt(searchParams.get("width") || "0", 10);
    }
    if (searchParams.has("height")) {
      options.height = parseInt(searchParams.get("height") || "0", 10);
    }
    if (searchParams.has("format")) {
      options.format = searchParams.get("format") || undefined;
    }
    if (searchParams.has("quality")) {
      options.quality = parseInt(searchParams.get("quality") || "0", 10);
    }
    if (searchParams.has("fit")) {
      options.fit = searchParams.get("fit") || undefined;
    }
    if (searchParams.has("gravity")) {
      options.gravity = searchParams.get("gravity") || undefined;
    }

    return options;
  }

  /**
   * Prepare a request and response with cache tags
   *
   * @param request Original request
   * @param response Response to be cached
   * @param pathOverride Optional path override
   * @param options Optional transformation options
   * @returns Object containing tagged request and response
   */
  prepareTaggedRequest(
    request: Request,
    response: Response,
    pathOverride?: string,
    options?: TransformOptions,
  ): { request: Request, response: Response } {
    const config = this.configService.getConfig();

    // If cache tags are not enabled, return the originals unchanged
    if (!config.cache.cacheTags?.enabled) {
      return { request, response };
    }

    try {
      const url = new URL(request.url);
      const path = pathOverride || url.pathname;

      // Extract options from URL parameters
      const extractedOptions = this.extractOptionsFromUrl(url);

      // Merge with passed options if available
      const mergedOptions = options
        ? { ...extractedOptions, ...options }
        : extractedOptions;

      // Generate tags for this request
      const tags = this.generateCacheTags(request, {
        response: new Response(""), // Dummy response
        sourceType: "remote",
        contentType: response.headers.get("Content-Type") ||
          "application/octet-stream",
        size: parseInt(response.headers.get("Content-Length") || "0", 10) || 0,
        path,
      }, mergedOptions);

      if (tags.length > 0) {
        this.logger.debug("Adding cache tags to request/response", {
          tagCount: tags.length,
          sampleTags: tags.slice(0, 3).join(", ") +
            (tags.length > 3 ? "..." : ""),
          cacheMethod: config.cache.method
        });

        // Apply tags based on cache method
        return this.applyTags(request, response, tags);
      }
    } catch (tagsError) {
      // If tag generation fails, log but continue with the originals
      this.logger.warn("Failed to generate cache tags for request", {
        error: tagsError instanceof Error
          ? tagsError.message
          : String(tagsError),
        url: request.url,
      });
    }

    return { request, response };
  }
}