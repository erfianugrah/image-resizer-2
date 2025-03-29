/**
 * TTLCalculator Module
 * 
 * Responsible for calculating appropriate TTL (Time To Live) values
 * for cached resources based on content type, status, and other factors.
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

export class TTLCalculator {
  private logger: Logger;
  private configService: ConfigurationService;

  constructor(logger: Logger, configService: ConfigurationService) {
    this.logger = logger;
    this.configService = configService;
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
    storageResult?: StorageResult,
  ): number {
    this.logger.debug("TTLCalculator module calculating cache TTL", {
      moduleInstance: "TTLCalculator",
      responseStatus: response.status,
      contentType: response.headers.get("Content-Type") || "unknown"
    });
    
    const config = this.configService.getConfig();
    const status = response.status;
    const contentType = response.headers.get("Content-Type") || "";

    this.logger.debug("Calculating TTL for response", {
      status,
      contentType,
      hasStorageResult: !!storageResult,
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
    const cacheControl = response.headers.get("Cache-Control");
    if (cacheControl) {
      const maxAgeMatch = cacheControl.match(/max-age=(\d+)/);
      if (maxAgeMatch && maxAgeMatch[1]) {
        const originMaxAge = parseInt(maxAgeMatch[1], 10);

        // Only use origin max-age if it's reasonable (not too short or too long)
        // This prevents very short TTLs or extremely long ones from being used blindly
        if (originMaxAge >= 60 && originMaxAge <= 31536000) { // 1 minute to 1 year
          this.logger.debug("Using origin max-age for TTL", {
            originMaxAge,
            originalTtl: ttl,
          });

          // Use the minimum of our calculated TTL and origin max-age
          // This ensures we don't cache longer than the origin intended
          ttl = Math.min(ttl, originMaxAge);
        }
      }
    }

    // Adjust TTL based on image format from content-type
    if (contentType.includes("image/")) {
      const format = contentType.split("/")[1]?.split(";")[0]?.toLowerCase();

      // Format-specific TTL adjustments
      switch (format) {
        case "svg+xml":
          // SVGs are vector and rarely change, so cache longer
          ttl = Math.max(ttl, 86400 * 14); // 2 weeks
          break;

        case "avif":
        case "webp":
          // Modern formats indicate optimization focus, can cache longer
          ttl = Math.max(ttl, 86400 * 7); // 1 week
          break;

        case "jpeg":
        case "jpg":
        case "png":
          // Standard formats, use normal TTL
          break;

        case "gif":
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
        "thumbnail": 86400 * 14, // 2 weeks - thumbnails change rarely
        "avatar": 86400 * 7, // 1 week - avatars update occasionally
        "profile": 86400 * 5, // 5 days - profile images update occasionally

        // Content-centric derivatives
        "preview": 3600 * 12, // 12 hours - previews may update more often
        "banner": 86400 * 2, // 2 days - banners are more frequently updated
        "hero": 86400 * 2, // 2 days - hero images are more frequently updated

        // Special-purpose derivatives
        "og-image": 86400 * 30, // 30 days - social sharing images rarely change
        "icon": 86400 * 30, // 30 days - icons rarely change
        "logo": 86400 * 30, // 30 days - logos rarely change

        // Short-lived derivatives
        "temp": 3600, // 1 hour - temporary images
        "preview-draft": 300, // 5 minutes - draft previews
      };

      if (derivativeTTLs[options.derivative]) {
        // Apply the derivative-specific TTL
        ttl = derivativeTTLs[options.derivative];

        this.logger.debug("Applied derivative-specific TTL", {
          derivative: options.derivative,
          derivativeTtl: ttl,
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
      const pathBasedTtl = config.cache.pathBasedTtl as Record<
        string,
        number
      >;

      // Check each path pattern for a match
      Object.entries(pathBasedTtl).forEach(([pattern, patternTtl]) => {
        if (path.includes(pattern.toLowerCase())) {
          this.logger.debug("Applying path-based TTL adjustment", {
            pattern,
            patternTtl,
            originalTtl: ttl,
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
      if (
        path.includes("/news/") ||
        path.includes("/blog/") ||
        path.includes("/events/") ||
        path.includes("/temporary/")
      ) {
        ttl = Math.min(ttl, 86400); // Max 1 day for news/blog/events content
      }

      // Images that rarely change
      if (
        path.includes("/static/") ||
        path.includes("/assets/") ||
        path.includes("/icons/") ||
        path.includes("/logos/")
      ) {
        ttl = Math.max(ttl, 86400 * 30); // Min 30 days for static assets
      }
    }
    
    this.logger.debug("Calculated final TTL", {
      ttl,
      status,
      contentType,
      derivative: options?.derivative || "none",
      quality: options?.quality || "default",
    });

    // Ensure TTL is a positive number and within reasonable bounds
    if (isNaN(ttl) || ttl < 0) {
      this.logger.warn("Invalid TTL calculated, using default", {
        calculatedTtl: ttl,
        defaultTtl: config.cache.ttl.ok,
      });
      return config.cache.ttl.ok;
    }

    // Apply TTL limits if configured
    if (config.cache.maxTtl && ttl > config.cache.maxTtl) {
      this.logger.debug("Capping TTL to configured maximum", {
        calculatedTtl: ttl,
        maxTtl: config.cache.maxTtl,
      });
      ttl = config.cache.maxTtl;
    }

    if (config.cache.minTtl && ttl < config.cache.minTtl) {
      this.logger.debug("Raising TTL to configured minimum", {
        calculatedTtl: ttl,
        minTtl: config.cache.minTtl,
      });
      ttl = config.cache.minTtl;
    }

    return ttl;
  }
}