/**
 * Common type definitions for the Image Resizer
 */

// Environment variables
export interface Env {
  // System configuration
  ENVIRONMENT?: string;
  DEBUG?: string;
  
  // Feature flags
  USE_DI_SYSTEM?: string;
  ENABLE_LAZY_LOADING?: string;
  
  // Storage configuration
  REMOTE_URL?: string;
  FALLBACK_URL?: string;
  STORAGE_PRIORITY?: string;
  
  // Akamai compatibility
  ENABLE_AKAMAI_COMPATIBILITY?: string;
  ENABLE_AKAMAI_ADVANCED_FEATURES?: string;
  LOGGING_LEVEL?: string;
  LOGGING_STRUCTURED?: string;
  LOGGING_TIMESTAMP?: string;
  LOGGING_BREADCRUMBS_ENABLED?: string;
  LOGGING_USE_PINO?: string;
  LOGGING_PRETTY_PRINT?: string;
  LOGGING_COLORIZE?: string;
  CACHE_TAGS_ENABLED?: string;
  CACHE_TAGS_PREFIX?: string;
  CACHE_TAGS_CUSTOM?: string;
  CACHE_TAGS_PARSE_METADATA?: string;
  CACHE_TTL_OK?: string;
  CACHE_TTL_CLIENT_ERROR?: string;
  CACHE_TTL_SERVER_ERROR?: string;
  CACHE_TTL_REMOTE_FETCH?: string;
  CACHE_TTL_R2_HEADERS?: string;
  CACHE_METHOD?: string;
  CACHE_EVERYTHING?: string;
  CACHE_USE_TTL_BY_STATUS?: string;
  CACHE_STATUS_SUCCESS_RANGE?: string;
  CACHE_STATUS_REDIRECT_RANGE?: string;
  CACHE_STATUS_NOTFOUND_RANGE?: string;
  CACHE_STATUS_ERROR_RANGE?: string;
  CACHE_TTL_STATUS_SUCCESS?: string;
  CACHE_TTL_STATUS_REDIRECT?: string;
  CACHE_TTL_STATUS_NOTFOUND?: string;
  CACHE_TTL_STATUS_ERROR?: string;
  FORMAT_QUALITY_WEBP?: string;
  FORMAT_QUALITY_AVIF?: string;
  FORMAT_QUALITY_JPEG?: string;
  FORMAT_QUALITY_PNG?: string;
  DEFAULT_QUALITY?: string;
  DEFAULT_FIT?: string;
  USER_AGENT?: string;
  PATH_TRANSFORMS?: string | any; // Could be string or object
  
  // Global Auth settings
  AUTH_ENABLED?: string;
  AUTH_SECURITY_LEVEL?: string;
  AUTH_CACHE_TTL?: string;
  AUTH_USE_ORIGIN_AUTH?: string;
  AUTH_SHARE_PUBLICLY?: string;

  // Remote URL Auth Configuration
  REMOTE_AUTH_ENABLED?: string;
  REMOTE_AUTH_TYPE?: string;
  REMOTE_AUTH_REGION?: string;
  REMOTE_AUTH_SERVICE?: string;
  REMOTE_AUTH_ACCESS_KEY_VAR?: string;
  REMOTE_AUTH_SECRET_KEY_VAR?: string;
  
  // Fallback URL Auth Configuration
  FALLBACK_AUTH_ENABLED?: string;
  FALLBACK_AUTH_TYPE?: string;
  FALLBACK_AUTH_REGION?: string;
  FALLBACK_AUTH_SERVICE?: string;
  FALLBACK_AUTH_ACCESS_KEY_VAR?: string;
  FALLBACK_AUTH_SECRET_KEY_VAR?: string;
  FALLBACK_AUTH_TOKEN_HEADER?: string;
  
