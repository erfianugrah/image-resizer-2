/**
 * CacheHeadersManager Module
 * 
 * Responsible for applying cache headers to responses based on content type, 
 * status code, and configuration.
 */

import { Logger } from "../../utils/logging";
import {
  ConfigurationService,
  StorageResult,
  TransformOptions,
} from "../interfaces";
import { CacheServiceError } from "../../errors/cacheErrors";

// Type guard functions
function isResponse(obj: unknown): obj is Response {
  return obj instanceof Response;
}

// Type for callback functions passed by the main service
export interface CacheHeadersFunctions {
  calculateTtl: (
    response: Response, 
    options: TransformOptions, 
    storageResult?: StorageResult
  ) => number;
  generateCacheTags: (
    request: Request, 
    storageResult: StorageResult, 
    options: TransformOptions
  ) => string[];
  isImmutableContent: (
    response: Response, 
    options?: TransformOptions, 
    storageResult?: StorageResult
  ) => boolean;
}

export class CacheHeadersManager {
  private logger: Logger;
  private configService: ConfigurationService;

  constructor(logger: Logger, configService: ConfigurationService) {
    this.logger = logger;
    this.configService = configService;
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
   * @param functions Callback functions required from main service
   * @returns A response with appropriate Cache-Control headers
   * @throws {CacheServiceError} If applying cache headers fails
   */
  applyCacheHeaders(
    response: Response,
    options?: TransformOptions,
    storageResult?: StorageResult,
    functions?: CacheHeadersFunctions,
  ): Response {
    const config = this.configService.getConfig();

    this.logger.debug("Applying cache headers", {
      cacheMethod: config.cache.method,
      status: response.status,
      contentType: response.headers.get("Content-Type") || "unknown",
      hasOptions: !!options && Object.keys(options).length > 0,
    });

    // If caching is disabled, return the response as is
    if (!config.cache.cacheability) {
      return response;
    }

    // Create a new response that we can modify
    const newResponse = new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: new Headers(response.headers),
    });

    // Calculate appropriate TTL based on our advanced logic
    const ttl = functions?.calculateTtl 
      ? functions.calculateTtl(newResponse, options || {}, storageResult)
      : config.cache.ttl.ok; // Fallback to default TTL if callback not provided

    // Set cache control header based on status code
    const status = newResponse.status;
    let cacheControl = "";

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
      if (functions?.isImmutableContent && 
          functions.isImmutableContent(newResponse, options, storageResult)) {
        cacheControl += ", immutable";
      }

