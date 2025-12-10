/**
 * Service interfaces for Image Resizer
 * 
 * This file contains the interfaces for all services used in the application.
 * These interfaces define the contracts that implementations must follow.
 */

import { ImageResizerConfig } from '../config';
import { Logger } from '../utils/logging';
import { PathTransforms } from '../utils/path';
import { Env } from '../types';
import type { ExecutionContext } from '@cloudflare/workers-types';
import { ConfigurationApiService, ConfigStoreInterface } from './config/interfaces';

/**
 * Performance timing points for tracking request processing
 */
export interface PerformanceMetrics {
  start: number;
  storageStart?: number;
  storageEnd?: number;
  transformStart?: number;
  transformEnd?: number;
  detectionStart?: number;
  detectionEnd?: number;
  kvCacheLookupStart?: number;
  kvCacheLookupEnd?: number;
  kvCacheHit?: boolean;
  kvCacheError?: boolean;
  end?: number;
  detectionSource?: string;
}
/**
 * Image transformation options for Cloudflare Image Resizing service
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
  
  // Smart transformation options
  smart?: boolean;  // Enable smart transformations using metadata
  platform?: string;  // Target platform for aspect ratio optimization
  content?: string;  // Content type for focal point optimization
  device?: 'mobile' | 'tablet' | 'desktop' | string;  // Target device type
  aspect?: string;  // Custom aspect ratio in format "width:height" or "width-height"
  focal?: string;  // Custom focal point in format "x,y" (values 0-1)
  allowExpansion?: boolean;  // Allow image expansion to fit aspect ratio
  
  // Internal use options
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _conditions?: any[]; // For conditional transformations (internal use)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _customEffects?: any[]; // For custom effects (internal use)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  _metadataResult?: any; // For storing metadata analysis results (internal use)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

// Client info interface for client detection
export interface ClientInfo {
  viewportWidth?: number;
  devicePixelRatio?: number;
  saveData?: boolean;
  acceptsWebp?: boolean;
  acceptsAvif?: boolean;
  deviceType?: 'mobile' | 'tablet' | 'desktop' | 'unknown';
  networkQuality?: 'fast' | 'medium' | 'slow';
  preferredFormats?: string[];
  deviceClassification?: 'high-end' | 'mid-range' | 'low-end';
  memoryConstraints?: boolean;
  processorConstraints?: boolean;
}

/**
 * Storage result representing the outcome of a storage operation
 */
export interface StorageResult {
  response: Response;
  sourceType: 'r2' | 'remote' | 'fallback' | 'error';
  contentType: string | null;
  size: number | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata?: Record<string, any>;
  originalUrl?: string;
  error?: Error;
  path?: string;
  width?: number;
  height?: number;
  ttl?: number;          // TTL in seconds for caching this resource
  buffer?: ArrayBuffer;  // Optional buffer for storage operations
}

/**
 * Storage service for fetching images from different sources
 */
export interface StorageService {
  /**
   * Fetch an image from storage
   * 
   * @param imagePath Path to the image
   * @param config Application configuration
   * @param env Environment variables
   * @param request Original request
   * @param options Optional fetch options including abort signal
   * @returns Storage result with the image data
   */
  fetchImage(
    imagePath: string, 
    config: ImageResizerConfig, 
    env: Env, 
    request: Request,
    options?: RequestInit
  ): Promise<StorageResult>;
}

/**
 * Image transformation service for applying transformations to images
 */
export interface ImageTransformationService {
  /**
   * Set the client detection service
   * 
   * @param service The client detection service to use
   */
  setClientDetectionService(service: ClientDetectionService): void;
  
  /**
   * Set the metadata fetching service
   * 
   * @param service The metadata service to use
   */
  setMetadataService(service: MetadataFetchingService): void;
  
