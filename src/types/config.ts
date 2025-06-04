/**
 * Canonical Configuration Types
 * 
 * This module provides the core type definitions for the configuration system,
 * serving as the single source of truth for configuration structure.
 */

import { PathTransforms } from '../utils/path';

// Define interfaces for cache tag configuration
export interface CacheTagsPathNormalization {
  leadingSlashPattern?: string;
  invalidCharsPattern?: string;
  replacementChar?: string;
}

export interface MetadataHeadersConfig {
  enabled: boolean;
  headerPrefixes: string[];
  excludeHeaders: string[];
  includeContentType: boolean;
  includeCacheControl: boolean;
}

export interface CacheTagsConfig {
  enabled: boolean;
  prefix?: string;
  includeImageDimensions: boolean;
  includeFormat: boolean;
  includeQuality: boolean;
  includeDerivative: boolean;
  customTags?: string[];
  pathBasedTags?: Record<string, string[]>;
  parseMetadataHeaders?: MetadataHeadersConfig;
  pathNormalization?: CacheTagsPathNormalization;
  maxTags?: number;
  simplifiedTags?: boolean;
}

/**
 * Cache tier configuration for tiered caching strategy
 */
export interface CacheTierConfig {
  name: string;
  ttlMultiplier: number;
  priority: number;
  contentTypes?: string[];
  pathPatterns?: string[];
  minSize?: number;
  maxSize?: number;
  frequentlyAccessed?: boolean;
}

/**
 * Configuration for the Client Detector framework
 */
export interface DetectorConfig {
  cache: {
    maxSize: number;       // Maximum cache entries
    pruneAmount: number;   // How many to prune when limit reached
    enableCache: boolean;  // Allow disabling cache entirely
    ttl?: number;          // Optional TTL in milliseconds
  };
  strategies: {
    clientHints: {
      priority: number;
      enabled: boolean;
    };
    acceptHeader: {
      priority: number;
      enabled: boolean;
    };
    userAgent: {
      priority: number;
      enabled: boolean;
      maxUALength: number; // Max user agent length to process
    };
    staticData: {
      priority: number;
      enabled: boolean;
    };
    defaults: {
      priority: number;
      enabled: boolean;
    };
  };
  performanceBudget: {
    quality: {
      low: {
        min: number;
        max: number;
        target: number;
      };
      medium: {
        min: number;
        max: number;
        target: number;
      };
      high: {
        min: number;
        max: number;
        target: number;
      };
    };
    dimensions: {
      maxWidth: {
        low: number;
        medium: number;
        high: number;
      };
      maxHeight: {
        low: number;
        medium: number;
        high: number;
      };
    };
    preferredFormats: {
      low: string[];    // Ordered list of formats for low-end
      medium: string[]; // Ordered list of formats for medium
      high: string[];   // Ordered list of formats for high-end
    };
  };
  
