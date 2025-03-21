/**
 * Caching utilities for the image resizer worker
 * 
 * This module provides functions for caching responses using either Cloudflare's cache
 * or the Cache API.
 */

import { ImageResizerConfig } from './config';
import { TransformOptions } from './transform';

/**
 * Apply caching headers to a response based on status
 */
export function applyCacheHeaders(
  response: Response,
  config: ImageResizerConfig
): Response {
  // If caching is disabled, return the response as is
  if (!config.cache.cacheability) {
    return response;
  }
  
  // Create a new response with the same body but new headers
  const newResponse = new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: new Headers(response.headers)
  });
  
  // Set cache control headers based on status code
  const status = response.status;
  
  if (status >= 200 && status < 300) {
    // Success responses - cache according to config
    newResponse.headers.set('Cache-Control', `public, max-age=${config.cache.ttl.ok}`);
  } else if (status >= 400 && status < 500) {
    // Client error responses - cache briefly
    newResponse.headers.set('Cache-Control', `public, max-age=${config.cache.ttl.clientError}`);
  } else if (status >= 500) {
    // Server error responses - cache very briefly
    newResponse.headers.set('Cache-Control', `public, max-age=${config.cache.ttl.serverError}`);
  }
  
  return newResponse;
}

/**
 * Cache a response using the Cache API
 */
export async function cacheWithCacheApi(
  request: Request,
  response: Response,
  config: ImageResizerConfig,
  context: ExecutionContext
): Promise<Response> {
  // Import the logger dynamically to avoid circular dependencies
  const { defaultLogger } = await import('./utils/logging');
  const logger = defaultLogger;
  
  // Skip caching if not needed
  if (config.cache.method !== 'cache-api') {
    logger.breadcrumb('Skipping Cache API caching', undefined, { reason: 'method not cache-api' });
    return response;
  }
  
  logger.breadcrumb('Preparing to cache with Cache API');
  
  // Apply cache headers
  const cacheStart = Date.now();
  const cachedResponse = applyCacheHeaders(response, config);
  const cacheEnd = Date.now();
  
  logger.breadcrumb('Applied cache headers', cacheEnd - cacheStart, {
    status: cachedResponse.status,
    cacheControl: cachedResponse.headers.get('Cache-Control')
  });
  
  // Only cache successful responses
  if (cachedResponse.status >= 200 && cachedResponse.status < 300) {
    // Clone response to avoid consuming the body
    const clonedResponse = cachedResponse.clone();
    
    logger.breadcrumb('Storing successful response in Cache API', undefined, {
      status: cachedResponse.status,
      url: request.url
    });
    
    // Use waitUntil to cache the response without blocking
    context.waitUntil(
      caches.default.put(request, clonedResponse).then(() => {
        logger.breadcrumb('Successfully stored in Cache API');
      }).catch(error => {
        logger.breadcrumb('Failed to store in Cache API', undefined, {
          error: error instanceof Error ? error.message : String(error)
        });
      })
    );
  } else {
    logger.breadcrumb('Not caching non-success response', undefined, {
      status: cachedResponse.status
    });
  }
  
  return cachedResponse;
}

/**
 * Check if a request should bypass cache
 */
export function shouldBypassCache(request: Request, config?: ImageResizerConfig): boolean {
  // Check for cache-control header
  const cacheControl = request.headers.get('Cache-Control');
  if (cacheControl && (cacheControl.includes('no-cache') || cacheControl.includes('no-store'))) {
    return true;
  }
  
  // Check for cache bypass in query params
  const url = new URL(request.url);
  
  // Use configured bypass parameters if available, or default to 'nocache'
  const bypassParams = config?.cache.bypassParams || ['nocache'];
  
  // Check if any of the bypass parameters exist in the URL
  return bypassParams.some(param => url.searchParams.has(param));
}

/**
 * Generate cache tags for an image resource based on transformation options
 * 
 * @param imagePath The path to the image
 * @param options The transformation options applied to the image
 * @param config The image resizer configuration
 * @param responseHeaders Optional headers from the image response for metadata extraction
 * @returns An array of cache tags
 */
