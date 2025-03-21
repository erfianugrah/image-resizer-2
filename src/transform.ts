/**
 * Image transformation utilities for the image resizer worker
 * 
 * This module provides functions for transforming images using Cloudflare's Image Resizing service
 * via the `cf.image` object.
 */

import { ImageResizerConfig } from './config';
import { StorageResult } from './storage';
import { applyCloudflareCache } from './cache';
import { createLogger, Logger, defaultLogger } from './utils/logging';

// Use default logger until a configured one is provided
let logger: Logger = defaultLogger;

/**
 * Set the logger for the transform module
 * 
 * @param configuredLogger The logger to use
 */
export function setLogger(configuredLogger: Logger): void {
  logger = configuredLogger;
}

/**
 * Image transformation options
 */
export interface TransformOptions {
  width?: number;
  height?: number;
  fit?: string;
  gravity?: string;
  quality?: number;
  format?: string;
  background?: string;
  dpr?: number;
  metadata?: string;
  sharpen?: number;
  trim?: number | boolean | string;
  rotate?: number;
  brightness?: number;
  contrast?: number;
  saturation?: number;
  derivative?: string;
  blur?: number;
  flip?: boolean;
  flop?: boolean;
  draw?: any[];  // For watermarks and overlays
  'origin-auth'?: 'share-publicly';
  _conditions?: any[]; // For conditional transformations (internal use)
  _customEffects?: any[]; // For custom effects (internal use)
  [key: string]: any;
}

/**
 * Get the appropriate width for the image based on client hints and configuration
 */
function getResponsiveWidth(
  options: TransformOptions,
  request: Request,
  config: ImageResizerConfig
): number | undefined {
  // If a specific width is requested, use that
  if (options.width) {
    return options.width;
  }
  
  // Get client hint for viewport width - try modern and legacy headers
  const viewportWidth = 
    request.headers.get('Sec-CH-Viewport-Width') || 
    request.headers.get('Viewport-Width') ||
    request.headers.get('Width');
  
  // Get device pixel ratio
  const dpr = 
    request.headers.get('Sec-CH-DPR') || 
    request.headers.get('DPR') || 
    '1';
  
  // Check for save-data header
  const saveData = request.headers.get('Save-Data') === 'on';
  
  // Check for network information
  const downlink = request.headers.get('Downlink');
  const rtt = request.headers.get('RTT');
  
  // Get Cloudflare's device type if available
  const cfDeviceType = request.headers.get('CF-Device-Type');
  
  // Detect device type from user agent as fallback
  const userAgent = request.headers.get('User-Agent') || '';
  
  // Use configurable regex patterns if available, or fall back to defaults
  const mobileRegex = config.responsive.deviceDetection?.mobileRegex || 'Mobile|Android|iPhone|iPad|iPod';
  const tabletRegex = config.responsive.deviceDetection?.tabletRegex || 'iPad|Android(?!.*Mobile)';
  
  const isMobile = new RegExp(mobileRegex, 'i').test(userAgent);
  const isTablet = new RegExp(tabletRegex, 'i').test(userAgent);
  
  // Determine device category - first try CF headers, then fall back to UA detection
  let deviceCategory = 'desktop';
  
  if (cfDeviceType) {
    // Use Cloudflare's device detection if available
    if (cfDeviceType.toLowerCase() === 'mobile') {
      deviceCategory = 'mobile';
    } else if (cfDeviceType.toLowerCase() === 'tablet') {
      deviceCategory = 'tablet';
    }
  } else {
    // Fall back to user agent detection
    if (isMobile && !isTablet) {
      deviceCategory = 'mobile';
    } else if (isTablet) {
      deviceCategory = 'tablet';
    }
  }
  
  // Get width from config based on device type
  let width: number | undefined;
  if (deviceCategory && config.responsive.deviceWidths[deviceCategory]) {
    width = config.responsive.deviceWidths[deviceCategory];
  }
  
  // If we have a viewport width, use that with the device pixel ratio
  if (viewportWidth) {
    const parsedWidth = parseInt(viewportWidth, 10);
    const parsedDpr = parseFloat(dpr);
    
    if (!isNaN(parsedWidth) && !isNaN(parsedDpr)) {
      // Find the closest breakpoint that's larger than the viewport width
      const calculatedWidth = parsedWidth * parsedDpr;
      
      // Find the next largest breakpoint
      const nextBreakpoint = config.responsive.breakpoints.find(bp => bp >= calculatedWidth);
      
      // Use the next breakpoint or the largest one
      width = nextBreakpoint || config.responsive.breakpoints[config.responsive.breakpoints.length - 1];
    }
  }
  
  return width;
}

