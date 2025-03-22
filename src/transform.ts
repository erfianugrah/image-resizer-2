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

// Import utilities
import { isFormatSupported } from './utils/browser-formats';
import { 
  parseClientHints, 
  suggestOptimizations, 
  addClientHintsHeaders 
} from './utils/client-hints';

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
  fit?: 'scale-down' | 'contain' | 'cover' | 'crop' | 'pad' | string;
  gravity?: 'auto' | 'center' | 'top' | 'bottom' | 'left' | 'right' | 'north' | 'south' | 'east' | 'west' | 'north-east' | 'north-west' | 'south-east' | 'south-west' | 'face' | string | { x: number; y: number };
  quality?: number;
  format?: 'avif' | 'webp' | 'json' | 'jpeg' | 'png' | 'gif' | 'auto' | string;
  background?: string;
  dpr?: number;
  metadata?: 'none' | 'copyright' | 'keep' | string;
  sharpen?: number;
  trim?: string; // Format: "top;right;bottom;left" in pixels
  rotate?: 90 | 180 | 270 | number; // Cloudflare only supports 90, 180, and 270 degree rotations
  brightness?: number;
  contrast?: number;
  saturation?: number;
  derivative?: string;
  anim?: boolean;  // Controls animation preservation (true = preserve, false = first frame only)
  blur?: number;  // Value between 1 and 250
  border?: { color: string; width?: number; top?: number; right?: number; bottom?: number; left?: number };
  compression?: 'fast';  // Reduces latency at cost of quality
  gamma?: number;  // Value > 0, 1.0 = no change, 0.5 = darker, 2.0 = lighter
  flip?: string | boolean;  // Valid values: 'h' (horizontal), 'v' (vertical), 'hv' (both), or true for backwards compatibility
  flop?: boolean;  // Deprecated - use flip='v' instead for vertical flipping
  draw?: Array<{
    url: string;
    width?: number;
    height?: number;
    fit?: string;
    gravity?: string;
    opacity?: number;
    repeat?: boolean | 'x' | 'y';
    top?: number;
    left?: number;
    bottom?: number;
    right?: number;
    background?: string;
    rotate?: number;
  }>;  // For watermarks and overlays
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

// Using caniuse-api for browser feature detection

/**
 * Get image format based on request Accept header, User-Agent, and configuration
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
  
  // Parse client hints if available
  const clientHints = parseClientHints(request);
  
  // Check if we have a format suggestion from client hints
  if (options.format === 'auto' && Object.keys(clientHints).length > 0) {
    const optimizations = suggestOptimizations(options, clientHints);
    if (optimizations.format) {
      logger.debug('Using client hints-suggested format', { 
        format: optimizations.format,
        clientHintsAvailable: true
      });
      return optimizations.format;
    }
  }
  
  // Get headers to determine browser support
  const acceptHeader = request.headers.get('Accept') || '';
  const userAgent = request.headers.get('User-Agent') || '';
  
  // First check Accept header (most reliable when present)
  let supportsWebP = acceptHeader.includes('image/webp');
  let supportsAVIF = acceptHeader.includes('image/avif');
  
  // If not explicitly in Accept header, use User-Agent detection
  if (!supportsWebP || !supportsAVIF) {
    try {
      // Extract browser and version from User-Agent
      const browser = getBrowserInfo(userAgent);
      
      if (browser) {
        logger.debug('Detected browser from User-Agent', { 
          browserName: browser.name, 
          browserVersion: browser.version 
        });
        
        // Use static browser format support detection
        try {
          if (!supportsWebP) {
            supportsWebP = isFormatSupported('webp', browser.name, browser.version);
          }
          
          if (!supportsAVIF) {
            supportsAVIF = isFormatSupported('avif', browser.name, browser.version);
          }
          
          logger.debug('Format support detected from static dictionary', { supportsWebP, supportsAVIF });
        } catch (error) {
          logger.debug('Error detecting format support', { 
            error: error instanceof Error ? error.message : String(error) 
          });
        }
        
        // Add a fallback layer if our static detection didn't resolve support
        // This handles edge cases not covered in our static dictionary
        if (!supportsWebP || !supportsAVIF) {
          detectFormatSupportFromBrowser(browser, (webpSupported, avifSupported) => {
            if (!supportsWebP) supportsWebP = webpSupported;
            if (!supportsAVIF) supportsAVIF = avifSupported;
          });
          
          logger.debug('Format support confirmed by detection function', { supportsWebP, supportsAVIF });
        }
      } else {
        logger.debug('Could not parse browser info from User-Agent', { userAgent });
      }
    } catch (error) {
      logger.warn('Error in browser detection for format support', { 
        error: error instanceof Error ? error.message : String(error) 
      });
    }
  }
  
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
    // Special format handling based on original format
    if (originalFormat === 'gif' && options.width && options.width < 100) {
      // For small animated thumbnails, keep gif
      return 'gif';
    } else if (originalFormat === 'svg') {
      // For SVGs, keep as SVG unless we're specifically changing dimensions
      return (options.width || options.height) ? 'png' : 'svg';
    } else if (originalFormat === 'png' && contentType && contentType.includes('png')) {
      // Check if the PNG might have transparency
      return 'png';
    }
    
    // For other formats, prioritize based on support and efficiency
    if (supportsAVIF) {
      return 'avif';
    } else if (supportsWebP) {
      return 'webp';
    } else {
      return 'jpeg'; // Fallback to JPEG
    }
  }
  
  return options.format || config.responsive.format;
}

/**
 * Determine browser format support based on browser and version
 * Uses the static browser format support dictionary
 * 
 * @param browser - Object containing browser name and version
 * @param callback - Callback function receiving WebP and AVIF support status
 */