  // Detector Cascade Configuration
  DETECTOR_CASCADE_FORMAT_ENABLED?: string;
  DETECTOR_CASCADE_FORMAT_ACCEPT_PRIORITY?: string;
  DETECTOR_CASCADE_FORMAT_CLIENT_HINTS_PRIORITY?: string;
  DETECTOR_CASCADE_FORMAT_BROWSER_PRIORITY?: string;
  DETECTOR_CASCADE_FORMAT_FALLBACK?: string;
  
  DETECTOR_CASCADE_QUALITY_ENABLED?: string;
  DETECTOR_CASCADE_QUALITY_SAVEDATA_PRIORITY?: string;
  DETECTOR_CASCADE_QUALITY_NETWORK_PRIORITY?: string;
  DETECTOR_CASCADE_QUALITY_DEVICE_PRIORITY?: string;
  DETECTOR_CASCADE_QUALITY_DPR_ADJUSTMENT?: string;
  DETECTOR_CASCADE_QUALITY_MEMORY_HIGH?: string;
  DETECTOR_CASCADE_QUALITY_MEMORY_LOW?: string;
  DETECTOR_CASCADE_QUALITY_PROCESSORS_HIGH?: string;
  DETECTOR_CASCADE_QUALITY_PROCESSORS_LOW?: string;
  DETECTOR_CASCADE_QUALITY_SLOW_NETWORK_FACTOR?: string;
  DETECTOR_CASCADE_QUALITY_FAST_NETWORK_FACTOR?: string;
  DETECTOR_CASCADE_QUALITY_DPR_FACTOR?: string;
  
  // Domain-based auth settings
  AUTH_DOMAIN_SECURE?: string;
  AUTH_DOMAIN_BASIC?: string;
  AUTH_DOMAIN_API?: string;
  AUTH_DOMAIN_SIGNED?: string;
  
  // Auth type by origin
  AUTH_TYPE_SECURE?: string;
  AUTH_TYPE_BASIC?: string;
  AUTH_TYPE_API?: string;
  AUTH_TYPE_SIGNED?: string;
  
  // Auth params
  AUTH_TOKEN_HEADER_NAME?: string;
  AUTH_TOKEN_PARAM_NAME?: string;
  AUTH_TOKEN_EXPIRATION?: string;
  AUTH_SIGNED_EXPIRATION?: string;
  
  // AWS credentials for S3 auth
  AWS_ACCESS_KEY_ID?: string;
  AWS_SECRET_ACCESS_KEY?: string;
  FALLBACK_AWS_ACCESS_KEY?: string;
  FALLBACK_AWS_SECRET_KEY?: string;
  
  // Required for compatibility with various service interfaces
  DERIVATIVES?: Record<string, any>; // Changed to 'any' to support nested objects
  FALLBACK_AUTH_CUSTOM_HEADERS?: Record<string, string>;
  
  // Detector Cache Configuration
  DETECTOR_CACHE_MAX_SIZE?: string;
  DETECTOR_CACHE_PRUNE_AMOUNT?: string;
  DETECTOR_CACHE_ENABLE?: string;
  DETECTOR_CACHE_TTL?: string;
  
  // Detector Strategy Configuration
  DETECTOR_STRATEGY_CLIENT_HINTS_PRIORITY?: string;
  DETECTOR_STRATEGY_CLIENT_HINTS_ENABLED?: string;
  DETECTOR_STRATEGY_ACCEPT_HEADER_PRIORITY?: string;
  DETECTOR_STRATEGY_ACCEPT_HEADER_ENABLED?: string;
  DETECTOR_STRATEGY_USER_AGENT_PRIORITY?: string;
  DETECTOR_STRATEGY_USER_AGENT_ENABLED?: string;
  DETECTOR_STRATEGY_USER_AGENT_MAX_LENGTH?: string;
  DETECTOR_STRATEGY_STATIC_DATA_PRIORITY?: string;
  DETECTOR_STRATEGY_STATIC_DATA_ENABLED?: string;
  DETECTOR_STRATEGY_DEFAULTS_PRIORITY?: string;
  DETECTOR_STRATEGY_DEFAULTS_ENABLED?: string;
  