  /**
   * Transform an image based on the provided options
   * 
   * @param request Original request
   * @param storageResult Result from storage service
   * @param options Transformation options
   * @param config Application configuration
   * @returns Response with the transformed image
   */
  transformImage(
    request: Request, 
    storageResult: StorageResult, 
    options: TransformOptions, 
    config: ImageResizerConfig,
    env: Env
  ): Promise<Response>;

  /**
   * Get optimal transformation options based on client information
   * 
   * @param request Original request
   * @param clientInfo Client information
   * @param config Application configuration
   * @returns Optimized transformation options
   */
  getOptimalOptions(
    request: Request, 
    clientInfo: ClientInfo, 
    config: ImageResizerConfig
  ): TransformOptions;
  
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
  processSmartOptions(
    request: Request,
    imagePath: string,
    options: TransformOptions,
    config: ImageResizerConfig,
    env: Env
  ): Promise<TransformOptions>;
}

/**
 * Cache service for managing caching operations
 */
export interface CacheService extends KVTransformCacheMethods {
  /**
   * Apply cache headers to a response based on content type, status code, and configuration
   * 
   * @param response The original response
   * @param options Optional transformation options for optimized caching
   * @param storageResult Optional storage result for metadata-based cache decisions
   * @returns A response with appropriate Cache-Control headers
   */
  applyCacheHeaders(
    response: Response,
    options?: TransformOptions,
    storageResult?: StorageResult
  ): Response;

  /**
   * Cache a response using the Cache API
   * 
   * @param request Original request
   * @param response Response to cache
   * @param ctx Execution context
   * @returns Response (potentially modified)
   */
  cacheWithCacheApi(
    request: Request, 
    response: Response, 
    ctx: ExecutionContext
  ): Promise<Response>;

  /**
   * Check if caching should be bypassed for this request
   * 
   * @param request The request to check
   * @param options Optional transformation options for specific bypass checks
   * @returns True if caching should be bypassed
   */
  shouldBypassCache(
    request: Request,
    options?: TransformOptions
  ): boolean;

  /**
   * Generate cache tags for a request/response
   * 
   * @param request Original request
   * @param storageResult Storage result
   * @param options Transformation options
   * @returns Array of cache tags
   */
  generateCacheTags(
    request: Request,
    storageResult: StorageResult,
    options: TransformOptions
  ): string[];
  
  /**
   * Apply Cloudflare cache configuration to a request
   * 
   * @param requestInit The request initialization options
   * @param imagePath The path to the image
   * @param options Transformation options
   * @returns Updated request initialization with CF cache settings
   */
  applyCloudflareCache(
    requestInit: RequestInit,
    imagePath: string,
    options: TransformOptions
  ): RequestInit;
  
  /**
   * Calculate the appropriate TTL for a response with intelligent adjustment
   * based on content type, response status, and image properties
   * 
   * @param response The response to check
   * @param options The transformation options
   * @param storageResult Optional storage result with additional image metadata
   * @returns The TTL in seconds
   */
  calculateTtl(
    response: Response,
    options: TransformOptions,
    storageResult?: StorageResult
  ): number;
  
  /**
   * Cache a response with advanced fallback strategies for high reliability
   * 
   * This method combines multiple resilience patterns:
   * 1. Retry mechanism for transient failures
   * 2. Circuit breaker to prevent overloading failing systems
   * 3. Fallback mechanism for when primary caching fails completely
   * 4. Stale-while-revalidate pattern for seamless cache refreshes
   * 5. Cache warming for frequently accessed resources
   * 
   * @param request The original request
   * @param response The response to cache
   * @param ctx The execution context for waitUntil
   * @param options Optional transformation options for optimized caching
   * @param storageResult Optional storage result for metadata-based cache decisions
   * @returns The potentially modified response
   */
  cacheWithFallback(
    request: Request,
    response: Response,
    ctx: ExecutionContext,
    options?: TransformOptions,
    storageResult?: StorageResult
  ): Promise<Response>;
  
