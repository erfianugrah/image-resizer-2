/**
 * Configuration management for the image resizer worker
 * 
 * This module provides a simple, unified configuration system with sensible defaults
 * and environment-specific overrides.
 */

// Define the configuration structure with TypeScript types
import { PathTransforms } from './utils/path';

// Define interfaces for cache tag configuration
interface CacheTagsPathNormalization {
  leadingSlashPattern?: string;
  invalidCharsPattern?: string;
  replacementChar?: string;
}

interface MetadataHeadersConfig {
  enabled: boolean;
  headerPrefixes: string[];
  excludeHeaders: string[];
  includeContentType: boolean;
  includeCacheControl: boolean;
}

interface CacheTagsConfig {
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
}

export interface ImageResizerConfig {
  // Core configuration
  environment: 'development' | 'staging' | 'production';
  version: string;
  
  // Feature flags
  features?: {
    enableAkamaiCompatibility?: boolean;
  };
  
  // Debug settings
  debug: {
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
  };
  
  // Logging settings
  logging?: {
    level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
    includeTimestamp: boolean;
    enableStructuredLogs: boolean;
    enableBreadcrumbs?: boolean; // Enable breadcrumbs for e2e tracing
  };
  
  // Cache settings
  cache: {
    method: 'cf' | 'cache-api' | 'none';
    ttl: {
      ok: number;
      clientError: number;
      serverError: number;
      remoteFetch?: number; // TTL for remote fetch requests
      r2Headers?: number;   // TTL for R2 headers
    };
    cacheEverything?: boolean; // Whether to cache all content types
    useTtlByStatus?: boolean;  // Whether to use cacheTtlByStatus instead of cacheTtl
    statusRanges?: {          // Configurable status code ranges
      success: string;        // Success status range (default: "200-299")
      redirect: string;       // Redirect status range (default: "301-302")
      notFound: string;       // Not found status code (default: "404")
      serverError: string;    // Server error range (default: "500-599")
    };
    cacheTtlByStatus?: {
      [key: string]: number; // Maps status code ranges (e.g. "200-299") to TTL values
    };
    cacheability: boolean;
    bypassParams?: string[]; // Query parameters that trigger cache bypass
    cacheTags?: CacheTagsConfig;
  };
  
  // Responsive settings
  responsive: {
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
  };
  