/**
 * Get image format based on request Accept header and configuration
 */
function getFormat(
  request: Request,
  contentType: string | null,
  options: TransformOptions,
  config: ImageResizerConfig
): string {
  // If a specific format is requested, use that
  if (options.format && options.format !== 'auto') {
    return options.format;
  }
  
  // Get the Accept header to determine browser support
  const acceptHeader = request.headers.get('Accept') || '';
  
  // Check for format support in the browser
  const supportsWebP = acceptHeader.includes('image/webp');
  const supportsAVIF = acceptHeader.includes('image/avif');
  
  // Determine the original format from content type
  let originalFormat = 'jpeg';
  if (contentType) {
    if (contentType.includes('png')) {
      originalFormat = 'png';
    } else if (contentType.includes('gif')) {
      originalFormat = 'gif';
    } else if (contentType.includes('svg')) {
      originalFormat = 'svg';
    } else if (contentType.includes('webp')) {
      originalFormat = 'webp';
    } else if (contentType.includes('avif')) {
      originalFormat = 'avif';
    }
  }
  
  // Choose the optimal format
  if (options.format === 'auto' || !options.format) {
    if (supportsAVIF) {
      return 'avif';
    } else if (supportsWebP) {
      return 'webp';
    } else if (originalFormat === 'gif' && options.width && options.width < 100) {
      // For small animated thumbnails, keep gif
      return 'gif';
    } else if (originalFormat === 'svg') {
      // For SVGs, keep as SVG unless we're specifically changing dimensions
      return (options.width || options.height) ? 'png' : 'svg';
    } else if (originalFormat === 'png' && contentType && contentType.includes('png')) {
      // Check if the PNG might have transparency (simplistic check)
      return 'png';
    }
    
    // Default to WebP if supported, otherwise JPEG
    return supportsWebP ? 'webp' : 'jpeg';
  }
  
  return options.format || config.responsive.format;
}

/**
 * Apply derivative template to transform options
 */
function applyDerivativeTemplate(
  options: TransformOptions,
  derivative: string,
  config: ImageResizerConfig
): TransformOptions {
  // If the derivative doesn't exist, return the original options
  if (!derivative || !config.derivatives[derivative]) {
    return options;
  }
  
  // Get the derivative template
  const template = config.derivatives[derivative];
  
  // Merge the template with the options, with options taking precedence
  const result: TransformOptions = { ...template };
  
  // Override with any explicitly set options
  Object.keys(options).forEach(key => {
    if (options[key] !== undefined) {
      result[key] = options[key];
    }
  });
  
  return result;
}

/**
 * Build Cloudflare image transformation options
 */
