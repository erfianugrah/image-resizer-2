/**
 * Transform Image Command
 * 
 * Encapsulates the business logic for transforming an image
 */

import { ServiceContainer, ClientInfo, TransformOptions, PerformanceMetrics } from '../../services/interfaces';
import { Env } from '../../types';
import type { ExecutionContext } from '@cloudflare/workers-types';
import { Command } from './command';

/**
 * Command to transform an image based on the provided options
 */
export class TransformImageCommand implements Command<Response> {
  private readonly request: Request;
  private readonly imagePath: string;
  private readonly options: TransformOptions;
  private readonly services: ServiceContainer;
  private readonly metrics: PerformanceMetrics;
  private readonly url: URL;
  private clientInfo?: ClientInfo;

  /**
   * Create a new TransformImageCommand
   * 
   * @param request Original request
   * @param imagePath Path to the image
   * @param options Transformation options
   * @param services Service container
   * @param metrics Performance metrics
   * @param url Request URL
   */
  constructor(
    request: Request, 
    imagePath: string,
    options: TransformOptions, 
    services: ServiceContainer,
    metrics: PerformanceMetrics,
    url: URL
  ) {
    this.request = request;
    this.imagePath = imagePath;
    this.options = options;
    this.services = services;
    this.metrics = metrics;
    this.url = url;
  }

