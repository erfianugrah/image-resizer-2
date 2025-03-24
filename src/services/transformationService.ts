/**
 * Default implementation of the ImageTransformationService
 * 
 * Handles image transformation with optimized settings based on client detection
 * and performing image transformations using Cloudflare's Image Resizing service.
 */

import { ImageResizerConfig } from '../config';
import { Logger } from '../utils/logging';
import { applyCloudflareCache } from '../cache';
import { isFormatSupported } from '../utils/browser-formats';
import { addClientHintsHeaders } from '../utils/client-hints';
import { 
  ClientInfo, 
  ImageTransformationService, 
  StorageResult,
  ClientDetectionService,
  ConfigurationService,
  TransformOptions
} from './interfaces';
import { 
  TransformationError, 
  TransformationTimeoutError,
  ValidationError 
} from '../errors/transformationErrors';

export class DefaultImageTransformationService implements ImageTransformationService {
  private logger: Logger;
  private clientDetectionService?: ClientDetectionService;
  private configService?: ConfigurationService;

  constructor(
    logger: Logger, 
    clientDetectionService?: ClientDetectionService,
    configService?: ConfigurationService
  ) {
    this.logger = logger;
    this.clientDetectionService = clientDetectionService;
    this.configService = configService;
  }
  
  /**
   * Set the client detection service
   * This allows the service to be injected after construction
   * 
   * @param service The client detection service to use
   */
  setClientDetectionService(service: ClientDetectionService): void {
    this.clientDetectionService = service;
    this.logger.debug('Client detection service set');
  }

  /**
   * Set the configuration service
   * This allows the service to be injected after construction
   * 
   * @param service The configuration service to use
   */
  setConfigurationService(service: ConfigurationService): void {
    this.configService = service;
    this.logger.debug('Configuration service set');
  }