export function buildTransformOptions(
  request: Request,
  storageResult: StorageResult,
  options: TransformOptions,
  config: ImageResizerConfig
): TransformOptions {
  logger.breadcrumb('buildTransformOptions started', undefined, {
    imageSize: storageResult.size,
    contentType: storageResult.contentType,
    optionsProvided: Object.keys(options).join(',') || 'none'
  });
  
  // Check if no options were provided at all (empty object)
  const noOptionsProvided = Object.keys(options).length === 0;
  
  // If no options provided, treat as auto for all parameters
  if (noOptionsProvided) {
    options = { 
      width: 'auto' as any,
      height: 'auto' as any,
      format: 'auto',
      quality: 'auto' as any
    };
  }
  
  // Apply derivative template if specified
  let transformOptions = options;
  if (options.derivative && config.derivatives[options.derivative]) {
    transformOptions = applyDerivativeTemplate(options, options.derivative, config);
  }
  
  // Handle 'auto' width specifically
  if ((transformOptions.width as any) === 'auto' || String(transformOptions.width) === 'auto') {
    delete transformOptions.width; // Remove 'auto' so it doesn't get sent to Cloudflare
  }
  
  // Get responsive width if not explicitly set
  if (!transformOptions.width) {
    logger.breadcrumb('Calculating responsive width', undefined, { 
      hasWidth: false,
      userAgent: request.headers.get('User-Agent') || 'unknown',
      viewportWidth: request.headers.get('Sec-CH-Viewport-Width') || request.headers.get('Viewport-Width') || 'unknown',
      deviceType: request.headers.get('CF-Device-Type') || 'unknown'
    });
    const responsiveWidthStart = Date.now();
    const responsiveWidth = getResponsiveWidth(transformOptions, request, config);
    logger.breadcrumb('Responsive width calculated', Date.now() - responsiveWidthStart, { 
      calculatedWidth: responsiveWidth
    });
    if (responsiveWidth) {
      transformOptions.width = responsiveWidth;
      logger.breadcrumb('Applied responsive width', undefined, { width: responsiveWidth });
    } else {
      logger.breadcrumb('No responsive width determined, using original dimensions');
    }
  }
  
  // Get appropriate format
  if (!transformOptions.format || transformOptions.format === 'auto') {
    logger.breadcrumb('Determining output format', undefined, { 
      originalFormat: 'auto',
      contentType: storageResult.contentType,
      acceptHeader: request.headers.get('Accept') || 'none',
      saveData: request.headers.get('Save-Data') === 'on'
    });
    
    const formatStart = Date.now();
    // If Save-Data is enabled, prefer more efficient formats
    if (request.headers.get('Save-Data') === 'on') {
      // Use AVIF if accepted, otherwise WebP for best compression
      const acceptHeader = request.headers.get('Accept') || '';
      logger.breadcrumb('Save-Data header detected, using efficient format');
      
      if (acceptHeader.includes('image/avif')) {
        transformOptions.format = 'avif';
        logger.breadcrumb('Selected AVIF format for Save-Data');
      } else if (acceptHeader.includes('image/webp')) {
        transformOptions.format = 'webp';
        logger.breadcrumb('Selected WebP format for Save-Data');
      } else {
        transformOptions.format = getFormat(request, storageResult.contentType, transformOptions, config);
        logger.breadcrumb('Selected fallback format for Save-Data', undefined, { format: transformOptions.format });
      }
    } else {
      transformOptions.format = getFormat(request, storageResult.contentType, transformOptions, config);
      logger.breadcrumb('Selected format based on content negotiation', undefined, { format: transformOptions.format });
    }
    logger.breadcrumb('Format determination completed', Date.now() - formatStart, { 
      finalFormat: transformOptions.format,
      originalContentType: storageResult.contentType
    });
  }
  
  // Handle 'auto' quality
  if ((transformOptions.quality as any) === 'auto' || String(transformOptions.quality) === 'auto') {
    logger.breadcrumb('Auto quality detected, removing auto parameter');
    delete transformOptions.quality; // Remove 'auto' so it doesn't get sent to Cloudflare
  }
  
  // Set default quality if not specified
  if (transformOptions.quality === undefined) {
    logger.breadcrumb('Determining quality setting', undefined, {
      format: transformOptions.format,
      saveData: request.headers.get('Save-Data') === 'on',
      downlink: request.headers.get('Downlink') || 'unknown'
    });
    
    const qualityStart = Date.now();
    // Check for network conditions and Save-Data
    const saveData = request.headers.get('Save-Data') === 'on';
    const downlink = parseFloat(request.headers.get('Downlink') || '0');
    
    // Network-aware quality settings
    if (saveData || downlink > 0 && downlink < 1.0) {
      logger.breadcrumb('Using low-bandwidth quality settings', undefined, {
        saveData: saveData,
        downlink: downlink
      });
      
      // Low quality for save-data or slow connections
      const format = transformOptions.format as string;
      
      // Use format-specific quality from config if available
      if (config.responsive.formatQuality && format in config.responsive.formatQuality) {
        // For low bandwidth, use 85-90% of the normal quality
        const normalQuality = config.responsive.formatQuality[format];
        transformOptions.quality = Math.round(normalQuality * 0.85);
        logger.breadcrumb('Using adjusted quality from config', undefined, {
          format,
          normalQuality,
          adjustedQuality: transformOptions.quality
        });
      } else {
        // Fallback quality values if not in config
        if (format === 'webp') {
          transformOptions.quality = 75;
          logger.breadcrumb('Using fallback low WebP quality');
        } else if (format === 'avif') {
          transformOptions.quality = 70;
          logger.breadcrumb('Using fallback low AVIF quality');
        } else {
          transformOptions.quality = 75;
          logger.breadcrumb('Using fallback low quality for other format');
        }
      }
    } else {
      logger.breadcrumb('Using standard quality settings');
      // Standard quality settings
      const format = transformOptions.format as string;
      
      // Use format-specific quality from config if available
      if (config.responsive.formatQuality && format in config.responsive.formatQuality) {
        transformOptions.quality = config.responsive.formatQuality[format];
        logger.breadcrumb('Using quality from config', undefined, {
          format,
          quality: transformOptions.quality
        });
      } else {
        // Fallback quality values if not in config
        if (format === 'webp') {
          transformOptions.quality = 85;
          logger.breadcrumb('Using fallback standard WebP quality');
        } else if (format === 'avif') {
          transformOptions.quality = 80;
          logger.breadcrumb('Using fallback standard AVIF quality');
        } else {
          transformOptions.quality = config.responsive.quality;
          logger.breadcrumb('Using fallback standard quality from config');
        }
      }
    }
    logger.breadcrumb('Quality determination completed', Date.now() - qualityStart, {
      finalQuality: transformOptions.quality,
      format: transformOptions.format
    });
  }
  
  // Handle 'auto' height - simply remove it to preserve aspect ratio
  if ((transformOptions.height as any) === 'auto' || String(transformOptions.height) === 'auto') {
    delete transformOptions.height; // Remove 'auto' so it doesn't get sent to Cloudflare
  }
  
  // Set default fit if not specified
  if (transformOptions.fit === undefined) {
    transformOptions.fit = config.responsive.fit;
  }
  
  // Set default metadata handling if not specified
  if (transformOptions.metadata === undefined) {
    transformOptions.metadata = config.responsive.metadata;
  }
  
  // Process conditions based on image properties if available
  if (transformOptions._conditions) {
    logger.breadcrumb('Processing conditional transformations', undefined, {
      conditionCount: transformOptions._conditions.length,
      conditionTypes: transformOptions._conditions.map(c => c.type).join(',')
    });
    
    try {
      // Process each condition
      for (const condition of transformOptions._conditions) {
        if (condition.type === 'dimension') {
          // Parse and apply dimension condition
          logger.breadcrumb('Processing dimension condition', undefined, {
            condition: condition.condition
          });
          
          const dimensionResult = applyDimensionCondition(condition.condition, storageResult);
          
          // Merge resulting options
          if (dimensionResult && Object.keys(dimensionResult).length > 0) {
            logger.breadcrumb('Applying conditional transformation', undefined, {
              appliedParams: Object.keys(dimensionResult).join(',')
            });
            
            Object.keys(dimensionResult).forEach(key => {
              transformOptions[key] = dimensionResult[key];
            });
          } else {
            logger.breadcrumb('Condition not met or no transformation specified');
          }
        }
      }
    } catch (error) {
      logger.error('Error processing conditional transformations', {
        error: error instanceof Error ? error.message : String(error)
      });
    }
    
    // Remove condition metadata to avoid sending it to Cloudflare
    delete transformOptions._conditions;
  }
  
  // Clean up any undefined or null values
  const result: TransformOptions = {};
  Object.keys(transformOptions).forEach(key => {
    if (transformOptions[key] !== undefined && transformOptions[key] !== null) {
      result[key] = transformOptions[key];
    }
  });
  
  // Add origin-auth configuration if enabled
  if (config.storage.auth?.enabled && config.storage.auth.useOriginAuth) {
    if (config.storage.auth.sharePublicly) {
      result['origin-auth'] = 'share-publicly';
    }
  }
  
  // Let Cloudflare Image Resizing handle validation and provide warning headers
  logger.breadcrumb('buildTransformOptions completed', undefined, {
    finalOptionsCount: Object.keys(result).length,
    hasWidth: !!result.width,
    hasHeight: !!result.height,
    format: result.format,
    quality: result.quality,
    fit: result.fit,
  });
  
  return result;
}

