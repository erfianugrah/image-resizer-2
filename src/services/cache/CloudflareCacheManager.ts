/**
 * CloudflareCacheManager Module
 * 
 * Responsible for Cloudflare-specific cache operations, including TTL settings,
 * cache tags, and other Cloudflare cache configuration options.
 */

import { Logger } from "../../utils/logging";
import {
  ConfigurationService,
  TransformOptions,
  StorageResult,
} from "../interfaces";
import { CacheServiceError } from "../../errors/cacheErrors";

type GenerateCacheTagsFn = (request: Request, storageResult: StorageResult, options: TransformOptions) => string[];

export class CloudflareCacheManager {
  private logger: Logger;
  private configService: ConfigurationService;

  constructor(logger: Logger, configService: ConfigurationService) {
    this.logger = logger;
    this.configService = configService;
  }

  /**
   * Apply Cloudflare cache configuration to a request
   *
   * @param requestInit The request initialization options
   * @param imagePath The path to the image
   * @param options Transformation options
   * @param generateCacheTags Function to generate cache tags
   * @returns Updated request initialization with CF cache settings
   */
  applyCloudflareCache(
    requestInit: RequestInit,
    imagePath: string,
    options: TransformOptions,
    generateCacheTags?: GenerateCacheTagsFn
  ): RequestInit {
    const config = this.configService.getConfig();

    // Skip if not using Cloudflare caching
    if (config.cache.method !== "cf") {
      this.logger.debug(
        "Skipping Cloudflare cache as cache method is not CF",
      );
      return requestInit;
    }

    // Create a new request init with CF cache settings
    const result = {
      ...requestInit,
      cf: {
        ...requestInit.cf,
        // Use cacheEverything from config if available, default to true
        cacheEverything: config.cache.cacheEverything !== undefined
          ? config.cache.cacheEverything
          : true,
      },
    };

    // Add cacheTtl or cacheTtlByStatus based on configuration
    if (
      config.cache.useTtlByStatus &&
      config.cache.cacheTtlByStatus &&
      Object.keys(config.cache.cacheTtlByStatus).length > 0
    ) {
      // STATUS-BASED CACHING: Different TTLs for different status codes
      result.cf = {
        ...result.cf,
        cacheTtlByStatus: config.cache.cacheTtlByStatus,
      };
    } else {
      // SIMPLE CACHING: One TTL for all responses
      result.cf = {
        ...result.cf,
        cacheTtl: config.cache.ttl.ok,
      };
    }

    // Generate and add cache tags if enabled and we have the functionality
    if (config.cache.cacheTags?.enabled && generateCacheTags && imagePath) {
      try {
        // Create a dummy request for tag generation
        const dummyRequest = new Request(`https://example.com${imagePath}`);
        const dummyResponse = new Response();

        // Create a minimal storage result for tag generation
        const dummyStorageResult: StorageResult = {
          response: dummyResponse,
          sourceType: "remote",
          contentType: null,
          size: 0,
          path: imagePath,
        };

        // Generate tags using the provided function
        const cacheTags = generateCacheTags(
          dummyRequest,
          dummyStorageResult,
          options,
        );

        if (cacheTags.length > 0) {
          // Add cache tags to CF object
          result.cf = {
            ...result.cf,
            cacheTags,
          };
        }
      } catch (error) {
        this.logger.warn("Error generating cache tags for Cloudflare fetch", {
          error: error instanceof Error
            ? error.message
            : String(error),
          fallback: "Continuing without cache tags",
        });
      }
    }

    return result;
  }
}