  /**
   * Transform an image based on the provided options
   * 
   * This method takes the base options and applies optimization based on client detection,
   * then transforms the image using Cloudflare's Image Resizing service.
   */
  async transformImage(
    request: Request, 
    storageResult: StorageResult, 
    options: TransformOptions, 
    config: ImageResizerConfig
  ): Promise<Response> {
    this.logger.debug('Starting image transformation', { 
      sourceType: storageResult.sourceType,
      contentType: storageResult.contentType,
      optionsKeys: Object.keys(options),
      hasClientDetection: !!this.clientDetectionService
    });

    // If it's an error response, just return it
    if (storageResult.sourceType === 'error') {
      return storageResult.response;
    }
    
    // Check if this is an image-resizing subrequest - if so, we shouldn't transform
    const via = request.headers.get('via') || '';
    if (via.includes('image-resizing')) {
      this.logger.debug('Detected image-resizing subrequest, skipping transformation', {
        path: storageResult.path,
        via,
        sourceType: storageResult.sourceType
      });
      
      // Add metadata about the request being a subrequest, useful for caching decisions
      // Create a new object with the metadata to avoid modifying the original
      const resultWithMetadata = {
        ...storageResult,
        metadata: {
          ...((storageResult as any).metadata || {}),
          isSubrequest: 'true'
        }
      } as StorageResult;
      
      return resultWithMetadata.response;
    }

    // Log info about large images that might cause timeouts
    if (storageResult.size && storageResult.size > 10 * 1024 * 1024) {
      this.logger.breadcrumb('Large image detected', undefined, {
        size: storageResult.size,
        contentType: storageResult.contentType
      });
    }

    // Apply derivative options if specified
    let effectiveOptions = { ...options };
    if (options.derivative && config.derivatives[options.derivative]) {
      this.logger.debug('Applying derivative options', { 
        derivative: options.derivative,
        derivatives: Object.keys(config.derivatives)
      });
      
      // Merge with derivative options (options from URL take precedence)
      effectiveOptions = this.applyDerivativeTemplate(options, options.derivative, config);
    }

    // Apply client detection optimization if available
    if (this.clientDetectionService) {
      try {
        this.logger.debug('Optimizing transformation options with client detection');
        
        // Apply client detection optimization
        const optimizedOptions = await this.clientDetectionService.getOptimizedOptions(
          request,
          effectiveOptions,
          config
        );
        
        this.logger.debug('Applied client optimized options', {
          originalFormat: effectiveOptions.format,
          optimizedFormat: optimizedOptions.format,
          originalQuality: effectiveOptions.quality,
          optimizedQuality: optimizedOptions.quality,
          optimizationApplied: JSON.stringify(optimizedOptions) !== JSON.stringify(effectiveOptions)
        });
        
        // Use the optimized options
        effectiveOptions = optimizedOptions;
      } catch (error) {
        this.logger.warn('Error optimizing options with client detection', {
          error: error instanceof Error ? error.message : String(error)
        });
        
        // Continue with the original options
        this.logger.debug('Continuing with unoptimized options due to error');
      }
    } else {
      // If client detection is not available, use Accept header as fallback
      // for auto format selection
      if ((!effectiveOptions.format || effectiveOptions.format === 'auto') && request.headers) {
        const acceptHeader = request.headers.get('Accept') || '';
        const bestFormat = this.getBestImageFormat(acceptHeader);
        
        if (bestFormat && bestFormat !== 'auto') {
          this.logger.debug('Selected best format based on Accept header', { 
            format: bestFormat, 
            acceptHeader 
          });
          effectiveOptions.format = bestFormat;
        }
      }
    }

    // Store metadata about the transformation for cache tagging
    if (!storageResult.metadata) {
      storageResult.metadata = {};
    }
    
    // Add transformation metadata to help with cache tagging
    storageResult.metadata.transformOptions = JSON.stringify({
      format: effectiveOptions.format,
      width: effectiveOptions.width,
      height: effectiveOptions.height,
      quality: effectiveOptions.quality,
      fit: effectiveOptions.fit,
      derivative: effectiveOptions.derivative
    });
    
    // Clone the original response to avoid consuming the body
    const originalResponse = storageResult.response.clone();
    
    // Build transformation options
    this.logger.breadcrumb('Building transform options');
    const buildStart = Date.now();
    
    // Build transformation options using validation and processing
    const transformOptions = await this.buildTransformOptions(request, storageResult, effectiveOptions, config);
    
    const buildEnd = Date.now();
    this.logger.breadcrumb('Built transform options', buildEnd - buildStart, transformOptions);
    
    // Check if a derivative was requested but not found
    if (options.derivative && !config.derivatives[options.derivative]) {
      this.logger.error('Requested derivative not found', {
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
      this.logger.debug('Transform options', transformOptions);
      
      this.logger.breadcrumb('Applying cache settings');
      const cacheStart = Date.now();
      
      // Apply cache settings including cache tags
      // Pass response headers to extract metadata for cache tags
      const fetchOptionsWithCache = applyCloudflareCache(
        fetchOptions,
        config,
        storageResult.path || '',
        transformOptions,
        storageResult.response.headers
      );
      
      const cacheEnd = Date.now();
      this.logger.breadcrumb('Applied cache settings', cacheEnd - cacheStart);
      
      // Add a timeout to prevent long-running transformations (worker timeout is 30s)
      const timeoutPromise = new Promise<Response>((_, reject) => {
        setTimeout(() => {
          this.logger.breadcrumb('Image transformation timed out', 25000, { url: request.url });
          reject(new TransformationTimeoutError('Image transformation timed out after 25 seconds'));
        }, 25000); // 25 second timeout (5s before worker timeout)
      });
      
      // Transform the image using Cloudflare's cf.image with timeout
      this.logger.breadcrumb('Starting Cloudflare image transformation', undefined, { 
        url: request.url,
        imageSize: storageResult.size,
        transformOptionsCount: Object.keys(transformOptions).length
      });
      
      // Log the actual Cloudflare options being passed
      this.logger.breadcrumb('CF image transform options', undefined, {
        cfOptions: JSON.stringify(fetchOptionsWithCache.cf),
        hasWidth: !!transformOptions.width,
        hasHeight: !!transformOptions.height,
        hasFit: !!transformOptions.fit,
        fit: transformOptions.fit,
        format: transformOptions.format,
        quality: transformOptions.quality,
        imageSourceSize: storageResult.size ? Math.round(storageResult.size / 1024) + 'KB' : 'unknown'
      });
      
      const fetchStart = Date.now();
      
      // Log gravity details if present
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
          this.logger.debug('Gravity parameter in final fetch options', {
            gravity: String(imageOptions.gravity),
            gravityType: gravityType,
            gravityDetails: gravityDetails,
            gravityStringified: JSON.stringify(imageOptions.gravity)
          });
        }
      }
      
      this.logger.breadcrumb('Creating fetch promise with CF options');
      const transformPromise = fetch(request.url, fetchOptionsWithCache);
      this.logger.breadcrumb('Fetch promise created', Date.now() - fetchStart);
      
      // Use Promise.race to implement the timeout
      this.logger.breadcrumb('Awaiting CF transformation result');
      const raceStart = Date.now();
      const transformed = await Promise.race([transformPromise, timeoutPromise]);
      const fetchEnd = Date.now();
      
      this.logger.breadcrumb('Cloudflare transformation completed', fetchEnd - fetchStart, { 
        status: transformed.status,
        contentType: transformed.headers.get('content-type') || 'unknown',
        raceTime: fetchEnd - raceStart,
        totalTime: fetchEnd - fetchStart
      });
      
      if (!transformed.ok) {
        // If transformation failed, return the original
        this.logger.error('Image transformation failed', { 
          status: transformed.status,
          statusText: transformed.statusText,
          headers: JSON.stringify(Object.fromEntries([...transformed.headers.entries()])),
          url: request.url,
          imageSize: storageResult.size,
          transformOptionsCount: Object.keys(transformOptions).length
        });
        
        // Check if the status is 524 (timeout)
        if (transformed.status === 524) {
          this.logger.breadcrumb('Detected 524 timeout during transformation', undefined, {
            imageSize: storageResult.size,
            transformDuration: fetchEnd - fetchStart,
            format: transformOptions.format,
            width: transformOptions.width,
            height: transformOptions.height
          });
        }
        
        this.logger.breadcrumb('Falling back to original image due to transform failure', undefined, {
          errorStatus: transformed.status,
          cfRay: transformed.headers.get('cf-ray') || 'unknown'
        });
        return originalResponse;
      }
      
      // Create a new response with appropriate headers
      this.logger.breadcrumb('Creating final response');
      let response = new Response(transformed.body, {
        headers: transformed.headers,
        status: transformed.status,
        statusText: transformed.statusText,
      });
      
      // Add metadata headers for cache optimization
      const headers = new Headers(response.headers);
      
      // Store image dimensions in headers for cache tagging if available
      if (transformOptions.width) {
        headers.set('X-Image-Width', String(transformOptions.width));
      }
      if (transformOptions.height) {
        headers.set('X-Image-Height', String(transformOptions.height));
      }
      if (transformOptions.format && transformOptions.format !== 'auto') {
        headers.set('X-Image-Format', transformOptions.format);
      }
      if (transformOptions.quality) {
        headers.set('X-Image-Quality', String(transformOptions.quality));
      }
      if (transformOptions.derivative) {
        headers.set('X-Image-Derivative', transformOptions.derivative);
      }
      
      // Create a new response with the added headers
      response = new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers
      });
      