  /**
   * Service lifecycle method for initialization
   * 
   * This method is called during the service container initialization phase
   * and should perform any necessary setup such as:
   * - Initializing cache metrics
   * - Preparing failure tracking for circuit breaker
   * - Connecting to external monitoring systems
   * - Loading any persistent state
   * 
   * @returns Promise that resolves when initialization is complete
   */
  initialize(): Promise<void>;
  
  /**
   * Get the CacheTagsManager instance for consistent tag generation across services
   * 
   * This property exposes the tags manager component to allow other services
   * to use the same tag generation logic for consistency.
   * 
   * This property is private in DefaultCacheService to encapsulate implementation details.
   * Other services should use the generateCacheTags method instead.
   */
  readonly tagsManager?: unknown; // Optional to support different implementations
  
  /**
   * Service lifecycle method for shutdown
   * 
   * This method is called during the service container shutdown phase
   * and should perform any necessary cleanup such as:
   * - Persisting cache statistics
   * - Closing any external connections
   * - Releasing resources
   * 
   * @returns Promise that resolves when shutdown is complete
   */
  shutdown(): Promise<void>;
}

/**
 * Debug service for handling debug information and visualization
 */
export interface DebugService {
  /**
   * Add debug headers to a response
   * 
   * @param response Original response
   * @param request Original request
   * @param storageResult Storage result
   * @param options Transformation options
   * @param config Application configuration
   * @param metrics Performance metrics
   * @param url Request URL
   * @returns Response with debug headers
   */
  addDebugHeaders(
    response: Response,
    request: Request,
    storageResult: StorageResult,
    options: TransformOptions,
    config: ImageResizerConfig,
    metrics: PerformanceMetrics,
    url: URL
  ): Response;

  /**
   * Create a debug HTML report with interactive visualizations
   * 
   * @param request Original request
   * @param storageResult Storage result
   * @param options Transformation options
   * @param config Application configuration
   * @param metrics Performance metrics
   * @param clientInfo Optional client information for enhanced reporting
   * @returns Response with HTML report
   */
  createDebugHtmlReport(
    request: Request,
    storageResult: StorageResult,
    options: TransformOptions,
    config: ImageResizerConfig,
    metrics: PerformanceMetrics,
    clientInfo?: ClientInfo
  ): Response;

  /**
   * Check if debug mode is enabled
   * 
   * @param request Original request
   * @param config Application configuration
   * @returns True if debug is enabled
   */
  isDebugEnabled(
    request: Request,
    config: ImageResizerConfig
  ): boolean;
  
  /**
   * Get detailed debug information for the current request
   * 
   * This returns a structured object with comprehensive debug information
   * that can be used for logging, reporting, or visualization.
   * 
   * @param request Original request
   * @param storageResult Storage result
   * @param options Transformation options
   * @param config Application configuration
   * @param metrics Performance metrics
   * @returns Object with structured debug information
   */
  getDebugInfo(
    request: Request,
    storageResult: StorageResult,
    options: TransformOptions,
    config: ImageResizerConfig,
    metrics: PerformanceMetrics
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ): Record<string, any>;
}

/**
 * Client detection service for detecting client capabilities
 */
export interface ClientDetectionService {
  /**
   * Configure the client detection service
   * 
   * @param config Application configuration
   */
  configure(config: ImageResizerConfig): void;

  /**
   * Detect client information from a request
   * 
   * @param request Original request
   * @returns Client information
   */
  detectClient(request: Request): Promise<ClientInfo>;
  
  /**
   * Get optimized transformation options based on client capabilities
   * 
   * @param request Original request
   * @param baseOptions Base transformation options
   * @param config Application configuration
   * @returns Optimized transformation options
   */
  getOptimizedOptions(
    request: Request,
    baseOptions: TransformOptions,
    config: ImageResizerConfig
  ): Promise<TransformOptions>;
  