export function detectFormatSupportFromBrowser(
  browser: { name: string; version: string },
  callback: (webpSupported: boolean, avifSupported: boolean) => void
): void {
  const { name, version } = browser;
  
  const webpSupported = isFormatSupported('webp', name, version);
  const avifSupported = isFormatSupported('avif', name, version);
  
  callback(webpSupported, avifSupported);
}

/**
 * Extract browser name and version from User-Agent string
 * 
 * @param userAgent - The User-Agent string to parse
 * @returns Object with browser name and version, or null if not recognized
 */
export function getBrowserInfo(userAgent: string): { name: string; version: string } | null {
  try {
    // Add a debug log to see the raw User-Agent
    logger.debug('Parsing browser info from User-Agent', { userAgent });
    
    // Check for mobile devices first since they often include multiple browser identifiers
    
    // iOS devices
    let match = userAgent.match(/iPad|iPhone|iPod/i);
    if (match) {
      // iOS Safari
      const versionMatch = userAgent.match(/OS (\d+[_\.]\d+)/i);
      if (versionMatch) {
        // Convert version format from 14_0 to 14.0
        const version = versionMatch[1].replace('_', '.');
        return { name: 'ios_saf', version };
      }
      
      // If we can't determine iOS version, use Safari version if available
      const safariMatch = userAgent.match(/Version\/(\d+\.\d+)/i);
      if (safariMatch) {
        return { name: 'ios_saf', version: safariMatch[1] };
      }
      
      // If no version info, return a safe default
      return { name: 'ios_saf', version: '9.0' };
    }
    
    // Android devices
    if (userAgent.includes('Android')) {
      // Chrome for Android
      match = userAgent.match(/Chrome\/(\d+\.\d+)/i);
      if (match) {
        return { name: 'and_chr', version: match[1] };
      }
      
      // Firefox for Android
      match = userAgent.match(/Firefox\/(\d+\.\d+)/i);
      if (match) {
        return { name: 'and_ff', version: match[1] };
      }
      
      // Android browser or WebView
      match = userAgent.match(/Android (\d+\.\d+)/i);
      if (match) {
        return { name: 'android', version: match[1] };
      }
    }
    
    // Now handle desktop browsers
    
    // Edge (Chromium-based)
    match = userAgent.match(/Edg(e)?\/(\d+\.\d+)/i);
    if (match) {
      // When Edge is Chromium-based, it's 79+
      const version = match[2];
      const versionNumber = parseFloat(version);
      if (versionNumber >= 79) {
        return { name: 'edge_chromium', version };
      }
      return { name: 'edge', version };
    }
    
    // Chrome, Chromium
    match = userAgent.match(/(Chrome|Chromium)\/(\d+\.\d+)/i);
    if (match) {
      return { name: 'chrome', version: match[2] };
    }
    
    // Firefox
    match = userAgent.match(/Firefox\/(\d+\.\d+)/i);
    if (match) {
      return { name: 'firefox', version: match[1] };
    }
    
    // Safari
    match = userAgent.match(/Version\/(\d+\.\d+).*Safari/i);
    if (match && userAgent.includes('Safari')) {
      return { name: 'safari', version: match[1] };
    }
    
    // Opera
    match = userAgent.match(/OPR\/(\d+\.\d+)/i);
    if (match) {
      return { name: 'opera', version: match[1] };
    }
    
    // Internet Explorer
    match = userAgent.match(/MSIE (\d+\.\d+)/i) || userAgent.match(/Trident.*rv:(\d+\.\d+)/i);
    if (match) {
      return { name: 'ie', version: match[1] };
    }
    
    // Samsung Internet
    match = userAgent.match(/SamsungBrowser\/(\d+\.\d+)/i);
    if (match) {
      return { name: 'samsung', version: match[1] };
    }
    
    // Brave (identifies as Chrome)
    if (userAgent.includes('Brave')) {
      match = userAgent.match(/Chrome\/(\d+\.\d+)/i);
      if (match) {
        return { name: 'chrome', version: match[1] }; // Treat as Chrome for compatibility
      }
    }
    
    logger.debug('Could not identify browser from User-Agent', { userAgent });
    return null;
  } catch (error) {
    logger.warn('Error parsing browser info from User-Agent', { 
      userAgent,
      error: error instanceof Error ? error.message : String(error)
    });
    return null;
  }
}

