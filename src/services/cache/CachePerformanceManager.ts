/**
 * CachePerformanceManager Module
 * 
 * Responsible for performance-related cache functionality including
 * metrics recording and resource hints.
 */

import { Logger } from "../../utils/logging";
import {
  ConfigurationService,
  StorageResult,
  TransformOptions,
} from "../interfaces";

export class CachePerformanceManager {
  private logger: Logger;
  private configService: ConfigurationService;

  constructor(logger: Logger, configService: ConfigurationService) {
    this.logger = logger;
    this.configService = configService;
  }

  /**
   * Add resource hints to a response for performance optimization
   *
   * @param response The response to enhance
   * @param request The original request
   * @param options The transformation options
   * @param storageResult The storage result
   * @returns The enhanced response
   */
  addResourceHints(
    response: Response,
    request: Request,
    options?: TransformOptions,
    storageResult?: StorageResult,
  ): Response {
    const config = this.configService.getConfig();

    // Only add hints to HTML responses
    const contentType = response.headers.get("Content-Type") || "";
    if (!contentType.includes("text/html")) {
      return response;
    }

    // Create a new response with the hints added
    const headers = new Headers(response.headers);
    let hasPreloads = false;

    // Add preconnect hints for CDN domains
    if (
      config.cache.resourceHints?.preconnect &&
      Array.isArray(config.cache.resourceHints.preconnect)
    ) {
      const preconnectLinks = config.cache.resourceHints.preconnect.map(
        (domain: string) => `<${domain}>; rel=preconnect`,
      ).join(", ");

      headers.set("Link", preconnectLinks);
    }

    // Add preload hints for critical resources
    if (
      storageResult?.path &&
      config.cache.resourceHints?.preloadPatterns &&
      typeof config.cache.resourceHints.preloadPatterns === "object"
    ) {
      const path = storageResult.path.toLowerCase();
      const preloads: string[] = [];

      // Check each pattern to see if resources should be preloaded
      Object.entries(config.cache.resourceHints.preloadPatterns).forEach(
        ([pattern, resources]) => {
          if (
            path.includes(pattern.toLowerCase()) && Array.isArray(resources)
          ) {
            resources.forEach((resource: string) => {
              preloads.push(`<${resource}>; rel=preload; as=image`);
            });
          }
        },
      );

      if (preloads.length > 0) {
        hasPreloads = true;
        const currentLink = headers.get("Link");
        if (currentLink) {
          headers.set("Link", `${currentLink}, ${preloads.join(", ")}`);
        } else {
          headers.set("Link", preloads.join(", "));
        }
      }
    }

    this.logger.debug("Added resource hints to response", {
      operation: 'resource_hints',
      category: 'cache',
      result: 'success',
      durationMs: 0, // No timing here, but include for consistency
      contentType,
      hasPreconnect: !!config.cache.resourceHints?.preconnect,
      hasPreloads,
      url: request.url
    });

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  /**
   * Record cache metrics for monitoring
   *
   * @param request The original request
   * @param response The response
   */
  async recordCacheMetric(
    request: Request,
    response: Response,
  ): Promise<void> {
    // Check if the response has a cache status header
    const cacheStatus = response.headers.get("X-Cache-Status") || "unknown";
    const url = new URL(request.url);
    const path = url.pathname;

    // Simple path-based metric bucketing to avoid too many unique metrics
    const pathBucket = path.split("/").slice(0, 3).join("/") || "/";

    // Generate metric key
    const metricKey = `cache_${cacheStatus}_${pathBucket}`;

    // Log the metric with standardized field names
    this.logger.debug("Cache metric", {
      operation: 'cache_metric',
      category: 'cache',
      result: cacheStatus.toLowerCase(),
      durationMs: 0, // No timing information available
      url: request.url,
      cacheStatus,
      pathBucket,
      metricKey,
    });

    // In a real implementation, this would send to a metrics service
  }
}