      // Add CDN-specific cache directives if configured
      if (config.cache.cdnDirectives?.enabled) {
        // Common CDN directives like Cloudflare's, Fastly's, or Akamai's
        if (config.cache.cdnDirectives.noTransform) {
          cacheControl += ", no-transform";
        }

        // Fastly and other CDNs support stale-if-error
        if (config.cache.cdnDirectives.staleIfError) {
          const staleErrorTime =
            config.cache.cdnDirectives.staleIfErrorTime || ttl * 2;
          cacheControl += `, stale-if-error=${staleErrorTime}`;
        }
      }
    } else if (status >= 400 && status < 500) {
      // Client error responses - shorter caching, private
      cacheControl = `private, max-age=${config.cache.ttl.clientError}`;

      // Special case for 404s which might change frequently during development
      if (status === 404 && config.environment === "development") {
        cacheControl = "no-store";
      }
    } else if (status >= 500) {
      // Server error responses - minimal caching, private
      cacheControl = `private, max-age=${config.cache.ttl.serverError}`;
    }

    // Apply the constructed Cache-Control header
    newResponse.headers.set("Cache-Control", cacheControl);

    // Add Cloudflare-specific headers for duplicate processing prevention
    if (config.cache.method === "cf") {
      // Add marker to prevent duplicate processing
      newResponse.headers.set("x-img-resizer-processed", "true");

      // Add worker identifier to help with debugging
      newResponse.headers.set("cf-worker", "image-resizer");
    }

    // Add Vary headers for proper cache differentiation
    this.addVaryHeaders(newResponse, options);

    // Add cache tags if configured and available
    if (config.cache.cacheTags?.enabled && storageResult && functions?.generateCacheTags) {
      try {
        const tags = functions.generateCacheTags(
          new Request(
            storageResult.originalUrl || "https://example.com/unknown",
          ),
          storageResult,
          options || {},
        );

        if (tags.length > 0) {
          // Set Cache-Tag header on response (used by Cloudflare Cache API and other CDNs)
          newResponse.headers.set("Cache-Tag", tags.join(","));

          this.logger.debug(
            "Added cache tags to response via Cache-Tag header",
            {
              tagCount: tags.length,
              firstFewTags: tags.slice(0, 3).join(", ") +
                (tags.length > 3 ? "..." : ""),
            },
          );
        }
      } catch (tagError) {
        this.logger.warn("Failed to generate or apply cache tags", {
          error: tagError instanceof Error
            ? tagError.message
            : String(tagError),
        });
        // Continue without tags rather than failing the whole operation
      }
    }

    // We'll store cache strategy info in a property that can be read by debugService
    // The parent cacheService should handle debug headers via debugService
    // This avoids setting debug headers in multiple places

    // Log the final cache headers
    this.logger.debug("Applied enhanced cache headers", {
      cacheControl: newResponse.headers.get("Cache-Control"),
      cacheTagHeader: newResponse.headers.get("Cache-Tag"),
      status: newResponse.status,
      ttl,
    });

    return newResponse;
  }

  /**
   * Add appropriate Vary headers to a response to ensure proper cache differentiation
   * Vary headers tell CDNs and browsers to cache different versions based on request headers
   *
   * @param response The response to modify
   * @param options The transformation options
   */
  addVaryHeaders(response: Response, options?: TransformOptions): void {
    const config = this.configService.getConfig();
    const currentVary = response.headers.get("Vary") || "";
    const varyHeaders: string[] = currentVary ? currentVary.split(", ") : [];

    // Always vary on Accept for content negotiation
    if (!varyHeaders.includes("Accept")) {
      varyHeaders.push("Accept");
    }

    // Add client hint headers for responsive images
    if (config.cache.varyOnClientHints) {
      const clientHintHeaders = [
        "Sec-CH-DPR",
        "DPR",
        "Sec-CH-Width",
        "Viewport-Width",
      ];

      for (const header of clientHintHeaders) {
        if (!varyHeaders.includes(header)) {
          varyHeaders.push(header);
        }
      }
    }

    // Add User-Agent if we're varying on device type
    if (config.cache.varyOnUserAgent) {
      if (!varyHeaders.includes("User-Agent")) {
        varyHeaders.push("User-Agent");
      }
    }

    // Add Save-Data if we're optimizing for data saving mode
    if (config.cache.varyOnSaveData) {
      if (!varyHeaders.includes("Save-Data")) {
        varyHeaders.push("Save-Data");
      }
    }

    // If we have format or quality auto-selection based on the Accept header
    if (options?.format === "auto") {
      if (!varyHeaders.includes("Accept")) {
        varyHeaders.push("Accept");
      }
    }

    // Set the new Vary header if we added anything
    if (varyHeaders.length > 0) {
      response.headers.set("Vary", varyHeaders.join(", "));
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
  isImmutableContent(
    response: Response,
    options?: TransformOptions,
    storageResult?: StorageResult,
  ): boolean {
    // Get config for immutable content patterns
    const config = this.configService.getConfig();

    // If immutable caching is disabled, always return false
    if (!config.cache.immutableContent?.enabled) {
      return false;
    }

    // Check if content type is considered immutable
    const contentType = response.headers.get("Content-Type") || "";
    const immutableTypes = config.cache.immutableContent.contentTypes || [
      "image/svg+xml",
      "font/",
      "application/font",
    ];

    if (immutableTypes.some((type) => contentType.includes(type))) {
      return true;
    }

    // Check if path indicates immutable content (like versioned static assets)
    if (storageResult?.path) {
      const path = storageResult.path.toLowerCase();
      const immutablePaths = config.cache.immutableContent.paths || [
        "/static/",
        "/assets/",
        "/dist/",
      ];

      // Check for versioned file patterns like /assets/v2/, /static/1.2.3/, etc.
      const hasVersionPattern = /\/(v\d+|v\d+\.\d+|v\d+\.\d+\.\d+)\//.test(
        path,
      );

      // Check for content hash patterns like .a1b2c3d4.js, .abcdef123456.css
      const hasHashPattern = /\.[a-f0-9]{6,32}\.[a-z]+$/i.test(path);

      if (hasVersionPattern || hasHashPattern) {
        return true;
      }

      // Check for configured immutable paths
      if (
        immutablePaths.some((immutablePath) => path.includes(immutablePath))
      ) {
        return true;
      }
    }

    // Check if specific derivatives should be treated as immutable
    if (options?.derivative) {
      const immutableDerivatives = config.cache.immutableContent.derivatives ||
        [
          "icon",
          "logo",
          "favicon",
        ];

      if (immutableDerivatives.includes(options.derivative)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Prepare a response for caching by adding timestamp and proper cache headers
   *
   * @param response Original response
   * @returns Response ready for caching
   */
  prepareCacheableResponse(response: Response): Response {
    // Clone the response to avoid consuming the body
    const clonedResponse = response.clone();

    // Add timestamp header for age calculation
    const headers = new Headers(clonedResponse.headers);
    if (!headers.has("Date")) {
      headers.set("Date", new Date().toUTCString());
    }

    this.logger.debug("Prepared response for caching", {
      status: clonedResponse.status,
      contentType: clonedResponse.headers.get("Content-Type") || "unknown",
      hasDateHeader: clonedResponse.headers.has("Date"),
    });

    return new Response(clonedResponse.body, {
      status: clonedResponse.status,
      statusText: clonedResponse.statusText,
      headers,
    });
  }
}