/**
 * Image Resizer Worker
 * 
 * A simplified Cloudflare Worker for image resizing that leverages Cloudflare's Image Resizing service
 * while maintaining essential functionality from the original worker.
 */

import { getConfig } from './config';
import { fetchImage } from './storage';
import { transformImage, TransformOptions, setLogger as setTransformLogger } from './transform';
import { applyCacheHeaders, cacheWithCacheApi, shouldBypassCache } from './cache';
import { addDebugHeaders, createDebugHtmlReport, isDebugEnabled, PerformanceMetrics, setLogger as setDebugLogger } from './debug';
import { parseImagePath, parseQueryOptions, extractDerivative, applyPathTransforms } from './utils/path';
import { AppError, NotFoundError, ValidationError, StorageError, TransformError, createErrorResponse } from './utils/errors';
import { isAkamaiFormat, convertToCloudflareUrl, translateAkamaiParams, setLogger } from './utils/akamai-compatibility';
import { createLogger, Logger } from './utils/logging';
import { setLogger as setStorageLogger } from './storage';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // Start performance tracking
    const metrics: PerformanceMetrics = {
      start: Date.now()
    };
    
    // Get configuration
    const config = getConfig(env);
    
    // Initialize loggers for all modules
    const mainLogger = createLogger(config, 'ImageResizer');
    const akamaiLogger = createLogger(config, 'AkamaiCompat');
    const storageLogger = createLogger(config, 'Storage');
    const transformLogger = createLogger(config, 'Transform');
    const debugLogger = createLogger(config, 'Debug');
    
    // Log initialization with configured logger
    mainLogger.info(`Worker initialized with logging level ${config.logging?.level}`);
    
    // Set loggers for modules
    setLogger(akamaiLogger);
    setStorageLogger(storageLogger);
    setTransformLogger(transformLogger);
    setDebugLogger(debugLogger);
    
    // Use the main logger for this module
    const logger = mainLogger;
    
    // Start request breadcrumb trail
    logger.breadcrumb('Request started', undefined, {
      url: request.url,
      method: request.method,
      userAgent: request.headers.get('user-agent') || 'unknown'
    });
    
    // Parse URL
    let url = new URL(request.url);
    
    // Handle root path
    if (url.pathname === '/' || url.pathname === '') {
      return new Response('Image Resizer Worker', { 
        status: 200,
        headers: {
          'Content-Type': 'text/plain'
        }
      });
    }
    
    // Check for the debug report request
    if (url.pathname === '/debug-report' && isDebugEnabled(request, config)) {
      try {
        // We need a dummy storage result and transform options for the report
        const storageResult = {
          response: new Response('Debug Mode'),
          sourceType: 'remote' as const, // Use a valid source type
          contentType: 'text/plain',
          size: 0
        };
        
        const transformOptions = {
          width: 800,
          format: 'auto'
        };
        
        return createDebugHtmlReport(request, storageResult, transformOptions, config, metrics);
      } catch (error) {
        return new Response(`Error creating debug report: ${error}`, { status: 500 });
      }
    }
    
    try {
      // Validate request method
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        throw new ValidationError(`Method ${request.method} not allowed`, { 
          allowedMethods: ['GET', 'HEAD'] 
        });
      }
      
      // Check for Akamai compatibility mode
      let isAkamai = false;
      if (config.features?.enableAkamaiCompatibility) {
        logger.debug('Akamai compatibility is enabled, checking URL format', { 
          advancedFeatures: config.features?.enableAkamaiAdvancedFeatures ? 'enabled' : 'disabled'
        });
        
        // First check for Akamai parameters in the URL
        isAkamai = isAkamaiFormat(url);
        
        // If Akamai format is detected, convert parameters to Cloudflare format
        if (isAkamai) {
          // Log the original URL for debugging
          logger.info('Detected Akamai URL format', { url: url.toString() });
          
          try {
            // Convert the URL parameters, passing config for advanced feature detection
            const cfParams = translateAkamaiParams(url, config);
            
            // Store config in params for potential downstream use
            (cfParams as any)._config = config;
            
            // Convert to Cloudflare URL with our params
            const convertedUrl = new URL(url.toString());
            
            // Remove all Akamai parameters
            for (const key of Array.from(convertedUrl.searchParams.keys())) {
              if (key.startsWith('im.')) {
                convertedUrl.searchParams.delete(key);
              }
            }
            
            // Add Cloudflare parameters
            for (const [key, value] of Object.entries(cfParams)) {
              if (value !== undefined && value !== null && !key.startsWith('_')) {
                // Special handling for gravity parameter with x,y coordinates
                if (key === 'gravity' && typeof value === 'object' && 'x' in value && 'y' in value) {
                  // Use a simpler format: "x,y" for gravity coordinates (e.g., "0.5,0.3")
                  // This is easier to parse and less error-prone than JSON serialization
                  // The format matches the regex in transform.ts: /^(0(\.\d+)?|1(\.0+)?),(0(\.\d+)?|1(\.0+)?)$/
                  // Values must be between 0-1 representing the focal point position
                  const x = (value as any).x;
                  const y = (value as any).y;
                  convertedUrl.searchParams.set(key, `${x},${y}`);
                } else if (typeof value === 'object') {
                  convertedUrl.searchParams.set(key, JSON.stringify(value));
                } else {
                  convertedUrl.searchParams.set(key, String(value));
                }
              }
            }
            
            // Create a new request with the converted URL
            url = new URL(convertedUrl.toString());
            
            // Log the converted URL for debugging
            logger.info('Successfully converted to Cloudflare format', { convertedUrl: url.toString() });
          } catch (error) {
            logger.error('Error converting Akamai URL to Cloudflare format', { 
              error: String(error),
              url: url.toString()
            });
            
            // Continue with the original URL if conversion fails
            logger.warn('Continuing with original URL due to conversion error');
          }
        } else {
          logger.debug('No Akamai parameters detected in URL');
        }
      } else {
        logger.debug('Akamai compatibility is disabled');
      }
      
      // Parse the path to extract image path and options
      const { imagePath: originalPath, options: pathOptions } = parseImagePath(url.pathname);
      
      // Validate path - must have some content
      if (!originalPath || originalPath === '/') {
        throw new ValidationError('Invalid image path', { path: originalPath });
      }
      
      // Apply path transformations if configured
      let imagePath = originalPath;
      if (config.pathTransforms) {
        imagePath = applyPathTransforms(originalPath, config.pathTransforms);
      }
      
      // Parse query parameters
      const queryOptions = parseQueryOptions(url.searchParams);
      
      // Combine options (query parameters take precedence over path options)
      const optionsFromUrl: TransformOptions = {
        ...Object.entries(pathOptions).reduce((acc, [key, value]) => {
          // Convert string values to numbers or booleans when appropriate
          if (value === 'true') {
            acc[key] = true;
          } else if (value === 'false') {
            acc[key] = false;
          } else {
            const numVal = Number(value);
            acc[key] = isNaN(numVal) ? value : numVal;
          }
          return acc;
        }, {} as TransformOptions),
        ...queryOptions
      };
      
      // Check for derivative in path segments
      const derivativeNames = Object.keys(config.derivatives);
      const pathDerivative = extractDerivative(url.pathname, derivativeNames);
      
      if (pathDerivative && !optionsFromUrl.derivative) {
        optionsFromUrl.derivative = pathDerivative;
      }
      
      // Check for named path templates
      if (config.pathTemplates) {
        const segments = url.pathname.split('/').filter(Boolean);
        for (const segment of segments) {
          const templateName = config.pathTemplates[segment];
          if (templateName && !optionsFromUrl.derivative) {
            optionsFromUrl.derivative = templateName;
            break;
          }
        }
      }
      
      // Fetch the image from storage
      metrics.storageStart = Date.now();
      logger.breadcrumb('Fetching image from storage', undefined, { imagePath });
      const storageResult = await fetchImage(imagePath, config, env, request);
      metrics.storageEnd = Date.now();
      const storageDuration = metrics.storageEnd - metrics.storageStart;
      logger.breadcrumb('Storage fetch completed', storageDuration, { 
        sourceType: storageResult.sourceType,
        contentType: storageResult.contentType,
        size: storageResult.size
      });
      
      // If the storage result is an error, throw a not found error
      if (storageResult.sourceType === 'error') {
        throw new NotFoundError('Image not found', { 
          path: imagePath,
          originalPath
        });
      }
      
      // Transform the image
      metrics.transformStart = Date.now();
      logger.debug('Starting image transformation', { 
        sourceType: storageResult.sourceType,
        contentType: storageResult.contentType,
        transformOptions: optionsFromUrl
      });
      
      logger.breadcrumb('Starting image transformation', undefined, {
        sourceType: storageResult.sourceType,
        contentType: storageResult.contentType,
        format: optionsFromUrl.format,
        width: optionsFromUrl.width,
        height: optionsFromUrl.height,
        fit: optionsFromUrl.fit,
        quality: optionsFromUrl.quality,
        derivative: optionsFromUrl.derivative
      });
      
      let transformedResponse;
      try {
        transformedResponse = await transformImage(request, storageResult, optionsFromUrl, config);
        metrics.transformEnd = Date.now();
        
        const transformTime = metrics.transformEnd - metrics.transformStart;
        logger.debug('Image transformation completed', { 
          transformTimeMs: transformTime,
          status: transformedResponse.status
        });
        
        logger.breadcrumb('Image transformation completed', transformTime, {
          status: transformedResponse.status,
          contentType: transformedResponse.headers.get('content-type') || 'unknown'
        });
      } catch (error) {
        metrics.transformEnd = Date.now();
        logger.error('Image transformation failed', { 
          error: String(error),
          transformTimeMs: metrics.transformEnd - metrics.transformStart
        });
        
        throw error;
      }
      
      // Apply cache control headers
      logger.breadcrumb('Applying cache headers');
      let finalResponse = applyCacheHeaders(transformedResponse, config);
      
      // Add debug headers if enabled
      finalResponse = addDebugHeaders(
        finalResponse,
        request,
        storageResult,
        optionsFromUrl,
        config,
        metrics,
        url
      );
      
      // Add Akamai compatibility header if enabled and used
      if (config.features?.enableAkamaiCompatibility && isAkamai) {
        logger.debug('Adding Akamai compatibility header');
        
        const debugPrefix = config.debug.headerNames?.debugEnabled?.replace('Enabled', '') || 'X-Debug-';
        const headerName = `${debugPrefix}Akamai-Compatibility`;
        
        const newHeaders = new Headers(finalResponse.headers);
        newHeaders.set(headerName, 'used');
        
        logger.debug('Added Akamai compatibility header', { headerName, value: 'used' });
        
        finalResponse = new Response(finalResponse.body, {
          status: finalResponse.status,
          statusText: finalResponse.statusText,
          headers: newHeaders
        });
      }
      
      // Cache with Cache API if configured
      if (config.cache.method === 'cache-api' && !shouldBypassCache(request, config)) {
        logger.breadcrumb('Caching response with Cache API');
        finalResponse = await cacheWithCacheApi(request, finalResponse, config, ctx);
      }
      
      // Set the end time for performance metrics
      metrics.end = Date.now();
      
      // Log the end of the request with timing information
      const totalDuration = metrics.end - metrics.start;
      logger.breadcrumb('Request completed', totalDuration, {
        status: finalResponse.status,
        contentLength: finalResponse.headers.get('content-length'),
        contentType: finalResponse.headers.get('content-type'),
        totalDurationMs: totalDuration
      });
      
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
