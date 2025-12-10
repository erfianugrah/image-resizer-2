/**
 * Default implementation of the ImageTransformationService
 * 
 * Handles image transformation with optimized settings based on client detection
 * and performing image transformations using Cloudflare's Image Resizing service.
 */

import { ImageResizerConfig } from '../config';
import { Logger } from '../utils/logging';
import { OptimizedLogger } from '../utils/optimized-logging';
import { isFormatSupported } from '../utils/browser-formats';
import { addClientHintsHeaders } from '../utils/client-hints';
import { 
  mergeResponseUpdates,
  batchUpdateHeaders,
  // Used in other modules and for future extension of response handling
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  addResponseHeaders
} from '../utils/optimized-response';
import { 
  ClientInfo, 
  ImageTransformationService, 
  StorageResult,
  ClientDetectionService,
  ConfigurationService,
  CacheService,
  TransformOptions,
  MetadataFetchingService,
  MetadataProcessingOptions
} from './interfaces';
import { 
  // Used for future error handling extensions
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  TransformationError, 
  TransformationTimeoutError,
  // Used for validation error handling in future code paths
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  ValidationError 
} from '../errors/transformationErrors';
import { Env } from '../types';

export class DefaultImageTransformationService implements ImageTransformationService {
  private logger: Logger | OptimizedLogger;
  private clientDetectionService?: ClientDetectionService;
  private metadataService?: MetadataFetchingService;
  private configService?: ConfigurationService;
  private cacheService?: CacheService;
  private isOptimizedLogger: boolean;
  private performanceTracking: boolean;
  private formatStatistics: Record<string, number> = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private optionStatistics: Record<string, any> = {};
  private requestCount: number = 0;
  private errorCount: number = 0;
  
  constructor(
    logger: Logger, 
    clientDetectionService?: ClientDetectionService,
    configService?: ConfigurationService,
    cacheService?: CacheService,
    metadataService?: MetadataFetchingService
  ) {
    this.logger = logger;
    this.clientDetectionService = clientDetectionService;
    this.configService = configService;
    this.cacheService = cacheService;
    this.metadataService = metadataService;
    
    // Check if we have an optimized logger
    this.isOptimizedLogger = !!(logger as OptimizedLogger).isLevelEnabled;
    
    // Determine if performance tracking is enabled
    this.performanceTracking = configService?.getConfig().debug?.performanceTracking !== false;
  }
  