/**
 * Apply derivative template to transform options
 */
function applyDerivativeTemplate(
  options: TransformOptions,
  derivative: string,
  config: ImageResizerConfig
): TransformOptions {
  // If derivative name is not provided, return the original options
  if (!derivative) {
    return options;
  }
  
  // Check if the requested derivative exists
  if (!config.derivatives[derivative]) {
    // Video specific check for a potential fallback
    if (derivative.startsWith('video-') && config.derivatives['video-medium']) {
      // Fallback to medium for video derivatives if the specific one is not found
      logger.warn('Requested video derivative not found, using fallback', {
        requestedDerivative: derivative,
        fallbackDerivative: 'video-medium',
        availableDerivatives: Object.keys(config.derivatives).join(', ')
      });
      
      derivative = 'video-medium';
    } else {
      // Log missing derivative for debugging
      logger.warn('Requested derivative template not found', {
        derivative,
        availableDerivatives: Object.keys(config.derivatives).join(', ')
      });
      
      // Return the original options - this will still work but won't apply template
      return options;
    }
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
  
  logger.debug('Applied derivative template', {
    derivative,
    template: JSON.stringify(template),
    finalOptions: JSON.stringify(result)
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
  
  // Parse client hints for advanced device/network detection
  const clientHints = parseClientHints(request);
  
  // Get responsive width if not explicitly set
  if (!transformOptions.width) {
    logger.breadcrumb('Calculating responsive width', undefined, { 
      hasWidth: false,
      userAgent: request.headers.get('User-Agent') || 'unknown',
      viewportWidth: request.headers.get('Sec-CH-Viewport-Width') || request.headers.get('Viewport-Width') || 'unknown',
      deviceType: request.headers.get('CF-Device-Type') || 'unknown',
      clientHints: Object.keys(clientHints).length > 0 ? 'available' : 'not available'
    });
    
    // Check if we have width suggestion from client hints
    if (clientHints.viewportWidth && !transformOptions.width) {
      const optimizations = suggestOptimizations(transformOptions, clientHints);
      if (optimizations.optimizedWidth) {
        transformOptions.width = optimizations.optimizedWidth;
        logger.breadcrumb('Applied client hint-based width', undefined, { 
          width: transformOptions.width,
          dpr: clientHints.dpr
        });
      } else {
        // Fall back to traditional responsive width calculation
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
    } else {
      // Fall back to traditional responsive width calculation
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
      downlink: request.headers.get('Downlink') || 'unknown',
      clientHints: Object.keys(clientHints).length > 0 ? 'available' : 'not available'
    });
    
    // Check for client hints suggestion first
    if (Object.keys(clientHints).length > 0) {
      const optimizations = suggestOptimizations(transformOptions, clientHints);
      if (optimizations.quality) {
        transformOptions.quality = optimizations.quality;
        logger.breadcrumb('Applied client hint-based quality', undefined, { 
          quality: transformOptions.quality,
          connectionQuality: clientHints.ect || (clientHints.rtt ? `RTT: ${clientHints.rtt}ms` : 'unknown'),
          saveData: clientHints.saveData
        });
      }
    }
    
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
      
      // Special handling for gravity object (for xy coordinates) 
      if (key === 'gravity' && typeof transformOptions[key] === 'object') {
        // Make sure gravity object is preserved exactly as is
        // This is important for xy coordinate format from im.aspectCrop
        logger.breadcrumb('Preserving gravity object format', undefined, {
          gravityType: typeof transformOptions[key],
          gravityValue: JSON.stringify(transformOptions[key]),
          hasXY: transformOptions[key] && 'x' in transformOptions[key] && 'y' in transformOptions[key]
        });
      }
    }
  });
  
  // Validate the blur parameter
  if (result.blur !== undefined) {
    const blurValue = Number(result.blur);
    if (isNaN(blurValue) || blurValue < 1 || blurValue > 250) {
      if (!isNaN(blurValue)) {
        // Clamp to valid range
        result.blur = Math.max(1, Math.min(250, blurValue));
        logger.breadcrumb('Clamped blur value to valid range (1-250)', undefined, {
          originalValue: blurValue,
          clampedValue: result.blur
        });
      } else {
        // Not a valid number, remove it
        logger.warn('Invalid blur value, must be between 1 and 250', {
          value: result.blur
        });
        delete result.blur;
      }
    }
  }
  
  // Validate gamma parameter
  if (result.gamma !== undefined) {
    const gammaValue = Number(result.gamma);
    if (isNaN(gammaValue) || gammaValue <= 0) {
      logger.warn('Invalid gamma value, must be a positive number', {
        value: result.gamma
      });
      delete result.gamma;
    }
  }
  
  // Validate the anim parameter
  if (result.anim !== undefined && typeof result.anim !== 'boolean') {
    // Convert string 'true'/'false' to boolean
    if (result.anim === 'true') {
      result.anim = true;
      logger.breadcrumb('Converted anim="true" to boolean true', undefined, {
        originalValue: "true"
      });
    } else if (result.anim === 'false') {
      result.anim = false;
      logger.breadcrumb('Converted anim="false" to boolean false', undefined, {
        originalValue: "false"
      });
    } else {
      logger.warn('Invalid anim value, must be boolean', {
        value: result.anim
      });
      delete result.anim;
    }
  }
  
  // Validate the compression parameter
  if (result.compression !== undefined && result.compression !== 'fast') {
    logger.warn('Invalid compression value, only "fast" is supported', {
      value: result.compression
    });
    
    // Use a safer approach with explicit string check
    if (result.compression && typeof result.compression === 'string') {
      // Now TypeScript knows compression is a string
      const compressionStr: string = result.compression;
      if (compressionStr.toLowerCase() === 'fast') {
        result.compression = 'fast';
      } else {
        delete result.compression;
      }
    } else {
      delete result.compression;
    }
  }
  
  // Validate the draw array for watermarks and overlays
  if (result.draw && Array.isArray(result.draw)) {
    const validDrawItems = [];
    
    for (let i = 0; i < result.draw.length; i++) {
      const drawItem = result.draw[i];
      
      // Each draw item must have a URL
      if (!drawItem.url) {
        logger.warn(`Draw item at index ${i} missing required 'url' property, skipping`, {
          drawItem: JSON.stringify(drawItem)
        });
        continue;
      }
      
      // Validate numeric properties
      if (drawItem.width !== undefined && (isNaN(Number(drawItem.width)) || Number(drawItem.width) <= 0)) {
        logger.warn(`Invalid width in draw item at index ${i}, must be a positive number`, {
          width: drawItem.width
        });
        delete drawItem.width;
      }
      
      if (drawItem.height !== undefined && (isNaN(Number(drawItem.height)) || Number(drawItem.height) <= 0)) {
        logger.warn(`Invalid height in draw item at index ${i}, must be a positive number`, {
          height: drawItem.height
        });
        delete drawItem.height;
      }
      
      // Validate positioning - can't have both left/right or top/bottom
      if (drawItem.left !== undefined && drawItem.right !== undefined) {
        logger.warn(`Draw item at index ${i} has both 'left' and 'right' set, which is invalid. Removing 'right'`, {
          left: drawItem.left,
          right: drawItem.right
        });
        delete drawItem.right;
      }
      
      if (drawItem.top !== undefined && drawItem.bottom !== undefined) {
        logger.warn(`Draw item at index ${i} has both 'top' and 'bottom' set, which is invalid. Removing 'bottom'`, {
          top: drawItem.top,
          bottom: drawItem.bottom
        });
        delete drawItem.bottom;
      }
      
      // Validate opacity
      if (drawItem.opacity !== undefined) {
        const opacity = Number(drawItem.opacity);
        if (isNaN(opacity) || opacity < 0 || opacity > 1) {
          if (!isNaN(opacity)) {
            // Clamp to valid range
            drawItem.opacity = Math.max(0, Math.min(1, opacity));
            logger.breadcrumb(`Clamped opacity in draw item at index ${i} to valid range (0-1)`, undefined, {
              originalValue: opacity,
              clampedValue: drawItem.opacity
            });
          } else {
            logger.warn(`Invalid opacity in draw item at index ${i}, must be between 0 and 1`, {
              opacity
            });
            delete drawItem.opacity;
          }
        }
      }
      
      // Validate repeat - must be boolean or 'x' or 'y'
      if (drawItem.repeat !== undefined && 
          drawItem.repeat !== true && 
          drawItem.repeat !== false && 
          drawItem.repeat !== 'x' && 
          drawItem.repeat !== 'y') {
        
        // Convert string "true"/"false" to boolean
        if (drawItem.repeat === 'true') {
          drawItem.repeat = true;
        } else if (drawItem.repeat === 'false') {
          drawItem.repeat = false;
        } else {
          logger.warn(`Invalid repeat value in draw item at index ${i}, must be boolean or 'x' or 'y'`, {
            repeat: drawItem.repeat
          });
          delete drawItem.repeat;
        }
      }
      
      // Ensure fit value is valid
      if (drawItem.fit !== undefined) {
        const validFitValues = ['scale-down', 'contain', 'cover', 'crop', 'pad'];
        const fitValue = String(drawItem.fit).toLowerCase();
        
        if (!validFitValues.includes(fitValue)) {
          logger.warn(`Invalid fit value in draw item at index ${i}, defaulting to 'contain'`, {
            fit: drawItem.fit
          });
          drawItem.fit = 'contain';
        }
      }
      
      // If gravity is provided, validate it
      if (drawItem.gravity !== undefined) {
        const validGravityValues = ['auto', 'center', 'top', 'bottom', 'left', 'right', 'north', 'south', 'east', 'west', 'north-east', 'north-west', 'south-east', 'south-west', 'face'];
        
        // If gravity is an object with x,y coordinates, it's valid
        if (typeof drawItem.gravity === 'object' && 
            drawItem.gravity !== null && 
            'x' in drawItem.gravity && 
            'y' in drawItem.gravity) {
          // It's a valid coordinate object, keep it
        } else if (typeof drawItem.gravity === 'string') {
          // Check if it's a valid string value
          const gravityValue = drawItem.gravity.toLowerCase();
          
          if (!validGravityValues.includes(gravityValue)) {
            logger.warn(`Invalid gravity value in draw item at index ${i}, defaulting to 'center'`, {
              gravity: drawItem.gravity
            });
            drawItem.gravity = 'center';
          }
        } else {
          // Not a valid gravity value
          logger.warn(`Invalid gravity type in draw item at index ${i}, must be string or {x,y} object`, {
            gravity: drawItem.gravity,
            type: typeof drawItem.gravity
          });
          delete drawItem.gravity;
        }
      }
      
      // Add this item to the validated array
      validDrawItems.push(drawItem);
      
      logger.breadcrumb(`Validated draw item at index ${i}`, undefined, {
        url: drawItem.url,
        hasWidth: !!drawItem.width,
        hasHeight: !!drawItem.height,
        position: drawItem.top !== undefined ? 'top' : 
                 drawItem.bottom !== undefined ? 'bottom' : 
                 drawItem.left !== undefined ? 'left' : 
                 drawItem.right !== undefined ? 'right' : 'center',
        opacity: drawItem.opacity,
        repeat: drawItem.repeat
      });
    }
    
    // Replace the draw array with only valid items
    if (validDrawItems.length > 0) {
      result.draw = validDrawItems;
      logger.breadcrumb('Validated draw array', undefined, {
        itemCount: validDrawItems.length,
        items: validDrawItems.map(item => item.url).join(', ')
      });
    } else {
      // If no valid items, remove the draw array
      logger.warn('No valid draw items found, removing draw array', {
        originalCount: result.draw.length
      });
      delete result.draw;
    }
  }
  
  // Validate the metadata parameter
  if (result.metadata !== undefined && typeof result.metadata === 'string') {
    const validMetadataValues = ['none', 'copyright', 'keep'];
    const metadataValue = result.metadata.toLowerCase();
    
    if (!validMetadataValues.includes(metadataValue)) {
      logger.warn('Invalid metadata value, defaulting to none', {
        originalValue: result.metadata
      });
      result.metadata = 'none';
    }
  }
  
  // Validate the fit parameter
  if (result.fit !== undefined && typeof result.fit === 'string') {
    const validFitValues = ['scale-down', 'contain', 'cover', 'crop', 'pad'];
    const fitValue = result.fit.toLowerCase();
    
    if (!validFitValues.includes(fitValue)) {
      logger.warn('Invalid fit value, defaulting to scale-down', {
        originalValue: result.fit
      });
      result.fit = 'scale-down';
    }
  }
  
  // Validate gravity parameter - carefully preserve object format
  if (result.gravity !== undefined) {
    if (typeof result.gravity === 'object' && result.gravity !== null) {
      // Handle object gravity (coordinates from aspectCrop)
      if (!('x' in result.gravity) || !('y' in result.gravity)) {
        logger.warn('Invalid gravity object, missing x or y coordinates', {
          gravity: result.gravity
        });
      } else {
        // Log the gravity object being used
        logger.breadcrumb('Using gravity with exact coordinates', undefined, {
          x: result.gravity.x,
          y: result.gravity.y
        });
      }
    } else if (typeof result.gravity === 'string') {
      // First, check for the "x,y" coordinate format (our preferred format)
      // This format is used when gravity contains exact coordinates like "0.5,0.2"
      // Values must be between 0-1 representing the focal point position (x,y)
      // This is the simpler, more reliable format that replaces JSON serialization
      const coordRegex = /^(0(\.\d+)?|1(\.0+)?),(0(\.\d+)?|1(\.0+)?)$/;
      const coordMatch = (result.gravity as string).match(coordRegex);
      
      if (coordMatch) {
        // Parse x,y coordinates from the string format
        // The regex captures the values differently than expected
        // We need to use the original string and split it
        const coordinates = (result.gravity as string).split(',');
        if (coordinates.length === 2) {
          result.gravity = {
            x: parseFloat(coordinates[0]),
            y: parseFloat(coordinates[1])
          };
        }
        
        // Since we've set result.gravity to an object with x and y properties,
        // we can safely cast it for logging purposes
        const gravityObj = result.gravity as { x: number; y: number };
        
        logger.debug('Parsed gravity from coordinate string format', {
          x: gravityObj.x,
          y: gravityObj.y,
          originalValue: coordMatch[0]
        });
        
        logger.breadcrumb('Parsed gravity from simple coordinate format', undefined, {
          x: gravityObj.x,
          y: gravityObj.y,
          originalString: coordMatch[0]
        });
      } 
      // Handle case where gravity is a stringified JSON object (fallback for backward compatibility)
      else if (result.gravity.startsWith('{') && result.gravity.endsWith('}')) {
        try {
          // Attempt to parse the JSON string
          const parsedGravity = JSON.parse(result.gravity);
          
          // Check if parsed object has x and y coordinates
          if (parsedGravity && typeof parsedGravity === 'object' && 
              'x' in parsedGravity && 'y' in parsedGravity) {
            
            // Replace the string with the parsed object
            result.gravity = {
              x: parsedGravity.x,
              y: parsedGravity.y
            };
            
            // Since we've set result.gravity to an object with x and y properties,
            // we can safely cast it for logging purposes
            const gravityObj = result.gravity as { x: number; y: number };
            
            logger.debug('Successfully parsed gravity from JSON string', {
              x: gravityObj.x,
              y: gravityObj.y,
              originalValue: JSON.stringify(gravityObj)
            });
            
            logger.breadcrumb('Parsed gravity from stringified JSON', undefined, {
              x: gravityObj.x,
              y: gravityObj.y,
              originalString: JSON.stringify(gravityObj)
            });
          } else {
            logger.warn('Parsed gravity object is missing x or y coordinates, defaulting to center', {
              parsedGravity: JSON.stringify(parsedGravity),
              originalValue: result.gravity
            });
            result.gravity = 'center';
          }
        } catch (error) {
          logger.warn('Failed to parse gravity JSON string, defaulting to center', {
            error: error instanceof Error ? error.message : String(error),
            originalValue: result.gravity
          });
          result.gravity = 'center';
        }
      } else {
        // Existing string validation logic for named positions
        const validGravityValues = ['auto', 'center', 'top', 'bottom', 'left', 'right', 
                                'north', 'south', 'east', 'west', 
                                'north-east', 'north-west', 'south-east', 'south-west', 'face'];
        
        if (!validGravityValues.includes(result.gravity)) {
          logger.warn('Invalid gravity value, defaulting to center', {
            originalValue: result.gravity
          });
          result.gravity = 'center';
        }
      }
    }
  }
  
  // Validate the format parameter
  if (result.format !== undefined && typeof result.format === 'string') {
    const validFormats = ['avif', 'webp', 'json', 'jpeg', 'png', 'gif', 'auto'];
    const formatValue = result.format.toLowerCase();
    
    if (!validFormats.includes(formatValue)) {
      logger.warn('Invalid format value, defaulting to auto', {
        originalValue: result.format
      });
      result.format = 'auto';
    }
  }
  
  // Validate the trim parameter format
  if (result.trim !== undefined) {
    // If trim is not a string in the expected format, we need to fix it
    if (typeof result.trim !== 'string' || !result.trim.includes(';')) {
      logger.warn('Invalid trim parameter format', { 
        trim: result.trim,
        type: typeof result.trim
      });
      // If it's not in the correct format, remove it to avoid API errors
      delete result.trim;
    }
  }

  // Process flip parameter to ensure it's in the correct format
  if (result.flip !== undefined) {
    // Convert boolean true to string 'h' (horizontal) for backwards compatibility
    if (result.flip === true) {
      result.flip = 'h';
      logger.breadcrumb('Converted flip=true to flip=h', undefined, {
        originalValue: true,
        updatedValue: 'h'
      });
    } else if (typeof result.flip === 'string') {
      // Map old values to new values
      const flipValue = result.flip.toLowerCase();
      if (flipValue === 'horizontal') {
        result.flip = 'h';
        logger.breadcrumb('Converted flip=horizontal to flip=h', undefined, {
          originalValue: flipValue,
          updatedValue: 'h'
        });
      } else if (flipValue === 'vertical') {
        result.flip = 'v';
        logger.breadcrumb('Converted flip=vertical to flip=v', undefined, {
          originalValue: flipValue,
          updatedValue: 'v'
        });
      } else if (flipValue === 'both') {
        result.flip = 'hv';
        logger.breadcrumb('Converted flip=both to flip=hv', undefined, {
          originalValue: flipValue,
          updatedValue: 'hv'
        });
      } else if (!['h', 'v', 'hv'].includes(flipValue)) {
        // Default to h if we got an invalid string value
        result.flip = 'h';
        logger.breadcrumb('Converted invalid flip value to h', undefined, {
          originalValue: flipValue,
          updatedValue: 'h'
        });
      }
    }
  }

  // Validate the rotate parameter
  if (result.rotate !== undefined) {
    const rotation = Number(result.rotate);
    if (isNaN(rotation) || ![90, 180, 270].includes(rotation)) {
      logger.warn('Invalid rotation value, Cloudflare only supports 90, 180, and 270 degrees', {
        originalValue: result.rotate
      });
      
      // Try to normalize to a valid value
      if (!isNaN(rotation)) {
        // Normalize to 0, 90, 180, or 270
        const normalizedRotation = ((rotation % 360) + 360) % 360;
        
        // Round to the nearest valid value
        if (normalizedRotation > 45 && normalizedRotation <= 135) {
          result.rotate = 90;
        } else if (normalizedRotation > 135 && normalizedRotation <= 225) {
          result.rotate = 180;
        } else if (normalizedRotation > 225 && normalizedRotation <= 315) {
          result.rotate = 270;
        } else {
          // If close to 0 or 360, remove rotation
          delete result.rotate;
        }
        
        logger.breadcrumb('Normalized rotation value', undefined, {
          originalValue: rotation,
          normalizedValue: result.rotate || 'removed'
        });
      } else {
        // Not a valid number, remove it
        delete result.rotate;
      }
    }
  }

  // Handle legacy flop parameter
  if (result.flop === true) {
    // If only flop is true, set flip to v (vertical)
    if (!result.flip) {
      result.flip = 'v';
      logger.breadcrumb('Converted flop=true to flip=v', undefined, {
        originalValue: 'flop=true',
        updatedValue: 'flip=v'
      });
    } 
    // If both flip and flop are true, set flip to hv (both)
    else if (result.flip === 'h' || 
             (typeof result.flip === 'string' && result.flip === 'true') || 
             (typeof result.flip === 'boolean' && result.flip === true)) {
      result.flip = 'hv';
      logger.breadcrumb('Converted flip=h + flop=true to flip=hv', undefined, {
        originalValue: 'flip=h,flop=true',
        updatedValue: 'flip=hv'
      });
    }
    // Remove the flop parameter as we've converted it to flip
    delete result.flop;
  }
  
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
    width: result.width,
    height: result.height,
    format: result.format,
    quality: result.quality,
    fit: result.fit,
    flip: result.flip,
    hasFlip: !!result.flip,
    rotate: result.rotate,
    hasRotate: !!result.rotate,
    metadata: result.metadata,
    trim: result.trim,
    hasTrim: !!result.trim,
    blur: result.blur,
    brightness: result.brightness,
    contrast: result.contrast,
    saturation: result.saturation,
    anim: result.anim,
    gamma: result.gamma,
    compression: result.compression,
    border: result.border ? JSON.stringify(result.border) : undefined,
    sharpen: result.sharpen,
    dpr: result.dpr,
    background: result.background,
    allParams: Object.keys(result).join(',')
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
  
  // Check if a derivative was requested but not found
  if (options.derivative && !config.derivatives[options.derivative]) {
    logger.error('Requested derivative not found', {
      requestedDerivative: options.derivative,
      availableDerivatives: Object.keys(config.derivatives).join(', ')
    });
  }
  
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
      width: transformOptions.width,
      height: transformOptions.height,
      hasFit: !!transformOptions.fit,
      fit: transformOptions.fit,
      format: transformOptions.format,
      quality: transformOptions.quality,
      flip: transformOptions.flip,
      hasFlip: !!transformOptions.flip,
      flipType: transformOptions.flip ? typeof transformOptions.flip : 'none',
      rotate: transformOptions.rotate,
      hasRotate: !!transformOptions.rotate,
      metadata: transformOptions.metadata,
      trim: transformOptions.trim,
      hasTrim: !!transformOptions.trim,
      anim: transformOptions.anim,
      blur: transformOptions.blur,
      brightness: transformOptions.brightness,
      contrast: transformOptions.contrast,
      gamma: transformOptions.gamma,
      saturation: transformOptions.saturation,
      compression: transformOptions.compression,
      sharpen: transformOptions.sharpen,
      dpr: transformOptions.dpr,
      border: transformOptions.border ? JSON.stringify(transformOptions.border) : undefined,
      background: transformOptions.background,
      imageSourceSize: storageResult.size ? Math.round(storageResult.size / 1024) + 'KB' : 'unknown'
    });
    
    const fetchStart = Date.now();
    
    // Create the transformation promise using direct cf.image approach
    // Add detailed logging for debugging gravity and aspectCrop
    if (fetchOptionsWithCache.cf && fetchOptionsWithCache.cf.image) {
      const imageOptions = fetchOptionsWithCache.cf.image as Record<string, any>;
      
      // Check if gravity is present and log details
      if (imageOptions && typeof imageOptions === 'object' && 'gravity' in imageOptions) {
        // Enhanced gravity logging for debugging
        const gravityValue = imageOptions.gravity;
        const gravityType = typeof gravityValue;
        let gravityDetails = '';
        
        if (gravityType === 'object' && gravityValue !== null) {
          // Object format with x,y coordinates
          if ('x' in gravityValue && 'y' in gravityValue) {
            gravityDetails = `Object with coordinates {x:${gravityValue.x}, y:${gravityValue.y}}`;
          } else {
            gravityDetails = `Invalid object structure: ${JSON.stringify(gravityValue)}`;
          }
        } else if (gravityType === 'string') {
          // String format (named position or JSON string)
          if (gravityValue.startsWith('{') && gravityValue.endsWith('}')) {
            gravityDetails = `Stringified JSON: ${gravityValue}`;
          } else {
            gravityDetails = `Named position: ${gravityValue}`;
          }
        } else {
          gravityDetails = `Unknown format: ${String(gravityValue)}`;
        }
        
        // Log with all gravity details
        logger.debug('Gravity parameter in final fetch options', {
          gravity: String(imageOptions.gravity),
          gravityType: gravityType,
          gravityDetails: gravityDetails,
          gravityStringified: JSON.stringify(imageOptions.gravity)
        });
        
        logger.breadcrumb('Gravity parameter in final fetch', undefined, {
          gravityValue: JSON.stringify(imageOptions.gravity),
          gravityType: gravityType,
          gravityDetails: gravityDetails,
          fit: imageOptions.fit ? String(imageOptions.fit) : 'none',
          width: imageOptions.width ? Number(imageOptions.width) : undefined,
          height: imageOptions.height ? Number(imageOptions.height) : undefined
        });
      }
    }
    
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
    let response = new Response(transformed.body, {
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
    
    // Add client hints headers to response
    response = addClientHintsHeaders(response, request);
    logger.breadcrumb('Added client hints headers to response', undefined, {
      userAgent: request.headers.get('User-Agent')?.substring(0, 50) || 'unknown'
    });
    
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