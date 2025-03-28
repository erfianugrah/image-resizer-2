/**
 * Metadata Fetching Service Implementation
 * 
 * This service handles fetching and processing image metadata using format=json
 * to inform intelligent image transformations.
 */

import { Logger } from '../utils/logging';
import { ImageResizerConfig } from '../config';
import { Env } from '../types';
import { 
  ImageMetadata, 
  MetadataFetchingService, 
  MetadataProcessingOptions, 
  TransformationResult,
  StorageService,
  CacheService,
  ConfigurationService
} from './interfaces';

/**
 * RequestCoalescer - Manages in-flight requests to prevent duplicates
 * Uses a Map to track in-flight requests and prevent redundant operations
 */
class RequestCoalescer<T> {
  private inFlightRequests = new Map<string, Promise<T>>();
  private expiryTimers = new Map<string, number>();
  private maxConcurrentRequests: number;
  private requestTimeout: number;
  private logger: Logger;

  constructor(logger: Logger, maxConcurrent = 100, timeoutMs = 5000) {
    this.logger = logger;
    this.maxConcurrentRequests = maxConcurrent;
    this.requestTimeout = timeoutMs;
  }

  /**
   * Get result for a key, coalescing concurrent requests
   * @param key Unique key for the request
   * @param fetchFn The function that performs the actual fetch
   * @returns Promise with the fetch result
   */
  async getOrCreate(key: string, fetchFn: () => Promise<T>): Promise<T> {
    // Check if there's already a request in flight
    if (this.inFlightRequests.has(key)) {
      this.logger.debug('Coalescing metadata request', { 
        key, 
        inflight: this.inFlightRequests.size 
      });
      return this.inFlightRequests.get(key)!;
    }

    // Safety: If we're at max capacity, don't coalesce to prevent memory issues
    if (this.inFlightRequests.size >= this.maxConcurrentRequests) {
      this.logger.warn('Coalescer at capacity, executing request directly', { 
        capacity: this.maxConcurrentRequests,
        key
      });
      return fetchFn();
    }

    // Create a new fetch promise with built-in cleanup
    const promise = this.createManagedPromise(key, fetchFn);
    this.inFlightRequests.set(key, promise);
    
    // Set a safety timeout to prevent hanging references
    const timeout = setTimeout(() => {
      if (this.inFlightRequests.has(key)) {
        this.logger.warn('Coalesced request timed out', { 
          key, 
          timeoutMs: this.requestTimeout 
        });
        this.cleanup(key);
      }
    }, this.requestTimeout);
    
    // Store timeout ID (using number for compatibility with CF Workers)
    this.expiryTimers.set(key, timeout as unknown as number);
    
    return promise;
  }

