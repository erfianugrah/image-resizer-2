/**
 * Metadata Service Implementation
 * 
 * Fetches and processes image metadata from the Cloudflare Image Resizing API
 */

import type { Logger } from '../utils/logging';
import type { 
  StorageService, 
  MetadataFetchingService, 
  ConfigurationService, 
  CacheService,
  ImageMetadata as IImageMetadata,
  MetadataProcessingOptions as IMetadataProcessingOptions,
  TransformationResult
} from './interfaces';
import type { ImageResizerConfig } from '../config';
import type { Env } from '../types';

/**
 * Re-export the ImageMetadata interface
 */
export type ImageMetadata = IImageMetadata;

/**
 * Aspect ratio dimensions
 */
export interface AspectRatioDimensions {
  width: number;
  height: number;
}

/**
 * Crop dimensions with offsets
 */
export interface AspectCrop extends AspectRatioDimensions {
  hoffset?: number;
  voffset?: number;
}

/**
 * For backwards compatibility, we'll maintain the MetadataProcessResult as a subset of TransformationResult
 */
export interface MetadataProcessResult extends TransformationResult {
  focalPoint?: { x: number; y: number };
  originalDimensions?: { width: number; height: number };
}

/**
 * Re-export the MetadataProcessingOptions interface
 */
export type MetadataProcessingOptions = IMetadataProcessingOptions;

/**
 * RequestCoalescer helps reduce duplicate concurrent requests
 * for the same resource by coalescing them into a single request.
 */
class RequestCoalescer<T> {
  private inFlightRequests: Map<string, Promise<T>> = new Map();
  private expiryTimers: Map<string, NodeJS.Timeout> = new Map();
  private readonly maxConcurrentRequests: number;
  private readonly requestTimeout: number;
  
  /**
   * Create a new request coalescer
   * 
   * @param logger Logger for diagnostic information
   * @param maxConcurrentRequests Maximum concurrent requests allowed
   * @param requestTimeout Timeout for requests in ms
   */
  constructor(
    private logger: Logger, 
    maxConcurrentRequests: number = 100,
    requestTimeout: number = 10000
  ) {
    this.maxConcurrentRequests = maxConcurrentRequests;
    this.requestTimeout = requestTimeout;
  }
  
  /**
   * Get an existing request promise or create a new one
   * 
   * @param key Unique key identifying the request
   * @param fetchFn Function to execute if a new request is needed
   * @returns Promise for the request result
   */
  async getOrCreate(key: string, fetchFn: () => Promise<T>): Promise<T> {
    // If we already have an in-flight request for this key, return that promise
    if (this.inFlightRequests.has(key)) {
      this.logger.debug('Coalescing duplicate request', { key });
      return this.inFlightRequests.get(key)!;
    }
    
    // Create a new managed promise for this request
    const createManagedPromise = async (): Promise<T> => {
      try {
        // Execute the fetch function and return its result
        return await fetchFn();
      } catch (error) {
        // Log the error, clean up, and re-throw
        this.logger.error('Error in coalesced request', {
          key,
          error: error instanceof Error ? error.message : String(error)
        });
        this.cleanup(key);
        throw error;
      } finally {
        // Always clean up after the request completes
        this.cleanup(key);
      }
    };
    
    // Create a promise for this request
    const promise = createManagedPromise();
    
    // Store it in our map of in-flight requests
    this.inFlightRequests.set(key, promise);
    
    // Set a timeout to clean up if the request takes too long
    const timeoutId = setTimeout(() => {
      if (this.inFlightRequests.has(key)) {
        this.logger.warn('Request timed out, cleaning up', { key });
        this.cleanup(key);
      }
    }, this.requestTimeout);
    
    // Store the timeout ID so we can clear it later
    this.expiryTimers.set(key, timeoutId);
    
    return promise;
  }
  
  /**
   * Clean up resources for a completed request
   */
  private cleanup(key: string): void {
    this.inFlightRequests.delete(key);
    
    if (this.expiryTimers.has(key)) {
      clearTimeout(this.expiryTimers.get(key)!);
      this.expiryTimers.delete(key);
    }
  }
  
  /**
   * Get current stats about coalescer
   */
  getStats(): { inFlight: number, capacity: number } {
    return {
      inFlight: this.inFlightRequests.size,
      capacity: this.maxConcurrentRequests
    };
  }
}

// Platform-specific aspect ratios are now handled by the interfaces

// Device-specific width constraints are now handled by the interfaces

/**
 * Default implementation of the MetadataFetchingService
 */