      // Add cache control headers based on configuration
      if (config.cache.cacheability) {
        response.headers.set('Cache-Control', `public, max-age=${config.cache.ttl.ok}`);
        this.logger.breadcrumb('Added cache control headers', undefined, {
          cacheControl: `public, max-age=${config.cache.ttl.ok}`
        });
      }
      
      // Add client hints headers to response
      response = addClientHintsHeaders(response, request);
      this.logger.breadcrumb('Added client hints headers to response', undefined, {
        userAgent: request.headers.get('User-Agent')?.substring(0, 50) || 'unknown'
      });
      
      return response;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      
      this.logger.error('Error transforming image', {
        error: errorMsg,
        stack: stack
      });
      
      this.logger.breadcrumb('Transformation error occurred', undefined, {
        error: errorMsg,
        fallback: 'original image'
      });
      
      // In case of error, return the original image
      return originalResponse;
    }
  }

  /**
   * Get optimal transformation options based on client information
   * 
   * This version delegates to the ClientDetectionService if available, falling back
   * to basic optimization if not available.
   */
  async getOptimalOptions(
    request: Request, 
    clientInfo: ClientInfo, 
    config: ImageResizerConfig
  ): Promise<TransformOptions> {
    // Use the client detection service if available
    if (this.clientDetectionService) {
      try {
        this.logger.debug('Using ClientDetectionService for optimization');
        const baseOptions: TransformOptions = {};
        
        // Let the client detection service optimize the options
        return await this.clientDetectionService.getOptimizedOptions(
          request,
          baseOptions,
          config
        );
      } catch (error) {
        this.logger.warn('Error using ClientDetectionService for optimization', {
          error: error instanceof Error ? error.message : String(error)
        });
        
        // Fall back to basic optimization
        this.logger.debug('Falling back to basic optimization');
      }
    }
    
    // Basic optimization logic
    const options: TransformOptions = {};

    // Determine responsive width if not specified
    if (!options.width) {
      if (clientInfo.viewportWidth) {
        options.width = this.calculateResponsiveWidth(
          clientInfo.viewportWidth, 
          clientInfo.devicePixelRatio
        );
        this.logger.debug('Set responsive width based on client hints', { 
          width: options.width,
          viewportWidth: clientInfo.viewportWidth,
          dpr: clientInfo.devicePixelRatio
        });
      }
    }

    // Determine optimal format if not specified
    if (!options.format) {
      options.format = 'auto';
      if (clientInfo.acceptsAvif) {
        options.format = 'avif';
      } else if (clientInfo.acceptsWebp) {
        options.format = 'webp';
      }
      
      this.logger.debug('Set optimal format based on client capabilities', { 
        format: options.format,
        acceptsWebp: clientInfo.acceptsWebp,
        acceptsAvif: clientInfo.acceptsAvif
      });
    }

    // Adjust quality based on device type and network conditions
    if (!options.quality) {
      // Default quality
      options.quality = 85;
      
      // Adjust based on device type
      if (clientInfo.deviceType === 'mobile') {
        options.quality = 80;
      } else if (clientInfo.deviceType === 'tablet') {
        options.quality = 82;
      }
      
      // Further reduce for save-data
      if (clientInfo.saveData) {
        options.quality = Math.floor(options.quality * 0.8); // 20% reduction for save-data
        this.logger.debug('Reduced quality for save-data request', { quality: options.quality });
      }
    }
    
    // Adjust DPR if available
    if (clientInfo.devicePixelRatio && clientInfo.devicePixelRatio > 1) {
      options.dpr = Math.min(clientInfo.devicePixelRatio, 3); // Cap at 3x for performance
      this.logger.debug('Set DPR based on client capabilities', { dpr: options.dpr });
    }

    return options;
  }

  /**
   * Build Cloudflare image transformation options
   */
  async buildTransformOptions(
    request: Request,
    storageResult: StorageResult,
    options: TransformOptions,
    config: ImageResizerConfig
  ): Promise<TransformOptions> {
    this.logger.breadcrumb('buildTransformOptions started', undefined, {
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
    if (options.derivative) {
      if (config.derivatives[options.derivative]) {
        this.logger.debug('Applying derivative template', {
          derivative: options.derivative,
          hasTemplate: true,
          availableKeys: Object.keys(config.derivatives).join(',')
        });
        transformOptions = this.applyDerivativeTemplate(options, options.derivative, config);
      } else {
        this.logger.error('Derivative template not found in config', {
          requestedDerivative: options.derivative,
          availableDerivatives: Object.keys(config.derivatives).join(',')
        });
        // Continue with the original options, as the derivative wasn't found
      }
    }
    
    // Handle 'auto' width specifically - store a marker so we know to restore it later
    if ((transformOptions.width as any) === 'auto' || String(transformOptions.width) === 'auto') {
      transformOptions.__autoWidth = true; // Store marker to apply responsive width later
      delete transformOptions.width; // Remove 'auto' so it doesn't get sent to Cloudflare
    }
    
    // Get optimized options from client detection service if available
    if (this.clientDetectionService) {
      try {
        const detectorStart = Date.now();
        this.logger.breadcrumb('Using client detection service for options optimization');
        
        const optimizedOptions = await this.clientDetectionService.getOptimizedOptions(
          request, 
          transformOptions, 
          config
        );
        
        const detectionTime = Date.now() - detectorStart;
        this.logger.debug('Client detection optimization completed', {
          detectionTime: `${detectionTime}ms`,
          originalFormat: transformOptions.format,
          optimizedFormat: optimizedOptions.format
        });
        
        // Update transformOptions with the optimized values
        transformOptions = optimizedOptions;
      } catch (error) {
        this.logger.warn('Error optimizing with client detection service', {
          error: error instanceof Error ? error.message : String(error)
        });
        // Continue with unoptimized options
      }
    }
    
    // Get responsive width if not explicitly set or if auto width was requested
    if (!transformOptions.width || (transformOptions as any).__autoWidth === true) {
      this.logger.breadcrumb('Calculating responsive width', undefined, { 
        hasWidth: false,
        autoWidth: (transformOptions as any).__autoWidth === true,
        userAgent: request.headers.get('User-Agent') || 'unknown',
        viewportWidth: request.headers.get('Sec-CH-Viewport-Width') || request.headers.get('Viewport-Width') || 'unknown',
        deviceType: request.headers.get('CF-Device-Type') || 'unknown'
      });
      
      // Fall back to traditional responsive width calculation
      const responsiveWidthStart = Date.now();
      const responsiveWidth = this.getResponsiveWidth(transformOptions, request, config);
      this.logger.breadcrumb('Responsive width calculated', Date.now() - responsiveWidthStart, { 
        calculatedWidth: responsiveWidth
      });
      
      if (responsiveWidth) {
        transformOptions.width = responsiveWidth;
        this.logger.breadcrumb('Applied responsive width', undefined, { width: responsiveWidth });
      } else if (config.responsive?.deviceWidths) {
        // Fallback to device type based on user agent
        const userAgent = request.headers.get('User-Agent') || '';
        const cfDeviceType = request.headers.get('CF-Device-Type');
        
        // Set a default width based on the device type
        if (cfDeviceType === 'mobile' && config.responsive.deviceWidths.mobile) {
          transformOptions.width = config.responsive.deviceWidths.mobile;
          this.logger.breadcrumb('Using mobile width from config', undefined, { width: transformOptions.width });
        } else if (cfDeviceType === 'tablet' && config.responsive.deviceWidths.tablet) {
          transformOptions.width = config.responsive.deviceWidths.tablet;
          this.logger.breadcrumb('Using tablet width from config', undefined, { width: transformOptions.width });
        } else if (config.responsive.deviceWidths.desktop) {
          transformOptions.width = config.responsive.deviceWidths.desktop;
          this.logger.breadcrumb('Using desktop width from config', undefined, { width: transformOptions.width });
        } else {
          // Absolute fallback
          transformOptions.width = 1200;
          this.logger.breadcrumb('Using default width fallback', undefined, { width: 1200 });
        }
      } else {
        this.logger.breadcrumb('No responsive width determined, using original dimensions');
        transformOptions.width = 1200; // Last resort fallback for tests
      }
      
      // Clean up auto width marker
      if ((transformOptions as any).__autoWidth) {
        delete (transformOptions as any).__autoWidth;
      }
    }
    
    // Get appropriate format if not set by detector
    if (!transformOptions.format || transformOptions.format === 'auto') {
      this.logger.breadcrumb('Determining output format', undefined, { 
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
        this.logger.breadcrumb('Save-Data header detected, using efficient format');
        
        if (acceptHeader.includes('image/avif')) {
          transformOptions.format = 'avif';
          this.logger.breadcrumb('Selected AVIF format for Save-Data');
        } else if (acceptHeader.includes('image/webp')) {
          transformOptions.format = 'webp';
          this.logger.breadcrumb('Selected WebP format for Save-Data');
        } else {
          transformOptions.format = await this.getFormat(request, storageResult.contentType, transformOptions, config);
          this.logger.breadcrumb('Selected fallback format for Save-Data', undefined, { format: transformOptions.format });
        }
      } else {
        transformOptions.format = await this.getFormat(request, storageResult.contentType, transformOptions, config);
        this.logger.breadcrumb('Selected format based on content negotiation', undefined, { format: transformOptions.format });
      }
      this.logger.breadcrumb('Format determination completed', Date.now() - formatStart, { 
        finalFormat: transformOptions.format,
        originalContentType: storageResult.contentType
      });
    }
    
    // Handle 'auto' quality
    if ((transformOptions.quality as any) === 'auto' || String(transformOptions.quality) === 'auto') {
      this.logger.breadcrumb('Auto quality detected, removing auto parameter');
      delete transformOptions.quality; // Remove 'auto' so it doesn't get sent to Cloudflare
    }
    
    // Set default quality if not specified by detector
    if (transformOptions.quality === undefined) {
      this.logger.breadcrumb('Determining quality setting', undefined, {
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
        this.logger.breadcrumb('Using low-bandwidth quality settings', undefined, {
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
          this.logger.breadcrumb('Using adjusted quality from config', undefined, {
            format,
            normalQuality,
            adjustedQuality: transformOptions.quality
          });
        } else {
          // Fallback quality values if not in config
          if (format === 'webp') {
            transformOptions.quality = 75;
            this.logger.breadcrumb('Using fallback low WebP quality');
          } else if (format === 'avif') {
            transformOptions.quality = 70;
            this.logger.breadcrumb('Using fallback low AVIF quality');
          } else {
            transformOptions.quality = 75;
            this.logger.breadcrumb('Using fallback low quality for other format');
          }
        }
      } else {
        this.logger.breadcrumb('Using standard quality settings');
        // Standard quality settings
        const format = transformOptions.format as string;
        
        // Use format-specific quality from config if available
        if (config.responsive.formatQuality && format in config.responsive.formatQuality) {
          transformOptions.quality = config.responsive.formatQuality[format];
          this.logger.breadcrumb('Using quality from config', undefined, {
            format,
            quality: transformOptions.quality
          });
        } else {
          // Fallback quality values if not in config
          if (format === 'webp') {
            transformOptions.quality = 85;
            this.logger.breadcrumb('Using fallback standard WebP quality');
          } else if (format === 'avif') {
            transformOptions.quality = 80;
            this.logger.breadcrumb('Using fallback standard AVIF quality');
          } else {
            transformOptions.quality = config.responsive.quality;
            this.logger.breadcrumb('Using fallback standard quality from config');
          }
        }
      }
      this.logger.breadcrumb('Quality determination completed', Date.now() - qualityStart, {
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
      this.logger.breadcrumb('Processing conditional transformations', undefined, {
        conditionCount: transformOptions._conditions.length,
        conditionTypes: transformOptions._conditions.map(c => c.type).join(',')
      });
      
      try {
        // Process each condition
        for (const condition of transformOptions._conditions) {
          if (condition.type === 'dimension') {
            // Parse and apply dimension condition
            this.logger.breadcrumb('Processing dimension condition', undefined, {
              condition: condition.condition
            });
            
            const dimensionResult = this.applyDimensionCondition(condition.condition, storageResult);
            
            // Merge resulting options
            if (dimensionResult && Object.keys(dimensionResult).length > 0) {
              this.logger.breadcrumb('Applying conditional transformation', undefined, {
                appliedParams: Object.keys(dimensionResult).join(',')
              });
              
              Object.keys(dimensionResult).forEach(key => {
                transformOptions[key] = dimensionResult[key];
              });
            } else {
              this.logger.breadcrumb('Condition not met or no transformation specified');
            }
          }
        }
      } catch (error) {
        this.logger.error('Error processing conditional transformations', {
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
          this.logger.breadcrumb('Preserving gravity object format', undefined, {
            gravityType: typeof transformOptions[key],
            gravityValue: JSON.stringify(transformOptions[key]),
            hasXY: transformOptions[key] && 'x' in transformOptions[key] && 'y' in transformOptions[key]
          });
        }
      }
    });
    
    // Validate the transform options
    this.validateTransformOptions(result);
    
    // Add origin-auth configuration if enabled
    if (config.storage.auth?.enabled && config.storage.auth.useOriginAuth) {
      if (config.storage.auth.sharePublicly) {
        result['origin-auth'] = 'share-publicly';
      }
    }
    
    // Let Cloudflare Image Resizing handle validation and provide warning headers
    this.logger.breadcrumb('buildTransformOptions completed', undefined, {
      finalOptionsCount: Object.keys(result).length,
      hasWidth: !!result.width,
      hasHeight: !!result.height,
      width: result.width,
      height: result.height,
      format: result.format,
      quality: result.quality,
      fit: result.fit,
      allParams: Object.keys(result).join(',')
    });
    
    return result;
  }

  /**
   * Get image format based on request Accept header, User-Agent, and configuration
   */
  private async getFormat(
    request: Request,
    contentType: string | null,
    options: TransformOptions,
    config: ImageResizerConfig
  ): Promise<string> {
    // If a specific format is requested, use that
    if (options.format && options.format !== 'auto') {
      return options.format;
    }
    
    // Use the client detection service to get format support
    if (this.clientDetectionService) {
      try {
        // Check AVIF support
        const supportsAvif = await this.clientDetectionService.supportsFormat(request, 'avif');
        if (supportsAvif) {
          return 'avif';
        }
        
        // Check WebP support
        const supportsWebp = await this.clientDetectionService.supportsFormat(request, 'webp');
        if (supportsWebp) {
          return 'webp';
        }
      } catch (error) {
        this.logger.warn('Error checking format support with client detection service', {
          error: error instanceof Error ? error.message : String(error)
        });
        // Continue with fallback format detection
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
      
      // Get Accept header for manual format detection
      const acceptHeader = request.headers.get('Accept') || '';
      if (acceptHeader.includes('image/avif')) {
        return 'avif';
      } else if (acceptHeader.includes('image/webp')) {
        return 'webp';
      }
      
      // User agent based detection as fallback
      const userAgent = request.headers.get('User-Agent') || '';
      if (isFormatSupported('webp', userAgent)) {
        return 'webp';
      }
      
      // Default to JPEG as the safest option
      return 'jpeg';
    }
    
    return options.format || config.responsive.format;
  }

  /**
   * Get the appropriate width for the image based on client hints and configuration
   */
  private getResponsiveWidth(
    options: TransformOptions,
    request: Request,
    config: ImageResizerConfig
  ): number | undefined {
    // If a specific width is requested, use that
    if (options.width) {
      if (typeof options.width === 'number') {
        return options.width;
      } else if (typeof options.width === 'string' && options.width !== 'auto') {
        return parseInt(options.width, 10);
      }
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
    
    // Get Cloudflare's device type if available
    const cfDeviceType = request.headers.get('CF-Device-Type');
    
    // Detect device type from user agent as fallback
    const userAgent = request.headers.get('User-Agent') || '';
    
    // Use configurable regex patterns if available, or fall back to defaults
    const mobileRegex = config.responsive?.deviceDetection?.mobileRegex || 'Mobile|Android|iPhone|iPad|iPod';
    const tabletRegex = config.responsive?.deviceDetection?.tabletRegex || 'iPad|Android(?!.*Mobile)';
    
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
    if (deviceCategory && config.responsive?.deviceWidths && config.responsive.deviceWidths[deviceCategory]) {
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
        const nextBreakpoint = config.responsive?.breakpoints?.find(bp => bp >= calculatedWidth);
        
        // Use the next breakpoint or the largest one
        if (nextBreakpoint) {
          width = nextBreakpoint;
        } else if (config.responsive?.breakpoints?.length) {
          width = config.responsive.breakpoints[config.responsive.breakpoints.length - 1];
        }
      }
    }
    
    return width;
  }

  /**
   * Apply derivative template to transform options
   */
  private applyDerivativeTemplate(
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
      // Log missing derivative for debugging
      this.logger.warn('Requested derivative template not found', {
        derivative,
        availableDerivatives: Object.keys(config.derivatives).join(', ')
      });
      
      // Return the original options - this will still work but won't apply template
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
    
    this.logger.debug('Applied derivative template', {
      derivative,
      template: JSON.stringify(template),
      finalOptions: JSON.stringify(result)
    });
    
    return result;
  }

  /**
   * Apply a dimension condition to transform options
   */
  private applyDimensionCondition(
    condition: string, 
    storageResult: StorageResult
  ): TransformOptions {
    // Format: condition,transform (e.g. width>500,im.resize=width:300)
    const parts = condition.split(',', 2);
    if (parts.length !== 2) {
      this.logger.breadcrumb('Invalid condition format, expected condition,transform', undefined, {
        condition
      });
      return {};
    }
    
    const [conditionPart, transformPart] = parts;
    
    // Parse condition
    const match = conditionPart.match(/^(width|height|ratio|format)([<>=]+)([0-9.]+)$/);
    if (!match) {
      this.logger.breadcrumb('Invalid condition syntax', undefined, {
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
      this.logger.breadcrumb('Using dimensions from storage result', undefined, { width, height });
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
          
          this.logger.breadcrumb('Using estimated dimensions from file size', undefined, {
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
      this.logger.breadcrumb('Cannot evaluate dimension condition, no dimensions available');
      return {};
    }
    
    // Check condition
    let conditionMet = false;
    
    if (property === 'width' && width !== undefined) {
      conditionMet = this.evaluateCondition(width, operator, value);
      this.logger.breadcrumb('Evaluated width condition', undefined, {
        actualWidth: width,
        operator,
        expectedValue: value,
        result: conditionMet
      });
    } else if (property === 'height' && height !== undefined) {
      conditionMet = this.evaluateCondition(height, operator, value);
      this.logger.breadcrumb('Evaluated height condition', undefined, {
        actualHeight: height,
        operator,
        expectedValue: value,
        result: conditionMet
      });
    } else if (property === 'ratio' && width !== undefined && height !== undefined) {
      const ratio = width / height;
      conditionMet = this.evaluateCondition(ratio, operator, value);
      this.logger.breadcrumb('Evaluated ratio condition', undefined, {
        actualRatio: ratio.toFixed(3),
        operator,
        expectedValue: value,
        result: conditionMet
      });
    }
    
    // If condition is met, parse and apply the transformation
    if (conditionMet && transformPart) {
      this.logger.breadcrumb('Condition met, applying transformation', undefined, {
        transform: transformPart
      });
      
      // Handle transformation syntax
      if (transformPart.startsWith('im.')) {
        // Akamai-style transformations
        return this.parseAkamaiTransform(transformPart);
      } else {
        // Cloudflare-style transformations
        return this.parseCloudflareTransform(transformPart);
      }
    }
    
    // If condition is not met or there was an error, return empty object
    return {};
  }

  /**
   * Parse Akamai-style transformation parameters
   */
  private parseAkamaiTransform(transformPart: string): TransformOptions {
    try {
      // We'll use a URL to parse the parameters
      const mockUrl = new URL(`https://example.com/?${transformPart}`);
      
      // Extract Akamai parameters
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
      this.logger.error('Error parsing Akamai parameters in condition', {
        error: error instanceof Error ? error.message : String(error),
        transform: transformPart
      });
      return {};
    }
  }

  /**
   * Parse Cloudflare-style transformation parameters
   */
  private parseCloudflareTransform(transformPart: string): TransformOptions {
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
      this.logger.error('Error parsing Cloudflare parameters in condition', {
        error: error instanceof Error ? error.message : String(error),
        transform: transformPart
      });
      return {};
    }
  }

  /**
   * Evaluate a comparison condition
   */
  private evaluateCondition(actual: number, operator: string, expected: number): boolean {
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

  /**
   * Calculate responsive width based on viewport width and device pixel ratio
   */
  private calculateResponsiveWidth(viewportWidth: number, dpr = 1): number {
    // Apply device pixel ratio
    let calculatedWidth = viewportWidth * dpr;
    
    // Cap at reasonable maximum to prevent excessive sizes
    const maxWidth = 2000;
    if (calculatedWidth > maxWidth) {
      calculatedWidth = maxWidth;
    }
    
    // Round to the nearest 100 for caching efficiency
    return Math.ceil(calculatedWidth / 100) * 100;
  }

  /**
   * Get the best image format based on Accept header
   */
  private getBestImageFormat(acceptHeader: string): string | null {
    // Parse Accept header to find supported image formats
    const formats: string[] = [];
    
    try {
      // Split the header on commas and process each part
      const parts = acceptHeader.split(',');
      
      for (const part of parts) {
        // Extract the MIME type and quality factor
        const [mimeType] = part.trim().split(';');
        
        // Check if this is an image format
        if (mimeType.startsWith('image/')) {
          // Extract the format name (after image/)
          const format = mimeType.substring(6).toLowerCase();
          formats.push(format);
        }
      }
    } catch (error) {
      this.logger.debug('Error parsing Accept header', { 
        error: error instanceof Error ? error.message : String(error),
        acceptHeader
      });
    }
    
    // Check for modern formats in order of preference
    if (formats.includes('avif')) {
      return 'avif';
    }
    
    if (formats.includes('webp')) {
      return 'webp';
    }
    
    // Fallback to auto if no modern formats detected
    return null;
  }

  /**
   * Validate transformation options and apply constraints
   */
  private validateTransformOptions(options: TransformOptions): void {
    // Validate the blur parameter
    if (options.blur !== undefined) {
      const blurValue = Number(options.blur);
      if (isNaN(blurValue) || blurValue < 1 || blurValue > 250) {
        if (!isNaN(blurValue)) {
          // Clamp to valid range
          options.blur = Math.max(1, Math.min(250, blurValue));
          this.logger.breadcrumb('Clamped blur value to valid range (1-250)', undefined, {
            originalValue: blurValue,
            clampedValue: options.blur
          });
        } else {
          // Not a valid number, remove it
          this.logger.warn('Invalid blur value, must be between 1 and 250', {
            value: options.blur
          });
          delete options.blur;
        }
      }
    }
    
    // Validate gamma parameter
    if (options.gamma !== undefined) {
      const gammaValue = Number(options.gamma);
      if (isNaN(gammaValue) || gammaValue <= 0) {
        this.logger.warn('Invalid gamma value, must be a positive number', {
          value: options.gamma
        });
        delete options.gamma;
      }
    }
    
    // Validate the anim parameter
    if (options.anim !== undefined && typeof options.anim !== 'boolean') {
      // Convert string 'true'/'false' to boolean
      if (options.anim === 'true') {
        options.anim = true;
        this.logger.breadcrumb('Converted anim="true" to boolean true', undefined, {
          originalValue: "true"
        });
      } else if (options.anim === 'false') {
        options.anim = false;
        this.logger.breadcrumb('Converted anim="false" to boolean false', undefined, {
          originalValue: "false"
        });
      } else {
        this.logger.warn('Invalid anim value, must be boolean', {
          value: options.anim
        });
        delete options.anim;
      }
    }
    
    // Validate the compression parameter
    if (options.compression !== undefined && options.compression !== 'fast') {
      this.logger.warn('Invalid compression value, only "fast" is supported', {
        value: options.compression
      });
      
      // Use a safer approach with explicit string check
      if (options.compression && typeof options.compression === 'string') {
        // Now TypeScript knows compression is a string
        const compressionStr: string = options.compression;
        if (compressionStr.toLowerCase() === 'fast') {
          options.compression = 'fast';
        } else {
          delete options.compression;
        }
      } else {
        delete options.compression;
      }
    }
    
    // Validate watermark/draw array
    if (options.draw && Array.isArray(options.draw)) {
      const validDrawItems = [];
      
      for (let i = 0; i < options.draw.length; i++) {
        const drawItem = options.draw[i];
        
        // Each draw item must have a URL
        if (!drawItem.url) {
          this.logger.warn(`Draw item at index ${i} missing required 'url' property, skipping`, {
            drawItem: JSON.stringify(drawItem)
          });
          continue;
        }
        
        // Validate numeric properties
        if (drawItem.width !== undefined && (isNaN(Number(drawItem.width)) || Number(drawItem.width) <= 0)) {
          this.logger.warn(`Invalid width in draw item at index ${i}, must be a positive number`, {
            width: drawItem.width
          });
          delete drawItem.width;
        }
        
        if (drawItem.height !== undefined && (isNaN(Number(drawItem.height)) || Number(drawItem.height) <= 0)) {
          this.logger.warn(`Invalid height in draw item at index ${i}, must be a positive number`, {
            height: drawItem.height
          });
          delete drawItem.height;
        }
        
        // Validate positioning - can't have both left/right or top/bottom
        if (drawItem.left !== undefined && drawItem.right !== undefined) {
          this.logger.warn(`Draw item at index ${i} has both 'left' and 'right' set, which is invalid. Removing 'right'`, {
            left: drawItem.left,
            right: drawItem.right
          });
          delete drawItem.right;
        }
        
        if (drawItem.top !== undefined && drawItem.bottom !== undefined) {
          this.logger.warn(`Draw item at index ${i} has both 'top' and 'bottom' set, which is invalid. Removing 'bottom'`, {
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
              this.logger.breadcrumb(`Clamped opacity in draw item at index ${i} to valid range (0-1)`, undefined, {
                originalValue: opacity,
                clampedValue: drawItem.opacity
              });
            } else {
              this.logger.warn(`Invalid opacity in draw item at index ${i}, must be between 0 and 1`, {
                opacity
              });
              delete drawItem.opacity;
            }
          }
        }
        
        // Add this item to the validated array
        validDrawItems.push(drawItem);
      }
      
      // Replace the draw array with only valid items
      if (validDrawItems.length > 0) {
        options.draw = validDrawItems;
        this.logger.breadcrumb('Validated draw array', undefined, {
          itemCount: validDrawItems.length,
          items: validDrawItems.map(item => item.url).join(', ')
        });
      } else {
        // If no valid items, remove the draw array
        this.logger.warn('No valid draw items found, removing draw array', {
          originalCount: options.draw.length
        });
        delete options.draw;
      }
    }
    
    // Validate and normalize gravity parameter
    if (options.gravity !== undefined) {
      if (typeof options.gravity === 'object' && options.gravity !== null) {
        // Handle object gravity (coordinates)
        if (!('x' in options.gravity) || !('y' in options.gravity)) {
          this.logger.warn('Invalid gravity object, missing x or y coordinates', {
            gravity: options.gravity
          });
          options.gravity = 'center'; // Default to center
        }
      } else if (typeof options.gravity === 'string') {
        // Handle string gravity
        const validGravityValues = ['auto', 'center', 'top', 'bottom', 'left', 'right', 'north', 'south', 'east', 'west', 'north-east', 'north-west', 'south-east', 'south-west', 'face'];
        
        if (!validGravityValues.includes(options.gravity)) {
          this.logger.warn('Invalid gravity value, defaulting to center', {
            originalValue: options.gravity
          });
          options.gravity = 'center';
        }
      } else {
        // Invalid gravity type
        this.logger.warn('Invalid gravity type, must be string or object with x,y coordinates', {
          gravityType: typeof options.gravity
        });
        options.gravity = 'center'; // Default to center
      }
    }
    
    // Validate format
    if (options.format !== undefined && typeof options.format === 'string') {
      const validFormats = ['avif', 'webp', 'json', 'jpeg', 'png', 'gif', 'auto'];
      const formatValue = options.format.toLowerCase();
      
      if (!validFormats.includes(formatValue)) {
        this.logger.warn('Invalid format value, defaulting to auto', {
          originalValue: options.format
        });
        options.format = 'auto';
      }
    }
  }
}