  /**
   * Creates a managed promise that handles its own cleanup
   */
  private async createManagedPromise(key: string, fetchFn: () => Promise<T>): Promise<T> {
    try {
      const result = await fetchFn();
      this.cleanup(key);
      return result;
    } catch (error) {
      this.logger.error('Coalesced request failed', { 
        key, 
        error: error instanceof Error ? error.message : String(error) 
      });
      this.cleanup(key);
      throw error;
    }
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

/**
 * Platform-specific aspect ratios
 */
const PLATFORM_ASPECT_RATIOS: Record<string, { width: number; height: number }> = {
  twitter: { width: 16, height: 9 },
  twitter_card: { width: 2, height: 1 },
  facebook: { width: 1.91, height: 1 },
  facebook_square: { width: 1, height: 1 },
  instagram: { width: 1, height: 1 },
  instagram_portrait: { width: 4, height: 5 },
  instagram_landscape: { width: 16, height: 9 },
  pinterest: { width: 2, height: 3 },
  linkedin: { width: 1.91, height: 1 },
  blog_hero: { width: 16, height: 9 },
  product: { width: 1, height: 1 },
  thumbnail: { width: 4, height: 3 }
};

/**
 * Device-specific width constraints
 */
const DEVICE_WIDTH_CONSTRAINTS: Record<string, number> = {
  mobile: 600,
  tablet: 1200,
  desktop: 1800
};

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
    // Declare a variable to store storage fetch results for later use
    // Using any type here is necessary to handle unknown storage service responses
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let storageResult: any = null;
    
    try {
      // Initialize empty metadata structure
      // We'll populate this with real values from either storage or format=json API
      const baseMetadata: ImageMetadata = {
        metadata: {
          width: 0, // Will be populated with actual values
          height: 0, // Will be populated with actual values
          format: ''
        }
      };
      
      try {
        // Use the storage service to fetch the image first to get basic info
        storageResult = await this.storageService.fetchImage(
          imagePath,
          config,
          env,
          request
        );
        
        // Check if storage result has dimensions
        if (storageResult) {
          this.logger.debug('Storage service returned result', {
            hasWidth: !!storageResult.width,
            hasHeight: !!storageResult.height,
            width: storageResult.width,
            height: storageResult.height,
            contentType: storageResult.contentType,
            hasMetadata: !!storageResult.metadata,
            size: storageResult.size,
            metadataKeys: storageResult.metadata ? Object.keys(storageResult.metadata) : []
          });
          
          let bestWidth: number | undefined;
          let bestHeight: number | undefined;
          
          // First, try to get dimensions directly from storage result
          if (storageResult.width && storageResult.height) {
            bestWidth = storageResult.width;
            bestHeight = storageResult.height;
            
            this.logger.debug('Found dimensions from storage service', {
              width: bestWidth,
              height: bestHeight,
              source: 'direct'
            });
          }
          
          // If the image is very large, the size in bytes can help us estimate dimensions
          // Many large images from modern cameras can be over 20MP
          if (storageResult.size && storageResult.size > 10 * 1024 * 1024) {
            // Large file size suggests high resolution image
            // This is a rough heuristic based on modern image sizes
            // For a 16MB image, assuming moderate compression:
            // - JPEG at ~0.5-1 bytes per pixel suggests 16-32MP image
            // - Typical aspect ratios like 3:2 or 4:3 suggest dimensions like 4000x3000 or similar
            
            // Size-based estimation is only used if we don't have better information
            if (!bestWidth || !bestHeight) {
              const estimatedMegapixels = storageResult.size / (1024 * 1024) * 2;  // ~2MP per MB is a reasonable heuristic
              
              // Estimate dimensions based on 3:2 aspect ratio (common in photos)
              const estimatedWidth = Math.sqrt(estimatedMegapixels * 1000000 * (3/2));
              const estimatedHeight = estimatedWidth * (2/3);
              
              this.logger.debug('Estimated high-res dimensions from file size', {
                sizeMB: (storageResult.size / (1024 * 1024)).toFixed(1),
                estimatedMegapixels: estimatedMegapixels.toFixed(1) + 'MP',
                estimatedWidth: Math.round(estimatedWidth),
                estimatedHeight: Math.round(estimatedHeight)
              });
              
              bestWidth = Math.round(estimatedWidth);
              bestHeight = Math.round(estimatedHeight);
            }
          }
          
          // If we got dimensions, use them
          if (bestWidth && bestHeight) {
            // Only update if the dimensions we found are larger than the defaults
            // (avoiding downgrading resolution)
            if (bestWidth > baseMetadata.metadata.width || 
                bestHeight > baseMetadata.metadata.height) {
              this.logger.debug('Using enhanced dimensions from storage service', {
                width: bestWidth,
                height: bestHeight,
                originalWidth: baseMetadata.metadata.width,
                originalHeight: baseMetadata.metadata.height
              });
              
              baseMetadata.metadata.width = bestWidth;
              baseMetadata.metadata.height = bestHeight;
            }
          }
          
          // Set format if available
          if (storageResult.contentType) {
            const format = storageResult.contentType.replace('image/', '');
            baseMetadata.metadata.format = format;
          }
          
          // Check if we have any additional metadata in the storage result
          if (storageResult.metadata) {
            // Check for EXIF or other image properties that might contain dimensions
            if (storageResult.metadata.exif || storageResult.metadata.dimensions) {
              this.logger.debug('Storage result contains additional metadata', {
                hasExif: !!storageResult.metadata.exif,
                hasDimensions: !!storageResult.metadata.dimensions,
                metadataKeys: Object.keys(storageResult.metadata)
              });
              
              // Try to extract natural dimensions from metadata if available
              const exifData = storageResult.metadata.exif;
              if (exifData) {
                // Some storage services provide full EXIF data
                // Try to extract image dimensions from various EXIF fields
                const exifWidth = 
                  exifData.ImageWidth || 
                  exifData.PixelXDimension || 
                  (exifData.image && exifData.image.width);
                
                const exifHeight = 
                  exifData.ImageHeight || 
                  exifData.PixelYDimension || 
                  (exifData.image && exifData.image.height);
                
                if (exifWidth && exifHeight) {
                  this.logger.debug('Using dimensions from EXIF data', {
                    width: exifWidth,
                    height: exifHeight,
                    source: 'exif'
                  });
                  
                  // Only override if EXIF dimensions are larger (likely more accurate)
                  if (exifWidth > baseMetadata.metadata.width || 
                      exifHeight > baseMetadata.metadata.height) {
                    baseMetadata.metadata.width = exifWidth;
                    baseMetadata.metadata.height = exifHeight;
                  }
                }
              }
            }
          }
        }
      } catch (storageError) {
        this.logger.warn('Error getting dimensions from storage service, using fallbacks', {
          error: storageError instanceof Error ? storageError.message : String(storageError)
        });
      }
      
      // For storage results, keep track of the origin URL
      let originImageUrl = '';
      
      // Use storage service's configured URLs for origin
      if (config.storage?.fallbackUrl) {
        originImageUrl = new URL(imagePath, config.storage.fallbackUrl).toString();
        this.logger.debug('Using fallback URL for origin fetch', { originImageUrl });
      } 
      else if (config.storage?.remoteUrl) {
        originImageUrl = new URL(imagePath, config.storage.remoteUrl).toString();
        this.logger.debug('Using remote URL for origin fetch', { originImageUrl });
      }
      else {
        const reqUrl = new URL(request.url);
        const baseUrl = `${reqUrl.protocol}//${reqUrl.host}`;
        originImageUrl = new URL(imagePath, baseUrl).toString();
        this.logger.debug('Using original request host for origin fetch', { originImageUrl });
      }
      
      // For metadata fetch, we always use the Image Resizing API itself
      // This ensures we get proper format=json metadata with true original dimensions
      const reqUrl = new URL(request.url);
      const baseUrl = `${reqUrl.protocol}//${reqUrl.host}`;
      const imageUrl = new URL(imagePath, baseUrl).toString();
      this.logger.debug('Using Image Resizing API for metadata fetch', { imageUrl });
      
      // First, try using Cloudflare's recommended approach - create a URL specifically for metadata
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
      
      this.logger.debug('Trying to fetch metadata from Image Resizing API with format=json', { 
        url: metadataUrl.toString()
      });
      
      try {
        // Use Cloudflare's cf object to directly request metadata
      // This won't trigger recursion since it's handled by Cloudflare's image pipeline
        const fetchOptions = {
          cf: {
            image: {
              format: 'json' as const // Use const assertion to fix TypeScript type
            }
          }
        };
        const metadataResponse = await fetch(metadataUrl.toString(), fetchOptions);
        
        // Check that the response is OK and is actually JSON
        const contentType = metadataResponse.headers.get('content-type') || '';
        const isJson = contentType.includes('application/json') || contentType.includes('text/json');
        const isImage = contentType.includes('image/');
        
        this.logger.debug('Metadata fetch response info', {
          status: metadataResponse.status,
          contentType,
          isJson,
          isImage,
          contentLength: metadataResponse.headers.get('content-length'),
          url: metadataUrl.toString()
        });
        
        // Handle image responses differently than JSON responses (special case for CDNs that don't support format=json)
        if (metadataResponse && metadataResponse.ok && isImage) {
          // Some providers return image metadata in headers - check for those
          const widthHeader = metadataResponse.headers.get('x-image-width') || 
                              metadataResponse.headers.get('x-width') || 
                              metadataResponse.headers.get('image-width');
                              
          const heightHeader = metadataResponse.headers.get('x-image-height') || 
                               metadataResponse.headers.get('x-height') || 
                               metadataResponse.headers.get('image-height');
          
          // If we got dimensions from headers, use them
          if (widthHeader && heightHeader) {
            const width = parseInt(widthHeader, 10);
            const height = parseInt(heightHeader, 10);
            
            if (!isNaN(width) && !isNaN(height) && width > 0 && height > 0) {
              this.logger.debug('Found image dimensions in headers', {
                width,
                height,
                source: 'headers'
              });
              
              this.logger.debug('Using image dimensions from response headers', {
                width,
                height,
                contentType,
                source: 'headers',
                headers: [widthHeader, heightHeader].filter(Boolean).join(', ')
              });
              
              // Create our metadata object from headers with detailed information
              const metadata: ImageMetadata = {
                metadata: {
                  width,
                  height,
                  format: contentType.replace('image/', ''),
                  estimationMethod: 'headers',
                  metadataSource: 'headers',
                  confidence: 'high', // Headers typically contain accurate dimensions
                  // Store additional header information for reference
                  originalMetadata: {
                    headers: {
                      contentType,
                      width: widthHeader,
                      height: heightHeader,
                      contentLength: metadataResponse.headers.get('content-length')
                    }
                  }
                },
                messages: ['Dimensions extracted from image response headers']
              };
              
              // Cache and return the metadata from headers
              this.cacheMap.set(cacheKey, metadata);
              return metadata;
            }
          }
          
          // If we got here, we have an image response with no dimension headers
          // Let's try the alternative method - using metadata=json
          this.logger.debug('Got image response instead of JSON, trying alternate approach');
        }
        
        if (metadataResponse && metadataResponse.ok && isJson) {
          try {
            // Use more specific type for improved type safety
            // Parse the response to JSON
            const rawData = await metadataResponse.json();
            
            // Log the raw metadata for debugging
            // Convert to string for safe logging
            this.logger.debug('Raw metadata JSON received', {
              metadata: typeof rawData === 'object' ? JSON.stringify(rawData) : String(rawData)
            });
            
            // Check if we have an actual JSON response with metadata structure
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const workerMetadata = rawData as {
              width?: number;
              height?: number;
              format?: string;
              orientation?: string;
              color?: { dominant?: string; palette?: string[] };
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
              // EXIF data can be structured in various ways
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              exif?: Record<string, any>;
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              Exif?: Record<string, any>;
              ExifImageWidth?: number;
              ExifImageHeight?: number;
              PixelWidth?: number;
              PixelHeight?: number;
              PixelXDimension?: number;
              PixelYDimension?: number;
              // Some services use "dimensions" or "size" object
              dimensions?: { width?: number; height?: number };
              size?: { width?: number; height?: number };
              // Cloudflare specific fields
              imageWidth?: number;
              imageHeight?: number;
            };
            
            this.logger.debug('Parsed Cloudflare Image API metadata', {
              hasWidth: !!workerMetadata.width,
              hasHeight: !!workerMetadata.height,
              width: workerMetadata.width,
              height: workerMetadata.height,
              // Cloudflare Image Resizing returns original dimensions in the 'original' object
              hasOriginal: !!workerMetadata.original,
              originalWidth: workerMetadata.original?.width,
              originalHeight: workerMetadata.original?.height,
              originalSize: workerMetadata.original?.file_size,
              // Secondary dimension sources if original is not available
              hasNaturalDimensions: !!workerMetadata.naturalWidth && !!workerMetadata.naturalHeight,
              naturalWidth: workerMetadata.naturalWidth,
              naturalHeight: workerMetadata.naturalHeight,
              fallbackWidth: workerMetadata.originalWidth, // Confusingly named in the API
              fallbackHeight: workerMetadata.originalHeight,
              hasExif: !!workerMetadata.exif
            });
            
            // Extract EXIF-specific dimensions if available
            const exifWidth = 
              workerMetadata.ExifImageWidth ||
              workerMetadata.PixelWidth ||
              workerMetadata.PixelXDimension ||
              (workerMetadata.exif && (
                workerMetadata.exif.ImageWidth || 
                workerMetadata.exif.PixelXDimension || 
                workerMetadata.exif.ExifImageWidth
              )) ||
              (workerMetadata.Exif && (
                workerMetadata.Exif.ImageWidth || 
                workerMetadata.Exif.PixelXDimension || 
                workerMetadata.Exif.ExifImageWidth
              ));
              
            const exifHeight = 
              workerMetadata.ExifImageHeight ||
              workerMetadata.PixelHeight ||
              workerMetadata.PixelYDimension ||
              (workerMetadata.exif && (
                workerMetadata.exif.ImageHeight || 
                workerMetadata.exif.PixelYDimension || 
                workerMetadata.exif.ExifImageHeight
              )) ||
              (workerMetadata.Exif && (
                workerMetadata.Exif.ImageHeight || 
                workerMetadata.Exif.PixelYDimension || 
                workerMetadata.Exif.ExifImageHeight
              ));
            
            // Extract dimensions from size or dimensions objects if available
            const dimensionsWidth = 
              (workerMetadata.dimensions && workerMetadata.dimensions.width) ||
              (workerMetadata.size && workerMetadata.size.width);
              
            const dimensionsHeight = 
              (workerMetadata.dimensions && workerMetadata.dimensions.height) ||
              (workerMetadata.size && workerMetadata.size.height);
              
            // Extract Cloudflare-specific dimensions
            const cloudflareWidth = workerMetadata.imageWidth;
            const cloudflareHeight = workerMetadata.imageHeight;
            
            // Log all candidate dimensions for debugging
            this.logger.debug('Candidate dimensions found in metadata', {
              exifDimensions: exifWidth && exifHeight ? `${exifWidth}x${exifHeight}` : 'none',
              objectDimensions: dimensionsWidth && dimensionsHeight ? `${dimensionsWidth}x${dimensionsHeight}` : 'none',
              cloudflareDimensions: cloudflareWidth && cloudflareHeight ? `${cloudflareWidth}x${cloudflareHeight}` : 'none',
              baseDimensions: workerMetadata.width && workerMetadata.height ? `${workerMetadata.width}x${workerMetadata.height}` : 'none',
              naturalDimensions: workerMetadata.naturalWidth && workerMetadata.naturalHeight ? `${workerMetadata.naturalWidth}x${workerMetadata.naturalHeight}` : 'none',
              originalDimensions: workerMetadata.originalWidth && workerMetadata.originalHeight ? `${workerMetadata.originalWidth}x${workerMetadata.originalHeight}` : 'none'
            });
            
            // Use the most accurate dimensions available, in order of preference:
            // 1. The "original" object from Cloudflare's format=json response is most accurate
            // 2. EXIF dimensions are typically accurate
            // 3. Dimensions from size/dimensions objects
            // 4. Cloudflare-specific dimensions
            // 5. Original/natural dimensions reported by the worker
            // 6. Basic width/height fields
            // 7. Fallback to our default values
            
            // Prioritize the original object from Cloudflare's format=json response since
            // it contains the true dimensions of the original image before any transformations
            // Always favor the larger dimensions since smaller ones might be thumbnails or previews
            
            // Log if we have found the 'original' object which is the most accurate source
            if (workerMetadata.original) {
              this.logger.debug('Found original dimensions in Cloudflare format=json response', {
                originalWidth: workerMetadata.original.width,
                originalHeight: workerMetadata.original.height,
                originalFileSize: workerMetadata.original.file_size,
                originalFormat: workerMetadata.original.format,
                source: 'cloudflare-original'
              });
            }
            
            const candidateWidths = [
              workerMetadata.original?.width,  // Highest priority - true original dimensions from Cloudflare
              exifWidth,                       // EXIF dimensions are usually accurate
              dimensionsWidth,                 // Dimensions from size/dimensions objects
              cloudflareWidth,                 // Cloudflare-specific image dimensions
              workerMetadata.originalWidth,    // Various fallback dimensions
              workerMetadata.naturalWidth,
              workerMetadata.width
            ].filter(Boolean) as number[];
            
            const candidateHeights = [
              workerMetadata.original?.height, // Highest priority - true original dimensions from Cloudflare
              exifHeight,                      // EXIF dimensions are usually accurate
              dimensionsHeight,                // Dimensions from size/dimensions objects
              cloudflareHeight,                // Cloudflare-specific image dimensions
              workerMetadata.originalHeight,   // Various fallback dimensions
              workerMetadata.naturalHeight,
              workerMetadata.height
            ].filter(Boolean) as number[];
            
            // Use the largest dimension found, as it's likely the original image size
            const actualWidth = candidateWidths.length > 0
              ? Math.max(...candidateWidths)
              : baseMetadata.metadata.width;
              
            const actualHeight = candidateHeights.length > 0
              ? Math.max(...candidateHeights)
              : baseMetadata.metadata.height;
            
            if (actualWidth !== (workerMetadata.width || 0) || actualHeight !== (workerMetadata.height || 0)) {
              this.logger.debug('Using enhanced dimensions instead of basic metadata', {
                enhancedWidth: actualWidth,
                enhancedHeight: actualHeight,
                basicWidth: workerMetadata.width,
                basicHeight: workerMetadata.height
              });
            }
            
            // Determine confidence level based on metadata source
            let confidence: 'high' | 'medium' | 'low' = 'medium';
            let estimationMethod: 'direct' | 'exif' | 'headers' | 'file-size' | 'minimal-fallback' | 'error-fallback' = 'direct';
            
            // If we have the original object from Cloudflare's format=json, this is the most accurate
            if (workerMetadata.original?.width && workerMetadata.original?.height) {
              confidence = 'high';
              estimationMethod = 'direct';
            } else if (exifWidth && exifHeight) {
              // EXIF data is generally reliable but can sometimes be incorrect
              confidence = 'high'; 
              estimationMethod = 'exif';
            } else if (cloudflareWidth && cloudflareHeight) {
              // Cloudflare-specific dimensions are typically reliable
              confidence = 'medium';
              estimationMethod = 'direct';
            } else {
              // Other sources are less reliable
              confidence = 'medium';
              estimationMethod = 'direct';
            }
            
            // Create a properly structured metadata object with worker metadata
            const metadata: ImageMetadata = {
              metadata: {
                width: actualWidth,
                height: actualHeight,
                format: workerMetadata.format || baseMetadata.metadata.format,
                // Store original metadata for reference
                originalMetadata: workerMetadata,
                metadataSource: 'format-json',
                confidence: confidence,
                estimationMethod: estimationMethod
              }
            };
            
            // Cache the metadata
            this.cacheMap.set(cacheKey, metadata);
            
            const duration = Date.now() - startTime;
            const hasOriginalInfo = !!workerMetadata.original;
            
            this.logger.debug('Successfully fetched metadata from Cloudflare Image API', {
              imagePath,
              duration,
              width: metadata.metadata.width,
              height: metadata.metadata.height,
              format: metadata.metadata.format,
              fromSource: 'cloudflare-image-api',
              hasOriginalObject: hasOriginalInfo,
              originalDimensions: hasOriginalInfo ? 
                `${workerMetadata.original?.width}x${workerMetadata.original?.height}` : undefined
            });
            
            return metadata;
          } catch (jsonError) {
            this.logger.warn('Error parsing worker metadata response as JSON', {
              error: jsonError instanceof Error ? jsonError.message : String(jsonError),
              status: metadataResponse.status,
              contentType: metadataResponse.headers.get('Content-Type')
            });
            
            // Try THREE alternative approaches:
            // 1. metadata=json parameter
            // 2. Direct Worker metadata approach (?cf-metadata=1)
            // 3. Size-based estimation for large files
            
            // First try the metadata=json approach with the Image Resizing API
            try {
              const alternativeUrl = new URL(imageUrl);
              // Clear search params and add metadata=json as first parameter
              alternativeUrl.search = '';
              alternativeUrl.searchParams.set('metadata', 'json');
              
              this.logger.debug('Trying alternative metadata parameter (metadata=json) with Image Resizing API', { 
                url: alternativeUrl.toString()
              });
              
              const altResponse = await fetch(alternativeUrl.toString());
              
              if (altResponse && altResponse.ok) {
                try {
                  const rawAltData = await altResponse.json();
                  this.logger.debug('Alternative metadata JSON received', {
                    metadata: typeof rawAltData === 'object' ? JSON.stringify(rawAltData) : String(rawAltData)
                  });
                  
                  // Process the alternative format - using the same comprehensive type definition as primary method
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const altMetadata = rawAltData as {
                    width?: number;
                    height?: number;
                    format?: string;
                    orientation?: string;
                    color?: { dominant?: string; palette?: string[] };
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
                    // EXIF data can be structured in various ways
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    exif?: Record<string, any>;
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    Exif?: Record<string, any>;
                    ExifImageWidth?: number;
                    ExifImageHeight?: number;
                    PixelWidth?: number;
                    PixelHeight?: number;
                    PixelXDimension?: number;
                    PixelYDimension?: number;
                    // Some services use "dimensions" or "size" object
                    dimensions?: { width?: number; height?: number };
                    size?: { width?: number; height?: number };
                    // Cloudflare specific fields
                    imageWidth?: number;
                    imageHeight?: number;
                    // Metadata may be nested in a metadata field in some API responses
                    metadata?: { 
                      width?: number; 
                      height?: number;
                      format?: string;
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      exif?: Record<string, any>;
                    };
                  };
                  
                  this.logger.debug('Alternative metadata format received', {
                    hasMetadataField: !!altMetadata.metadata,
                    hasWidth: !!(altMetadata.width || altMetadata.metadata?.width),
                    hasHeight: !!(altMetadata.height || altMetadata.metadata?.height),
                    // Prioritize original object from Cloudflare's format
                    hasOriginal: !!altMetadata.original,
                    originalWidth: altMetadata.original?.width,
                    originalHeight: altMetadata.original?.height,
                    originalSize: altMetadata.original?.file_size,
                    // Alternative dimension sources
                    hasExif: !!(altMetadata.exif || altMetadata.Exif || altMetadata.metadata?.exif),
                    hasNaturalDimensions: !!altMetadata.naturalWidth && !!altMetadata.naturalHeight,
                    naturalWidth: altMetadata.naturalWidth,
                    naturalHeight: altMetadata.naturalHeight
                  });
                  
                  // Extract EXIF-specific dimensions from alternative format
                  const exifWidth = 
                    altMetadata.ExifImageWidth ||
                    altMetadata.PixelWidth ||
                    altMetadata.PixelXDimension ||
                    (altMetadata.exif && (
                      altMetadata.exif.ImageWidth || 
                      altMetadata.exif.PixelXDimension || 
                      altMetadata.exif.ExifImageWidth
                    )) ||
                    (altMetadata.Exif && (
                      altMetadata.Exif.ImageWidth || 
                      altMetadata.Exif.PixelXDimension || 
                      altMetadata.Exif.ExifImageWidth
                    )) ||
                    (altMetadata.metadata?.exif && (
                      altMetadata.metadata.exif.ImageWidth || 
                      altMetadata.metadata.exif.PixelXDimension || 
                      altMetadata.metadata.exif.ExifImageWidth
                    ));
                    
                  const exifHeight = 
                    altMetadata.ExifImageHeight ||
                    altMetadata.PixelHeight ||
                    altMetadata.PixelYDimension ||
                    (altMetadata.exif && (
                      altMetadata.exif.ImageHeight || 
                      altMetadata.exif.PixelYDimension || 
                      altMetadata.exif.ExifImageHeight
                    )) ||
                    (altMetadata.Exif && (
                      altMetadata.Exif.ImageHeight || 
                      altMetadata.Exif.PixelYDimension || 
                      altMetadata.Exif.ExifImageHeight
                    )) ||
                    (altMetadata.metadata?.exif && (
                      altMetadata.metadata.exif.ImageHeight || 
                      altMetadata.metadata.exif.PixelYDimension || 
                      altMetadata.metadata.exif.ExifImageHeight
                    ));
                  
                  // Extract dimensions from size or dimensions objects
                  const dimensionsWidth = 
                    (altMetadata.dimensions && altMetadata.dimensions.width) ||
                    (altMetadata.size && altMetadata.size.width);
                    
                  const dimensionsHeight = 
                    (altMetadata.dimensions && altMetadata.dimensions.height) ||
                    (altMetadata.size && altMetadata.size.height);
                  
                  // Extract Cloudflare-specific dimensions
                  const cloudflareWidth = altMetadata.imageWidth;
                  const cloudflareHeight = altMetadata.imageHeight;
                  
                  // Always favor the largest dimensions since smaller ones might be thumbnails
                  // Prioritize the original object from Cloudflare's format=json response 
                  // as it contains the true dimensions of the original image before any transformations
                  
                  // Log if we have found the 'original' object which is the most accurate source
                  if (altMetadata.original) {
                    this.logger.debug('Found original dimensions in alternate format response', {
                      originalWidth: altMetadata.original.width,
                      originalHeight: altMetadata.original.height,
                      originalFileSize: altMetadata.original.file_size,
                      originalFormat: altMetadata.original.format,
                      source: 'alternate-metadata-original'
                    });
                  }
                  
                  const candidateWidths = [
                    altMetadata.original?.width,  // Highest priority - true original dimensions from Cloudflare
                    exifWidth,                    // EXIF dimensions are usually accurate
                    dimensionsWidth,              // Dimensions from size/dimensions objects
                    cloudflareWidth,              // Cloudflare-specific image dimensions
                    altMetadata.originalWidth,    // Various fallback dimensions
                    altMetadata.naturalWidth,
                    altMetadata.width,
                    altMetadata.metadata?.width   // Nested metadata field sometimes found in alternate API responses
                  ].filter(Boolean) as number[];
                  
                  const candidateHeights = [
                    altMetadata.original?.height, // Highest priority - true original dimensions from Cloudflare
                    exifHeight,                   // EXIF dimensions are usually accurate
                    dimensionsHeight,             // Dimensions from size/dimensions objects
                    cloudflareHeight,             // Cloudflare-specific image dimensions
                    altMetadata.originalHeight,   // Various fallback dimensions
                    altMetadata.naturalHeight,
                    altMetadata.height,
                    altMetadata.metadata?.height  // Nested metadata field sometimes found in alternate API responses
                  ].filter(Boolean) as number[];
                  
                  // Use the largest dimension found, as it's likely the original image size
                  const actualWidth = candidateWidths.length > 0
                    ? Math.max(...candidateWidths)
                    : baseMetadata.metadata.width;
                    
                  const actualHeight = candidateHeights.length > 0
                    ? Math.max(...candidateHeights)
                    : baseMetadata.metadata.height;
                  
                  // Determine confidence level based on metadata source
                  let confidence: 'high' | 'medium' | 'low' = 'medium';
                  let estimationMethod: 'direct' | 'exif' | 'headers' | 'file-size' | 'minimal-fallback' | 'error-fallback' = 'direct';
                  
                  // If we have the original object, this is the most accurate
                  if (altMetadata.original?.width && altMetadata.original?.height) {
                    confidence = 'high';
                    estimationMethod = 'direct';
                  } else if (exifWidth && exifHeight) {
                    // EXIF data is generally reliable but can sometimes be incorrect
                    confidence = 'high'; 
                    estimationMethod = 'exif';
                  } else if (cloudflareWidth && cloudflareHeight) {
                    // Cloudflare-specific dimensions are typically reliable
                    confidence = 'medium';
                    estimationMethod = 'direct';
                  } else {
                    // Other sources are less reliable
                    confidence = 'medium';
                    estimationMethod = 'direct';
                  }
                  
                  // Create a properly structured metadata object
                  const metadata: ImageMetadata = {
                    metadata: {
                      width: actualWidth,
                      height: actualHeight,
                      format: (altMetadata.metadata?.format) || altMetadata.format || baseMetadata.metadata.format,
                      originalMetadata: altMetadata,
                      metadataSource: 'metadata-json',
                      confidence: confidence,
                      estimationMethod: estimationMethod
                    }
                  };
                  
                  // Cache and return the metadata
                  this.cacheMap.set(cacheKey, metadata);
                  
                  const duration = Date.now() - startTime;
                  const hasOriginalInfo = !!altMetadata.original;
                  
                  this.logger.debug('Successfully fetched metadata from alternative method', {
                    imagePath,
                    duration,
                    width: metadata.metadata.width,
                    height: metadata.metadata.height,
                    format: metadata.metadata.format,
                    fromSource: 'metadata-json',
                    hasOriginalObject: hasOriginalInfo,
                    originalDimensions: hasOriginalInfo ? 
                      `${altMetadata.original?.width}x${altMetadata.original?.height}` : undefined
                  });
                  
                  return metadata;
                } catch (altJsonError) {
                  this.logger.warn('Error parsing alternative metadata response as JSON', {
                    error: altJsonError instanceof Error ? altJsonError.message : String(altJsonError)
                  });
                  // Continue to fallback
                }
              }
            } catch (altError) {
              this.logger.warn('Error using metadata=json method, trying Cloudflare Worker approach', {
                error: altError instanceof Error ? altError.message : String(altError)
              });
              
              // Second fallback: Try Cloudflare Worker-specific metadata approach with Image Resizing API
              try {
                // Cloudflare Workers can access image metadata without a specific endpoint
                const cfMetadataUrl = new URL(imageUrl);
                // Use cf-metadata parameter which is recognized by Cloudflare Workers
                cfMetadataUrl.search = '';
                cfMetadataUrl.searchParams.set('cf-metadata', '1');
                
                this.logger.debug('Trying Cloudflare-specific metadata parameter with Image Resizing API', { 
                  url: cfMetadataUrl.toString()
                });
                
                const cfResponse = await fetch(cfMetadataUrl.toString());
                const cfContentType = cfResponse.headers.get('content-type') || '';
                const cfIsJson = cfContentType.includes('application/json') || cfContentType.includes('text/json');
                
                this.logger.debug('Cloudflare metadata response info', {
                  status: cfResponse.status,
                  contentType: cfContentType,
                  isJson: cfIsJson
                });
                
                if (cfResponse && cfResponse.ok && cfIsJson) {
                  const cfRawData = await cfResponse.json();
                  
                  this.logger.debug('Cloudflare metadata JSON received', {
                    metadata: typeof cfRawData === 'object' ? JSON.stringify(cfRawData) : String(cfRawData)
                  });
                  
                  // Extract dimensions from Cloudflare's response
                  if (cfRawData && typeof cfRawData === 'object') {
                    // Type the data properly
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    const cfData: Record<string, any> = cfRawData;
                    
                    // Look for dimensions in various formats
                    const width = 
                      cfData['width'] || 
                      cfData['Width'] || 
                      (cfData['dimensions'] && cfData['dimensions']['width']);
                      
                    const height = 
                      cfData['height'] || 
                      cfData['Height'] || 
                      (cfData['dimensions'] && cfData['dimensions']['height']);
                    
                    if (width && height) {
                      // Create metadata with complete information
                      const metadata: ImageMetadata = {
                        metadata: {
                          width,
                          height,
                          format: cfData['format'] || cfData['Format'] || (cfContentType && cfContentType.replace('image/', '')),
                          estimationMethod: 'direct',
                          metadataSource: 'cf-metadata',
                          confidence: 'high', // Cloudflare worker metadata is reliable
                          // Store original metadata for reference
                          originalMetadata: cfData
                        },
                        messages: ['Dimensions extracted from Cloudflare Worker cf-metadata parameter']
                      };
                      
                      this.logger.debug('Successfully extracted metadata using Cloudflare Worker approach', {
                        width,
                        height,
                        format: metadata.metadata.format,
                        responseStatus: cfResponse.status,
                        contentType: cfContentType,
                        source: 'cf-metadata'
                      });
                      
                      // Cache and return the metadata
                      this.cacheMap.set(cacheKey, metadata);
                      return metadata;
                    }
                  }
                }
              } catch (cfError) {
                this.logger.warn('Error using Cloudflare Worker metadata method', {
                  error: cfError instanceof Error ? cfError.message : String(cfError)
                });
              }
            }
          }
        }
      } catch (workerError) {
        this.logger.warn('Error using Cloudflare Worker for metadata, falling back', {
          error: workerError instanceof Error ? workerError.message : String(workerError)
        });
        // Continue to fallback
      }
      
      // Use the storage result that was captured earlier
      // This should be populated from the earlier try/catch block
      
      // As a LAST resort, we'll use size-based estimation for larger images
      // This is deterministic, since size should be known after the storage fetch
      if (storageResult && storageResult.size && storageResult.size > 0) {
        const sizeMB = storageResult.size / (1024 * 1024);
        
        // For JPEG images, estimate resoltion based on file size
        // This is somewhat reliable for user-uploaded photos from modern devices
        
        // For a high-quality JPEG:
        // - 1MP ~= 0.25-0.5MB (medium compression)
        // - Calculate estimated megapixels from file size
        const estimatedMegapixels = sizeMB * 2;  // This is a reasonable heuristic
        
        let width = 0;
        let height = 0;
        
        // Use file size to estimate dimensions depending on image format
        if (storageResult.contentType?.includes('jpeg') || 
            storageResult.contentType?.includes('jpg')) {
          // JPEG - Calculate using common aspect ratio for photos (3:2)
          const aspectRatio = 3/2; // Standard photography aspect ratio
          
          // Calculate width and height
          width = Math.round(Math.sqrt(estimatedMegapixels * 1_000_000 * aspectRatio / (aspectRatio + 1)) * Math.sqrt(aspectRatio));
          height = Math.round(width / aspectRatio);
        }
        else if (storageResult.contentType?.includes('png')) {
          // PNG - Typically less compressed than JPEG
          const reducedMegapixels = estimatedMegapixels * 0.7; // PNG usually takes more space
          
          // Assume 4:3 aspect ratio for this estimation
          width = Math.round(Math.sqrt(reducedMegapixels * 1_000_000 * 4/3));
          height = Math.round(width * 3/4);
        }
        else {
          // For other formats, use a 16:9 aspect ratio as a default guess
          width = Math.round(Math.sqrt(estimatedMegapixels * 1_000_000 * 16/9));
          height = Math.round(width * 9/16);
        }
        
        // Only use this approach if we get reasonable values
        if (width >= 800 && height >= 600) {
          // Create metadata with size-based estimates 
          const sizeBasedMetadata: ImageMetadata = {
            metadata: {
              width,
              height,
              format: storageResult.contentType?.replace('image/', '') || 'jpeg',
              estimationMethod: 'file-size',
              metadataSource: 'estimation',
              confidence: 'medium', // Size estimation is reasonably accurate for typical photos
              // Store additional information about the estimation
              originalMetadata: {
                fileSize: storageResult.size,
                contentType: storageResult.contentType,
                estimatedMegapixels: estimatedMegapixels,
                estimationMethod: 'file-size',
                aspectRatio: width / height
              }
            },
            messages: ['Dimensions estimated from file size']
          };
          
          this.logger.debug('Created size-based metadata estimation', {
            imagePath,
            sizeMB: sizeMB.toFixed(2),
            estimatedMegapixels: estimatedMegapixels.toFixed(1) + 'MP',
            width,
            height,
            format: sizeBasedMetadata.metadata.format,
            aspectRatio: (width / height).toFixed(2)
          });
          
          // Cache the size-based metadata
          this.cacheMap.set(cacheKey, sizeBasedMetadata);
          
          return sizeBasedMetadata;
        }
      }
      
      // If we reach this point, all metadata retrieval methods have failed
      // We'll use a reasonable fallback with common web dimensions
      // This is only used as a last resort when all previous methods have failed
      
      this.logger.debug('All metadata extraction methods failed, using minimal fallback dimensions', {
        methods: 'format=json, metadata=json, cf-metadata, size-estimation',
        contentType: storageResult?.contentType || 'unknown',
        size: storageResult?.size || 'unknown'
      });
      
      // Use a reasonable fallback - 16:9 dimension which is common for most modern displays
      // These values are intentionally modest to avoid creating issues with too large dimensions
      const minimumMetadata: ImageMetadata = {
        metadata: {
          width: 1600,  // Reasonable width that works for most displays
          height: 900,  // 16:9 aspect ratio
          format: storageResult?.contentType?.replace('image/', '') || 'jpeg',
          estimationMethod: 'minimal-fallback',
          metadataSource: 'estimation',
          confidence: 'low'
        },
        messages: ['Used fallback dimensions due to metadata extraction failure']
      };
      
      this.logger.warn('Using minimal fallback metadata - all methods failed', {
        imagePath,
        width: minimumMetadata.metadata.width,
        height: minimumMetadata.metadata.height,
        format: minimumMetadata.metadata.format
      });
      
      // Cache the minimal metadata
      this.cacheMap.set(cacheKey, minimumMetadata);
      
      return minimumMetadata;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Failed to fetch metadata', {
        imagePath,
        error: errorMessage,
        duration: Date.now() - startTime
      });
      