export class DefaultMetadataFetchingService implements MetadataFetchingService {
  private cacheMap: Map<string, ImageMetadata> = new Map();
  private requestCoalescer: RequestCoalescer<ImageMetadata>;
  
  /**
   * Create a new DefaultMetadataFetchingService
   * 
   * @param logger Service logger
   * @param storageService Storage service for making requests
   * @param cacheService Cache service for caching metadata
   * @param configurationService Configuration service
   */
  constructor(
    private logger: Logger,
    private storageService: StorageService,
    private cacheService: CacheService,
    private configurationService: ConfigurationService
  ) {
    this.logger.debug('Metadata Fetching Service created');
    
    // Initialize the request coalescer with reasonable defaults
    // 5-second timeout is enough for metadata fetches, and 50 concurrent max should be plenty
    this.requestCoalescer = new RequestCoalescer<ImageMetadata>(this.logger, 50, 5000);
  }
  
  /**
   * Service lifecycle method for initialization
   */
  async initialize(): Promise<void> {
    this.logger.debug('Initializing Metadata Fetching Service');
    
    const stats = this.requestCoalescer.getStats();
    this.logger.debug('Metadata request coalescer initialized', {
      maxConcurrent: stats.capacity,
      inFlight: stats.inFlight,
      cacheSize: this.cacheMap.size
    });
    
    this.logger.info('Metadata Fetching Service initialized');
  }
  
  /**
   * Service lifecycle method for shutdown
   */
  async shutdown(): Promise<void> {
    this.logger.debug('Shutting down Metadata Fetching Service');
    
    // Log stats before shutdown
    const coalesceStats = this.requestCoalescer.getStats();
    this.logger.info('Metadata service request coalescer stats', {
      inFlightRequests: coalesceStats.inFlight,
      capacity: coalesceStats.capacity,
      cacheSize: this.cacheMap.size
    });
    
    // Clear cache
    this.cacheMap.clear();
    this.logger.info('Metadata Fetching Service shut down');
  }
  
  /**
   * Fetch image metadata using format=json
   * 
   * @param imagePath Path to the image
   * @param config Application configuration
   * @param env Environment variables
   * @param request Original request for context
   * @returns Promise with the image metadata
   */
  async fetchMetadata(
    imagePath: string,
    config: ImageResizerConfig,
    env: Env,
    request: Request
  ): Promise<ImageMetadata> {
    const startTime = Date.now();
    this.logger.debug('Fetching image metadata', { imagePath });
    
    // Check cache first
    const cacheKey = `metadata:${imagePath}`;
    const cachedMetadata = this.cacheMap.get(cacheKey);
    
    if (cachedMetadata) {
      this.logger.debug('Using cached metadata', { 
        imagePath, 
        cacheHit: true,
        metadataAge: Date.now() - startTime
      });
      return cachedMetadata;
    }
    
    // Use the request coalescer to handle concurrent requests for the same metadata
    return this.requestCoalescer.getOrCreate(cacheKey, () => {
      return this.actuallyFetchMetadata(imagePath, cacheKey, config, env, request, startTime);
    });
  }
  