  /**
   * Determine if a client supports a specific image format
   * 
   * @param request Original request
   * @param format Format to check support for (webp, avif, etc.)
   * @returns True if format is supported
   */
  supportsFormat(
    request: Request,
    format: string
  ): Promise<boolean>;
  
  /**
   * Get device classification based on client capabilities
   * 
   * @param request Original request
   * @returns Device classification (high-end, mid-range, low-end)
   */
  getDeviceClassification(
    request: Request
  ): Promise<'high-end' | 'mid-range' | 'low-end'>;
  
  /**
   * Get network quality classification based on client capabilities
   * 
   * @param request Original request
   * @returns Network quality (fast, medium, slow)
   */
  getNetworkQuality(
    request: Request
  ): Promise<'fast' | 'medium' | 'slow'>;
  
  /**
   * Clear detection cache
   */
  clearCache(): void;
}

/**
 * Configuration service for managing configuration loading and access
 */
// The cache service methods for KV transform cache are defined separately
// to allow for backwards compatibility with existing code
export interface KVTransformCacheMethods {
  /**
   * Check if a transformed image is already in the KV cache
   */
  isTransformCached(request: Request, transformOptions: TransformOptions): Promise<boolean>;
  
  /**
   * Get a transformed image from the KV cache
   */
  getTransformedImage(request: Request, transformOptions: TransformOptions): Promise<Response | null>;
  
  /**
   * Store a transformed image in the KV cache
   */
  storeTransformedImage(
    request: Request,
    response: Response,
    storageResult: StorageResult,
    transformOptions: TransformOptions,
    ctx?: ExecutionContext
  ): Promise<void>;
  
  /**
   * Purge transformed images by tag
   */
  purgeTransformsByTag(tag: string, ctx?: ExecutionContext): Promise<number>;
  
  /**
   * Purge transformed images by path pattern
   */
  purgeTransformsByPath(pathPattern: string, ctx?: ExecutionContext): Promise<number>;
  
  /**
   * Get statistics about the KV transform cache
   */
  getTransformCacheStats(): Promise<{
    count: number,
    size: number,
    hitRate: number,
    avgSize: number,
    lastPruned: Date,
    memoryCacheSize?: number,
    memoryCacheHitRate?: number
  }>;
  
  /**
   * List entries in the transform cache
   * 
   * @param limit Maximum number of entries to return
   * @param cursor Cursor for pagination
   * @returns List of cache entries with metadata
   */
  listTransformCacheEntries(
    limit?: number, 
    cursor?: string
  ): Promise<{
    entries: {key: string, metadata: Record<string, unknown>}[],
    cursor?: string,
    complete: boolean
  }>;
}

// The core configuration service interface without KV transform cache methods
export interface ConfigurationServiceCore {
  /**
   * Get the complete configuration
   * 
   * @returns Complete configuration object
   */
  getConfig(): ImageResizerConfig;
  
  /**
   * Get a specific configuration section
   * 
   * @param section Name of the configuration section to retrieve
   * @returns Configuration section
   */
  getSection<K extends keyof ImageResizerConfig>(section: K): ImageResizerConfig[K];
  
  /**
   * Get a specific configuration value
   * 
   * @param path Dot notation path to the configuration value
   * @param defaultValue Default value if path doesn't exist
   * @returns Configuration value at the specified path
   */
  getValue<T>(path: string, defaultValue?: T): T;
  
  /**
   * Merge additional configuration with the current configuration
   * 
   * @param additionalConfig Additional configuration to merge
   * @returns Updated configuration
   */
  mergeConfig(additionalConfig: Partial<ImageResizerConfig>): ImageResizerConfig;
  
  /**
   * Get environment-specific configuration
   * 
   * @param environment Target environment
   * @returns Environment-specific configuration
   */
  getEnvironmentConfig(environment: 'development' | 'staging' | 'production'): Partial<ImageResizerConfig>;
  
  /**
   * Check if a feature flag is enabled
   * 
   * @param featureName Name of the feature flag
   * @returns True if the feature is enabled
   */
  isFeatureEnabled(featureName: string): boolean;
  