  // Storage settings
  storage: {
    priority: ('r2' | 'remote' | 'fallback')[];
    remoteUrl?: string;
    fallbackUrl?: string;
    r2: {
      enabled: boolean;
      bindingName: string;
    };
    fetchOptions?: {
      userAgent?: string;
      headers?: Record<string, string>;
    };
    // Authenticated origin settings
    auth?: {
      enabled: boolean;
      // Use Cloudflare's origin-auth feature when true
      useOriginAuth?: boolean;       // When true, use Cloudflare's origin-auth feature
      sharePublicly?: boolean;       // When true, set origin-auth to "share-publicly"
      // Original auth implementation
      origins: Record<string, {
        domain: string;
        type: 'bearer' | 'basic' | 'header' | 'query';
        tokenSecret?: string;         // For bearer token generation
        tokenHeaderName?: string;     // Custom header name for bearer tokens
        tokenParam?: string;          // Query parameter name for token auth
        tokenExpiration?: number;     // Token expiration in seconds
        username?: string;            // For basic auth
        password?: string;            // For basic auth
        headers?: Record<string, string>; // Custom headers for header-based auth
        signedUrlExpiration?: number; // Expiration for signed URLs in seconds
        hashAlgorithm?: string;       // Algorithm for signing URLs (default: sha256)
      }>;
      securityLevel?: 'strict' | 'permissive'; // How to handle auth errors
      cacheTtl?: number;              // TTL for authenticated requests
    };
  };
  
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

// Base configuration with sensible defaults
export const defaultConfig: ImageResizerConfig = {
  environment: 'development',
  version: '1.0.0',
  
  features: {
    enableAkamaiCompatibility: false
  },
  
  debug: {
    enabled: true,
    headers: ['ir', 'cache', 'mode', 'client-hints', 'ua', 'device', 'strategy'],
    allowedEnvironments: ['development', 'staging'],
    verbose: true,
    includePerformance: true,
    forceDebugHeaders: false,
    prefix: 'X-',
    specialHeaders: {
      'x-processing-mode': true,
      'x-size-source': true,
      'x-actual-width': true,
      'x-responsive-sizing': true
    },
    headerNames: {
      debugEnabled: 'X-Debug-Enabled',
      version: 'X-Image-Resizer-Version',
      environment: 'X-Environment',
      processingMode: 'X-Processing-Mode',
      storageType: 'X-Storage-Type',
      originalContentType: 'X-Original-Content-Type',
      originalSize: 'X-Original-Size',
      originalUrl: 'X-Original-URL',
      clientDpr: 'X-Client-DPR',
      clientViewport: 'X-Client-Viewport-Width',
      deviceType: 'X-Device-Type'
    }
  },
  
  logging: {
    level: 'DEBUG',
    includeTimestamp: true,
    enableStructuredLogs: true,
    enableBreadcrumbs: true
  },
  
  cache: {
    method: 'cf',
    ttl: {
      ok: 86400, // 24 hours
      clientError: 60, // 1 minute
      serverError: 10, // 10 seconds
      remoteFetch: 3600, // 1 hour
      r2Headers: 86400 // 24 hours
    },
    cacheEverything: true, // Cache all content types by default
    useTtlByStatus: false, // Use single cacheTtl by default
    statusRanges: {
      success: "200-299",
      redirect: "301-302",
      notFound: "404",
      serverError: "500-599"
    },
    cacheTtlByStatus: {
      "200-299": 86400, // 24 hours for success responses
      "301-302": 3600,  // 1 hour for redirects
      "404": 60,        // 1 minute for not found
      "500-599": 10     // 10 seconds for server errors
    },
    cacheability: true,
    bypassParams: ['nocache'],
    cacheTags: {
      enabled: true,
      prefix: 'img-',
      includeImageDimensions: true,
      includeFormat: true,
      includeQuality: true,
      includeDerivative: true,
      // Static custom tags to always include
      customTags: [],
      // Path-based tags for categorization
      pathBasedTags: {},
      // Metadata header parsing for tags
      parseMetadataHeaders: {
        enabled: false,
        headerPrefixes: ['x-meta-', 'x-amz-meta-', 'x-goog-meta-'],
        excludeHeaders: ['credentials', 'token', 'key', 'auth', 'password', 'secret'],
        includeContentType: true,
        includeCacheControl: true
      },
      pathNormalization: {
        leadingSlashPattern: '^/+',
        invalidCharsPattern: '[^a-zA-Z0-9-_/.]',
        replacementChar: '-'
      }
    }
  },
  
  responsive: {
    breakpoints: [320, 640, 768, 1024, 1440, 1920, 2048],
    deviceWidths: {
      mobile: 480,
      tablet: 768,
      desktop: 1440
    },
    quality: 85,
    fit: 'scale-down',
    format: 'auto',
    metadata: 'none',
    formatQuality: {
      'webp': 85,
      'avif': 80,
      'jpeg': 85,
      'png': 90,
      'gif': 85
    },
    deviceDetection: {
      mobileRegex: 'Mobile|Android|iPhone|iPad|iPod',
      tabletRegex: 'iPad|Android(?!.*Mobile)'
    }
  },
  
  storage: {
    priority: ['r2', 'remote', 'fallback'],
    r2: {
      enabled: true,
      bindingName: 'IMAGES_BUCKET'
    },
    fetchOptions: {
      userAgent: 'Cloudflare-Image-Resizer/1.0',
      headers: {
        'Accept': 'image/*'
      }
    },
    auth: {
      enabled: false,
      useOriginAuth: false,
      sharePublicly: false,
      origins: {},
      securityLevel: 'strict',
      cacheTtl: 3600
    }
  },
  
  derivatives: {
    // Common transformation templates
    thumbnail: {
      width: 320,
      height: 150,
      quality: 85,
      fit: 'scale-down',
      metadata: 'none',
      sharpen: 1
    },
    
    avatar: {
      width: 180,
      height: 180,
      quality: 90,
      fit: 'cover',
      metadata: 'none',
      gravity: 'face'
    },
    
    banner: {
      width: 1600,
      height: 400,
      quality: 80,
      fit: 'cover',
      metadata: 'none'
    },
    
    product: {
      width: 800,
      height: 800,
      quality: 85,
      fit: 'contain',
      background: 'white',
      metadata: 'none'
    },
    
    header: {
      width: 1600,
      height: 73,
      quality: 80,
      fit: 'scale-down',
      metadata: 'copyright'
    }
  },
  
  // Path-based template mapping
  pathTemplates: {
    'profile-pictures': 'avatar',
    'hero-banners': 'header',
    'header': 'header',
    'thumbnail': 'thumbnail',
    'avatars': 'avatar',
    'products': 'product'
  },
  
  // Path transformations for directory structure
  pathTransforms: {
    'images': {
      prefix: '',
      removePrefix: true
    },
    'assets': {
      prefix: 'img/',
      removePrefix: true,
      // Origin-specific transformations
      r2: {
        prefix: 'img/',
        removePrefix: true
      },
      remote: {
        prefix: 'assets/',
        removePrefix: true
      },
      fallback: {
        prefix: 'public/',
        removePrefix: true
      }
    },
    'content': {
      prefix: 'content-images/',
      removePrefix: true
    }
  }
};

// Environment-specific overrides
const environmentConfigs: Record<string, Partial<ImageResizerConfig>> = {
  development: {
    features: {
      enableAkamaiCompatibility: true // Enable in development for testing
    },
    debug: { 
      enabled: true,
      verbose: true,
      headers: ['all'],
      allowedEnvironments: ['development', 'staging'],
      includePerformance: true,
      forceDebugHeaders: false
    },
    logging: {
      level: 'DEBUG',
      includeTimestamp: true,
      enableStructuredLogs: true,
      enableBreadcrumbs: true
    },
    cache: {
      method: 'cf',
      ttl: {
        ok: 60, // Short TTL for development
        clientError: 10,
        serverError: 5,
        remoteFetch: 60, // Short TTL for development
        r2Headers: 60 // Short TTL for development
      },
      cacheEverything: true,
      useTtlByStatus: true, // Use status-based TTLs in development for testing
      cacheTtlByStatus: {
        "200-299": 60,    // 1 minute for success in development
        "301-302": 30,    // 30 seconds for redirects
        "404": 10,        // 10 seconds for not found
        "500-599": 5      // 5 seconds for server errors
      },
      cacheability: true,
      cacheTags: {
        enabled: true,
        prefix: 'img-dev-',
        includeImageDimensions: true,
        includeFormat: true,
        includeQuality: true,
        includeDerivative: true
      }
    },
    responsive: {
      // Use default responsive settings from base config, just override quality
      breakpoints: [320, 640, 768, 1024, 1440, 1920, 2048],
      deviceWidths: {
        mobile: 480,
        tablet: 768,
        desktop: 1440
      },
      quality: 80,
      fit: 'scale-down',
      format: 'auto',
      metadata: 'none',
      formatQuality: {
        'webp': 80,
        'avif': 75,
        'jpeg': 80,
        'png': 85
      }
    },
    storage: {
      priority: ['r2', 'remote', 'fallback'],
      r2: {
        enabled: true,
        bindingName: 'IMAGES_BUCKET'
      },
      fetchOptions: {
        userAgent: 'Cloudflare-Image-Resizer/1.0-DEV'
      },
      auth: {
        enabled: true,
        useOriginAuth: true,
        sharePublicly: true,
        cacheTtl: 60, // Short TTL for development
        securityLevel: 'permissive', // More permissive in development
        origins: {} // Will be filled from AUTH_ORIGINS environment variable
      }
    }
  },
  
  staging: {
    features: {
      enableAkamaiCompatibility: true // Enable in staging for testing
    },
    debug: { 
      enabled: true,
      verbose: true,
      // Limited set of headers for staging environment
      headers: [
        'ir', // Image resizing parameters
        'cache', // Cache configuration details
        'mode', // Processing mode information
        'strategy' // Strategy selection information
      ],
      specialHeaders: {
        'x-processing-mode': true,
        'x-size-source': true
      },
      allowedEnvironments: ['development', 'staging'],
      includePerformance: true,
      forceDebugHeaders: false
    },
    logging: {
      level: 'INFO',
      includeTimestamp: true,
      enableStructuredLogs: true,
      enableBreadcrumbs: true
    },
    cache: {
      method: 'cache-api',
      ttl: {
        ok: 3600, // 1 hour
        clientError: 30,
        serverError: 5,
        remoteFetch: 1800, // 30 minutes
        r2Headers: 3600 // 1 hour
      },
      cacheEverything: true,
      useTtlByStatus: false, // Use standard TTL in staging
      cacheTtlByStatus: {
        "200-299": 3600,   // 1 hour for success in staging
        "301-302": 1800,   // 30 minutes for redirects
        "404": 30,        // 30 seconds for not found
        "500-599": 5      // 5 seconds for server errors
      },
      cacheability: true,
      cacheTags: {
        enabled: true,
        prefix: 'img-staging-',
        includeImageDimensions: true,
        includeFormat: true,
        includeQuality: true,
        includeDerivative: true
      }
    },
    storage: {
      priority: ['r2', 'remote', 'fallback'],
      r2: {
        enabled: true,
        bindingName: 'IMAGES_BUCKET'
      },
      fetchOptions: {
        userAgent: 'Cloudflare-Image-Resizer/1.0-STAGING'
      },
      auth: {
        enabled: true,
        useOriginAuth: true,
        sharePublicly: true,
        cacheTtl: 3600, // 1 hour for staging
        securityLevel: 'strict',
        origins: {} // Will be filled from AUTH_ORIGINS environment variable
      }
    }
  },
  
  production: {
    features: {
      enableAkamaiCompatibility: false // Initially disabled in production
    },
    debug: { 
      enabled: false,
      verbose: false,
      // Only include minimal headers in production, and only when explicitly requested
      allowedEnvironments: [], // Empty array means no debug headers by default
      headers: [
        'cache',
        'mode'
      ],
      // Minimal special headers for production
      specialHeaders: {
        'x-processing-mode': true
      },
      includePerformance: true,
      forceDebugHeaders: false,
      // Use more neutral header names in production to avoid exposing implementation details
      headerNames: {
        debugEnabled: 'X-Debug',
        version: 'X-Version',
        environment: 'X-Env',
        processingMode: 'X-Mode',
        storageType: 'X-Source',
        deviceType: 'X-Device'
      }
    },
    logging: {
      level: 'INFO',
      includeTimestamp: true,
      enableStructuredLogs: true,
      enableBreadcrumbs: true
    },
    cache: {
      method: 'cf',
      ttl: {
        ok: 604800, // 1 week
        clientError: 60,
        serverError: 10,
        remoteFetch: 86400, // 1 day
        r2Headers: 604800 // 1 week
      },
      cacheEverything: true,
      useTtlByStatus: true, // Use status-based TTLs in production for better control
      cacheTtlByStatus: {
        "200-299": 604800, // 1 week for success in production
        "301-302": 86400,  // 1 day for redirects
        "404": 60,        // 1 minute for not found
        "500-599": 10     // 10 seconds for server errors
      },
      cacheability: true,
      cacheTags: {
        enabled: true,
        prefix: 'img-prod-',
        includeImageDimensions: true,
        includeFormat: true,
        includeQuality: true,
        includeDerivative: true
      }
    },
    responsive: {
      // Use default responsive settings from base config, just override quality
      breakpoints: [320, 640, 768, 1024, 1440, 1920, 2048],
      deviceWidths: {
        mobile: 480,
        tablet: 768,
        desktop: 1440
      },
      quality: 85,
      fit: 'scale-down',
      format: 'auto',
      metadata: 'none',
      formatQuality: {
        'webp': 85,
        'avif': 80,
        'jpeg': 85,
        'png': 90
      }
    },
    storage: {
      priority: ['r2', 'remote', 'fallback'],
      r2: {
        enabled: true,
        bindingName: 'IMAGES_BUCKET'
      },
      fetchOptions: {
        userAgent: 'Cloudflare-Image-Resizer/1.0-PROD'
      },
      auth: {
        enabled: true,
        useOriginAuth: true,
        sharePublicly: true,
        cacheTtl: 86400, // 24 hours for production
        securityLevel: 'strict',
        origins: {} // Will be filled from AUTH_ORIGINS environment variable
      }
    }
  }
};

/**
 * Deep merge utility for configuration objects
 */
function deepMerge<T>(target: T, source: Partial<T>): T {
  const result = { ...target };
  
  if (source && typeof source === 'object' && !Array.isArray(source)) {
    Object.keys(source).forEach(key => {
      const sourceValue = source[key as keyof typeof source];
      const targetValue = target[key as keyof typeof target];
      
      if (
        sourceValue && 
        typeof sourceValue === 'object' && 
        !Array.isArray(sourceValue) &&
        targetValue && 
        typeof targetValue === 'object' && 
        !Array.isArray(targetValue)
      ) {
        // If both values are objects, recursively merge them
        result[key as keyof typeof result] = deepMerge(
          targetValue, 
          sourceValue as any
        ) as any;
      } else {
        // Otherwise just override the target value
        result[key as keyof typeof result] = sourceValue as any;
      }
    });
  }
  
  return result;
}

/**
 * Get the configuration for the current environment
 * 
 * @param env Environment variables from Cloudflare
 * @returns Merged configuration
 */
export function getConfig(env: Env): ImageResizerConfig {
  // Determine environment
  const envSetting = (env.ENVIRONMENT || 'development').toLowerCase();
  
  // Cast to valid environment type
  const environment = envSetting === 'staging' ? 'staging' as const :
                    envSetting === 'production' ? 'production' as const : 'development' as const;
  
  // Start with default config
  let config = { ...defaultConfig, environment };
  
  // Apply environment-specific overrides
  if (environmentConfigs[environment]) {
    config = deepMerge(config, environmentConfigs[environment]);
  }
  
  // Apply any additional config from environment variables
  if (env.FALLBACK_URL) {
    config.storage.fallbackUrl = env.FALLBACK_URL;
  }
  
  if (env.REMOTE_URL) {
    config.storage.remoteUrl = env.REMOTE_URL;
  }
  
  // Allow overriding storage priority via env vars - useful for testing
  if (env.STORAGE_PRIORITY) {
    try {
      const priorityString = env.STORAGE_PRIORITY as string;
      // Split by comma and validate each entry
      const priorities = priorityString.split(',').map(p => p.trim());
      const validPriorities = priorities.filter(p => 
        ['r2', 'remote', 'fallback'].includes(p)
      ) as ('r2' | 'remote' | 'fallback')[];
      
      if (validPriorities.length > 0) {
        config.storage.priority = validPriorities;
      }
    } catch (error) {
      // Ignore parsing errors, use default priority
    }
  }
  
  // Apply cache tag settings from environment
  if (env.CACHE_TAGS_ENABLED) {
    // Ensure cache tags section exists
    config.cache.cacheTags = config.cache.cacheTags || {
      enabled: true,
      includeImageDimensions: true,
      includeFormat: true,
      includeQuality: true,
      includeDerivative: true,
      customTags: [],
      pathBasedTags: {},
      parseMetadataHeaders: {
        enabled: false,
        headerPrefixes: ['x-meta-', 'x-amz-meta-', 'x-goog-meta-'],
        excludeHeaders: ['credentials', 'token', 'key', 'auth', 'password', 'secret'],
        includeContentType: true,
        includeCacheControl: true
      }
    };
    
    // Set enabled state based on environment variable
    config.cache.cacheTags.enabled = env.CACHE_TAGS_ENABLED === 'true';
  }
  
  if (env.CACHE_TAGS_PREFIX && config.cache.cacheTags) {
    config.cache.cacheTags.prefix = env.CACHE_TAGS_PREFIX;
  }
  
  // Parse custom tags from environment variable
  if (env.CACHE_TAGS_CUSTOM && config.cache.cacheTags) {
    const customTags = env.CACHE_TAGS_CUSTOM.split(',').map(tag => tag.trim()).filter(Boolean);
    if (customTags.length > 0) {
      config.cache.cacheTags.customTags = customTags;
    }
  }
  
  // Enable metadata header parsing if configured
  if (env.CACHE_TAGS_PARSE_METADATA && config.cache.cacheTags) {
    if (!config.cache.cacheTags.parseMetadataHeaders) {
      config.cache.cacheTags.parseMetadataHeaders = {
        enabled: false,
        headerPrefixes: ['x-meta-', 'x-amz-meta-', 'x-goog-meta-'],
        excludeHeaders: ['credentials', 'token', 'key', 'auth', 'password', 'secret'],
        includeContentType: true,
        includeCacheControl: true
      };
    }
    config.cache.cacheTags.parseMetadataHeaders.enabled = env.CACHE_TAGS_PARSE_METADATA === 'true';
  }
  
  // Apply cache TTL settings from environment
  if (env.CACHE_TTL_OK) {
    config.cache.ttl.ok = parseInt(env.CACHE_TTL_OK, 10);
  }
  
  if (env.CACHE_TTL_CLIENT_ERROR) {
    config.cache.ttl.clientError = parseInt(env.CACHE_TTL_CLIENT_ERROR, 10);
  }
  
  if (env.CACHE_TTL_SERVER_ERROR) {
    config.cache.ttl.serverError = parseInt(env.CACHE_TTL_SERVER_ERROR, 10);
  }
  
  if (env.CACHE_TTL_REMOTE_FETCH) {
    config.cache.ttl.remoteFetch = parseInt(env.CACHE_TTL_REMOTE_FETCH, 10);
  }
  
  if (env.CACHE_TTL_R2_HEADERS) {
    config.cache.ttl.r2Headers = parseInt(env.CACHE_TTL_R2_HEADERS, 10);
  }
  
  if (env.CACHE_METHOD) {
    config.cache.method = (env.CACHE_METHOD as 'cf' | 'cache-api' | 'none');
  }
  
  // Apply cache everything setting from environment
  if (env.CACHE_EVERYTHING) {
    config.cache.cacheEverything = env.CACHE_EVERYTHING === 'true';
  }
  
  // Apply cache TTL by status preference from environment
  if (env.CACHE_USE_TTL_BY_STATUS) {
    config.cache.useTtlByStatus = env.CACHE_USE_TTL_BY_STATUS === 'true';
  }
  
  // Apply status code range settings from environment
  config.cache.statusRanges = config.cache.statusRanges || {
    success: "200-299",
    redirect: "301-302",
    notFound: "404",
    serverError: "500-599"
  };
  
  if (env.CACHE_STATUS_SUCCESS_RANGE) {
    config.cache.statusRanges.success = env.CACHE_STATUS_SUCCESS_RANGE;
  }
  
  if (env.CACHE_STATUS_REDIRECT_RANGE) {
    config.cache.statusRanges.redirect = env.CACHE_STATUS_REDIRECT_RANGE;
  }
  
  if (env.CACHE_STATUS_NOTFOUND_RANGE) {
    config.cache.statusRanges.notFound = env.CACHE_STATUS_NOTFOUND_RANGE;
  }
  
  if (env.CACHE_STATUS_ERROR_RANGE) {
    config.cache.statusRanges.serverError = env.CACHE_STATUS_ERROR_RANGE;
  }
  
  // Apply cache TTL by status settings from environment
  if (!config.cache.cacheTtlByStatus) {
    config.cache.cacheTtlByStatus = {};
  }
  
  if (env.CACHE_TTL_STATUS_SUCCESS) {
    const successRange = config.cache.statusRanges?.success || "200-299";
    config.cache.cacheTtlByStatus[successRange] = parseInt(env.CACHE_TTL_STATUS_SUCCESS, 10);
  }
  
  if (env.CACHE_TTL_STATUS_REDIRECT) {
    const redirectRange = config.cache.statusRanges?.redirect || "301-302";
    config.cache.cacheTtlByStatus[redirectRange] = parseInt(env.CACHE_TTL_STATUS_REDIRECT, 10);
  }
  
  if (env.CACHE_TTL_STATUS_NOTFOUND) {
    const notFoundRange = config.cache.statusRanges?.notFound || "404";
    config.cache.cacheTtlByStatus[notFoundRange] = parseInt(env.CACHE_TTL_STATUS_NOTFOUND, 10);
  }
  
  if (env.CACHE_TTL_STATUS_ERROR) {
    const errorRange = config.cache.statusRanges?.serverError || "500-599";
    config.cache.cacheTtlByStatus[errorRange] = parseInt(env.CACHE_TTL_STATUS_ERROR, 10);
  }
  
  // Apply format quality settings from environment
  if (!config.responsive.formatQuality) {
    config.responsive.formatQuality = {};
  }
  
  if (env.FORMAT_QUALITY_WEBP) {
    config.responsive.formatQuality['webp'] = parseInt(env.FORMAT_QUALITY_WEBP, 10);
  }
  
  if (env.FORMAT_QUALITY_AVIF) {
    config.responsive.formatQuality['avif'] = parseInt(env.FORMAT_QUALITY_AVIF, 10);
  }
  
  if (env.FORMAT_QUALITY_JPEG) {
    config.responsive.formatQuality['jpeg'] = parseInt(env.FORMAT_QUALITY_JPEG, 10);
  }
  
  if (env.FORMAT_QUALITY_PNG) {
    config.responsive.formatQuality['png'] = parseInt(env.FORMAT_QUALITY_PNG, 10);
  }
  
  if (env.DEFAULT_QUALITY) {
    config.responsive.quality = parseInt(env.DEFAULT_QUALITY, 10);
  }
  
  if (env.DEFAULT_FIT) {
    config.responsive.fit = env.DEFAULT_FIT as 'scale-down' | 'contain' | 'cover' | 'crop' | 'pad';
  }
  
  // Apply user agent setting from environment
  if (env.USER_AGENT && config.storage.fetchOptions) {
    config.storage.fetchOptions.userAgent = env.USER_AGENT;
  }

  // Apply R2 configuration if available
  if (env.IMAGES_BUCKET) {
    config.storage.r2.enabled = true;
  } else {
    config.storage.r2.enabled = false;
    
    // Adjust storage priority if R2 is not available
    config.storage.priority = config.storage.priority.filter(p => p !== 'r2');
  }
  
  // Apply authentication settings from environment
  if (env.AUTH_ENABLED) {
    if (!config.storage.auth) {
      config.storage.auth = {
        enabled: env.AUTH_ENABLED === 'true',
        useOriginAuth: false,
        sharePublicly: false,
        origins: {},
        securityLevel: 'strict',
        cacheTtl: 3600
      };
    } else {
      config.storage.auth.enabled = env.AUTH_ENABLED === 'true';
    }
  }
  
  // Set Cloudflare's origin-auth feature settings
  if (env.AUTH_USE_ORIGIN_AUTH && config.storage.auth) {
    config.storage.auth.useOriginAuth = env.AUTH_USE_ORIGIN_AUTH === 'true';
  }
  
  if (env.AUTH_SHARE_PUBLICLY && config.storage.auth) {
    config.storage.auth.sharePublicly = env.AUTH_SHARE_PUBLICLY === 'true';
  }
  
  if (env.AUTH_SECURITY_LEVEL && config.storage.auth) {
    config.storage.auth.securityLevel = env.AUTH_SECURITY_LEVEL === 'permissive' 
      ? 'permissive' as const 
      : 'strict' as const;
  }
  
  if (env.AUTH_CACHE_TTL && config.storage.auth) {
    config.storage.auth.cacheTtl = parseInt(env.AUTH_CACHE_TTL, 10);
  }
  
  // Configure auth origins from individual environment variables
  if (config.storage.auth) {
    // Initialize origins object if needed
    config.storage.auth.origins = config.storage.auth.origins || {};
    
    // Configure secure origin (typically bearer token)
    if (env.AUTH_DOMAIN_SECURE) {
      config.storage.auth.origins.secure = {
        domain: env.AUTH_DOMAIN_SECURE,
        type: (env.AUTH_TYPE_SECURE || 'bearer') as 'bearer' | 'basic' | 'header' | 'query',
        tokenHeaderName: env.AUTH_TOKEN_HEADER_NAME || 'Authorization',
        tokenExpiration: env.AUTH_TOKEN_EXPIRATION ? parseInt(env.AUTH_TOKEN_EXPIRATION, 10) : 3600,
        // Note: tokenSecret will be accessed from env at runtime, not stored in config
      };
    }
    
    // Configure basic auth origin
    if (env.AUTH_DOMAIN_BASIC) {
      config.storage.auth.origins.basic = {
        domain: env.AUTH_DOMAIN_BASIC,
        type: (env.AUTH_TYPE_BASIC || 'basic') as 'bearer' | 'basic' | 'header' | 'query',
        // Note: username and password will be accessed from env at runtime, not stored in config
      };
    }
    
    // Configure API origin (custom headers)
    if (env.AUTH_DOMAIN_API) {
      config.storage.auth.origins.api = {
        domain: env.AUTH_DOMAIN_API,
        type: (env.AUTH_TYPE_API || 'header') as 'bearer' | 'basic' | 'header' | 'query',
        headers: {
          // We'll set up dynamic header access in the auth function
        }
      };
    }
    
    // Configure signed URL origin
    if (env.AUTH_DOMAIN_SIGNED) {
      config.storage.auth.origins.signed = {
        domain: env.AUTH_DOMAIN_SIGNED,
        type: (env.AUTH_TYPE_SIGNED || 'query') as 'bearer' | 'basic' | 'header' | 'query',
        tokenParam: env.AUTH_TOKEN_PARAM_NAME || 'token',
        signedUrlExpiration: env.AUTH_SIGNED_EXPIRATION ? parseInt(env.AUTH_SIGNED_EXPIRATION, 10) : 86400,
        // Note: tokenSecret will be accessed from env at runtime, not stored in config
      };
    }
  }
  
  // Apply debug settings from environment
  if (env.DEBUG === 'true') {
    config.debug.enabled = true;
  } else if (env.DEBUG === 'false') {
    config.debug.enabled = false;
  }
  
  // Apply logging settings from environment
  if (!config.logging) {
    config.logging = {
      level: 'INFO',
      includeTimestamp: true,
      enableStructuredLogs: true
    };
  }
  
  if (env.LOGGING_LEVEL) {
    if (['DEBUG', 'INFO', 'WARN', 'ERROR'].includes(env.LOGGING_LEVEL)) {
      config.logging.level = env.LOGGING_LEVEL as 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
    }
  }
  
  if (env.LOGGING_TIMESTAMP) {
    config.logging.includeTimestamp = env.LOGGING_TIMESTAMP === 'true';
  }
  
  if (env.LOGGING_STRUCTURED) {
    config.logging.enableStructuredLogs = env.LOGGING_STRUCTURED === 'true';
  }
  
  if (env.LOGGING_BREADCRUMBS_ENABLED) {
    config.logging.enableBreadcrumbs = env.LOGGING_BREADCRUMBS_ENABLED === 'true';
  }
  
  // Apply feature flag settings
  if (!config.features) {
    config.features = {};
  }
  
  // Enable Akamai compatibility if specified
  if (env.ENABLE_AKAMAI_COMPATIBILITY) {
    config.features.enableAkamaiCompatibility = env.ENABLE_AKAMAI_COMPATIBILITY === 'true';
  }
  
  // Configure any derivatives from env (JSON string)
  if ('DERIVATIVES' in env && typeof (env as Record<string, any>).DERIVATIVES === 'string') {
    try {
      const customDerivatives = JSON.parse((env as Record<string, any>).DERIVATIVES);
      config.derivatives = {
        ...config.derivatives,
        ...customDerivatives
      };
    } catch (e) {
      // Ignore parsing errors
    }
  }
  
  return config;
}