  /**
   * Execute the command to transform the image
   * 
   * @returns Response with the transformed image
   */
  async execute(): Promise<Response> {
    const { logger, storageService, transformationService, cacheService, debugService, configurationService } = this.services;
    const config = configurationService.getConfig();
    
    // Check for duplicated processing attempt
    const via = this.request.headers.get('via') || '';
    const cfWorker = this.request.headers.get('cf-worker') || '';
    const alreadyProcessed = this.request.headers.get('x-img-resizer-processed') || '';
    
    // Generate a unique request ID for tracking and diagnostics
    const requestId = Math.random().toString(36).substring(2, 10);
    
    // Check if this is a possible duplicate
    const possibleDuplicate = via.includes('image-resizing') || 
                            via.includes('image-resizing-proxy') || 
                            cfWorker.includes('image-resizer') || 
                            alreadyProcessed === 'true';
    
    // Log detailed request information for debugging
    logger.breadcrumb('Starting image transformation command', undefined, {
      url: this.url.toString(),
      imagePath: this.imagePath,
      options: Object.keys(this.options).join(','),
      requestId: requestId,
      via: via,
      cfWorker: cfWorker,
      alreadyProcessed: alreadyProcessed,
      possibleDuplicate: possibleDuplicate
    });

    try {
      // Fetch the image from storage
      this.metrics.storageStart = Date.now();
      logger.breadcrumb('Fetching image from storage', undefined, { imagePath: this.imagePath });
      
      const storageResult = await storageService.fetchImage(
        this.imagePath, 
        config, 
        (this.request as unknown as { env: Env }).env, 
        this.request
      );
      
      this.metrics.storageEnd = Date.now();
      const storageDuration = this.metrics.storageEnd - this.metrics.storageStart;
      
      logger.breadcrumb('Storage fetch completed', storageDuration, {
        sourceType: storageResult.sourceType,
        contentType: storageResult.contentType,
        size: storageResult.size
      });

      // Transform the image
      this.metrics.transformStart = Date.now();
      logger.breadcrumb('Starting image transformation', undefined, {
        sourceType: storageResult.sourceType,
        contentType: storageResult.contentType,
        options: Object.keys(this.options).join(',')
      });
      
      // Check if smart processing is requested
      let transformOptions = { ...this.options };
      if (transformOptions.smart === true && transformationService.processSmartOptions) {
        logger.breadcrumb('Smart transformation requested, processing with metadata', undefined, {
          imagePath: this.imagePath,
          smartOptions: JSON.stringify({
            platform: transformOptions.platform,
            content: transformOptions.content,
            device: transformOptions.device,
            aspect: transformOptions.aspect
          })
        });
        
        try {
          // Process with metadata service to get optimized parameters
          transformOptions = await transformationService.processSmartOptions(
            this.request,
            this.imagePath,
            transformOptions,
            config,
            (this.request as unknown as { env: Env }).env
          );
          
          logger.debug('Smart transformation options applied', {
            originalOptionCount: Object.keys(this.options).length,
            processedOptionCount: Object.keys(transformOptions).length,
            width: transformOptions.width,
            height: transformOptions.height,
            fit: transformOptions.fit,
            hasGravity: !!transformOptions.gravity
          });
        } catch (error) {
          logger.error('Error in smart transformation processing', {
            error: error instanceof Error ? error.message : String(error)
          });
          // Continue with original options if smart processing fails
        }
      }
      
      const transformedResponse = await transformationService.transformImage(
        this.request,
        storageResult,
        transformOptions,
        config
      );
      
      this.metrics.transformEnd = Date.now();
      const transformDuration = this.metrics.transformEnd - this.metrics.transformStart;
      
      logger.breadcrumb('Image transformation completed', transformDuration, {
        status: transformedResponse.status,
        contentType: transformedResponse.headers.get('content-type') || 'unknown'
      });

      // Apply cache headers with enhanced options
      logger.breadcrumb('Applying cache headers with smart options');
      let finalResponse = cacheService.applyCacheHeaders(
        transformedResponse, 
        this.options,
        storageResult
      );

      // Detect client info for debug reporting if requested
      if (debugService.isDebugEnabled(this.request, config)) {
        try {
          // Only try to get client info if we need it for debug purposes
          if (!this.clientInfo) {
            this.metrics.detectionStart = Date.now();
            
            // Use the clientDetectionService as the primary method for client detection
            this.clientInfo = await this.services.clientDetectionService.detectClient(this.request);
            this.metrics.detectionSource = 'client-detection-service';
            
            logger.debug('Detected client info for debug headers', {
              deviceType: this.clientInfo?.deviceType,
              viewportWidth: this.clientInfo?.viewportWidth,
              dpr: this.clientInfo?.devicePixelRatio,
              networkQuality: this.clientInfo?.networkQuality,
              deviceClassification: this.clientInfo?.deviceClassification
            });
            
            this.metrics.detectionEnd = Date.now();
          }
        } catch (error) {
          logger.warn('Error detecting client info for debug', {
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
      
      // Add debug headers if enabled
      finalResponse = debugService.addDebugHeaders(
        finalResponse,
        this.request,
        storageResult,
        this.options,
        config,
        this.metrics,
        this.url
      );

      // Always store transformed image in KV cache regardless of Client Cache-Control
      // This allows us to have the transformed image for future requests
      if (storageResult && config.cache.transformCache?.enabled) {
        logger.breadcrumb('Storing transformed image in KV cache using waitUntil');
        try {
          // Clone the response and read the buffer synchronously before passing to waitUntil
          // This ensures the response body is fully read before it's closed
          const responseToCache = finalResponse.clone();
          const responseBuffer = await responseToCache.arrayBuffer();
          
          // Add buffer to storage result
          const enhancedStorageResult = {
            ...storageResult,
            buffer: responseBuffer,
            storageType: storageResult.sourceType || 'transform',
            contentType: responseToCache.headers.get('Content-Type') || storageResult.contentType,
            size: responseBuffer.byteLength
          };
          
          logger.debug('Prepared response buffer for KV caching', {
            bufferSize: responseBuffer.byteLength,
            contentType: enhancedStorageResult.contentType,
            url: this.request.url
          });
          
          // Use the execution context for background processing
          const ctx = (this.request as unknown as { ctx: ExecutionContext }).ctx;
          
          // Make sure we have a valid execution context with waitUntil
          if (ctx && typeof ctx.waitUntil === 'function') {
            // Use waitUntil to run the KV transform caching in the background
            // This ensures KV operations don't block the response
            ctx.waitUntil(
              cacheService.storeTransformedImage(
                this.request,
                new Response(responseBuffer.slice(0), {
                  status: 200,
                  headers: responseToCache.headers
                }),
                enhancedStorageResult as any,
                this.options,
                ctx
              ).catch(err => {
                logger.error('Error in background KV transform storage', {
                  error: err instanceof Error ? err.message : String(err),
                  stack: err instanceof Error ? err.stack : undefined,
                  url: this.request.url
                });
              })
            );
            
            logger.debug('Background KV transform cache operation initiated with buffer', {
              bufferSize: responseBuffer.byteLength,
              contentType: enhancedStorageResult.contentType
            });
          } else {
            // No valid context, log a warning but continue without blocking
            logger.warn('No valid execution context available for background KV transform caching', {
              hasContext: !!ctx,
              hasWaitUntil: ctx ? (typeof ctx.waitUntil === 'function') : false,
              url: this.request.url
            });
          }
        } catch (error) {
          logger.error('Error initiating KV transform cache operation', {
            error: error instanceof Error ? error.message : String(error),
            url: this.request.url
          });
          // Continue even if KV caching fails - this is non-blocking
        }
      }

      // Cache with enhanced fallback mechanism only if not bypassed
      if (!cacheService.shouldBypassCache(this.request, this.options)) {
        logger.breadcrumb('Caching response with enhanced strategy');
        finalResponse = await cacheService.cacheWithFallback(
          this.request,
          finalResponse,
          (this.request as unknown as { ctx: ExecutionContext }).ctx,
          this.options,
          storageResult
        );
      }

      // Set the end time for performance metrics
      this.metrics.end = Date.now();
      const totalDuration = this.metrics.end - this.metrics.start;
      
      logger.breadcrumb('Transform image command completed', totalDuration, {
        status: finalResponse.status,
        contentLength: finalResponse.headers.get('content-length'),
        contentType: finalResponse.headers.get('content-type'),
        totalDurationMs: totalDuration
      });

      // URL contains ?debug=html, show debug report instead of the image
      if (this.url.searchParams.get('debug') === 'html' && debugService.isDebugEnabled(this.request, config)) {
        logger.info('Switching to HTML debug report due to debug=html parameter');
        
        return debugService.createDebugHtmlReport(
          this.request,
          storageResult,
          this.options,
          config,
          this.metrics,
          this.clientInfo
        );
      }
      
      return finalResponse;
    } catch (error) {
      // Log the error with detailed information
      logger.error('Error in transform image command', {
        url: this.request.url,
        error: error instanceof Error ? error.message : String(error),
        errorType: error instanceof Error ? error.constructor.name : 'Unknown',
        stack: error instanceof Error ? error.stack : undefined
      });

      // Re-throw the error to be handled by the main handler
      throw error;
    }
  }
}