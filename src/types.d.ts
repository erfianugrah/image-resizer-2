interface Env {
  // Environment variables
  ENVIRONMENT?: string;
  DEBUG?: string;
  
  // Storage settings
  REMOTE_URL?: string;
  FALLBACK_URL?: string;
  STORAGE_PRIORITY?: string;
  
  // Cache tag settings
  CACHE_TAGS_ENABLED?: string;
  CACHE_TAGS_PREFIX?: string;
  CACHE_TAGS_CUSTOM?: string;
  CACHE_TAGS_PARSE_METADATA?: string;
  
  // Cache settings
  CACHE_METHOD?: string;
  CACHE_EVERYTHING?: string;
  CACHE_USE_TTL_BY_STATUS?: string;
  CACHE_TTL_OK?: string;
  CACHE_TTL_CLIENT_ERROR?: string;
  CACHE_TTL_SERVER_ERROR?: string;
  CACHE_TTL_REMOTE_FETCH?: string;
  CACHE_TTL_R2_HEADERS?: string;
  
  // Other environment variables
  ENABLE_AKAMAI_COMPATIBILITY?: string;
  LOGGING_LEVEL?: string;
  LOGGING_STRUCTURED?: string;
  LOGGING_TIMESTAMP?: string;
  LOGGING_BREADCRUMBS_ENABLED?: string;
  LOGGING_USE_PINO?: string;
  
  // Bindings
  IMAGES_BUCKET?: R2Bucket;
  ASSETS?: Fetcher;
}