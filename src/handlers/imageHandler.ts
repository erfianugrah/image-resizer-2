/**
 * Image Handler
 * 
 * Main handler for image transformation requests
 */

import { ServiceContainer, TransformOptions } from '../services/interfaces';
import { extractDerivative, applyPathTransforms } from '../utils/path';
import { ValidationError } from '../utils/errors';
import { TransformImageCommand } from '../domain/commands';
import { PerformanceMetrics } from '../services/interfaces';
import { ParameterHandler } from '../parameters';

/**
 * Process an image transformation request
 * 
 * @param request The original request
 * @param url The URL to process
 * @param services Service container
 * @param metrics Performance metrics
 * @returns Response with the transformed image
 */
export async function handleImageRequest(
  request: Request,
  url: URL,
  services: ServiceContainer,
  metrics: PerformanceMetrics
): Promise<Response> {
  const { logger, configurationService } = services;
  const config = configurationService.getConfig();
  
  // Validate request method
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    throw new ValidationError(`Method ${request.method} not allowed`, { 
      allowedMethods: ['GET', 'HEAD'] 
    });
  }
  
  // Extract the path for the image (everything after removing any path parameters)
  const pathSegments = url.pathname.split('/').filter(Boolean);
  // Extract option segments (for potential future use)
  // const optionSegments = pathSegments.filter(segment => segment.startsWith('_') && segment.includes('='));
  const nonOptionSegments = pathSegments.filter(segment => !(segment.startsWith('_') && segment.includes('=')));
  const originalPath = '/' + nonOptionSegments.join('/');
  
  // Validate path - must have some content
  if (!originalPath || originalPath === '/') {
    throw new ValidationError('Invalid image path', { path: originalPath });
  }
  
  // Apply path transformations if configured
  let imagePath = originalPath;
  if (config.pathTransforms) {
    imagePath = applyPathTransforms(originalPath, config.pathTransforms);
  }
  
  // Use the new parameter handler to process all parameters
  const parameterHandler = new ParameterHandler(logger);
  const optionsFromUrl: TransformOptions = parameterHandler.handleRequest(request);
  
  // Log the parsed options
  logger.debug('Parsed transformation options', {
    optionCount: Object.keys(optionsFromUrl).length,
    hasWidth: optionsFromUrl.width !== undefined,
    hasHeight: optionsFromUrl.height !== undefined
  });
  
  // Check for derivative in path segments
  const derivativeNames = Object.keys(config.derivatives);
  
  logger.debug('Available derivatives', {
    derivatives: derivativeNames.join(', '),
    count: derivativeNames.length,
    pathname: url.pathname
  });
  
  const derivativeResult = extractDerivative(url.pathname, derivativeNames);
  
  // If a derivative was found in the path, use it and modify the image path
  if (derivativeResult && !optionsFromUrl.derivative) {
    optionsFromUrl.derivative = derivativeResult.derivative;
    
    // Update the image path to the modified one (without the derivative segment)
    imagePath = derivativeResult.modifiedPath;
    
    logger.debug('Found and applied derivative from path', {
      pathname: url.pathname,
      derivative: derivativeResult.derivative,
      originalPath: url.pathname,
      modifiedImagePath: imagePath
    });
  }
  
  // Check for named path templates (only if no derivative was found in the path)
  if (!optionsFromUrl.derivative && config.pathTemplates) {
    const segments = url.pathname.split('/').filter(Boolean);
    for (const segment of segments) {
      const templateName = config.pathTemplates[segment];
      if (templateName) {
        optionsFromUrl.derivative = templateName;
        logger.debug('Applied derivative from path template', {
          segment,
          templateName
        });
        break;
      }
    }
  }
  
  // Log derivative application status
  if (optionsFromUrl.derivative) {
    if (config.derivatives[optionsFromUrl.derivative]) {
      logger.debug('Using derivative for transformation', {
        derivative: optionsFromUrl.derivative,
        imagePath,
        templateProperties: Object.keys(config.derivatives[optionsFromUrl.derivative]).join(',')
      });
    } else {
      logger.warn('Derivative not found in configuration', {
        derivative: optionsFromUrl.derivative,
        availableDerivatives: Object.keys(config.derivatives).join(',')
      });
    }
  }
  
  // Check if the transformed image is already in KV cache before transformation
  const { cacheService } = services;
  
  // Check if transform cache is enabled in the config
  if (config.cache.transformCache?.enabled) {
    try {
      logger.breadcrumb('Checking KV transform cache before transformation');
      
      // Record KV cache lookup start time for metrics
      metrics.kvCacheLookupStart = Date.now();
      
      const cachedResponse = await cacheService.getTransformedImage(request, optionsFromUrl);
      
      // Record KV cache lookup end time for metrics
      metrics.kvCacheLookupEnd = Date.now();
      const kvCacheLookupDuration = metrics.kvCacheLookupEnd - metrics.kvCacheLookupStart;
      
      if (cachedResponse) {
        // Record that we had a cache hit
        metrics.kvCacheHit = true;
        
        logger.info('Transformed image found in KV cache, returning cached response', {
          url: request.url,
          imagePath,
          cacheKey: cachedResponse.headers.get('X-Cache-Key') || 'unknown',
          lookupDurationMs: kvCacheLookupDuration
        });
        
        // Update response headers to reflect lookup time
        const updatedResponse = new Response(cachedResponse.body, cachedResponse);
        updatedResponse.headers.set('X-KV-Cache-Lookup-Time', kvCacheLookupDuration.toString());
        updatedResponse.headers.set('X-KV-Cache', 'HIT');
        
        // We found the image in cache, return it directly without further transformation
        return updatedResponse;
      }
      
      // Record that we had a cache miss
      metrics.kvCacheHit = false;
      
      logger.debug('Transformed image not found in KV cache, proceeding with transformation', {
        url: request.url,
        imagePath,
        lookupDurationMs: kvCacheLookupDuration
      });
    } catch (error) {
      // Record metrics even on error
      if (metrics.kvCacheLookupStart !== undefined && metrics.kvCacheLookupEnd === undefined) {
        metrics.kvCacheLookupEnd = Date.now();
      }
      metrics.kvCacheError = true;
      
      // Log the error but continue with transformation
      logger.warn('Error checking KV transform cache, proceeding with transformation', {
        error: error instanceof Error ? error.message : String(error),
        url: request.url,
        imagePath,
        lookupDurationMs: metrics.kvCacheLookupEnd !== undefined && metrics.kvCacheLookupStart !== undefined ? (metrics.kvCacheLookupEnd - metrics.kvCacheLookupStart) : 'unknown'
      });
    }
  }
  
  // Create and execute the transform image command
  const transformCommand = new TransformImageCommand(
    request,
    imagePath,
    optionsFromUrl,
    services,
    metrics,
    url
  );
  
  logger.breadcrumb('Executing transform image command');
  return await transformCommand.execute();
}