  /**
   * Get the default configuration
   * 
   * @returns Default configuration
   */
  getDefaultConfig(): ImageResizerConfig;
  
  /**
   * Reload configuration
   * 
   * This method attempts to reload the configuration from the KV store via ConfigurationApiService
   * if available, otherwise falls back to reloading from environment variables.
   * 
   * @returns Promise with the updated configuration
   */
  reloadConfig(): Promise<ImageResizerConfig>;
  
  /**
   * Get the path transformations for a specific origin type
   * 
   * @param originType The origin type (r2, remote, fallback)
   * @returns Path transformations for the specified origin
   */
  getPathTransforms(originType: 'r2' | 'remote' | 'fallback'): PathTransforms;
  
  /**
   * Get derivative configuration by name
   * 
   * @param derivativeName Name of the derivative
   * @returns Derivative configuration or null if not found
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getDerivative(derivativeName: string): Record<string, any> | null;
  
  /**
   * Get all available derivative names
   * 
   * @returns Array of derivative names
   */
  getDerivativeNames(): string[];
  
  /**
   * Check if a path should be considered immutable content
   * 
   * @param path Path to check
   * @param contentType Optional content type for additional checking
   * @param derivative Optional derivative name for additional checking
   * @returns True if the content should be considered immutable
   */
  isImmutableContent(path: string, contentType?: string, derivative?: string): boolean;
  
  /**
   * Check if caching should be bypassed for a particular path
   * 
   * @param path Path to check
   * @param format Optional image format for format-based bypass
   * @returns True if cache should be bypassed
   */
  shouldBypassForPath(path: string, format?: string): boolean;
  
  /**
   * Get appropriate TTL for a path based on path-based TTL configuration
   * 
   * @param path Path to get TTL for
   * @returns TTL value in seconds, or undefined if no match
   */
  getPathBasedTtl(path: string): number | undefined;
  
  /**
   * Service lifecycle method for initialization
   * 
   * @returns Promise that resolves when initialization is complete
   */
  initialize(): Promise<void>;
  
  /**
   * Service lifecycle method for shutdown
   * 
   * @returns Promise that resolves when shutdown is complete
   */
  shutdown(): Promise<void>;
}

// Define the full ConfigurationService interface by extending both the core and KV transform methods
export interface ConfigurationService extends ConfigurationServiceCore, Partial<KVTransformCacheMethods> {
}

/**
 * Logging service for centralized log management
 */
export interface LoggingService {
  /**
   * Get a logger instance for a specific context
   * 
   * @param context The context for the logger (module name, feature, etc.)
   * @returns A configured logger instance
   */
  getLogger(context: string): Logger;
  
  /**
   * Configure the logging service with updated configuration
   * 
   * @param config The configuration to apply
   */
  configure(config: ImageResizerConfig): void;
  
  /**
   * Get the current log level
   * 
   * @returns The current log level
   */
  getLogLevel(): string;
  
  /**
   * Set the log level
   * 
   * @param level The log level to set
   */
  setLogLevel(level: string): void;
}

/**
 * Path service for handling path operations
 */
export interface PathService {
  /**
   * Normalize a path
   * 
   * @param path The path to normalize
   * @returns Normalized path
   */
  normalizePath(path: string): string;
  
  /**
   * Parse image path and options from URL path
   * 
   * @param pathname URL pathname
   * @returns Object with image path and options
   */
  parseImagePath(pathname: string): {
    imagePath: string;
    options: Record<string, string>;
  };
  
  /**
   * Extract derivative name from path
   * 
   * @param pathname URL pathname
   * @param derivatives List of available derivatives
   * @returns Object with derivative name and modified path, or null if no derivative found
   */
  extractDerivative(
    pathname: string,
    derivatives: string[]
  ): { derivative: string; modifiedPath: string } | null;
  