  /**
   * Process smart transformation options using metadata
   * 
   * This method is called when 'smart=true' is present in the options.
   * It uses the metadata service to fetch and analyze the image, then
   * updates the transformation options accordingly.
   * 
   * @param request Original request
   * @param imagePath Path to the image
   * @param options Current transformation options
   * @param config Application configuration
   * @param env Environment variables
   * @returns Updated transformation options with metadata-informed settings
   */
  async processSmartOptions(
    request: Request,
    imagePath: string,
    options: TransformOptions,
    config: ImageResizerConfig,
    env: Env
  ): Promise<TransformOptions> {
    const startTime = Date.now();
    this.logger.debug('Processing smart transform options', {
      imagePath,
      optionsKeys: Object.keys(options).join(','),
      smart: !!options.smart
    });
    
    // Check if metadata service is available
    if (!this.metadataService) {
      this.logger.warn('Metadata service not available, skipping smart processing');
      return options;
    }
    
    try {
      // Extract parameters for metadata processing
      const processingOptions: MetadataProcessingOptions = {
        targetPlatform: options.platform as string,
        contentType: options.content as string,
        deviceType: options.device as 'mobile' | 'tablet' | 'desktop',
        allowExpansion: options.allowExpansion || false,
        preserveFocalPoint: true,
        width: options.width // Pass through the requested width
      };
      
      // Extract custom focal point if provided
      if (options.focal) {
        try {
          const [x, y] = options.focal.split(',').map(v => parseFloat(v));
          if (!isNaN(x) && !isNaN(y) && x >= 0 && x <= 1 && y >= 0 && y <= 1) {
            processingOptions.focalPoint = { x, y };
            this.logger.debug('Using custom focal point', { x, y });
          }
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (error) {
          this.logger.warn('Invalid focal point format', { focal: options.focal });
        }
      }
      
      // Parse target aspect ratio if provided
      let targetAspect: { width: number, height: number } | undefined;
      if (options.aspect) {
        try {
          // Support both colon format (16:9) and dash format (16-9)
          const aspectString = options.aspect.replace('-', ':');
          const [width, height] = aspectString.split(':').map(v => parseFloat(v));
          
          if (!isNaN(width) && !isNaN(height) && width > 0 && height > 0) {
            targetAspect = { width, height };
            this.logger.debug('Using custom aspect ratio', { 
              width, 
              height, 
              ratio: width / height 
            });
          }
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (error) {
          this.logger.warn('Invalid aspect ratio format', { aspect: options.aspect });
        }
      }
      
      // Fetch and process metadata
      this.logger.debug('Fetching and processing metadata', {
        imagePath,
        targetAspect: targetAspect ? `${targetAspect.width}:${targetAspect.height}` : 'none',
        processingOptions: JSON.stringify(processingOptions)
      });
      
      const transformationResult = await this.metadataService.fetchAndProcessMetadata(
        imagePath,
        config,
        env,
        request,
        targetAspect,
        processingOptions
      );
      
      // Create a new options object to avoid modifying the original
      const updatedOptions = { ...options };
      
      // Apply aspect crop parameters if available
      if (transformationResult.aspectCrop) {
        // If we have aspect crop parameters, convert to CF Image parameters
        const { width, height, hoffset, voffset, allowExpansion } = transformationResult.aspectCrop;
        
        // Store the metadata result for potential later use
        updatedOptions._metadataResult = transformationResult;
        
        // Set dimensions based on the aspect crop
        updatedOptions.width = width;
        updatedOptions.height = height;
        
        // Set allowExpansion flag if specified
        if (allowExpansion !== undefined) {
          updatedOptions.allowExpansion = allowExpansion;
          
          // When allowExpansion is true, use 'pad' fit mode to add padding
          // instead of cropping the image
          if (allowExpansion) {
            updatedOptions.fit = 'pad';
            
            // Ensure background color is set or use transparent as default
            if (!updatedOptions.background) {
              updatedOptions.background = options.background || 'transparent';
            }
            
            // Calculate target dimensions based on the desired aspect ratio
            // Extract the target aspect ratio from the options
            let targetRatioWidth = 1;
            let targetRatioHeight = 1;
            
            // Check if aspect ratio was provided in options
            if (options.aspect) {
              try {
                // Handle both formats: "16:9" and "16-9"
                const aspectStr = options.aspect.toString().replace('-', ':');
                const [w, h] = aspectStr.split(':').map(v => parseFloat(v));
                
                if (!isNaN(w) && !isNaN(h) && w > 0 && h > 0) {
                  targetRatioWidth = w;
                  targetRatioHeight = h;
                }
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              } catch (error) {
                this.logger.warn('Invalid aspect ratio format', { aspect: options.aspect });
              }
            }
            
            // Calculate target dimensions for the padding container
            const targetRatio = targetRatioWidth / targetRatioHeight;
            const originalRatio = width / height;
            
            // Calculate the dimensions of the containing box with padding
            let containerWidth: number;
            let containerHeight: number;
            
            // Check if a specific width was explicitly requested in the original options
            // This takes priority over the calculated dimensions
            if (options.width && typeof options.width === 'number') {
              // User explicitly requested a width, use it and calculate height based on target ratio
              containerWidth = options.width;
              containerHeight = Math.ceil(containerWidth / targetRatio);
              
              this.logger.debug('Using explicitly requested width for container dimensions', {
                requestedWidth: options.width,
                calculatedHeight: containerHeight,
                targetRatio
              });
            } else {
              // No explicit width request, calculate container dimensions based on original image
              // Calculate a container that has the target aspect ratio
              // but is large enough to contain the entire original image
              if (originalRatio > targetRatio) {
                // Original is wider than target - adjust container height
                containerWidth = width;
                containerHeight = Math.ceil(width / targetRatio);
              } else {
                // Original is taller than target - adjust container width
                containerHeight = height;
                containerWidth = Math.ceil(height * targetRatio);
              }
              
              this.logger.debug('Calculated container dimensions from original image', {
                originalWidth: width,
                originalHeight: height,
                containerWidth,
                containerHeight,
                originalRatio,
                targetRatio
              });
            }
            
            // Use these container dimensions as the explicit width/height
            updatedOptions.width = containerWidth;
            updatedOptions.height = containerHeight;
            
            this.logger.debug('Calculated padding container dimensions', {
              originalWidth: width,
              originalHeight: height,
              originalRatio,
              targetRatio,
              containerWidth,
              containerHeight,
              paddingType: originalRatio > targetRatio ? 'vertical' : 'horizontal',
              paddingAmount: originalRatio > targetRatio ? 
                `${containerHeight - height}px vertical` : 
                `${containerWidth - width}px horizontal`
            });
          } else {
            // When allowExpansion is false, use 'cover' fit mode for cropping
            updatedOptions.fit = 'cover';
          }
        } else {
          // Default to cover if allowExpansion isn't specified
          updatedOptions.fit = 'cover';
        }
        
        // Set gravity to coordinates for precise focal point
        updatedOptions.gravity = { x: hoffset, y: voffset };
        
        this.logger.debug('Applied aspect crop parameters', {
          width,
          height,
          hoffset,
          voffset,
          allowExpansion,
          fit: updatedOptions.fit,
          outputWidth: updatedOptions.width,
          outputHeight: updatedOptions.height,
          background: updatedOptions.background,
          gravity: JSON.stringify(updatedOptions.gravity)
        });
      }
      
      // Apply dimension constraints if available
      if (transformationResult.dimensions) {
        // Only apply if we don't have aspect crop (which already sets width/height)
        if (!transformationResult.aspectCrop) {
          if (transformationResult.dimensions.width) {
            updatedOptions.width = transformationResult.dimensions.width;
          }
          if (transformationResult.dimensions.height) {
            updatedOptions.height = transformationResult.dimensions.height;
          }
          
          this.logger.debug('Applied dimension constraints', {
            width: updatedOptions.width,
            height: updatedOptions.height
          });
        }
      }
      
      // Apply format recommendation if available
      if (transformationResult.format) {
        updatedOptions.format = transformationResult.format;
        this.logger.debug('Applied format recommendation', {
          format: updatedOptions.format
        });
      }
      
      // Apply quality recommendation if available
      if (transformationResult.quality) {
        updatedOptions.quality = transformationResult.quality;
        this.logger.debug('Applied quality recommendation', {
          quality: updatedOptions.quality
        });
      }
      
      // Remove smart parameter to avoid reprocessing
      delete updatedOptions.smart;
      
      // Remove processed parameters to avoid confusion
      delete updatedOptions.platform;
      delete updatedOptions.content;
      delete updatedOptions.device;
      delete updatedOptions.aspect;
      delete updatedOptions.focal;
      
      const duration = Date.now() - startTime;
      this.logger.debug('Smart processing completed', {
        duration,
        originalOptionCount: Object.keys(options).length,
        updatedOptionCount: Object.keys(updatedOptions).length
      });
      
      return updatedOptions;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Error in smart processing', {
        error: errorMessage,
        duration: Date.now() - startTime
      });
      
      // Return original options in case of error
      return options;
    }
  }
  