  // Format selection cascade
  cascade?: {
    format: {
      enabled: boolean;           // Enable format cascade
      acceptHeaderPriority: number;  // Priority for Accept header detection
      clientHintsPriority: number;   // Priority for client hints detection
      browserDetectionPriority: number; // Priority for browser detection
      fallbackFormat: string;     // Default format when no detection works
    };
    // Quality selection cascade
    quality: {
      enabled: boolean;           // Enable quality cascade 
      saveDataPriority: number;   // Priority for Save-Data header
      networkConditionPriority: number; // Priority for network conditions
      deviceCapabilityPriority: number; // Priority for device capabilities
      dprAdjustmentEnabled: boolean; // Enable DPR-based quality adjustment
      deviceMemoryThresholds: {
        high: number;             // Memory threshold for high quality (in GB)
        low: number;              // Memory threshold for low quality (in GB)
      };
      processorThresholds: {
        high: number;             // CPU cores threshold for high quality
        low: number;              // CPU cores threshold for low quality
      };
      adjustmentFactors: {
        slowNetwork: number;      // Quality adjustment factor for slow networks
        fastNetwork: number;      // Quality adjustment factor for fast networks
        dprAdjustment: number;    // Quality adjustment per DPR point above 1
      };
    };
  };
  deviceClassification: {
    thresholds: {
      lowEnd: number;   // Score below this is low-end
      highEnd: number;  // Score above this is high-end
    };
    platformScores?: {
      [platform: string]: number; // Base score for platforms (deprecated, using client hints instead)
    };
  };
  hashAlgorithm: 'simple' | 'fnv1a' | 'md5';  // Configurable hash algorithm
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

/**
 * KV Transform Cache configuration
 */
export interface TransformCacheConfig {
  enabled: boolean;
  binding?: string;         // KV namespace binding name (defaults to IMAGE_TRANSFORMATIONS_CACHE)
  prefix?: string;          // Key prefix (defaults to "transform")
  maxSize?: number;         // Maximum size to cache in bytes (defaults to 10MB)
  defaultTtl?: number;      // Default TTL in seconds (defaults to 86400 - 1 day)
  contentTypeTtls?: Record<string, number>; // TTLs by content type
  indexingEnabled?: boolean; // Enable secondary indices (defaults to true)
  backgroundIndexing?: boolean; // Update indices in background (defaults to true)
  purgeDelay?: number;      // Delay between purge operations (defaults to 100ms)
  disallowedPaths?: string[]; // Paths not to cache
  // Advanced optimizations
  optimizedIndexing?: boolean; // Use minimal indices for better performance
  smallPurgeThreshold?: number; // Maximum items for list+filter instead of indices
  indexUpdateFrequency?: number; // How often to update indices
  skipIndicesForSmallFiles?: boolean; // Skip indexing for small files
  smallFileThreshold?: number; // Size threshold for "small" files in bytes
  // Simplified implementation
  useSimpleImplementation?: boolean; // Use simplified KV transform cache implementation with metadata filtering
}

/**
 * Cache configuration
 */
export interface CacheConfig {
  method: 'cf' | 'cache-api' | 'none';
  ttl: {
    ok: number;           // TTL for successful responses (200-299)
    clientError: number;  // TTL for client error responses (400-499)
    serverError: number;  // TTL for server error responses (500-599)
    remoteFetch?: number; // TTL for remote fetch requests
    r2Headers?: number;   // TTL for R2 headers
  };
  cacheEverything?: boolean; // Whether to cache all content types
  useTtlByStatus?: boolean;  // When true: use cacheTtlByStatus, when false: use ttl.ok for cacheTtl
  statusRanges?: {           // Status code ranges for cacheTtlByStatus
    success: string;         // Success status range (default: "200-299")
    redirect: string;        // Redirect status range (default: "301-302")
    notFound: string;        // Not found status code (default: "404")
    serverError: string;     // Server error range (default: "500-599")
  };
  cacheTtlByStatus?: {
    [key: string]: number;   // Maps status code ranges (e.g. "200-299") to TTL values
  };
  cacheability: boolean;
  bypassParams?: string[];   // Query parameters that trigger cache bypass
  cacheTags?: CacheTagsConfig;
  transformCache?: TransformCacheConfig;
  enableStaleWhileRevalidate?: boolean;  // Enable stale-while-revalidate caching pattern
  staleWhileRevalidatePercentage?: number; // Percentage of main TTL to use for stale time (default: 50)
  enableBackgroundCaching?: boolean; // Enable non-blocking background caching
  minTtl?: number;  // Minimum TTL in seconds for any cached resource
  maxTtl?: number;  // Maximum TTL in seconds for any cached resource
  pathBasedTtl?: Record<string, number>; // Map of path patterns to specific TTLs
  // Define pathPatterns format to match what's used in PathPatternTTLCalculator
  pathPatterns?: Array<{
    name: string;         // Pattern name for identification
    matcher: string;      // Regular expression pattern as string
    ttl: {                // TTL configuration for matched paths
      ok: number;         // TTL for successful responses (2xx)
      redirects?: number; // TTL for redirects (3xx)
      clientError?: number; // TTL for client errors (4xx)
      serverError?: number; // TTL for server errors (5xx)
    };
    priority?: number;    // Pattern priority (higher numbers take precedence) 
    description?: string; // Optional description for documentation
    tags?: string[];      // Optional tags for cache tagging
  }>; // Path patterns with TTL and optional tags
  derivativeTTLs?: Record<string, number>; // TTLs for specific derivatives
  immutableContent?: {
    enabled: boolean;
    contentTypes?: string[];     // Content types that should be considered immutable
    paths?: string[];            // Path patterns that should be considered immutable
    derivatives?: string[];      // Derivatives that should be considered immutable
  };
  bypassPaths?: string[];        // Path patterns that should always bypass cache
  bypassInDevelopment?: boolean; // Always bypass cache in development environment
  bypassForAdmin?: boolean;      // Bypass cache for admin users (based on headers)
  bypassFormats?: string[];      // Image formats that should bypass cache (e.g., beta formats)
  versionBypass?: boolean;       // Support ?v=timestamp for versioned caching
  cdnDirectives?: {
    enabled: boolean;
    noTransform?: boolean;        // Add no-transform directive to prevent CDN modification
    staleIfError?: boolean;       // Add stale-if-error directive for high availability
    staleIfErrorTime?: number;    // TTL for stale-if-error directive
  };
  varyOnClientHints?: boolean;   // Add Vary headers for client hints
  varyOnUserAgent?: boolean;     // Add Vary: User-Agent header
  varyOnSaveData?: boolean;      // Add Vary: Save-Data header
  useMultipleCacheTagHeaders?: boolean; // Use multiple cache tag header formats (Cache-Tag, Cloudflare-CDN-Cache-Control)
  enableResourceHints?: boolean;
  resourceHints?: {
    preconnect?: string[];       // Domains to add preconnect hints for
    preloadPatterns?: Record<string, string[]>; // Path patterns to resource mappings
  };
  enableCacheMetrics?: boolean;  // Enable cache metrics collection
  tiers?: CacheTierConfig[];
  bypassThreshold?: number; // Score threshold for cache bypass decisions (0-100)
  maxAccessPatterns?: number; // Maximum number of access patterns to track
  retry?: {
    maxAttempts?: number;       // Maximum number of retry attempts (default: 3)
    initialDelayMs?: number;    // Initial delay before retry in milliseconds (default: 200)
    maxDelayMs?: number;        // Maximum retry delay in milliseconds (default: 2000)
    backoffFactor?: number;     // Exponential backoff factor (default: 2)
    jitterFactor?: number;      // Random jitter factor for delay (0-1, default: 0.1)
  };
  circuitBreaker?: {
    failureThreshold?: number;  // Number of failures before opening circuit (default: 5)
    resetTimeoutMs?: number;    // Time before attempting reset in milliseconds (default: 30000)
    successThreshold?: number;  // Consecutive successes needed to close circuit (default: 2)
  };
}

/**
 * Responsive image configuration
 */
export interface ResponsiveConfig {
  breakpoints: number[];
  deviceWidths: Record<string, number>;
  quality: number;
  fit: 'scale-down' | 'contain' | 'cover' | 'crop' | 'pad';
  format: string;
  metadata: 'keep' | 'copyright' | 'none';
  formatQuality?: {
    [format: string]: number; // Format-specific quality settings
  };
  deviceDetection?: {
    mobileRegex?: string;
    tabletRegex?: string;
  };
  supportedFormats?: string[];
}

/**
 * Metadata processing configuration
 */
export interface MetadataConfig {
  enabled: boolean;                         // Enable metadata processing features
  cacheTtl?: number;                        // TTL for cached metadata (seconds)
  allowClientSpecifiedTargets?: boolean;    // Allow clients to specify target aspect ratios
  platformPresets?: Record<string, {        // Platform-specific presets
    aspectRatio: { width: number, height: number },
    focalPoint?: { x: number, y: number },
    dimensions?: { width?: number, height?: number },
    format?: string,
    quality?: number
  }>;
  contentTypePresets?: Record<string, {     // Content-type specific presets
    focalPoint: { x: number, y: number }
  }>;
  defaultQuality?: number;                  // Default quality setting
  maxCacheItems?: number;                   // Maximum number of items to store in memory cache
  headerNames?: {                           // Custom header names
    targetPlatform?: string,                // Header name for specifying target platform
    targetAspect?: string,                  // Header name for specifying target aspect ratio
    contentType?: string,                   // Header name for specifying content type
    focalPoint?: string                     // Header name for specifying focal point
  };
}

/**
 * Storage auth configuration
 */
export interface StorageAuthConfig {
  useOriginAuth?: boolean;       // When true, use Cloudflare's origin-auth feature
  sharePublicly?: boolean;       // When true, set origin-auth to "share-publicly"
  securityLevel?: 'strict' | 'permissive'; // How to handle auth errors
  cacheTtl?: number;              // TTL for authenticated requests
  origins?: Record<string, {
    domain: string;
    type: 'bearer' | 'basic' | 'header' | 'query' | 'aws-s3';
    enabled?: boolean;             // Each origin can be individually enabled/disabled
    tokenHeaderName?: string;       // For bearer type
    tokenParam?: string;            // For query type
    tokenExpiration?: number;       // For bearer & query types
    signedUrlExpiration?: number;   // For query type
    headers?: Record<string, string>; // For header type
    region?: string;                // For AWS S3/GCS auth
    service?: string;               // For AWS S3/GCS auth
    accessKeyEnvVar?: string;       // For AWS S3/GCS auth
    secretKeyEnvVar?: string;       // For AWS S3/GCS auth
  }>;
}

/**
 * Remote auth configuration
 */
export interface RemoteAuthConfig {
  enabled: boolean;
  type: 'aws-s3' | 'bearer' | 'header' | 'query';
  region?: string;                // For AWS_S3 type
  service?: string;               // For AWS_S3 type
  accessKeyVar?: string;          // Name of env var with access key
  secretKeyVar?: string;          // Name of env var with secret key
  signedUrlExpiration?: number;   // For query type
  tokenHeaderName?: string;       // For bearer type
  tokenSecret?: string;           // For bearer type
  headers?: Record<string, string>; // For header type
}

/**
 * Path-based origin configuration
 */
export interface PathBasedOrigin {
  pattern: string | RegExp;               // Path pattern to match (string pattern or regex)
  priority: ('r2' | 'remote' | 'fallback')[];  // Storage priority for this path pattern
  remoteUrl?: string;                     // Remote URL specific to this path
  fallbackUrl?: string;                   // Fallback URL specific to this path
  r2?: {                                  // R2 settings specific to this path
    enabled: boolean;
    bindingName: string;                  // Can be different than global binding
  };
  auth?: {                                // Auth settings specific to this path
    useOriginAuth?: boolean;
    sharePublicly?: boolean;
    securityLevel?: 'strict' | 'permissive';
  };
  remoteAuth?: RemoteAuthConfig;          // Remote auth settings specific to this path
  fallbackAuth?: RemoteAuthConfig;        // Fallback auth settings specific to this path
  pathTransforms?: PathTransforms;        // Path-specific path transforms
  fetchOptions?: {                        // Path-specific fetch options
    userAgent?: string;
    headers?: Record<string, string>;
  };
}

/**
 * Storage configuration
 */
export interface StorageConfig {
  priority: ('r2' | 'remote' | 'fallback')[];
  pathBasedOrigins?: Record<string, PathBasedOrigin>;
  remoteUrl?: string;
  remoteAuth?: RemoteAuthConfig;
  fallbackUrl?: string;
  fallbackAuth?: RemoteAuthConfig;
  r2: {
    enabled: boolean;
    bindingName: string;
  };
  // Support for nested structure from storage module
  remote?: {
    url?: string;
    auth?: RemoteAuthConfig;
    fetchOptions?: {
      userAgent?: string;
      headers?: Record<string, string>;
    };
  };
  fallback?: {
    url?: string;
    auth?: RemoteAuthConfig;
    fetchOptions?: {
      userAgent?: string;
      headers?: Record<string, string>;
    };
  };
  fetchOptions?: {
    userAgent?: string;
    headers?: Record<string, string>;
  };
  auth?: StorageAuthConfig;
  retry?: {
    maxAttempts?: number;       // Maximum number of retry attempts (default: 3)
    initialDelayMs?: number;    // Initial delay before retry in milliseconds (default: 200)
    maxDelayMs?: number;        // Maximum retry delay in milliseconds (default: 2000)
    backoffFactor?: number;     // Exponential backoff factor (default: 2)
    jitterFactor?: number;      // Random jitter factor for delay (0-1, default: 0.1)
  };
  circuitBreaker?: {
    failureThreshold?: number;  // Number of failures before opening circuit (default: 5)
    resetTimeoutMs?: number;    // Time before attempting reset in milliseconds (default: 30000)
    successThreshold?: number;  // Consecutive successes needed to close circuit (default: 2)
  };
}

/**
 * Debug configuration
 */
export interface DebugConfig {
  enabled: boolean;
  headers: string[];
  allowedEnvironments: string[];
  verbose: boolean;
  includePerformance: boolean;
  forceDebugHeaders?: boolean;
  prefix?: string;
  specialHeaders?: Record<string, boolean>;
  headerNames?: {
    debugEnabled?: string;
    version?: string;
    environment?: string;
    processingMode?: string;
    storageType?: string;
    originalContentType?: string;
    originalSize?: string;
    originalUrl?: string;
    clientDpr?: string;
    clientViewport?: string;
    deviceType?: string;
  };
  performanceTracking?: boolean; // Enable performance tracking
}

/**
 * Logging configuration
 */
export interface LoggingConfig {
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  includeTimestamp: boolean;
  enableStructuredLogs: boolean;
  enableBreadcrumbs?: boolean; // Enable breadcrumbs for e2e tracing
  enableCacheMetrics?: boolean; // Enable cache hit/miss metrics
  usePino?: boolean; // DEPRECATED: Maintained for backwards compatibility
  useLegacy?: boolean; // Use legacy logger instead of Pino
  prettyPrint?: boolean; // Use pretty printing for Pino logs (development)
  colorize?: boolean; // Colorize Pino logs
}

/**
 * Performance configuration
 */
export interface PerformanceConfig {
  optimizedLogging?: boolean; // Enable optimized logging
  lazyServiceInitialization?: boolean; // Enable lazy service initialization
  parallelStorageOperations?: boolean; // Enable parallel storage operations
  responseOptimization?: boolean; // Enable response optimization
  optimizedClientDetection?: boolean; // Enable optimized client detection with request caching
  optimizedCaching?: boolean; // Enable optimized caching with tiered strategies
  optimizedMetadataFetching?: boolean; // Enable optimized metadata fetching with caching
  baselineEnabled?: boolean; // Enable performance baseline tracking
  maxBaselineSamples?: number; // Maximum samples to store per operation
  reportingEnabled?: boolean; // Enable performance reporting
  timeoutMs?: number; // Timeout for parallel operations
}

/**
 * Features configuration
 */
export interface FeaturesConfig {
  enableAkamaiCompatibility?: boolean;
  enableAkamaiAdvancedFeatures?: boolean;
  [key: string]: boolean | undefined;
}

/**
 * Complete image resizer configuration interface
 */
export interface ImageResizerConfig {
  // Core configuration
  environment: 'development' | 'staging' | 'production';
  version: string;
  
