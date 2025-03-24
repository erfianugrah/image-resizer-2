/**
 * Image Resizer Worker
 * 
 * A simplified Cloudflare Worker for image resizing that leverages Cloudflare's Image Resizing service
 * with a service-oriented architecture inspired by video-resizer.
 */

import { PerformanceMetrics } from './debug';
import { AppError, TransformError, createErrorResponse } from './utils/errors';
import { isAkamaiFormat } from './utils/akamai-compatibility';
import { setLogger as setAkamaiLogger } from './utils/akamai-compatibility';
// Storage logger is now handled through StorageService
// Transform logger is now handled through TransformationService
import { setLogger as setDebugLogger } from './debug';
import { setConfig as setDetectorConfig } from './utils/detector';
import { createServiceContainer } from './services';
import { 
  handleRootPath, 
  handleDebugReport, 
  handleAkamaiCompatibility,
  handleImageRequest,
  addAkamaiCompatibilityHeader
} from './handlers';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // Attach env and ctx to the request object for use in services
    (request as any).env = env;
    (request as any).ctx = ctx;
    
    // Start performance tracking
    const metrics: PerformanceMetrics = {
      start: Date.now()
    };
    
    // Create service container
    const services = createServiceContainer(env);
    const { logger, configurationService, loggingService } = services;
    
    // Get configuration via the configuration service
    const config = configurationService.getConfig();
    
    // Log initialization with configured logger
    logger.info(`Worker initialized with logging level ${loggingService.getLogLevel()}`);
    
    // Initialize loggers for specific modules that are not using the service pattern yet
    // We now use the loggingService to get loggers for each module
    const akamaiLogger = loggingService.getLogger('AkamaiCompat');
    const debugLogger = loggingService.getLogger('Debug');
    
    // Set loggers for modules that still use the older pattern
    // These will be refactored in subsequent steps to use the service directly
    setAkamaiLogger(akamaiLogger);
    // Storage now uses the StorageService
    // Transform now uses the TransformationService
    setDebugLogger(debugLogger);
    
    // Initialize detector with configuration if available
    if (config.detector) {
      setDetectorConfig(config.detector);
      logger.info('Client detector initialized with configuration', {
        cacheSize: config.detector.cache.maxSize,
        strategies: Object.keys(config.detector.strategies)
          .filter(key => {
            const strategy = config.detector?.strategies[key as keyof typeof config.detector.strategies];
            return strategy?.enabled;
          })
          .join(', '),
        hashAlgorithm: config.detector.hashAlgorithm || 'simple'
      });
    }
    
    // Start request breadcrumb trail
    logger.breadcrumb('Request started', undefined, {
      url: request.url,
      method: request.method,
      userAgent: request.headers.get('user-agent') || 'unknown'
    });
    
    // Parse URL
    let url = new URL(request.url);
    
    try {
      // Check for root path
      const rootResponse = handleRootPath(request);
      if (rootResponse) {
        return rootResponse;
      }
      
      // Check for debug report request
      const debugResponse = await handleDebugReport(request, services, metrics, config, logger);
      if (debugResponse) {
        return debugResponse;
      }
      
      // Handle Akamai compatibility if applicable
      const isAkamai = isAkamaiFormat(url);
      url = handleAkamaiCompatibility(request, url, services);
      
      // Process the image transformation request
      let finalResponse = await handleImageRequest(request, url, services, metrics);
      
      // Add Akamai compatibility header if enabled and used
      finalResponse = addAkamaiCompatibilityHeader(finalResponse, isAkamai, services);
      
      return finalResponse;
    } catch (error) {
      // Log the error with detailed information
      logger.error('Error processing image', {
        url: request.url,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'Unknown',
        stack: error instanceof Error ? error.stack : undefined
      });
      
      // Mark the error with a breadcrumb for easier tracing
      logger.breadcrumb('Request processing error occurred', undefined, {
        errorType: error instanceof Error ? error.constructor.name : 'Unknown',
        url: request.url,
        error: error instanceof Error ? error.message : String(error)
      });
      
      // Set the end time for performance metrics
      metrics.end = Date.now();
      const totalDuration = metrics.end - metrics.start;
      
      logger.breadcrumb('Request error metrics', totalDuration, {
        totalDurationMs: totalDuration,
        storageTimeMs: (metrics.storageEnd && metrics.storageStart) ? metrics.storageEnd - metrics.storageStart : 0,
        transformTimeMs: (metrics.transformEnd && metrics.transformStart) ? metrics.transformEnd - metrics.transformStart : 0
      });
      
      // Return a formatted error response
      if (error instanceof AppError) {
        logger.debug('Returning error response for known error type', {
          errorType: error.constructor.name,
          status: error.status
        });
        logger.breadcrumb('Returning structured error response', undefined, {
          errorType: error.constructor.name,
          status: error.status
        });
        return createErrorResponse(error);
      } else {
        // Wrap unknown errors in TransformError
        logger.debug('Wrapping unknown error in TransformError');
        logger.breadcrumb('Wrapping in TransformError', undefined, {
          originalError: error instanceof Error ? error.message : String(error)
        });
        const transformError = new TransformError(
          `Error processing image: ${error instanceof Error ? error.message : String(error)}`
        );
        return createErrorResponse(transformError);
      }
    }
  },
} satisfies ExportedHandler<Env>;