  /**
   * Service lifecycle method for initialization
   * 
   * This method is called during the service container initialization phase
   * and performs necessary setup such as:
   * - Initializing format statistics tracking
   * - Verifying required dependencies are present
   * - Setting up performance benchmarks
   * 
   * @returns Promise that resolves when initialization is complete
   */
  async initialize(): Promise<void> {
    this.logger.debug('Initializing ImageTransformationService');
    
    // Reset statistics
    this.formatStatistics = {};
    this.optionStatistics = {};
    this.requestCount = 0;
    this.errorCount = 0;
    
    // Verify that required services are available
    if (!this.configService) {
      this.logger.warn('ImageTransformationService initialized without ConfigurationService');
    }
    
    // Client detection service is optional, but useful
    if (!this.clientDetectionService) {
      this.logger.debug('ImageTransformationService initialized without ClientDetectionService');
    }
    
    // Initialize statistics tracking with default values
    const defaultFormats = ['avif', 'webp', 'jpeg', 'png', 'gif', 'auto'];
    defaultFormats.forEach(format => {
      this.formatStatistics[format] = 0;
    });
    
    // Initialize option statistics for tracking common transform options
    this.optionStatistics = {
      widthDistribution: {},
      qualityDistribution: {},
      fitModes: {},
      pixelProcessed: 0,
      avgProcessingTime: 0
    };
    
    // Get configuration for additional initialization if available
    if (this.configService) {
      const config = this.configService.getConfig();
      
      // Additional format-specific initialization based on configuration
      if (config.responsive?.formatQuality) {
        Object.keys(config.responsive.formatQuality).forEach(format => {
          if (!defaultFormats.includes(format)) {
            this.formatStatistics[format] = 0;
          }
        });
      }
      
      // Set performance tracking flag based on configuration
      this.performanceTracking = config.debug?.performanceTracking !== false;
      this.debugLog('Performance tracking ' + (this.performanceTracking ? 'enabled' : 'disabled'));
    }
    
    this.logger.info('ImageTransformationService initialization complete');
    return Promise.resolve();
  }
  
  /**
   * Service lifecycle method for shutdown
   * 
   * This method is called during the service container shutdown phase
   * and performs cleanup tasks such as:
   * - Logging format usage statistics
   * - Reporting performance metrics
   * 
   * @returns Promise that resolves when shutdown is complete
   */
  async shutdown(): Promise<void> {
    this.logger.debug('Shutting down ImageTransformationService');
    
    // Log format statistics if any transformations were performed
    if (this.requestCount > 0) {
      // Filter out formats with no usage
      const usedFormats = Object.entries(this.formatStatistics)
        .filter(([_, count]) => count > 0)
        .reduce((acc, [format, count]) => {
          acc[format] = count;
          return acc;
        }, {} as Record<string, number>);
        
      // Calculate percentages
      const formatPercentages = Object.entries(usedFormats).reduce((acc, [format, count]) => {
        acc[format] = Math.round((count / this.requestCount) * 100);
        return acc;
      }, {} as Record<string, number>);
      
      this.logger.debug('Transformation format statistics', {
        requestCount: this.requestCount,
        errorCount: this.errorCount,
        errorRate: this.requestCount > 0 ? Math.round((this.errorCount / this.requestCount) * 100) + '%' : '0%',
        formatCounts: usedFormats,
        formatPercentages
      });
      
      // Log detailed option statistics if available
      if (Object.keys(this.optionStatistics.widthDistribution).length > 0) {
        this.logger.debug('Transformation option statistics', {
          widthDistribution: this.optionStatistics.widthDistribution,
          qualityDistribution: this.optionStatistics.qualityDistribution,
          fitModes: this.optionStatistics.fitModes,
          avgProcessingTime: this.optionStatistics.avgProcessingTime
        });
      }
    } else {
      this.logger.debug('No transformations were performed during this session');
    }
    
    this.logger.info('ImageTransformationService shutdown complete');
    return Promise.resolve();
  }
  
  /**
   * Set the client detection service
   * This allows the service to be injected after construction
   * 
   * @param service The client detection service to use
   */
  setClientDetectionService(service: ClientDetectionService): void {
    this.clientDetectionService = service;
    
    // Only log if debug level is enabled
    if (this.isOptimizedLogger) {
      if ((this.logger as OptimizedLogger).isLevelEnabled('DEBUG')) {
        this.logger.debug('Client detection service set');
      }
    } else {
      this.logger.debug('Client detection service set');
    }
  }
  
  setMetadataService(service: MetadataFetchingService): void {
    this.metadataService = service;
    
    // Only log if debug level is enabled
    if (this.isOptimizedLogger) {
      if ((this.logger as OptimizedLogger).isLevelEnabled('DEBUG')) {
        this.logger.debug('Metadata service set');
      }
    } else {
      this.logger.debug('Metadata service set');
    }
  }
  