  // Optional debug properties
  _derivativesLoaded?: boolean;
  _derivativesCount?: number;
  
  // Feature flags
  features?: FeaturesConfig;
  
  // Client Detector configuration
  detector?: DetectorConfig;
  
  // Debug settings
  debug: DebugConfig;
  
  // Logging settings
  logging?: LoggingConfig;
  
  // Performance optimization settings
  performance?: PerformanceConfig;
  
  // Cache settings
  cache: CacheConfig;
  
  // Responsive settings
  responsive: ResponsiveConfig;
  
  // Metadata processing settings
  metadata?: MetadataConfig;
  
  // Storage settings
  storage: StorageConfig;
  
  // Template derivatives for common transformations
  derivatives: Record<string, {
    width?: number;
    height?: number;
    quality?: number;
    fit?: string;
    format?: string;
    metadata?: string;
    gravity?: string;
    background?: string;
    [key: string]: any;
  }>;
  
  // Path template mapping
  pathTemplates?: Record<string, string>;
  
  // Path transformations for directory structure normalization
  pathTransforms?: PathTransforms;
}

/**
 * Deep merge utility for configuration objects
 * 
 * @param target The target object to merge into
 * @param source The source object to merge from
 * @returns A new object with properties from both target and source
 */
export function deepMerge<T>(target: T, source: Partial<T>): T {
  // If source is null or undefined, return target
  if (source === null || source === undefined) {
    return target;
  }
  
  // Create a copy of the target
  const result = { ...target };
  
  // If both are not objects, return source
  if (typeof target !== 'object' || typeof source !== 'object' ||
      target === null || Array.isArray(target) !== Array.isArray(source)) {
    return source as T;
  }
  
  // Handle arrays specially
  if (Array.isArray(target) && Array.isArray(source)) {
    // For arrays, we'll take all unique items from both arrays
    const combined = [...target, ...source].filter((item, index, self) => {
      // For primitive items, remove duplicates
      if (typeof item !== 'object' || item === null) {
        return self.findIndex(i => i === item) === index;
      }
      // For object items, we'll keep them all as we can't easily detect duplicates
      return true;
    });
    return combined as unknown as T;
  }
  
  // Process all keys from source object
  Object.keys(source).forEach(key => {
    const sourceValue = source[key as keyof typeof source];
    
    // Skip undefined values to avoid overriding with undefined
    if (sourceValue === undefined) {
      return;
    }
    
    // Get the target value if it exists
    const targetValue = target ? target[key as keyof typeof target] : undefined;
    
    // Process based on value types
    if (sourceValue === null) {
      // Null explicitly overrides any existing value
      result[key as keyof typeof result] = null as any;
    } else if (
      typeof sourceValue === 'object' && 
      typeof targetValue === 'object' &&
      targetValue !== null &&
      sourceValue !== null &&
      !Array.isArray(sourceValue) === !Array.isArray(targetValue)
    ) {
      // If both are objects of the same type (array or non-array), merge recursively
      result[key as keyof typeof result] = deepMerge(
        targetValue,
        sourceValue as any
      ) as any;
    } else {
      // Otherwise override the target value
      result[key as keyof typeof result] = sourceValue as any;
    }
  });
  
  return result;
}