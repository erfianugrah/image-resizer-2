/*
 * Image Resizer Worker
 *
 * A simplified Cloudflare Worker for image resizing that leverages Cloudflare's Image Resizing service
 * with a service-oriented architecture inspired by video-resizer.
 */

import { PerformanceMetrics } from "./services/interfaces";
import { AppError, createErrorResponse, TransformError } from "./utils/errors";
import { isAkamaiFormat } from "./utils/akamai-compatibility-refactored";
import { setLogger as setAkamaiLogger } from "./utils/akamai-compatibility-refactored";
// Storage logger is now handled through StorageService
// Transform logger is now handled through TransformationService
// Debug logger is now handled through DebugService
import { setConfig as setDetectorConfig } from "./utils/detector";
import { createContainer } from "./services/containerFactory";
import {
  createRequestPerformanceMonitor,
  initializePerformanceBaseline,
} from "./utils/performance-integrations";
import {
  handleAkamaiCompatibility,
  addAkamaiCompatibilityHeader,
  handleDebugReport,
  handleImageRequest,
  handlePerformanceReport,
  handlePerformanceReset,
  handleRootPath,
} from "./handlers";

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<Response> {
    // Attach env and ctx to the request object for use in services
    // Use proper type assertion to avoid TypeScript errors
    (request as unknown as { env: any }).env = env;
    (request as unknown as { ctx: ExecutionContext }).ctx = ctx;

    // Start performance tracking
    const metrics: PerformanceMetrics = {
      start: Date.now(),
    };

    // Create service container using the factory
    // This will automatically select the appropriate container type and add lifecycle manager
    const services = await createContainer(env, {
      initializeServices: true,
      gracefulDegradation: true,
    });
    const { logger, configurationService, loggingService, lifecycleManager } =
      services;
      
    // Create pathService and detectorService if not already present
    if (!services.pathService) {
      // Import dynamically to avoid circular dependencies
      const { createPathService } = await import('./services/pathService');
      services.pathService = createPathService(loggingService.getLogger('PathService'), configurationService.getConfig());
      logger.info('Created missing PathService');
    }
    
    if (!services.detectorService) {
      // Import dynamically to avoid circular dependencies
      const { createDetectorService } = await import('./services/detectorServiceFactory');
      services.detectorService = createDetectorService(configurationService.getConfig(), loggingService.getLogger('DetectorService'));
      logger.info('Created missing DetectorService');
    }

    // Log lifecycle information if available
    if (lifecycleManager) {
      logger.debug(
        "Lifecycle manager available for coordinated service management",
      );
    }

    // Get configuration via the configuration service
    const config = configurationService.getConfig();

    // Initialize performance monitoring
    const performanceBaseline = initializePerformanceBaseline(config, logger);
    const performanceMonitor = createRequestPerformanceMonitor(
      metrics,
      logger,
      performanceBaseline,
    );

    // Log initialization with configured logger
    logger.info(
      `Worker initialized with logging level ${loggingService.getLogLevel()}`,
    );

    // Initialize loggers for specific modules that are not using the service pattern yet
    // We now use the loggingService to get loggers for each module
    const akamaiLogger = loggingService.getLogger("AkamaiCompat");
    const debugLogger = loggingService.getLogger("Debug");

    // Set loggers for modules that still use the older pattern
    // These will be refactored in subsequent steps to use the service directly
    setAkamaiLogger(akamaiLogger);
    // Storage now uses the StorageService
    // Transform now uses the TransformationService
    // Debug service already has logger from constructor, no need to set it

    // Initialize detector with configuration if available
    if (config.detector) {
      setDetectorConfig(config.detector);
      logger.info("Client detector initialized with configuration", {
        cacheSize: config.detector.cache.maxSize,
        strategies: Object.keys(config.detector.strategies)
          .filter((key) => {
            const strategy = config.detector
              ?.strategies[key as keyof typeof config.detector.strategies];
            return strategy?.enabled;
          })
          .join(", "),
        hashAlgorithm: config.detector.hashAlgorithm || "simple",
      });
    }

    // Start request breadcrumb trail
    logger.breadcrumb("Request started", undefined, {
      url: request.url,
      method: request.method,
      userAgent: request.headers.get("user-agent") || "unknown",
    });

    // Parse URL
    let url = new URL(request.url);

    try {
      performanceMonitor.startOperation("total");

      // Check for root path
      const rootResponse = handleRootPath(request);
      if (rootResponse) {
        performanceMonitor.endOperation("total", { type: "root_path" });
        performanceMonitor.endRequest({
          status: rootResponse.status,
          type: "root_path",
        });
        return rootResponse;
      }
      
      // Check for transform cache debug request
      if (url.pathname.startsWith('/debug/transform-cache')) {
        try {
          // Import the transform cache debug handler dynamically
          const { transformCacheDebugHandler } = await import(
            "./handlers/transformCacheDebugHandler"
          );
          
          performanceMonitor.startOperation("transform_cache_debug");
          logger.debug("Handling transform cache debug request", {
            path: url.pathname
          });
          
          const transformCacheResponse = await transformCacheDebugHandler(
            request,
            services,
            env,
            ctx,
            config
          );
          
          performanceMonitor.endOperation("transform_cache_debug", {
            status: transformCacheResponse.status
          });
          
          performanceMonitor.endOperation("total", {
            type: "transform_cache_debug"
          });
          performanceMonitor.endRequest({
            status: transformCacheResponse.status,
            type: "transform_cache_debug"
          });
          
          return transformCacheResponse;
        } catch (error) {
          logger.error("Error in transform cache debug handler", {
            error: error instanceof Error ? error.message : String(error),
            path: url.pathname
          });
          
          // Let the request continue to be handled by the standard debug handler
          logger.warn(
            "Falling back to standard debug handler after transform cache debug handler error"
          );
        }
      }

      // Check for performance report request
      const performanceResponse = await handlePerformanceReport(
        request,
        services,
        config
      );
      if (performanceResponse) {
        performanceMonitor.endOperation("total", {
          type: "performance_report",
        });
        performanceMonitor.endRequest({
          status: performanceResponse.status,
          type: "performance_report",
        });
        return performanceResponse;
      }

      // Check for performance reset request
      const resetResponse = await handlePerformanceReset(request, services, config);
      if (resetResponse) {
        performanceMonitor.endOperation("total", { type: "performance_reset" });
        performanceMonitor.endRequest({
          status: resetResponse.status,
          type: "performance_reset",
        });
        return resetResponse;
      }

      // Check for debug report request
      const debugResponse = await handleDebugReport(
        request,
        services,
        metrics,
        config,
        logger,
      );
      if (debugResponse) {
        performanceMonitor.endOperation("total", { type: "debug_report" });
        performanceMonitor.endRequest({
          status: debugResponse.status,
          type: "debug_report",
        });
        return debugResponse;
      }

      // Check for metadata-driven transformation request (path starts with /smart/)
      if (url.pathname.startsWith("/smart/")) {
        try {
          // Import the metadata handler dynamically to avoid circular dependencies
          const { handleMetadataTransformation } = await import(
            "./handlers/metadataHandler"
          );

          performanceMonitor.startOperation("metadata_transform");
          logger.debug("Handling metadata-driven transformation", {
            path: url.pathname,
          });

          const metadataResponse = await handleMetadataTransformation(
            request,
            env,
            services,
            config
          );

          performanceMonitor.endOperation("metadata_transform", {
            status: metadataResponse.status,
            contentType: metadataResponse.headers.get("content-type"),
          });

          performanceMonitor.endOperation("total", {
            type: "metadata_transform",
          });
          performanceMonitor.endRequest({
            status: metadataResponse.status,
            type: "metadata_transform",
            contentType: metadataResponse.headers.get("content-type"),
          });

          return metadataResponse;
        } catch (error) {
          logger.error("Error in metadata transformation handler", {
            error: error instanceof Error ? error.message : String(error),
            path: url.pathname,
          });

          // Let the request continue to be handled by the standard image handler
          logger.warn(
            "Falling back to standard image handler after metadata handler error",
          );
        }
      }
      
      // Handle Configuration API requests (path starts with /api/config)
      if (url.pathname.startsWith("/api/config")) {
        try {
          // Import the config API handler dynamically
          const { handleConfigApiRequest } = await import(
            "./handlers/configApiHandler"
          );
          
          performanceMonitor.startOperation("config_api");
          logger.debug("Handling configuration API request", {
            path: url.pathname,
            method: request.method
          });
          
          const configApiResponse = await handleConfigApiRequest(
            request,
            url,
            services,
            env
          );
          
          performanceMonitor.endOperation("config_api", {
            status: configApiResponse.status
          });
          
          performanceMonitor.endOperation("total", {
            type: "config_api"
          });
          performanceMonitor.endRequest({
            status: configApiResponse.status,
            type: "config_api"
          });
          
          return configApiResponse;
        } catch (error) {
          logger.error("Error in configuration API handler", {
            error: error instanceof Error ? error.message : String(error),
            path: url.pathname,
            method: request.method
          });
          
          // Return an error response for Config API errors
          const errorResponse = createErrorResponse(
            new AppError("Error processing configuration request", { 
              details: { error: error instanceof Error ? error.message : String(error) }, 
              status: 500 
            })
          );
          
          performanceMonitor.endOperation("total", { type: "config_api_error" });
          performanceMonitor.endRequest({
            status: errorResponse.status,
            type: "config_api_error"
          });
          
          return errorResponse;
        }
      }

      // Handle Akamai compatibility if applicable
      performanceMonitor.startOperation("akamai_compat");
      const isAkamai = isAkamaiFormat(url);
      url = handleAkamaiCompatibility(request, url, services, config);
      performanceMonitor.endOperation("akamai_compat", { used: isAkamai });

      // Process the image transformation request
      performanceMonitor.startOperation("image_request");
      let finalResponse = await handleImageRequest(
        request,
        url,
        services,
        metrics,
        config
      );
      performanceMonitor.endOperation("image_request", {
        status: finalResponse.status,
        contentType: finalResponse.headers.get("content-type"),
      });

      // Add Akamai compatibility header if enabled and used
      if (isAkamai) {
        performanceMonitor.startOperation("add_akamai_header");
        finalResponse = addAkamaiCompatibilityHeader(
          finalResponse,
          isAkamai,
          services,
        );
        performanceMonitor.endOperation("add_akamai_header");
      }

      // End the overall request timing
      performanceMonitor.endOperation("total");
      performanceMonitor.endRequest({
        status: finalResponse.status,
        contentType: finalResponse.headers.get("content-type"),
        contentLength: finalResponse.headers.get("content-length"),
      });

      return finalResponse;
    } catch (error) {
      // Log the error with detailed information
      logger.error("Error processing image", {
        url: request.url,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : "Unknown",
        stack: error instanceof Error ? error.stack : undefined,
      });

      // Mark the error with a breadcrumb for easier tracing
      logger.breadcrumb("Request processing error occurred", undefined, {
        errorType: error instanceof Error ? error.constructor.name : "Unknown",
        url: request.url,
        error: error instanceof Error ? error.message : String(error),
      });

      // Track error with performance monitoring
      try {
        // First try to end the total operation if it was started
        performanceMonitor.endOperation("total", { error: true });
      } catch (endError) {
        // Ignore errors from ending the operation - it may not have been started
      }

      performanceMonitor.startOperation("error_handling");

      // Record error type in peformance data
      const errorType = error instanceof Error
        ? error.constructor.name
        : "Unknown";
      const errorMessage = error instanceof Error
        ? error.message
        : String(error);

      // Get performance metrics
      performanceMonitor.updateMetrics();
      const storageTimeMs = performanceMonitor.getOperationTime("storage");
      const transformTimeMs = performanceMonitor.getOperationTime("transform");

      // End performance timing for error handling
      const totalDuration = performanceMonitor.endOperation("error_handling", {
        errorType,
        errorMessage,
      });

      logger.breadcrumb("Request error metrics", totalDuration, {
        totalDurationMs: totalDuration,
        storageTimeMs: storageTimeMs,
        transformTimeMs: transformTimeMs,
      });

      // Create appropriate error response
      let errorResponse: Response;

      // Return a formatted error response
      if (error instanceof AppError) {
        logger.debug("Returning error response for known error type", {
          errorType: error.constructor.name,
          status: error.status,
        });
        logger.breadcrumb("Returning structured error response", undefined, {
          errorType: error.constructor.name,
          status: error.status,
        });
        errorResponse = createErrorResponse(error);
      } else {
        // Wrap unknown errors in TransformError
        logger.debug("Wrapping unknown error in TransformError");
        logger.breadcrumb("Wrapping in TransformError", undefined, {
          originalError: errorMessage,
        });
        const transformError = new TransformError(
          `Error processing image: ${errorMessage}`,
        );
        errorResponse = createErrorResponse(transformError);
      }

      // Record final error metrics
      performanceMonitor.endRequest({
        status: errorResponse.status,
        errorType,
        errorMessage,
      });

      return errorResponse;
    }
  },

  // Add shutdown lifecycle hook for cleanup
  async scheduled(
    controller: any,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    // Map controller to event for compatibility with our code
    const event = controller as unknown as ScheduledEvent;
    
    
    // Create service container with minimal initialization
    const services = await createContainer(env, {
      initializeServices: false, // Don't initialize since we'll just shut down
    });

    const { logger, lifecycleManager } = services;

    if (event.scheduledTime) {
      logger.info("Scheduled event received", {
        scheduledTime: new Date(event.scheduledTime).toISOString(),
      });
    }

    // If we have a lifecycle manager, use it for coordinated shutdown
    if (lifecycleManager) {
      try {
        logger.info("Starting coordinated service shutdown");

        // Perform the shutdown with a timeout and force mode
        const stats = await lifecycleManager.shutdown({
          force: true,
          timeout: 5000, // 5 second timeout for each service
        });

        logger.info("Service shutdown completed successfully", {
          durationMs: stats.totalShutdownTimeMs,
          servicesShutdown: stats.services.shutdown,
          totalServices: stats.services.total,
        });
      } catch (error) {
        logger.error("Error during service shutdown", {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
      }
    } else {
      // Use regular shutdown if lifecycle manager is not available
      try {
        logger.info("Starting legacy service shutdown");
        await services.shutdown();
        logger.info("Legacy service shutdown completed");
      } catch (error) {
        logger.error("Error during legacy service shutdown", {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  },
} satisfies ExportedHandler<Env>;