/**
 * Transform an image using Cloudflare Image Resizing
 * 
 * @param request The original request
 * @param storageResult The storage result containing the image
 * @param options Transformation options
 * @param config The image resizer configuration
 * @returns A transformed image response
 */
export async function transformImage(
  request: Request,
  storageResult: StorageResult,
  options: TransformOptions,
  config: ImageResizerConfig
): Promise<Response> {
  // If it's an error response, just return it
  if (storageResult.sourceType === 'error') {
    return storageResult.response;
  }
  
  // Check if this is an image-resizing subrequest - if so, we shouldn't transform
  const via = request.headers.get('via') || '';
  if (via.includes('image-resizing')) {
    logger.debug('Detected image-resizing subrequest, skipping transformation', {
      path: storageResult.path,
      via,
      sourceType: storageResult.sourceType,
      storageOrder: config.storage.priority.join(',')
    });
    return storageResult.response;
  }
  
  // Log info about large images that might cause timeouts
  if (storageResult.size && storageResult.size > 10 * 1024 * 1024) {
    logger.breadcrumb('Large image detected', undefined, {
      size: storageResult.size,
      contentType: storageResult.contentType
    });
  }
  
  // Clone the original response to avoid consuming the body
  const originalResponse = storageResult.response.clone();
  
  logger.breadcrumb('Building transform options');
  const buildStart = Date.now();
  // Build transformation options
  const transformOptions = buildTransformOptions(request, storageResult, options, config);
  const buildEnd = Date.now();
  logger.breadcrumb('Built transform options', buildEnd - buildStart, transformOptions);
  
  try {
    // Prepare fetch options with image transformations
    const fetchOptions = {
      method: 'GET',
      cf: {
        // Apply image transformations
        image: transformOptions as Record<string, unknown>
      }
    };
    
    // Log transform options for debugging
    logger.debug('Transform options', transformOptions);
    
    logger.breadcrumb('Applying cache settings');
    const cacheStart = Date.now();
    // Apply cache settings including cache tags
    // Pass response headers to extract metadata for cache tags
    const fetchOptionsWithCache = applyCloudflareCache(
      fetchOptions,
      config,
      storageResult.path,
      transformOptions,
      storageResult.response.headers
    );
    const cacheEnd = Date.now();
    logger.breadcrumb('Applied cache settings', cacheEnd - cacheStart);
    
    // Add a timeout to prevent long-running transformations (worker timeout is 30s)
    const timeoutPromise = new Promise<Response>((_, reject) => {
      setTimeout(() => {
        logger.breadcrumb('Image transformation timed out', 25000, { url: request.url });
        reject(new Error('Image transformation timed out after 25 seconds'));
      }, 25000); // 25 second timeout (5s before worker timeout)
    });
    
    // Transform the image using Cloudflare's cf.image with timeout
    logger.breadcrumb('Starting Cloudflare image transformation', undefined, { 
      url: request.url,
      imageSize: storageResult.size,
      transformOptionsCount: Object.keys(transformOptions).length
    });
    
    // Log the actual Cloudflare options being passed
    logger.breadcrumb('CF image transform options', undefined, {
      cfOptions: JSON.stringify(fetchOptionsWithCache.cf),
      hasWidth: !!transformOptions.width,
      hasHeight: !!transformOptions.height,
      hasFit: !!transformOptions.fit,
      format: transformOptions.format,
      quality: transformOptions.quality
    });
    
    const fetchStart = Date.now();
    
    // Create the transformation promise using direct cf.image approach
    logger.breadcrumb('Creating fetch promise with CF options');
    const transformPromise = fetch(request.url, fetchOptionsWithCache);
    logger.breadcrumb('Fetch promise created', Date.now() - fetchStart);
    
    // Use Promise.race to implement the timeout
    logger.breadcrumb('Awaiting CF transformation result');
    const raceStart = Date.now();
    const transformed = await Promise.race([transformPromise, timeoutPromise]);
    const fetchEnd = Date.now();
    
    logger.breadcrumb('Cloudflare transformation completed', fetchEnd - fetchStart, { 
      status: transformed.status,
      contentType: transformed.headers.get('content-type') || 'unknown',
      raceTime: fetchEnd - raceStart,
      totalTime: fetchEnd - fetchStart
    });
    
    if (!transformed.ok) {
      // If transformation failed, return the original
      logger.error('Image transformation failed', { 
        status: transformed.status,
        statusText: transformed.statusText,
        headers: JSON.stringify(Object.fromEntries([...transformed.headers.entries()])),
        url: request.url,
        imageSize: storageResult.size,
        transformOptionsCount: Object.keys(transformOptions).length
      });
      
      // Check if the status is 524 (timeout)
      if (transformed.status === 524) {
        logger.breadcrumb('Detected 524 timeout during transformation', undefined, {
          imageSize: storageResult.size,
          transformDuration: fetchEnd - fetchStart,
          format: transformOptions.format,
          width: transformOptions.width,
          height: transformOptions.height
        });
      }
      
      logger.breadcrumb('Falling back to original image due to transform failure', undefined, {
        errorStatus: transformed.status,
        cfRay: transformed.headers.get('cf-ray') || 'unknown'
      });
      return originalResponse;
    }
    
    // Create a new response with appropriate headers
    logger.breadcrumb('Creating final response');
    const response = new Response(transformed.body, {
      headers: transformed.headers,
      status: transformed.status,
      statusText: transformed.statusText,
    });
    
    // Add cache control headers based on configuration
    if (config.cache.cacheability) {
      response.headers.set('Cache-Control', `public, max-age=${config.cache.ttl.ok}`);
      logger.breadcrumb('Added cache control headers', undefined, {
        cacheControl: `public, max-age=${config.cache.ttl.ok}`
      });
    }
    
    return response;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    
    logger.error('Error transforming image', {
      error: errorMsg,
      stack: stack
    });
    
    logger.breadcrumb('Transformation error occurred', undefined, {
      error: errorMsg,
      fallback: 'original image'
    });
    
    // In case of error, return the original image
    return originalResponse;
  }
}