  /**
   * Parse query parameters for image options
   * 
   * @param searchParams URL search parameters
   * @returns Object with parsed and normalized transformation options
   */
  parseQueryOptions(
    searchParams: URLSearchParams
  ): Promise<Record<string, unknown>>;
  
  /**
   * Apply transformations to an image path
   * 
   * @param imagePath The image path to transform
   * @param config Application configuration
   * @returns Transformed path
   */
  applyTransformations(
    imagePath: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    config?: any
  ): string;
}

/**
 * Metadata fetching service for retrieving and processing image metadata
 */
export interface MetadataFetchingService {
  /**
   * Fetch image metadata using format=json
   * 
   * @param imagePath Path to the image
   * @param config Application configuration
   * @param env Environment variables
   * @param request Original request for context
   * @returns Promise with the image metadata
   */
  fetchMetadata(
    imagePath: string,
    config: ImageResizerConfig,
    env: Env,
    request: Request
  ): Promise<ImageMetadata>;
  
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
  ): TransformationResult;
  
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
  fetchAndProcessMetadata(
    imagePath: string,
    config: ImageResizerConfig,
    env: Env,
    request: Request,
    targetAspect?: { width: number, height: number },
    options?: MetadataProcessingOptions
  ): Promise<TransformationResult>;
  
  /**
   * Service lifecycle method for initialization
   */
  initialize(): Promise<void>;
  
  /**
   * Service lifecycle method for shutdown
   */
  shutdown(): Promise<void>;
}

/**
 * Image metadata structure returned by format=json
 */
export interface ImageMetadata {
  metadata: {
    width: number;
    height: number;
    format?: string;
    orientation?: number;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    originalMetadata?: Record<string, any>; // Store the raw metadata from Cloudflare
    estimationMethod?: 'direct' | 'exif' | 'headers' | 'file-size' | 'minimal-fallback' | 'error-fallback'; // How dimensions were determined
    metadataSource?: 'format-json' | 'metadata-json' | 'cf-metadata' | 'headers' | 'storage-service' | 'estimation'; // Source of metadata
    confidence?: 'high' | 'medium' | 'low'; // Confidence in the accuracy of the metadata
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any;
  };
  errors?: string[];
  messages?: string[];
}

/**
 * Options for metadata processing
 */
export interface MetadataProcessingOptions {
  targetPlatform?: 'twitter' | 'facebook' | 'instagram' | 'pinterest' | 'linkedin' | string;
  focalPoint?: { x: number, y: number };
  contentType?: 'portrait' | 'landscape' | 'product' | 'banner' | 'profile' | string;
  deviceType?: 'mobile' | 'tablet' | 'desktop';
  allowExpansion?: boolean;
  preserveFocalPoint?: boolean;
  qualityFactor?: number;
  width?: number | string; // Explicitly requested width parameter
  cachedTransform?: {    // Information from KV transform cache to avoid duplicate processing
    aspectCropInfo?: {   // Aspect crop info from the KV transform cache
      aspect?: string;   // Aspect ratio used in the cached transform
      focal?: string;    // Focal point used in the cached transform
      processedWithKV: boolean; // Flag indicating this was processed by KV transform cache
    }
  }
}

/**
 * Result of transformation processing
 */
export interface TransformationResult {
  aspectCrop?: {
    width: number;
    height: number;
    hoffset: number;
    voffset: number;
    allowExpansion?: boolean;
  };
  dimensions?: {
    width?: number;
    height?: number;
  };
  format?: string;
  quality?: number;
  dpr?: number;
  originalMetadata?: ImageMetadata;
  transformUrl?: string;
  skipAspectCropCalculation?: boolean; // Flag to indicate aspect crop was already calculated
}

/**
 * Service container to provide access to all services
 */
export interface ServiceContainer {
  storageService: StorageService;
  transformationService: ImageTransformationService;
  cacheService: CacheService;
  debugService: DebugService;
  clientDetectionService: ClientDetectionService;
  configurationService: ConfigurationService;
  loggingService: LoggingService;
  authService: AuthService;
  logger: Logger;
  