  /**
   * Performance-optimized breadcrumb logging
   * Uses the optimized logger if available, or falls back to standard breadcrumb
   * 
   * @param step The breadcrumb step name
   * @param startTime Optional start time for duration calculation
   * @param data Optional additional data
   * @returns Current timestamp for chaining
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private trackedBreadcrumb(step: string, startTime?: number, data?: any): number {
    const now = Date.now();
    
    if (this.isOptimizedLogger && this.performanceTracking) {
      // Use optimized logger's tracked breadcrumb
      return (this.logger as OptimizedLogger).trackedBreadcrumb(step, startTime, data);
    } else if (startTime !== undefined) {
      // Standard logger with duration calculation
      const duration = now - startTime;
      this.logger.breadcrumb(step, duration, data);
    } else {
      // Standard logger without duration
      this.logger.breadcrumb(step, undefined, data);
    }
    
    return now;
  }

  /**
   * Set the configuration service
   * This allows the service to be injected after construction
   * 
   * @param service The configuration service to use
   */
  setConfigurationService(service: ConfigurationService): void {
    this.configService = service;
    this.debugLog('Configuration service set');
  }
  
  /**
   * Set the cache service
   * This allows the service to be injected after construction
   * 
   * @param service The cache service to use
   */
  setCacheService(service: CacheService): void {
    this.cacheService = service;
    this.debugLog('Cache service set');
  }
  