export function generateCacheTags(
  imagePath: string,
  options: TransformOptions,
  config: ImageResizerConfig,
  responseHeaders?: Headers
): string[] {
  // Import logger dynamically to avoid circular dependencies
  let logger: import('./utils/logging').Logger | undefined;
  try {
    const { defaultLogger, Logger } = require('./utils/logging');
    logger = defaultLogger;
  } catch (e) {
    // If logging module not available, continue without logging
  }
  
  // If cache tags are disabled, return empty array
  if (!config.cache.cacheTags?.enabled) {
    logger?.debug('Cache tags are disabled');
    return [];
  }
  
  const startTime = Date.now();
  const tags: string[] = [];
  const prefix = config.cache.cacheTags.prefix || 'img-';
  
  // Add base tag for the image path (normalized to avoid special chars)
  const leadingSlashPattern = config.cache.cacheTags?.pathNormalization?.leadingSlashPattern || '^\/+';
  const invalidCharsPattern = config.cache.cacheTags?.pathNormalization?.invalidCharsPattern || '[^a-zA-Z0-9-_/.]';
  const replacementChar = config.cache.cacheTags?.pathNormalization?.replacementChar || '-';
  
  logger?.breadcrumb('Generating cache tags', undefined, {
    imagePath,
    hasOptions: !!options,
    hasResponseHeaders: !!responseHeaders,
    prefix
  });
  
  const normalizedPath = imagePath
    .replace(new RegExp(leadingSlashPattern), '') // Remove leading slashes
    .replace(new RegExp(invalidCharsPattern, 'g'), replacementChar) // Replace special chars
    .split('/')
    .filter(Boolean);
  
  // Add a tag for the full path
  tags.push(`${prefix}path-${normalizedPath.join('-')}`);
  
  // Add tags for each path segment
  normalizedPath.forEach((segment, index) => {
    // Only add segment tags if there are multiple segments
    if (normalizedPath.length > 1) {
      tags.push(`${prefix}segment-${index}-${segment}`);
    }
  });
  
  // Add a tag for the derivative if configured
  if (config.cache.cacheTags.includeDerivative && options.derivative) {
    tags.push(`${prefix}derivative-${options.derivative}`);
  }
  
  // Add a tag for image format if configured
  if (config.cache.cacheTags.includeFormat && options.format) {
    tags.push(`${prefix}format-${options.format}`);
  }
  
  // Add tags for dimensions if configured
  if (config.cache.cacheTags.includeImageDimensions) {
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
  if (config.cache.cacheTags.includeQuality && options.quality) {
    tags.push(`${prefix}quality-${options.quality}`);
  }
  
  // Add custom tags from configuration if available
  if (config.cache.cacheTags.customTags && Array.isArray(config.cache.cacheTags.customTags)) {
    logger?.breadcrumb('Adding custom tags from configuration', undefined, {
      tagCount: config.cache.cacheTags.customTags.length
    });
    
    config.cache.cacheTags.customTags.forEach((tag: string) => {
      // Normalize tag to ensure it's safe for cache tags
      const safeTag = tag.replace(new RegExp(invalidCharsPattern, 'g'), replacementChar);
      tags.push(`${prefix}${safeTag}`);
      
      logger?.breadcrumb('Added custom tag', undefined, {
        originalTag: tag,
        normalizedTag: safeTag,
        fullTag: `${prefix}${safeTag}`
      });
    });
  }
  
  // Add path-based tags if configured
  if (config.cache.cacheTags.pathBasedTags) {
    logger?.breadcrumb('Processing path-based tags', undefined, {
      pathBasedTagsCount: Object.keys(config.cache.cacheTags.pathBasedTags).length
    });
    
    const pathBasedTags = config.cache.cacheTags.pathBasedTags as Record<string, string[]>;
    Object.entries(pathBasedTags).forEach(([pattern, patternTags]) => {
      logger?.breadcrumb('Checking path pattern', undefined, {
        pattern,
        imagePath,
        matches: imagePath.includes(pattern)
      });
      
      if (imagePath.includes(pattern)) {
        logger?.breadcrumb('Path matches pattern', undefined, {
          pattern,
          tagCount: patternTags.length
        });
        
        patternTags.forEach((tag: string) => {
          // Normalize tag to ensure it's safe for cache tags
          const safeTag = tag.replace(new RegExp(invalidCharsPattern, 'g'), replacementChar);
          tags.push(`${prefix}${safeTag}`);
          
          logger?.breadcrumb('Added path-based tag', undefined, {
            pattern,
            originalTag: tag,
            normalizedTag: safeTag,
            fullTag: `${prefix}${safeTag}`
          });
        });
      }
    });
  }
  
  // Parse metadata headers if enabled and headers are provided
  if (responseHeaders && 
      config.cache.cacheTags.parseMetadataHeaders?.enabled) {
    
    logger?.breadcrumb('Processing metadata headers for tags', undefined, {
      headersAvailable: !!responseHeaders,
      headerCount: responseHeaders ? [...responseHeaders.keys()].length : 0
    });
    
    const metadataConfig = config.cache.cacheTags.parseMetadataHeaders;
    const headerPrefixes = metadataConfig.headerPrefixes || ['x-meta-'];
    const excludeHeaders = metadataConfig.excludeHeaders || ['credentials', 'token', 'key'];
    
    logger?.breadcrumb('Using metadata header configuration', undefined, {
      prefixes: headerPrefixes.join(','),
      excludedKeys: excludeHeaders.join(','),
      includeContentType: metadataConfig.includeContentType,
      includeCacheControl: metadataConfig.includeCacheControl
    });
    
    // Process headers to extract metadata as tags
    responseHeaders.forEach((value, key) => {
      // Check if this header contains metadata based on its prefix
      const headerKey = key.toLowerCase();
      const isMetadataHeader = headerPrefixes.some((prefix: string) => headerKey.startsWith(prefix));
      
      logger?.breadcrumb('Examining header', undefined, {
        headerKey,
        headerValue: value.length > 40 ? value.substring(0, 37) + '...' : value,
        isMetadataHeader
      });
      
      if (isMetadataHeader) {
        // Extract the metadata name by removing the prefix
        let metaName = headerKey;
        let matchedPrefix = '';
        for (const prefix of headerPrefixes) {
          if (headerKey.startsWith(prefix)) {
            metaName = headerKey.substring(prefix.length);
            matchedPrefix = prefix;
            break;
          }
        }
        
        // Skip sensitive metadata
        const isSensitive = excludeHeaders.some((excluded: string) => 
          metaName.includes(excluded.toLowerCase())
        );
        
        logger?.breadcrumb('Processing metadata header', undefined, {
          headerKey,
          matchedPrefix,
          extractedName: metaName,
          isSensitive
        });
        
        if (!isSensitive) {
          // Normalize value to ensure it's safe for cache tags
          const safeValue = value.replace(new RegExp(invalidCharsPattern, 'g'), replacementChar);
          const tagName = `${prefix}meta-${metaName}-${safeValue}`;
          tags.push(tagName);
          
          logger?.breadcrumb('Added metadata header tag', undefined, {
            metaName,
            originalValue: value,
            normalizedValue: safeValue,
            fullTag: tagName
          });
        } else {
          logger?.breadcrumb('Skipped sensitive metadata header', undefined, {
            metaName,
            reason: 'matched excluded keyword'
          });
        }
      }
    });
    
    // Include content-type as a tag if configured
    if (metadataConfig.includeContentType) {
      const contentType = responseHeaders.get('content-type');
      logger?.breadcrumb('Processing content-type for tags', undefined, {
        enabled: metadataConfig.includeContentType,
        contentType: contentType || 'none'
      });
      
      if (contentType) {
        // Extract main type and subtype
        const [mainType, fullSubType] = contentType.split('/');
        const subType = fullSubType?.split(';')[0]; // Remove parameters
        
        logger?.breadcrumb('Extracted content-type components', undefined, {
          originalContentType: contentType,
          mainType: mainType || 'unknown',
          subType: subType || 'unknown'
        });
        
        if (mainType) {
          const typeTag = `${prefix}type-${mainType}`;
          tags.push(typeTag);
          logger?.breadcrumb('Added content type main-type tag', undefined, { tag: typeTag });
        }
        
        if (subType) {
          const subTypeTag = `${prefix}subtype-${subType}`;
          tags.push(subTypeTag);
          logger?.breadcrumb('Added content type sub-type tag', undefined, { tag: subTypeTag });
        }
      }
    }
    
    // Include cache-control directives as tags if configured
    if (metadataConfig.includeCacheControl) {
      const cacheControl = responseHeaders.get('cache-control');
      logger?.breadcrumb('Processing cache-control for tags', undefined, {
        enabled: metadataConfig.includeCacheControl,
        cacheControl: cacheControl || 'none'
      });
      
      if (cacheControl) {
        // Extract useful cache control directives as tags
        const directives: Record<string, boolean> = {
          immutable: cacheControl.includes('immutable'),
          public: cacheControl.includes('public'),
          private: cacheControl.includes('private'),
          noStore: cacheControl.includes('no-store'),
          noCache: cacheControl.includes('no-cache'),
          mustRevalidate: cacheControl.includes('must-revalidate')
        };
        
        logger?.breadcrumb('Extracted cache-control directives', undefined, directives);
        
        // Add tags for each directive present
        if (directives.immutable) {
          tags.push(`${prefix}cc-immutable`);
          logger?.breadcrumb('Added cache-control directive tag', undefined, { directive: 'immutable' });
        }
        
        if (directives.public) {
          tags.push(`${prefix}cc-public`);
          logger?.breadcrumb('Added cache-control directive tag', undefined, { directive: 'public' });
        }
        
        if (directives.private) {
          tags.push(`${prefix}cc-private`);
          logger?.breadcrumb('Added cache-control directive tag', undefined, { directive: 'private' });
        }
        
        if (directives.noStore) {
          tags.push(`${prefix}cc-no-store`);
          logger?.breadcrumb('Added cache-control directive tag', undefined, { directive: 'no-store' });
        }
        
        if (directives.noCache) {
          tags.push(`${prefix}cc-no-cache`);
          logger?.breadcrumb('Added cache-control directive tag', undefined, { directive: 'no-cache' });
        }
        
        if (directives.mustRevalidate) {
          tags.push(`${prefix}cc-must-revalidate`);
          logger?.breadcrumb('Added cache-control directive tag', undefined, { directive: 'must-revalidate' });
        }
        
        // Extract max-age if present
        const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);
        if (maxAgeMatch && maxAgeMatch[1]) {
          const maxAge = parseInt(maxAgeMatch[1], 10);
          let maxAgeCategory: string;
          
          // Group max-age into ranges to avoid too many unique tags
          if (maxAge <= 60) {
            maxAgeCategory = '1min';
            tags.push(`${prefix}cc-max-age-1min`);
          } else if (maxAge <= 3600) {
            maxAgeCategory = '1hr';
            tags.push(`${prefix}cc-max-age-1hr`);
          } else if (maxAge <= 86400) {
            maxAgeCategory = '1day';
            tags.push(`${prefix}cc-max-age-1day`);
          } else if (maxAge <= 604800) {
            maxAgeCategory = '1week';
            tags.push(`${prefix}cc-max-age-1week`);
          } else {
            maxAgeCategory = 'long';
            tags.push(`${prefix}cc-max-age-long`);
          }
          
          logger?.breadcrumb('Added max-age cache tag', undefined, {
            maxAge,
            category: maxAgeCategory,
            tag: `${prefix}cc-max-age-${maxAgeCategory}`
          });
        } else {
          logger?.breadcrumb('No max-age directive found in cache-control');
        }
      }
    }
  }
  
  const endTime = Date.now();
  logger?.breadcrumb('Generated cache tags', endTime - startTime, {
    tagCount: tags.length,
    generationTime: endTime - startTime
  });
  
  // Log the first 5 tags as a sample if there are more than 5
  if (tags.length > 0) {
    const sampleTags = tags.slice(0, 5);
    const hasMore = tags.length > 5;
    logger?.breadcrumb('Generated tag sample', undefined, {
      sampleTags: sampleTags.join(', '),
      totalCount: tags.length,
      hasMore
    });
  }
  
  return tags;
}