  // Added new services
  detectorService?: ClientDetectionService;
  pathService?: PathService;
  parameterHandler?: ParameterHandlerService;
  lifecycleManager?: LifecycleManagerService;
  metadataService?: MetadataFetchingService;
  configStore?: ConfigStoreInterface;
  configApiService?: ConfigurationApiService;
  
  /**
   * Initialize all services in the container
   * 
   * @returns Promise that resolves when all services are initialized
   */
  initialize(): Promise<void>;
  
  /**
   * Shut down all services in the container
   * 
   * @returns Promise that resolves when all services are shut down
   */
  shutdown(): Promise<void>;
  
  /**
   * Get an instance of a registered service by its type
   * 
   * @param serviceType The service type identifier
   * @returns An instance of the requested service
   * @throws Error if the service is not registered
   */
  resolve<T>(serviceType: string): T;
  
  /**
   * Register a factory function for creating a service implementation
   * 
   * @param serviceType The service type identifier
   * @param factory Factory function that will create the implementation
   * @param singleton Whether this service should be treated as a singleton (default: true)
   */
  registerFactory<T>(serviceType: string, factory: () => T, singleton?: boolean): void;
}

/**
 * Parameter handler service for transforming and normalizing URL parameters
 */
export interface ParameterHandlerService {
  /**
   * Process parameters from a request
   * 
   * @param request The request to process
   * @returns Promise with normalized parameters for image transformation
   */
  handleRequest(request: Request): Promise<Record<string, any>>;
}

/**
 * Dependency Injection container with registration and resolution capabilities
 */
/**
 * Authentication service for handling protected resources
 */
export interface AuthService {
  /**
   * Set the logger for the auth service
   * 
   * @param configuredLogger The logger to use
   */
  setLogger(configuredLogger: Logger): void;

  /**
   * Find origin configuration for a given path
   * 
   * @param path URL path to check
   * @param config Image resizer configuration
   * @param env Environment variables
   * @returns Origin context with environment or null if no match
   */
  findOriginForPath(
    path: string, 
    config: ImageResizerConfig, 
    env: Record<string, unknown>
  ): OriginContext | null;

  /**
   * Get default auth result when no authentication is needed
   * 
   * @param url URL to authenticate
   * @returns Authentication result with success status
   */
  getDefaultAuthResult(url: string): AuthResult;

  /**
   * Authenticate a request to a protected origin
   * 
   * @param url URL to authenticate
   * @param config Authentication configuration
   * @param env Environment variables
   * @returns Authentication result with success status, URL and headers
   */
  authenticateRequest(
    url: string, 
    config: ImageResizerConfig,
    env: Record<string, unknown>
  ): Promise<AuthResult>;
}

/**
 * Authentication result data
 */
export interface AuthResult {
  success: boolean;
  url: string;
  headers?: Record<string, string>;
  error?: string;
}

/**
 * Origin context for authentication
 */
export interface OriginContext {
  originId: string;
  origin: OriginConfig;
  env: Record<string, unknown>;
}

/**
 * Origin configuration for authentication
 */
export interface OriginConfig {
  domain: string;
  type: 'bearer' | 'header' | 'query' | 'aws-s3' | 'basic';
  tokenSecret?: string;
  tokenHeaderName?: string;
  tokenParam?: string;
  tokenExpiration?: number;
  region?: string;
  service?: string;
  accessKeyEnvVar?: string;
  secretKeyEnvVar?: string;
  accessKeyVar?: string;
  secretKeyVar?: string;
  headers?: Record<string, string>;
  signedUrlExpiration?: number;
  hashAlgorithm?: string;
}

export interface DIContainer {
  /**
   * Register a service implementation for a given interface
   * 
   * @param serviceType The service type identifier
   * @param implementation The concrete implementation
   * @param singleton Whether this service should be treated as a singleton (default: true)
   */
  register<T>(serviceType: string, implementation: T, singleton?: boolean): void;
  