  /**
   * Performance-optimized debug logging
   * Only logs if debug level is enabled
   * 
   * @param message The message to log
   * @param data Optional additional data
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private debugLog(message: string, data?: any): void {
    if (this.isOptimizedLogger) {
      if ((this.logger as OptimizedLogger).isLevelEnabled('DEBUG')) {
        this.logger.debug(message, data);
      }
    } else {
      this.logger.debug(message, data);
    }
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
    config: ImageResizerConfig,
    env: Env
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
    
    // Enhanced subrequest detection - check multiple signals
    const via = request.headers.get('via') || '';
    const cfWorker = request.headers.get('cf-worker') || '';
    const alreadyProcessed = request.headers.get('x-img-resizer-processed') || '';
    
    // Check for any indication that this request has already been processed
    // This includes the via header with image-resizing or image-resizing-proxy
    // as well as our custom headers
    if (via.includes('image-resizing') || 
        via.includes('image-resizing-proxy') || 
        cfWorker.includes('image-resizer') || 
        alreadyProcessed === 'true') {
      
      this.logger.debug('Detected already processed request, skipping transformation', {
        path: storageResult.path,
        via,
        cfWorker,
        alreadyProcessed,
        sourceType: storageResult.sourceType,
        viaHeader: !!via && via.includes('image-resizing-proxy')
      });
      
      // Add metadata about the request being a subrequest, useful for caching decisions
      const resultWithMetadata = {
        ...storageResult,
        metadata: {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    const buildStart = this.trackedBreadcrumb('Building transform options');
    
    // Build transformation options using validation and processing
    const transformOptions = await this.buildTransformOptions(
      request,
      storageResult,
      effectiveOptions,
      config,
      env
    );
    
    // Use optimized tracking for the completion breadcrumb
    this.trackedBreadcrumb('Built transform options', buildStart, transformOptions);
    
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
      this.debugLog('Transform options', transformOptions);
      
      const cacheStart = this.trackedBreadcrumb('Applying cache settings');
      
      // Apply cache settings including cache tags using CacheService
      let fetchOptionsWithCache: RequestInit;
      
      if (this.cacheService) {
        // Use the CacheService if available
        this.debugLog('Using CacheService for applying Cloudflare cache settings');
        fetchOptionsWithCache = this.cacheService.applyCloudflareCache(
          fetchOptions,
          storageResult.path || '',
          transformOptions
        );
      } else {
        // Fallback to direct application if no service is available
        this.logger.warn('No CacheService available, using minimal Cloudflare cache settings');
        fetchOptionsWithCache = {
          ...fetchOptions,
          cf: {
            ...fetchOptions.cf,
            cacheEverything: true,
            cacheTtl: config.cache.ttl.ok
          }
        };
      }
      
      this.trackedBreadcrumb('Applied cache settings', cacheStart);
      
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
        background: transformOptions.background,
        allowExpansion: transformOptions.allowExpansion,
        imageSourceSize: storageResult.size ? Math.round(storageResult.size / 1024) + 'KB' : 'unknown'
      });
      
      // Log more detailed transformation options for debugging
      this.logger.info('Detailed image transformation options', {
        width: transformOptions.width,
        height: transformOptions.height,
        fit: transformOptions.fit,
        background: transformOptions.background,
        allowExpansion: transformOptions.allowExpansion,
        format: transformOptions.format,
        quality: transformOptions.quality,
        smartAspectRatio: transformOptions.aspect,
        cfImage: JSON.stringify(fetchOptionsWithCache.cf?.image || {})
      });
      
      const fetchStart = Date.now();
      
      // Log gravity details if present
      if (fetchOptionsWithCache.cf && fetchOptionsWithCache.cf.image) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
      
      // Create the final response with all headers in a single operation
      this.trackedBreadcrumb('Creating final response');
      
      // Prepare all the header updates in a batch
      const headerUpdates = (headers: Headers) => {
        // Add metadata headers for cache optimization
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
        
        // Add cache control headers if enabled
        if (config.cache.cacheability) {
          headers.set('Cache-Control', `public, max-age=${config.cache.ttl.ok}`);
          this.debugLog('Added cache control headers', {
            cacheControl: `public, max-age=${config.cache.ttl.ok}`
          });
        }
      };
      
      // Create a single response with all headers combined
      let response = mergeResponseUpdates(transformed, {
        headers: transformed.headers, // Keep original headers
        status: transformed.status,
        statusText: transformed.statusText
      });
      
      // Apply metadata headers in a batch
      response = batchUpdateHeaders(response, [headerUpdates]);
      
      // Add client hints headers - this already returns a new response
      response = addClientHintsHeaders(response, request);
      this.trackedBreadcrumb('Added client hints headers to response', undefined, {
        userAgent: request.headers.get('User-Agent')?.substring(0, 50) || 'unknown'
      });
      
      // Track statistics for the successful transformation
      this.trackTransformationStatistics(transformOptions, fetchStart, Date.now());
      
      return response;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      
      this.logger.error('Error transforming image', {
        error: errorMsg,
        stack: stack
      });
      
      this.trackedBreadcrumb('Transformation error occurred', undefined, {
        error: errorMsg,
        fallback: 'original image'
      });
      
      // Track error in statistics
      this.errorCount++;
      
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
   * Check if a transformation requires original image metadata
   * 
   * This identifies transformation options that inherently need
   * metadata about the original image to function correctly.
   * 
   * @param options Transformation options to check
   * @returns True if metadata is required for the transformation
   */
  private requiresMetadata(options: TransformOptions): boolean {
    // Check for smart transformation - safely convert any smart value to string to compare
    const smartValue = options.smart !== undefined ? String(options.smart) : '';
    if (options.smart === true || smartValue === 'true') {
      this.logger.debug('Metadata required: smart=true parameter detected');
      return true;
    }
    
    // Check if either width or height are explicitly set, in which case we may not need metadata
    // for aspect ratio or focal point operations
    const hasExplicitWidth = options.__explicitWidth === true && 
                            options.width !== undefined && 
                            (typeof options.width === 'number' || (typeof options.width === 'string' && options.width !== 'auto'));
    const hasExplicitHeight = options.__explicitHeight === true && 
                             options.height !== undefined && 
                             (typeof options.height === 'number' || (typeof options.height === 'string' && options.height !== 'auto'));
    
    // Log the explicit dimension flags for debugging
    this.logger.debug('Checking for explicit dimensions', {
      hasExplicitWidth,
      hasExplicitHeight,
      width: options.width,
      height: options.height,
      __explicitWidth: options.__explicitWidth,
      __explicitHeight: options.__explicitHeight
    });
    
    // Check for aspect ratio specification
    if (options.aspect) {
      // For aspect ratio, we need metadata unless either width or height is set explicitly
      if (hasExplicitWidth || hasExplicitHeight) {
        this.logger.debug('Skipping metadata fetch: aspect ratio with explicit dimension', { 
          aspect: options.aspect,
          hasExplicitWidth,
          hasExplicitHeight
        });
        return false;
      }
      
      this.logger.debug('Metadata required: aspect ratio without explicit dimensions', { 
        aspect: options.aspect
      });
      return true;
    }
    
    // Check for focal point specification
    if (options.focal) {
      // For focal point with aspect ratio, either width or height is sufficient
      if (options.aspect) {
        if (hasExplicitWidth || hasExplicitHeight) {
          this.logger.debug('Skipping metadata fetch: focal point with aspect ratio and one explicit dimension', { 
            focal: options.focal,
            aspect: options.aspect,
            width: options.width,
            height: options.height,
            hasExplicitWidth,
            hasExplicitHeight
          });
          return false;
        }
      } 
      // For focal point without aspect ratio, we need both dimensions
      else if (hasExplicitWidth && hasExplicitHeight) {
        this.logger.debug('Skipping metadata fetch: focal point with both dimensions explicit', { 
          focal: options.focal,
          width: options.width,
          height: options.height
        });
        return false;
      }
      
      this.logger.debug('Metadata required: focal point without sufficient dimension information', { 
        focal: options.focal,
        hasAspect: !!options.aspect,
        hasExplicitWidth,
        hasExplicitHeight
      });
      return true;
    }
    
    // Check for certain derivatives that rely on original dimensions
    if (options.derivative) {
      const metadataDerivatives = ['banner', 'avatar', 'profile', 'thumbnail', 'portrait', 'square'];
      if (metadataDerivatives.includes(options.derivative)) {
        this.logger.debug('Metadata required: derivative requires original dimensions', { derivative: options.derivative });
        return true;
      }
    }
    
    return false;
  }

