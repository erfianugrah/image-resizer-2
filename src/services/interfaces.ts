/**
 * Service interfaces for Image Resizer
 * 
 * This file contains the interfaces for all services used in the application.
 * These interfaces define the contracts that implementations must follow.
 */

import { ImageResizerConfig } from '../config';
import { Logger } from '../utils/logging';

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
  _conditions?: any[]; // For conditional transformations (internal use)
  _customEffects?: any[]; // For custom effects (internal use)
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
  metadata?: Record<string, any>;
  originalUrl?: string;
  error?: Error;
  path?: string;
  width?: number;
  height?: number;
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
   * @returns Storage result with the image data
   */
  fetchImage(
    imagePath: string, 
    config: ImageResizerConfig, 
    env: Env, 
    request: Request
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
    config: ImageResizerConfig
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
}

/**
 * Cache service for managing caching operations
 */
export interface CacheService {
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
export interface ConfigurationService {
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
  ): Record<string, unknown>;
  
  /**
   * Apply transformations to an image path
   * 
   * @param imagePath The image path to transform
   * @param config Application configuration
   * @returns Transformed path
   */
  applyTransformations(
    imagePath: string,
    config?: any
  ): string;
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
   * Get quick result for when auth is disabled
   * 
   * @param url URL to authenticate
   * @returns Authentication result with success status
   */
  getNoAuthResult(url: string): AuthResult;

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