/**
 * Common type definitions for the Image Resizer
 */

// Environment variables
export interface Env {
  ENVIRONMENT?: string;
  DEBUG?: string;
  REMOTE_URL?: string;
  FALLBACK_URL?: string;
  STORAGE_PRIORITY?: string;
  ENABLE_AKAMAI_COMPATIBILITY?: string;
  ENABLE_AKAMAI_ADVANCED_FEATURES?: string;
  LOGGING_LEVEL?: string;
  LOGGING_STRUCTURED?: string;
  LOGGING_TIMESTAMP?: string;
  LOGGING_BREADCRUMBS_ENABLED?: string;
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
  
  // Cloudflare bindings
  IMAGES_BUCKET?: R2Bucket;
  ASSETS?: Fetcher;
  KV_TEST?: KVNamespace;
}

// Cloudflare Workers types
declare global {
  interface R2Bucket {}
  
  // Define only if it doesn't exist already
  interface WorkersFetcher extends Fetcher {}
  
  interface KVNamespace {}
}

export {};