  // Detector Performance Budget Configuration
  DETECTOR_QUALITY_LOW_MIN?: string;
  DETECTOR_QUALITY_LOW_MAX?: string;
  DETECTOR_QUALITY_LOW_TARGET?: string;
  DETECTOR_QUALITY_MEDIUM_MIN?: string;
  DETECTOR_QUALITY_MEDIUM_MAX?: string;
  DETECTOR_QUALITY_MEDIUM_TARGET?: string;
  DETECTOR_QUALITY_HIGH_MIN?: string;
  DETECTOR_QUALITY_HIGH_MAX?: string;
  DETECTOR_QUALITY_HIGH_TARGET?: string;
  
  // Detector Dimensions Configuration
  DETECTOR_DIMENSIONS_WIDTH_LOW?: string;
  DETECTOR_DIMENSIONS_WIDTH_MEDIUM?: string;
  DETECTOR_DIMENSIONS_WIDTH_HIGH?: string;
  DETECTOR_DIMENSIONS_HEIGHT_LOW?: string;
  DETECTOR_DIMENSIONS_HEIGHT_MEDIUM?: string;
  DETECTOR_DIMENSIONS_HEIGHT_HIGH?: string;
  
  // Detector Format Configuration
  DETECTOR_FORMATS_LOW?: string;
  DETECTOR_FORMATS_MEDIUM?: string;
  DETECTOR_FORMATS_HIGH?: string;
  
  // Detector Device Classification
  DETECTOR_THRESHOLD_LOW_END?: string;
  DETECTOR_THRESHOLD_HIGH_END?: string;
  DETECTOR_PLATFORM_IOS?: string;
  DETECTOR_PLATFORM_MACOS?: string;
  DETECTOR_PLATFORM_WINDOWS?: string;
  DETECTOR_PLATFORM_ANDROID?: string;
  DETECTOR_PLATFORM_LINUX?: string;
  DETECTOR_PLATFORM_CHROME_OS?: string;
  
  // Detector Core Configuration
  DETECTOR_HASH_ALGORITHM?: string;
  DETECTOR_LOG_LEVEL?: string;
  
  // Cloudflare bindings
  IMAGES_BUCKET?: R2Bucket;
  ASSETS?: Fetcher;
  KV_TEST?: KVNamespace;
  IMAGE_METADATA_CACHE?: KVNamespace; // KV for metadata caching
  IMAGE_TRANSFORMATIONS_CACHE?: KVNamespace; // KV for transform caching
  
  // Transform Cache Configuration - adding these explicitly
  TRANSFORM_CACHE_ENABLED?: string;
  TRANSFORM_CACHE_BINDING?: string;
  TRANSFORM_CACHE_PREFIX?: string;
  TRANSFORM_CACHE_MAX_SIZE?: string;
  TRANSFORM_CACHE_DEFAULT_TTL?: string;
  TRANSFORM_CACHE_INDEXING_ENABLED?: string;
  TRANSFORM_CACHE_BACKGROUND_INDEXING?: string;
  TRANSFORM_CACHE_PURGE_DELAY?: string;
  TRANSFORM_CACHE_OPTIMIZED_INDEXING?: string;
  TRANSFORM_CACHE_SMALL_PURGE_THRESHOLD?: string;
  TRANSFORM_CACHE_INDEX_FREQUENCY?: string;
  TRANSFORM_CACHE_SKIP_SMALL_FILES?: string;
  TRANSFORM_CACHE_SMALL_FILE_SIZE?: string;
  TRANSFORM_CACHE_USE_SIMPLE_IMPLEMENTATION?: string;
  TRANSFORM_CACHE_RESPECT_CLIENT_CACHE_CONTROL?: string;
  TRANSFORM_CACHE_USE_WAITUNTIL?: string;
}

// Cloudflare Workers types
declare global {
  interface R2Bucket {}
  
  // Define only if it doesn't exist already
  interface WorkersFetcher extends Fetcher {}
  
  interface KVNamespace {}
}

export {};