  /**
   * Build Cloudflare image transformation options
   */
  async buildTransformOptions(
    request: Request,
    storageResult: StorageResult,
    options: TransformOptions,
    config: ImageResizerConfig,
    env: Env
  ): Promise<TransformOptions> {
    this.trackedBreadcrumb('buildTransformOptions started', undefined, {
      imageSize: storageResult.size,
      contentType: storageResult.contentType,
      optionsProvided: Object.keys(options).join(',') || 'none'
    });
    
    // Check if no options were provided at all (empty object)
    const noOptionsProvided = Object.keys(options).length === 0;
    
    // If no options provided, treat as auto for all parameters
    if (noOptionsProvided) {
      options = { 
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        width: 'auto' as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        height: 'auto' as any,
        format: 'auto',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        quality: 'auto' as any
      };
    }
    
    // Check if we need to fetch metadata for this transformation
    const needsMetadata = this.requiresMetadata(options);
    
    this.logger.info('Metadata requirement decision', {
      needsMetadata,
      hasAspect: !!options.aspect,
      hasFocal: !!options.focal,
      hasExplicitWidth: options.__explicitWidth === true,
      hasExplicitHeight: options.__explicitHeight === true,
      width: options.width,
      height: options.height,
      f: options.f, // Size code if used
      transformOptions: Object.keys(options).join(',')
    });
    
    if (needsMetadata && this.metadataService) {
      this.logger.debug('Fetching metadata for transformation', {
        imagePath: storageResult.path,
        requiresMetadata: true,
        transformOptions: Object.keys(options).join(',')
      });
      
      try {
        // Fetch the metadata for the image
        const metadata = await this.metadataService.fetchMetadata(
          storageResult.path || '',
          config,
          env,
          request
        );
        
        this.logger.debug('Metadata fetched successfully', {
          imagePath: storageResult.path,
          width: metadata.properties?.width,
          height: metadata.properties?.height,
          format: metadata.properties?.format,
          confidence: metadata.properties?.confidence
        });
        
        // Set up metadata processing options
        const processingOptions: MetadataProcessingOptions = {
          preserveFocalPoint: true,
          allowExpansion: options.allowExpansion || false,
          width: options.width // Pass through the requested width
        };
        
        // Add content type and platform information if available
        if (options.content) {
          processingOptions.contentType = options.content as string;
        }
        if (options.platform) {
          processingOptions.targetPlatform = options.platform as string;
        }
        if (options.device) {
          processingOptions.deviceType = options.device as 'mobile' | 'tablet' | 'desktop';
        }
        
        // If we have a focal point, use it
        if (options.focal) {
          try {
            const [x, y] = options.focal.split(',').map(v => parseFloat(v));
            if (!isNaN(x) && !isNaN(y) && x >= 0 && x <= 1 && y >= 0 && y <= 1) {
              processingOptions.focalPoint = { x, y };
              this.logger.debug('Using custom focal point', { x, y });
            }
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          } catch (error) {
            this.logger.warn('Invalid focal point format', { focal: options.focal });
          }
        }
        
        // Process the metadata based on what transformation is needed
        if (options.aspect && metadata.properties) {
          this.logger.debug('Processing aspect ratio with metadata', {
            aspect: options.aspect,
            originalWidth: metadata.properties.width,
            originalHeight: metadata.properties.height
          });
          
          // Process the metadata - create a targetAspect object if aspect ratio is provided
          let targetAspect: { width: number, height: number } | undefined;
          
          // If aspect ratio is provided, extract width and height
          if (options.aspect) {
            try {
              // Support both colon format (16:9) and dash format (16-9)
              const aspectString = options.aspect.toString().replace('-', ':');
              const [width, height] = aspectString.split(':').map(v => parseFloat(v));
              
              if (!isNaN(width) && !isNaN(height) && width > 0 && height > 0) {
                targetAspect = { width, height };
                this.logger.debug('Using aspect ratio for metadata processing', {
                  width,
                  height,
                  ratio: width / height
                });
              }
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            } catch (error) {
              this.logger.warn('Invalid aspect ratio format', { aspect: options.aspect });
            }
          }
          
          // Call processMetadata with the extracted aspect ratio
          const result = await this.metadataService.processMetadata(
            metadata,
            targetAspect,
            processingOptions
          );
          
          // Apply the processed metadata to the options
          if (result.aspectCrop) {
            if (!options.width) options.width = result.aspectCrop.width;
            if (!options.height) options.height = result.aspectCrop.height;
            if (!options.fit) options.fit = 'crop';
            
            // Cloudflare expects an object with x,y for gravity
            if (!options.gravity && result.aspectCrop.hoffset !== undefined && result.aspectCrop.voffset !== undefined) {
              // Create gravity object from hoffset and voffset
              options.gravity = { 
                x: result.aspectCrop.hoffset, 
                y: result.aspectCrop.voffset 
              };
            }
          }
        }
        
        // If smart mode is enabled, process it with the metadata
        const smartValue = options.smart !== undefined ? String(options.smart) : '';
        if ((options.smart === true || smartValue === 'true') && metadata.properties) {
          this.logger.debug('Processing smart transformation with metadata', {
            originalWidth: metadata.properties.width,
            originalHeight: metadata.properties.height
          });
          
          // For smart mode without aspect, use original aspect ratio but with smart cropping
          if (!options.aspect) {
            // Default to square if no other dimensions are provided
            let width = options.width ? Number(options.width) : metadata.properties.width;
            let height = options.height ? Number(options.height) : metadata.properties.height;
            
            // If neither width nor height is specified, use a reasonable default
            if (!options.width && !options.height) {
              width = Math.min(metadata.properties.width, 800);
              height = Math.round(width * (metadata.properties.height / metadata.properties.width));
            }
            
            // Update the options with the calculated dimensions
            options.width = width;
            options.height = height;
            options.fit = 'crop';
            
            // Use face gravity if no specific gravity or focal point is set
            if (!options.gravity && !options.focal) {
              options.gravity = 'face';
              this.logger.debug('Using face detection for smart crop');
            }
          }
          
          // If it's a portrait or product image, apply special handling
          if (options.content === 'portrait' || options.content === 'product') {
            // For portraits, prioritize face detection
            options.gravity = 'face';
            
            // For products, use center if no focal point is provided
            if (options.content === 'product' && !options.focal) {
              options.gravity = 'center';
            }
            
            this.logger.debug('Applied special handling for content type', {
              contentType: options.content,
              gravity: options.gravity
            });
          }
        }
        
        // For banner-type derivatives, apply special handling
        if (options.derivative === 'banner' && metadata.properties) {
          this.logger.debug('Processing banner derivative with metadata', {
            originalWidth: metadata.properties.width,
            originalHeight: metadata.properties.height
          });
          
          // Use face detection with wide aspect ratio if no specific gravity is set
          if (!options.gravity && !options.focal) {
            options.gravity = 'face';
          }
          
          // Ensure a wide aspect ratio if not specifically set
          if (!options.aspect) {
            options.aspect = '16:5';
          }
        }
      } catch (error) {
        this.logger.warn('Error fetching metadata for transformation', {
          error: error instanceof Error ? error.message : String(error),
          imagePath: storageResult.path
        });
        // Continue with transformation without metadata
      }
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((transformOptions.width as any) === 'auto' || String(transformOptions.width) === 'auto') {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (transformOptions as any).__autoWidth = true; // Store marker to apply responsive width later
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!transformOptions.width || (transformOptions as any).__autoWidth === true) {
      this.logger.breadcrumb('Calculating responsive width', undefined, { 
        hasWidth: false,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((transformOptions as any).__autoWidth) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    
    // Add origin-auth configuration if useOriginAuth is enabled
    if (config.storage.auth?.useOriginAuth) {
      if (config.storage.auth.sharePublicly) {
        result['origin-auth'] = 'share-publicly';
      }
    }
    
    // Apply aspect ratio processing to ensure proper crop behavior
    // This is needed for both paths (with and without metadata)
    const processedResult = this.processAspectRatio(result);
    
    // Let Cloudflare Image Resizing handle validation and provide warning headers
    this.trackedBreadcrumb('buildTransformOptions completed', undefined, {
      finalOptionsCount: Object.keys(processedResult).length,
      hasWidth: !!processedResult.width,
      hasHeight: !!processedResult.height,
      width: processedResult.width,
      height: processedResult.height,
      format: processedResult.format,
      quality: processedResult.quality,
      fit: processedResult.fit,
      allParams: Object.keys(processedResult).join(',')
    });
    
    return processedResult;
  }

  /**
   * Process aspect ratio transformations consistently
   * Ensures proper crop settings are applied when aspect ratio is specified
   * 
   * @param options The transformation options containing aspect ratio settings
   * @returns Updated options with consistent crop behavior
   */
  private processAspectRatio(options: TransformOptions): TransformOptions {
    const result = { ...options };
    
    if (options.aspect) {
      // ALWAYS set fit to crop for aspect ratio operations, overriding any other fit value
      result.fit = 'crop';
      this.logger.debug('Forcing fit=crop for aspect ratio operation', { 
        aspect: options.aspect,
        originalFit: options.fit
      });
      
      // Process focal point if provided with aspect ratio
      if (options.focal && !result.gravity) {
        try {
          const [x, y] = options.focal.split(',').map(parseFloat);
          if (!isNaN(x) && !isNaN(y) && x >= 0 && x <= 1 && y >= 0 && y <= 1) {
            result.gravity = { x, y };
            this.logger.debug('Setting gravity from focal point for aspect ratio', { 
              focal: options.focal,
              gravity: result.gravity
            });
          }
        } catch (error) {
          this.logger.warn('Invalid focal point format', { focal: options.focal });
        }
      }
      
      // Calculate missing dimension if needed
      if (options.width && !options.height) {
        try {
          const [aspectWidth, aspectHeight] = options.aspect.toString().replace('-', ':').split(':').map(Number);
          if (!isNaN(aspectWidth) && !isNaN(aspectHeight) && aspectWidth > 0 && aspectHeight > 0) {
            const aspectRatio = aspectHeight / aspectWidth;
            result.height = Math.round(options.width * aspectRatio);
            this.logger.debug('Calculated height from width and aspect ratio', { 
              width: options.width,
              aspectRatio,
              calculatedHeight: result.height
            });
          }
        } catch (error) {
          this.logger.warn('Error calculating height from aspect ratio', { 
            aspect: options.aspect,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      } else if (!options.width && options.height) {
        try {
          const [aspectWidth, aspectHeight] = options.aspect.toString().replace('-', ':').split(':').map(Number);
          if (!isNaN(aspectWidth) && !isNaN(aspectHeight) && aspectWidth > 0 && aspectHeight > 0) {
            const aspectRatio = aspectWidth / aspectHeight;
            result.width = Math.round(options.height * aspectRatio);
            this.logger.debug('Calculated width from height and aspect ratio', { 
              height: options.height,
              aspectRatio,
              calculatedWidth: result.width
            });
          }
        } catch (error) {
          this.logger.warn('Error calculating width from aspect ratio', { 
            aspect: options.aspect,
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }
    }
    
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
      // Extract browser and version from user agent string - simple detection
      const match = userAgent.match(/(Chrome|Firefox|Safari|Edge|Opera)\/(\d+\.\d+)/i);
      if (match && match.length >= 3) {
        const browser = match[1].toLowerCase();
        const version = match[2];
        if (isFormatSupported('webp', browser, version)) {
          return 'webp';
        }
      } else {
        // Can't parse UA string accurately, use some heuristics instead
        if (userAgent.includes('Chrome/') || userAgent.includes('Firefox/')) {
          // Modern Chrome and Firefox support WebP
          return 'webp';
        }
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
    
    // Enhanced logging of config for derivatives debugging
    this.logger.debug('Configuration inspection in applyDerivativeTemplate', {
      hasDerivativesSection: !!config.derivatives,
      derivativesType: typeof config.derivatives,
      configKeys: Object.keys(config).join(','),
      requestedDerivative: derivative,
      _derivativesLoaded: config._derivativesLoaded,
      _derivativesCount: config._derivativesCount
    });
    
    // Check if derivatives section exists
    if (!config.derivatives) {
      this.logger.error('Derivatives section missing in configuration', {
        derivative,
        configSections: Object.keys(config).join(','),
        hasTransformConfig: Object.prototype.hasOwnProperty.call(config, 'transform'),
        _derivativesLoaded: config._derivativesLoaded,
        _derivativesCount: config._derivativesCount
      });
      
      // Load config directly from configuration service if available as fallback
      if (this.configService) {
        const directConfig = this.configService.getConfig();
        if (directConfig && directConfig.derivatives && directConfig.derivatives[derivative]) {
          this.logger.info('Found derivative in direct config access - using as fallback', {
            derivative,
            availableDerivatives: Object.keys(directConfig.derivatives).join(',')
          });
          
          const template = directConfig.derivatives[derivative];
          const result = { ...template };
          
          // Override with explicitly set options
          Object.keys(options).forEach(key => {
            if (options[key] !== undefined) {
              result[key] = options[key];
            }
          });
          
          return result;
        }
      }
      
      return options;
    }
    
    // Check if the requested derivative exists
    if (!config.derivatives[derivative]) {
      // Log missing derivative for debugging with enhanced information
      this.logger.error('Requested derivative template not found', {
        derivative,
        availableDerivatives: Object.keys(config.derivatives).join(','),
        derivativesCount: Object.keys(config.derivatives).length,
        _derivativesLoaded: config._derivativesLoaded,
        _derivativesCount: config._derivativesCount,
        configSource: this.configService ? 'Service container' : 'Direct parameter'
      });
      
      // Return the original options - this will still work but won't apply template
      return options;
    }
    
    // Get the derivative template
    const template = config.derivatives[derivative];
    
    this.logger.debug('Found derivative template', {
      derivative,
      templateProperties: Object.keys(template).join(',')
    });
    
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
    
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
   * Track transformation statistics for monitoring and optimization
   * 
   * @param options The transformation options applied
   * @param startTime The start time of the transformation
   * @param endTime The end time of the transformation
   */
  private trackTransformationStatistics(
    options: TransformOptions, 
    startTime: number, 
    endTime: number
  ): void {
    // Skip tracking if not in performance tracking mode
    if (!this.performanceTracking) {
      return;
    }
    
    // Ensure statistics objects are initialized
    if (!this.formatStatistics) {
      this.formatStatistics = {};
    }
    if (!this.optionStatistics) {
      this.optionStatistics = {
        widthDistribution: {},
        qualityDistribution: {},
        fitModes: {},
        pixelProcessed: 0,
        avgProcessingTime: 0
      };
    }
    if (!this.optionStatistics.widthDistribution) {
      this.optionStatistics.widthDistribution = {};
    }
    if (!this.optionStatistics.qualityDistribution) {
      this.optionStatistics.qualityDistribution = {};
    }
    if (!this.optionStatistics.fitModes) {
      this.optionStatistics.fitModes = {};
    }
    
    // Increment request count
    this.requestCount++;
    
    // Track format usage
    if (options.format) {
      const format = options.format as string;
      if (this.formatStatistics[format] !== undefined) {
        this.formatStatistics[format]++;
      } else {
        this.formatStatistics[format] = 1;
      }
    } else {
      // Default format tracking
      this.formatStatistics['auto'] = (this.formatStatistics['auto'] || 0) + 1;
    }
    
    // Track width distribution
    if (options.width && typeof options.width === 'number') {
      // Round to nearest 100px for better grouping
      const widthBucket = Math.floor(options.width / 100) * 100;
      const widthKey = `${widthBucket}-${widthBucket + 99}`;
      
      this.optionStatistics.widthDistribution[widthKey] = 
        (this.optionStatistics.widthDistribution[widthKey] || 0) + 1;
    }
    
    // Track quality distribution
    if (options.quality && typeof options.quality === 'number') {
      // Group by 10s for better aggregation
      const qualityBucket = Math.floor(options.quality / 10) * 10;
      const qualityKey = `${qualityBucket}-${qualityBucket + 9}`;
      
      this.optionStatistics.qualityDistribution[qualityKey] = 
        (this.optionStatistics.qualityDistribution[qualityKey] || 0) + 1;
    }
    
    // Track fit modes
    if (options.fit) {
      const fit = options.fit as string;
      this.optionStatistics.fitModes[fit] = 
        (this.optionStatistics.fitModes[fit] || 0) + 1;
    }
    
    // Track processing time
    const processingTime = endTime - startTime;
    const currentAvg = this.optionStatistics.avgProcessingTime || 0;
    
    // Calculate new moving average
    if (currentAvg === 0) {
      this.optionStatistics.avgProcessingTime = processingTime;
    } else {
      // Simple moving average calculation
      this.optionStatistics.avgProcessingTime = 
        (currentAvg * (this.requestCount - 1) + processingTime) / this.requestCount;
    }
    
    // Estimate pixels processed if dimensions are available
    if (options.width && options.height && 
        typeof options.width === 'number' && 
        typeof options.height === 'number') {
      const pixels = options.width * options.height;
      this.optionStatistics.pixelProcessed = 
        (this.optionStatistics.pixelProcessed || 0) + pixels;
    }
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
          originalValue: 'true'
        });
      } else if (options.anim === 'false') {
        options.anim = false;
        this.logger.breadcrumb('Converted anim="false" to boolean false', undefined, {
          originalValue: 'false'
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