  /**
   * Internal method that actually performs the metadata fetch
   * This is used by the request coalescer to avoid duplicate fetches
   */
  private async actuallyFetchMetadata(
    imagePath: string,
    cacheKey: string,
    config: ImageResizerConfig,
    env: Env,
    request: Request,
    startTime: number
  ): Promise<ImageMetadata> {
    try {
      // Base metadata structure (will be populated with actual values)
      const baseMetadata: ImageMetadata = {
        properties: {
          width: 0,
          height: 0,
          format: undefined
        }
      };
      
      // Get basic storage info first to help identify content type
      let storageResult = null;
      try {
        storageResult = await this.storageService.fetchImage(
          imagePath,
          config,
          env,
          request
        );
        
        if (storageResult && storageResult.contentType) {
          const format = storageResult.contentType.replace('image/', '');
          baseMetadata.properties.format = format;
        }
      } catch (storageError) {
        this.logger.warn('Error getting basic info from storage service', {
          error: storageError instanceof Error ? storageError.message : String(storageError)
        });
        // Continue anyway to try the format=json approach
      }
      
      // For metadata fetch, we always use the Image Resizing API itself
      // This ensures we get proper format=json metadata with true original dimensions
      const reqUrl = new URL(request.url);
      const baseUrl = `${reqUrl.protocol}//${reqUrl.host}`;
      const imageUrl = new URL(imagePath, baseUrl).toString();
      
      // Create a URL specifically for metadata
      // Make sure format=json is the FIRST parameter to ensure it's not ignored
      const metadataUrl = new URL(imageUrl);
      
      // Clear any existing parameters to ensure format=json is applied first
      const existingParams = new URLSearchParams(metadataUrl.search);
      metadataUrl.search = '';
      
      // Add format=json as the first parameter
      metadataUrl.searchParams.set('format', 'json');
      
      // Re-add any existing parameters that might be important (excluding any that might conflict)
      for (const [key, value] of existingParams.entries()) {
        if (key !== 'format' && key !== 'metadata') {
          metadataUrl.searchParams.append(key, value);
        }
      }
      
      this.logger.debug('Fetching metadata from Image Resizing API with format=json', { 
        url: metadataUrl.toString()
      });
      
      // Use Cloudflare's cf object to directly request metadata
      const fetchOptions = {
        cf: {
          image: {
            format: 'json' as const
          }
        }
      };
      
      const metadataResponse = await fetch(metadataUrl.toString(), fetchOptions);
      
      // Check that the response is OK and is actually JSON
      const contentType = metadataResponse.headers.get('content-type') || '';
      const isJson = contentType.includes('application/json') || contentType.includes('text/json');
      
      this.logger.debug('Metadata fetch response info', {
        status: metadataResponse.status,
        contentType,
        isJson,
        contentLength: metadataResponse.headers.get('content-length'),
        url: metadataUrl.toString()
      });
      
      if (!metadataResponse.ok) {
        throw new Error(`Failed to fetch metadata: HTTP ${metadataResponse.status}`);
      }
      
      if (!isJson) {
        throw new Error(`Expected JSON response but got: ${contentType}`);
      }
      
      // Parse the response to JSON
      const rawData = await metadataResponse.json();
      
      // Check if we have an actual JSON response with metadata structure
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const workerMetadata = rawData as {
        width?: number;
        height?: number;
        format?: string;
        // Cloudflare's format=json returns an "original" object with the true dimensions
        original?: {
          file_size?: number;
          width?: number;
          height?: number;
          format?: string;
        };
        // Additional fields that might be in the response
        naturalWidth?: number;
        naturalHeight?: number;
        originalWidth?: number;
        originalHeight?: number;
      };
      
      this.logger.debug('Parsed Cloudflare Image API metadata', {
        hasWidth: !!workerMetadata.width,
        hasHeight: !!workerMetadata.height,
        width: workerMetadata.width,
        height: workerMetadata.height,
        hasOriginal: !!workerMetadata.original,
        originalWidth: workerMetadata.original?.width,
        originalHeight: workerMetadata.original?.height
      });
      
      // Prioritize dimensions from the original object if available (most accurate)
      let width = 0;
      let height = 0;
      
      if (workerMetadata.original?.width && workerMetadata.original?.height) {
        width = workerMetadata.original.width;
        height = workerMetadata.original.height;
        this.logger.debug('Using dimensions from original object', {
          width,
          height,
          source: 'cloudflare-original'
        });
      } else if (workerMetadata.width && workerMetadata.height) {
        width = workerMetadata.width;
        height = workerMetadata.height;
        this.logger.debug('Using dimensions from base metadata', {
          width,
          height,
          source: 'cloudflare-base'
        });
      } else if (workerMetadata.naturalWidth && workerMetadata.naturalHeight) {
        width = workerMetadata.naturalWidth;
        height = workerMetadata.naturalHeight;
        this.logger.debug('Using dimensions from naturalWidth/Height', {
          width,
          height,
          source: 'cloudflare-natural'
        });
      } else if (workerMetadata.originalWidth && workerMetadata.originalHeight) {
        width = workerMetadata.originalWidth;
        height = workerMetadata.originalHeight;
        this.logger.debug('Using dimensions from originalWidth/Height', {
          width,
          height,
          source: 'cloudflare-original-fields'
        });
      } else {
        throw new Error('No valid dimensions found in metadata response');
      }
      
      // Create a properly structured metadata object
      const metadata: ImageMetadata = {
        properties: {
          // Keep width and height adjacent for better readability
          width,
          height,
          // Basic image properties
          format: workerMetadata.format || baseMetadata.properties.format,
          // Quality assessment metadata
          confidence: 'high',
          estimationMethod: 'direct',
          metadataSource: 'format-json',
          // Store original metadata for reference
          originalMetadata: workerMetadata
        }
      };
      
      // Cache the metadata
      this.cacheMap.set(cacheKey, metadata);
      
      const duration = Date.now() - startTime;
      this.logger.debug('Successfully fetched metadata from Cloudflare Image API', {
        imagePath,
        duration,
        width: metadata.properties.width,
        height: metadata.properties.height,
        format: metadata.properties.format
      });
      
      return metadata;
    } catch (error) {
      // Log detailed error for debugging
      this.logger.error('Error fetching image metadata', {
        imagePath,
        error: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined
      });
      
      // Instead of multiple fallbacks, just throw the error to indicate failure
      // The calling code (processSmartOptions) will handle the failure appropriately
      throw new Error(`Metadata extraction failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Process metadata to extract useful dimensions
   * 
   * @param metadata Original metadata
   * @param targetAspect Target aspect ratio
   * @param options Processing options
   * @returns Processed metadata
   */
  processMetadata(
    metadata: ImageMetadata,
    targetAspect?: { width: number, height: number },
    options: MetadataProcessingOptions = {}
  ): TransformationResult {
    try {
      // Default result
      const result: TransformationResult = {};

      // If no metadata provided, return empty result
      if (!metadata || !metadata.properties) {
        this.logger.debug('No metadata provided, returning empty result');
        return result;
      }
      
      // Extract original dimensions from metadata
      const originalWidth = metadata.properties.width;
      const originalHeight = metadata.properties.height;
      
      // Store original dimensions in result
      result.dimensions = {
        width: originalWidth,
        height: originalHeight
      };
      
      // If we have a target aspect ratio, calculate aspect crop
      if (targetAspect && targetAspect.width > 0 && targetAspect.height > 0) {
        this.logger.debug('Processing aspect ratio', {
          targetAspect: `${targetAspect.width}:${targetAspect.height}`,
          originalDimensions: `${originalWidth}x${originalHeight}`
        });
        
        // Calculate aspect ratio
        const targetRatio = targetAspect.width / targetAspect.height;
        const originalRatio = originalWidth / originalHeight;
        
        let cropWidth: number;
        let cropHeight: number;
        let hoffset = 0;
        let voffset = 0;
        
        // Calculate crop dimensions based on target aspect ratio
        if (targetRatio > originalRatio) {
          // Target is wider than original, crop vertically
          cropWidth = originalWidth;
          cropHeight = originalWidth / targetRatio;
          
          // Calculate vertical offset
          // Default to center
          voffset = (originalHeight - cropHeight) / 2;
          
          this.logger.debug('Vertical crop calculated', {
            cropWidth,
            cropHeight,
            voffset,
            percentageHeight: (cropHeight / originalHeight * 100).toFixed(1) + '%'
          });
        } else {
          // Target is taller than original, crop horizontally
          cropHeight = originalHeight;
          cropWidth = originalHeight * targetRatio;
          
          // Calculate horizontal offset
          // Default to center
          hoffset = (originalWidth - cropWidth) / 2;
          
          this.logger.debug('Horizontal crop calculated', {
            cropWidth,
            cropHeight,
            hoffset,
            percentageWidth: (cropWidth / originalWidth * 100).toFixed(1) + '%'
          });
        }
        
        // Adjust focus point if provided
        if (options.focalPoint && options.preserveFocalPoint !== false) {
          this.logger.debug('Adjusting crop for focal point', {
            focalPoint: `${options.focalPoint.x},${options.focalPoint.y}`
          });
          
          // Calculate focal point in actual pixels
          const focalX = options.focalPoint.x * originalWidth;
          const focalY = options.focalPoint.y * originalHeight;
          
          // Adjust horizontal offset to include focal point if possible
          if (targetRatio <= originalRatio) {
            // We're cropping horizontally, so adjust hoffset
            
            // Calculate desired hoffset to center on focal point
            const desiredHoffset = Math.max(0, focalX - (cropWidth / 2));
            
            // Ensure we don't go past the edge
            hoffset = Math.min(desiredHoffset, originalWidth - cropWidth);
            
            this.logger.debug('Adjusted horizontal crop for focal point', {
              focalX,
              desiredHoffset,
              adjustedHoffset: hoffset
            });
          } else {
            // We're cropping vertically, so adjust voffset
            
            // Calculate desired voffset to center on focal point
            const desiredVoffset = Math.max(0, focalY - (cropHeight / 2));
            
            // Ensure we don't go past the edge
            voffset = Math.min(desiredVoffset, originalHeight - cropHeight);
            
            this.logger.debug('Adjusted vertical crop for focal point', {
              focalY,
              desiredVoffset,
              adjustedVoffset: voffset
            });
          }
        }
        
        // If we have a specific device constraint and a width is requested
        if (options.deviceType && options.width && options.width !== 'auto') {
          const width = parseInt(String(options.width), 10);
          if (!isNaN(width) && width > 0) {
            this.logger.debug('Applying device type constraint', {
              deviceType: options.deviceType,
              requestedWidth: width
            });
            
            // Define maximum width for device types
            const deviceWidths = {
              mobile: 600,
              tablet: 1200,
              desktop: 1800
            };
            
            // Get maximum width for this device type
            const maxWidth = deviceWidths[options.deviceType] || 1800;
            
            // Scale crop dimensions if needed
            if (width > maxWidth) {
              const scale = maxWidth / width;
              cropWidth = Math.round(cropWidth * scale);
              cropHeight = Math.round(cropHeight * scale);
              
              this.logger.debug('Scaled dimensions for device constraint', {
                scale,
                maxWidth,
                scaledWidth: cropWidth,
                scaledHeight: cropHeight
              });
            }
          }
        }
        
        // If we have a content type and target platform, apply specific adjustments
        if (options.contentType && options.targetPlatform) {
          this.logger.debug('Applying content and platform specific adjustments', {
            contentType: options.contentType,
            targetPlatform: options.targetPlatform
          });
          
          // Apply specific constraints for some content types
          if (options.contentType === 'portrait' && options.targetPlatform === 'instagram') {
            // Instagram portraits are strictly 4:5
            const instagramRatio = 4 / 5;
            
            if (Math.abs(cropWidth / cropHeight - instagramRatio) > 0.01) {
              // Recalculate for Instagram
              if (cropWidth / cropHeight > instagramRatio) {
                // Too wide, adjust width
                cropWidth = cropHeight * instagramRatio;
              } else {
                // Too tall, adjust height
                cropHeight = cropWidth / instagramRatio;
              }
              
              this.logger.debug('Adjusted dimensions for Instagram portrait', {
                cropWidth,
                cropHeight,
                ratio: (cropWidth / cropHeight).toFixed(2)
              });
            }
          }
        }
        
        // Store aspect crop in result
        result.aspectCrop = {
          width: Math.round(cropWidth),
          height: Math.round(cropHeight),
          hoffset: Math.round(hoffset),
          voffset: Math.round(voffset)
        };
        
        this.logger.debug('Final aspect crop dimensions', {
          cropWidth: result.aspectCrop.width,
          cropHeight: result.aspectCrop.height,
          hoffset: result.aspectCrop.hoffset,
          voffset: result.aspectCrop.voffset
        });
      }
      
      // If we have a focal point in options, handle it
      // Note: TransformationResult doesn't have a focalPoint property, 
      // so we'll set additional information in gravity if needed
      if (options.focalPoint) {
        // We'd typically set gravity here if needed
        if (!result.aspectCrop) {
          // If there's no aspectCrop yet, create one with basic dimensions
          result.aspectCrop = {
            width: originalWidth,
            height: originalHeight,
            hoffset: 0, 
            voffset: 0
          };
        }
      }
      
      return result;
    } catch (error) {
      this.logger.error('Error processing metadata', {
        error: error instanceof Error ? error.message : String(error),
        metadata: JSON.stringify(metadata),
        targetAspect: targetAspect ? `${targetAspect.width}:${targetAspect.height}` : 'none'
      });
      
      // Return minimal result with just original dimensions if available
      const result: MetadataProcessResult = {};
      if (metadata?.properties?.width && metadata?.properties?.height) {
        result.originalDimensions = {
          width: metadata.properties.width,
          height: metadata.properties.height
        };
      }
      return result;
    }
  }
  
  /**
   * Fetch and process metadata in one operation
   */
  async fetchAndProcessMetadata(
    imagePath: string,
    config: ImageResizerConfig,
    env: Env,
    request: Request,
    targetAspect?: { width: number, height: number },
    options?: MetadataProcessingOptions
  ): Promise<TransformationResult> {
    try {
      // Fetch the metadata
      const metadata = await this.fetchMetadata(
        imagePath,
        config,
        env,
        request
      );
      
      // Then process it (this is synchronous now)
      return this.processMetadata(metadata, targetAspect, options || {});
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Error in fetchAndProcessMetadata', {
        imagePath,
        error: errorMessage
      });
      
      // Return minimal result
      return {};
    }
  }
}