      // Return a placeholder with reasonable dimensions for error cases
      // This should rarely be used since we have multiple fallback mechanisms
      this.logger.error('Critical error in metadata extraction, using emergency fallback dimensions', {
        error: errorMessage,
        path: imagePath
      });
      
      const defaultMetadata: ImageMetadata = {
        metadata: {
          width: 1600,
          height: 900,
          format: 'jpeg',
          estimationMethod: 'error-fallback',
          metadataSource: 'estimation',
          confidence: 'low'
        },
        errors: [errorMessage],
        messages: ['Emergency fallback dimensions used due to critical error in metadata extraction']
      };
      
      return defaultMetadata;
    }
  }
  
  /**
   * Process image metadata to determine optimal transformation parameters
   * 
   * @param metadata Original image metadata
   * @param targetAspect Optional target aspect ratio (width/height)
   * @param options Additional processing options
   * @returns Transformation recommendations
   */
  processMetadata(
    metadata: ImageMetadata,
    targetAspect?: { width: number, height: number },
    options?: MetadataProcessingOptions
  ): TransformationResult {
    options = options || {};
    const startTime = Date.now();
    this.logger.debug('Processing metadata', {
      originalWidth: metadata.metadata.width,
      originalHeight: metadata.metadata.height,
      targetAspect: targetAspect ? `${targetAspect.width}:${targetAspect.height}` : 'none',
      options: JSON.stringify(options)
    });
    
    // Get the original dimensions
    const originalWidth = metadata.metadata.width;
    const originalHeight = metadata.metadata.height;
    const originalRatio = originalWidth / originalHeight;
    
    // Create the result object
    const result: TransformationResult = {
      originalMetadata: metadata
    };
    
    try {
      // Step 1: Determine target aspect ratio
      // If targetAspect is provided explicitly, use it
      // Otherwise, check for platform-specific ratio or use the original
      let targetWidth = targetAspect?.width;
      let targetHeight = targetAspect?.height;
      let targetRatio = targetWidth && targetHeight ? targetWidth / targetHeight : originalRatio;
      
      // Check if we have a platform specified
      if (options.targetPlatform && !targetAspect) {
        const platformRatio = PLATFORM_ASPECT_RATIOS[options.targetPlatform];
        if (platformRatio) {
          targetWidth = platformRatio.width;
          targetHeight = platformRatio.height;
          targetRatio = targetWidth / targetHeight;
          
          this.logger.debug('Using platform-specific aspect ratio', {
            platform: options.targetPlatform,
            ratio: `${targetWidth}:${targetHeight}`,
            numericRatio: targetRatio
          });
        }
      }
      
      // Step 2: Calculate cropping parameters if aspect ratio differs
      const aspectRatioDifference = Math.abs(originalRatio - targetRatio);
      
      // Only perform aspect cropping if the difference is significant (>1%)
      // and we have a specific target ratio
      if (aspectRatioDifference > 0.01 && targetWidth && targetHeight) {
        // Akamai-compatible aspect ratio implementation
        // Following Akamai's AspectCrop behavior:
        // 1. When cropping, preserve one dimension and adjust the other based on relative aspect ratios
        // 2. When expanding (allowExpansion=true), preserve original dimensions and add transparent padding
        
        let newWidth: number;
        let newHeight: number;
        
        // Determine if allowExpansion is enabled (defaults to false)
        const allowExpansion = options.allowExpansion ?? false;
        
        if (allowExpansion) {
          // With allowExpansion=true, preserve original dimensions exactly
          // and padding will be added by the transformation service
          newWidth = originalWidth;
          newHeight = originalHeight;
          
          this.logger.debug('Using allowExpansion=true, preserving original dimensions', {
            originalWidth,
            originalHeight,
            targetRatio,
            allowExpansion: true
          });
        } else {
          // Without allowExpansion, crop to achieve the target ratio
          // while preserving as much of the original image as possible
          
          // Check if a specific width was explicitly requested in the options
          const requestedWidth = options.width !== undefined ? parseInt(String(options.width), 10) : null;
          
          if (requestedWidth !== null && !isNaN(requestedWidth) && requestedWidth > 0) {
            // User explicitly requested a width, use it and calculate height based on target ratio
            newWidth = requestedWidth;
            newHeight = Math.round(requestedWidth / targetRatio);
            
            this.logger.debug('Using explicitly requested width for aspect crop', {
              requestedWidth,
              calculatedHeight: newHeight,
              targetRatio,
              originalWidth,
              originalHeight
            });
          } else if (originalRatio > targetRatio) {
            // Original is wider than target - preserve height, adjust width
            // This crops the sides of the image (left and right)
            newHeight = originalHeight;
            newWidth = Math.round(originalHeight * targetRatio);
            
            this.logger.debug('Original is wider than target, preserving height', {
              originalWidth,
              originalHeight,
              newWidth,
              newHeight,
              originalRatio,
              targetRatio
            });
          } else {
            // Original is taller than target - preserve width, adjust height
            // This crops the top and bottom of the image
            newWidth = originalWidth;
            newHeight = Math.round(originalWidth / targetRatio);
            
            this.logger.debug('Original is taller than target, preserving width', {
              originalWidth,
              originalHeight,
              newWidth,
              newHeight,
              originalRatio,
              targetRatio
            });
          }
        }
        
        result.aspectCrop = {
          width: newWidth,
          height: newHeight,
          hoffset: 0.5, // Default center
          voffset: 0.5, // Default center
          allowExpansion: allowExpansion
        };
        
        // Step 3: Determine optimal focal point
        // If explicit focal point is provided, use it
        if (options.focalPoint) {
          result.aspectCrop.hoffset = options.focalPoint.x;
          result.aspectCrop.voffset = options.focalPoint.y;
        }
        // Otherwise, use content type to make a good guess
        else if (options.contentType) {
          switch (options.contentType) {
          case 'portrait':
            // For portraits, focus on the upper third
            result.aspectCrop.voffset = 0.33;
            break;
          case 'landscape':
            // For landscapes, focus slightly above center
            result.aspectCrop.voffset = 0.4;
            break;
          case 'product':
            // For products, focus on the center
            result.aspectCrop.voffset = 0.5;
            break;
          case 'banner':
            // For banners, center is usually best
            result.aspectCrop.voffset = 0.5;
            break;
          case 'profile':
            // For profile pictures, focus on the upper quarter
            result.aspectCrop.voffset = 0.25;
            break;
          }
        }
        // If we don't have content type, make a guess based on the original ratio
        else {
          // If original is portrait, focus higher
          if (originalRatio < 0.8) {
            result.aspectCrop.voffset = 0.33;
          } 
          // If original is square, keep center focus
          else if (originalRatio >= 0.8 && originalRatio <= 1.2) {
            result.aspectCrop.voffset = 0.5;
          }
          // If original is landscape, focus slightly higher than center
          else {
            result.aspectCrop.voffset = 0.4;
          }
        }
        
        this.logger.debug('Calculated aspect crop parameters', {
          aspectCrop: result.aspectCrop,
          originalRatio,
          targetRatio,
          difference: aspectRatioDifference
        });
      }
      
      // Step 4: Calculate dimensions
      // If we have a device type constraint, use it
      if (options.deviceType && DEVICE_WIDTH_CONSTRAINTS[options.deviceType]) {
        const maxWidth = DEVICE_WIDTH_CONSTRAINTS[options.deviceType];
        
        // Only constrain if original is larger
        if (originalWidth > maxWidth) {
          result.dimensions = {
            width: maxWidth,
            // Calculate height to maintain aspect ratio
            // If we're doing aspect crop, use target ratio
            // Otherwise use original ratio
            height: result.aspectCrop 
              ? Math.round(maxWidth / targetRatio) 
              : Math.round(maxWidth / originalRatio)
          };
          
          this.logger.debug('Applied device constraints', {
            deviceType: options.deviceType,
            maxWidth,
            calculatedDimensions: result.dimensions
          });
        }
      }
      
      // Step 5: Quality and format recommendations
      // Set default quality based on image size and processing options
      if (originalWidth * originalHeight > 1_000_000) { // > 1MP
        result.quality = 80;
      } else {
        result.quality = 85;
      }
      
      // Adjust quality based on quality factor if provided
      if (options.qualityFactor !== undefined) {
        const factor = Math.max(0.5, Math.min(1.5, options.qualityFactor));
        result.quality = Math.round(result.quality * factor);
        result.quality = Math.max(1, Math.min(100, result.quality));
      }
      
      // Don't set format by default - let the original logic handle it
      
      const duration = Date.now() - startTime;
      this.logger.debug('Completed metadata processing', {
        duration,
        resultParameters: Object.keys(result).join(',')
      });
      
      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error('Error processing metadata', {
        error: errorMessage,
        duration: Date.now() - startTime
      });
      
      // Return minimal result with original metadata
      return {
        originalMetadata: metadata
      };
    }
  }
  
  /**
   * Fetch and process image metadata in one operation
   * 
   * @param imagePath Path to the image
   * @param config Application configuration
   * @param env Environment variables
   * @param request Original request for context
   * @param targetAspect Optional target aspect ratio
   * @param options Additional processing options
   * @returns Promise with transformation recommendations
   */
  async fetchAndProcessMetadata(
    imagePath: string,
    config: ImageResizerConfig,
    env: Env,
    request: Request,
    targetAspect?: { width: number; height: number },
    options?: MetadataProcessingOptions
  ): Promise<TransformationResult> {
    try {
      // First, fetch the metadata
      const metadata = await this.fetchMetadata(
        imagePath,
        config,
        env,
        request
      );
      
      // Then process it
      return this.processMetadata(metadata, targetAspect, options);
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