/**
 * Apply Cloudflare cache settings to a fetch
 */
export function applyCloudflareCache(
  requestInit: RequestInit, 
  config: ImageResizerConfig,
  imagePath?: string,
  options?: TransformOptions,
  responseHeaders?: Headers
): RequestInit {
  // Import logger dynamically to avoid circular dependencies
  let logger: import('./utils/logging').Logger | undefined;
  try {
    const { defaultLogger, Logger } = require('./utils/logging');
    logger = defaultLogger;
  } catch (e) {
    // If logging module not available, continue without logging
  }
  
  // Only apply if using Cloudflare cache
  if (config.cache.method !== 'cf') {
    logger?.debug('Skipping Cloudflare cache as cache method is not CF', {
      method: config.cache.method
    });
    return requestInit;
  }
  
  // Start tracking time for performance
  const startTime = Date.now();
  
  // Log the cache configuration
  logger?.breadcrumb('Applying Cloudflare cache settings', undefined, {
    cacheEverything: config.cache.cacheEverything,
    useTtlByStatus: config.cache.useTtlByStatus,
    cacheTtl: config.cache.ttl.ok,
    cacheTagsEnabled: config.cache.cacheTags?.enabled
  });
  
  // Generate cache tags if enabled and we have options
  const cacheTagsEnabled = config.cache.cacheTags?.enabled === true;
  logger?.breadcrumb('Checking cache tag generation requirements', undefined, {
    cacheTagsEnabled,
    hasImagePath: !!imagePath,
    hasOptions: !!options,
    hasResponseHeaders: !!responseHeaders
  });
  
  const cacheTags = imagePath && options && cacheTagsEnabled
    ? generateCacheTags(imagePath, options, config, responseHeaders)
    : [];
  
  if (cacheTags.length > 0) {
    logger?.breadcrumb('Generated cache tags for request', undefined, {
      tagCount: cacheTags.length,
      hasTags: cacheTags.length > 0
    });
  } else {
    logger?.breadcrumb('No cache tags generated', undefined, {
      reason: !cacheTagsEnabled ? 'disabled' : !imagePath ? 'missing path' : !options ? 'missing options' : 'no tags created'
    });
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
    logger?.breadcrumb('Using cacheTtlByStatus for granular cache control', undefined, {
      statusRanges: Object.keys(config.cache.cacheTtlByStatus).join(',')
    });
    
    // Add detailed debug info for better visibility
    if (logger && typeof logger.debug === 'function') {
      const ttlMappings = Object.entries(config.cache.cacheTtlByStatus)
        .map(([range, ttl]) => `${range}: ${ttl}s`)
        .join(', ');
      
      logger.debug('Status-based cache TTLs', {
        mode: 'cacheTtlByStatus',
        mappings: ttlMappings
      });
    }
    
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
    logger?.breadcrumb('Using simple cacheTtl', undefined, {
      ttl: config.cache.ttl.ok
    });
    
    if (logger && typeof logger.debug === 'function') {
      logger.debug('Simple cache TTL', {
        mode: 'cacheTtl',
        ttl: `${config.cache.ttl.ok}s`,
        note: 'All status codes will use this TTL in Cloudflare cache'
      });
    }
    
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
  
  // Add cache tags if available
  if (cacheTags.length > 0) {
    logger?.debug('Adding cache tags to request', {
      tagCount: cacheTags.length,
      firstFewTags: cacheTags.slice(0, 5).join(', ') + (cacheTags.length > 5 ? '...' : '')
    });
    
    result.cf = {
      ...result.cf,
      cacheTags
    };
  }
  
  const endTime = Date.now();
  logger?.breadcrumb('Applied Cloudflare cache settings', endTime - startTime, {
    cacheEverything: result.cf.cacheEverything,
    hasCacheTtl: !!result.cf.cacheTtl,
    hasCacheTtlByStatus: !!result.cf.cacheTtlByStatus,
    tagCount: cacheTags.length
  });
  
  return result;
}