  /**
   * Register a factory function for creating a service implementation
   * 
   * @param serviceType The service type identifier
   * @param factory Factory function that will create the implementation
   * @param singleton Whether this service should be treated as a singleton (default: true)
   */
  registerFactory<T>(serviceType: string, factory: () => T, singleton?: boolean): void;
  
  /**
   * Get an instance of a registered service by its type
   * 
   * @param serviceType The service type identifier
   * @returns An instance of the requested service
   * @throws Error if the service is not registered
   */
  resolve<T>(serviceType: string): T;
  
  /**
   * Check if a service type is registered
   * 
   * @param serviceType The service type identifier
   * @returns True if the service is registered
   */
  isRegistered(serviceType: string): boolean;
  
  /**
   * Create the standard service container interface from the DI container
   * 
   * @returns A ServiceContainer instance with all standard services
   */
  createServiceContainer(): ServiceContainer;
  
  /**
   * Create a child container that inherits registrations from the parent
   * 
   * @returns A new DIContainer instance
   */
  createChildContainer(): DIContainer;
}

/**
 * Represents the health status of a service
 */
export interface ServiceHealth {
  serviceName: string;
  status: 'initializing' | 'initialized' | 'failed' | 'shutting_down' | 'shutdown' | 'unknown';
  startTime?: number;
  endTime?: number;
  durationMs?: number;
  error?: Error;
  message?: string;
  dependencies?: string[];
}

/**
 * Contains lifecycle statistics and metrics for all services
 */
export interface LifecycleStatistics {
  applicationStartTime: number;
  applicationEndTime?: number;
  totalInitializationTimeMs?: number;
  totalShutdownTimeMs?: number;
  serviceHealths: Record<string, ServiceHealth>;
  initializeOrder: string[];
  shutdownOrder: string[];
  services: {
    total: number;
    initialized: number;
    failed: number;
    shutdown: number;
  };
  errors: Array<{
    serviceName: string;
    phase: 'initialize' | 'shutdown';
    error: Error;
    message: string;
  }>;
}

/**
 * Lifecycle manager service for coordinating service initialization and shutdown
 */
export interface LifecycleManagerService {
  /**
   * Initialize all services in dependency-based order
   * 
   * @param options Optional initialization options
   * @returns Promise that resolves when initialization is complete
   */
  initialize(options?: { 
    gracefulDegradation?: boolean; 
    timeout?: number;
    critical?: string[];
  }): Promise<LifecycleStatistics>;
  
  /**
   * Shut down all services in reverse dependency order
   * 
   * @param options Optional shutdown options
   * @returns Promise that resolves when shutdown is complete
   */
  shutdown(options?: {
    force?: boolean;
    timeout?: number;
  }): Promise<LifecycleStatistics>;
  
  /**
   * Create a dependency graph visualization for service initialization
   * 
   * @returns A string representation of the dependency graph
   */
  createDependencyGraph(): string;
  
  /**
   * Get current health status of all services
   * 
   * @returns Service health statistics
   */
  getServiceHealths(): Record<string, ServiceHealth>;
  
  /**
   * Get detailed lifecycle statistics
   * 
   * @returns Lifecycle statistics
   */
  getStatistics(): LifecycleStatistics;
  
  /**
   * Check if a specific service is healthy
   * 
   * @param serviceName The name of the service to check
   * @returns True if the service is in a healthy state
   */
  isServiceHealthy(serviceName: string): boolean;
  
  /**
   * Check if the application as a whole is healthy
   * 
   * @param criticalServices Array of service names that must be healthy
   * @returns True if all critical services are healthy
   */
  isApplicationHealthy(criticalServices?: string[]): boolean;
  
  /**
   * Create a health report for services
   * 
   * @returns A formatted health report string
   */
  createHealthReport(): string;
}