/**
 * Apply a dimension condition to transform options
 * 
 * @param condition The dimension condition string (e.g. "width>500,im.resize=width:300")
 * @param storageResult The storage result with image metadata
 * @returns TransformOptions to apply if the condition is met
 */
function applyDimensionCondition(condition: string, storageResult: StorageResult): TransformOptions {
  // Format: condition,transform (e.g. width>500,im.resize=width:300)
  const parts = condition.split(',', 2);
  if (parts.length !== 2) {
    logger.breadcrumb('Invalid condition format, expected condition,transform', undefined, {
      condition
    });
    return {};
  }
  
  const [conditionPart, transformPart] = parts;
  
  // Parse condition
  const match = conditionPart.match(/^(width|height|ratio|format)([<>=]+)([0-9.]+)$/);
  if (!match) {
    logger.breadcrumb('Invalid condition syntax', undefined, {
      conditionPart
    });
    return {};
  }
  
  const [_, property, operator, valueStr] = match;
  const value = parseFloat(valueStr);
  
  // Get image dimensions from headers or metadata
  let width: number | undefined;
  let height: number | undefined;
  
  // Try to get dimensions from content length, CF object, or estimate from size
  if (storageResult.width && storageResult.height) {
    width = storageResult.width;
    height = storageResult.height;
    logger.breadcrumb('Using dimensions from storage result', undefined, { width, height });
  } else {
    // Attempt to parse from headers
    const contentType = storageResult.contentType;
    const contentLength = storageResult.size;
    
    if (contentType && contentLength) {
      // Make a rough estimate based on content type and size
      // This is a very rough heuristic and should be replaced with actual metadata
      const isJpeg = contentType.includes('jpeg') || contentType.includes('jpg');
      const isPng = contentType.includes('png');
      
      if (isJpeg || isPng) {
        // Very rough estimate based on file size
        // Assuming an average of 0.25 bytes per pixel for JPEG and 1 byte per pixel for PNG
        const bytesPerPixel = isJpeg ? 0.25 : 1;
        const estimatedPixels = contentLength / bytesPerPixel;
        
        // Guess dimensions assuming a 4:3 aspect ratio
        const estimatedWidth = Math.sqrt(estimatedPixels * (4/3));
        const estimatedHeight = estimatedWidth * (3/4);
        
        width = Math.round(estimatedWidth);
        height = Math.round(estimatedHeight);
        
        logger.breadcrumb('Using estimated dimensions from file size', undefined, {
          width,
          height,
          contentType,
          contentLength,
          estimation: 'very rough'
        });
      }
    }
  }
  
  // If we still don't have dimensions, we can't evaluate the condition
  if ((property === 'width' || property === 'height' || property === 'ratio') && 
      (width === undefined || height === undefined)) {
    logger.breadcrumb('Cannot evaluate dimension condition, no dimensions available');
    return {};
  }
  
  // Check condition
  let conditionMet = false;
  
  if (property === 'width' && width !== undefined) {
    conditionMet = evaluateCondition(width, operator, value);
    logger.breadcrumb('Evaluated width condition', undefined, {
      actualWidth: width,
      operator,
      expectedValue: value,
      result: conditionMet
    });
  } else if (property === 'height' && height !== undefined) {
    conditionMet = evaluateCondition(height, operator, value);
    logger.breadcrumb('Evaluated height condition', undefined, {
      actualHeight: height,
      operator,
      expectedValue: value,
      result: conditionMet
    });
  } else if (property === 'ratio' && width !== undefined && height !== undefined) {
    const ratio = width / height;
    conditionMet = evaluateCondition(ratio, operator, value);
    logger.breadcrumb('Evaluated ratio condition', undefined, {
      actualRatio: ratio.toFixed(3),
      operator,
      expectedValue: value,
      result: conditionMet
    });
  }
  
  // If condition is met, parse and apply the transformation
  if (conditionMet && transformPart) {
    logger.breadcrumb('Condition met, applying transformation', undefined, {
      transform: transformPart
    });
    
    // If transformation starts with "im.", it's in Akamai format
    if (transformPart.startsWith('im.')) {
      try {
        // We'll use the existing akamai-compatibility module to parse these
        // To avoid circular dependencies, we'll create a URL with the parameters
        const mockUrl = new URL(`https://example.com/?${transformPart}`);
        
        // Import the translateAkamaiParams function dynamically to avoid circular dependencies
        // This is a simplified version - in a real implementation, consider using a shared service
        // or dependency injection pattern to avoid the dynamic import
        const params: Record<string, string> = {};
        for (const [key, value] of mockUrl.searchParams.entries()) {
          if (key.startsWith('im.')) {
            params[key.slice(3)] = value; // Remove the "im." prefix
          }
        }
        
        // Convert Akamai-style parameters to Cloudflare style
        const result: TransformOptions = {};
        
        // Handle resize parameter (width, height, fit mode)
        if (params.resize) {
          const resizeParams = params.resize.split(',');
          for (const param of resizeParams) {
            const [key, value] = param.includes(':') 
              ? param.split(':') 
              : param.includes('=') 
                ? param.split('=')
                : [param, ''];
                
            if (key === 'width') {
              result.width = parseInt(value, 10);
            } else if (key === 'height') {
              result.height = parseInt(value, 10);
            } else if (key === 'mode') {
              // Map Akamai fit modes to Cloudflare
              switch(value) {
                case 'fit': result.fit = 'contain'; break;
                case 'stretch': result.fit = 'scale-down'; break;
                case 'fill': result.fit = 'cover'; break;
                case 'crop': result.fit = 'crop'; break;
                case 'pad': result.fit = 'pad'; break;
              }
            }
          }
        }
        
        // Handle format parameter
        if (params.format) {
          result.format = params.format;
        }
        
        // Handle quality parameter
        if (params.quality) {
          if (params.quality.match(/^\d+$/)) {
            result.quality = parseInt(params.quality, 10);
          } else {
            // Map named quality levels
            switch (params.quality.toLowerCase()) {
              case 'low': result.quality = 50; break;
              case 'medium': result.quality = 75; break;
              case 'high': result.quality = 90; break;
              default: result.quality = 85;
            }
          }
        }
        
        return result;
      } catch (error) {
        logger.error('Error parsing Akamai parameters in condition', {
          error: error instanceof Error ? error.message : String(error),
          transform: transformPart
        });
        return {};
      }
    } else {
      // Handle Cloudflare format directly (key=value,key2=value2)
      try {
        const result: TransformOptions = {};
        const params = transformPart.split(',');
        
        for (const param of params) {
          const [key, value] = param.split('=');
          if (key && value) {
            // Convert numeric values
            if (['width', 'height', 'quality', 'sharpen', 'blur'].includes(key.trim())) {
              result[key.trim()] = parseInt(value.trim(), 10);
            } else if (['brightness', 'contrast', 'saturation'].includes(key.trim())) {
              result[key.trim()] = parseFloat(value.trim());
            } else if (['flip', 'flop'].includes(key.trim())) {
              result[key.trim()] = value.trim().toLowerCase() === 'true';
            } else {
              result[key.trim()] = value.trim();
            }
          }
        }
        
        return result;
      } catch (error) {
        logger.error('Error parsing Cloudflare parameters in condition', {
          error: error instanceof Error ? error.message : String(error),
          transform: transformPart
        });
        return {};
      }
    }
  }
  
  // If condition is not met or there was an error, return empty object
  return {};
}

/**
 * Helper to evaluate comparison conditions
 */
function evaluateCondition(actual: number, operator: string, expected: number): boolean {
  switch (operator) {
    case '>': return actual > expected;
    case '>=': return actual >= expected;
    case '<': return actual < expected;
    case '<=': return actual <= expected;
    case '=':
    case '==': return actual === expected;
    case '!=': return actual !== expected;
    default: return false;
  }
}