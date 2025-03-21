/**
 * Configuration management for the image resizer worker
 * 
 * This module provides a simple, unified configuration system with sensible defaults
 * and environment-specific overrides.
 */

// Define the configuration structure with TypeScript types
import { PathTransforms } from './utils/path';
import { Env } from './types';
import { loadDetectorConfigFromEnv } from './utils/wrangler-config';

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
  
  // New cascade configuration
  cascade?: {
    // Format selection cascade
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

export interface ImageResizerConfig {
  // Core configuration
  environment: 'development' | 'staging' | 'production';
  version: string;
  
  // Feature flags
  features?: {
    enableAkamaiCompatibility?: boolean;
    enableAkamaiAdvancedFeatures?: boolean;
  };
  
  // Client Detector configuration
  detector?: DetectorConfig;
  
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
      // When useTtlByStatus=false: ok value is used for Cloudflare's cacheTtl setting
      // When useTtlByStatus=true: these values are ignored for Cloudflare cache, use cacheTtlByStatus instead
      // All values are still used for Cache-Control headers regardless of useTtlByStatus
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
    // Only used when useTtlByStatus=true
    cacheTtlByStatus?: {
      [key: string]: number;   // Maps status code ranges (e.g. "200-299") to TTL values
    };
    cacheability: boolean;
    bypassParams?: string[];   // Query parameters that trigger cache bypass
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
    remoteAuth?: {
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
    };
    fallbackUrl?: string;
    fallbackAuth?: {
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
    };
    r2: {
      enabled: boolean;
      bindingName: string;
    };
    fetchOptions?: {
      userAgent?: string;
      headers?: Record<string, string>;
    };
    // Global auth settings (still used for origin-auth)
    auth?: {
      enabled: boolean;
      useOriginAuth?: boolean;       // When true, use Cloudflare's origin-auth feature
      sharePublicly?: boolean;       // When true, set origin-auth to "share-publicly"
      securityLevel?: 'strict' | 'permissive'; // How to handle auth errors
      cacheTtl?: number;              // TTL for authenticated requests
      origins?: Record<string, {
        domain: string;
        type: 'bearer' | 'basic' | 'header' | 'query' | 'aws-s3';
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
    enableAkamaiCompatibility: false,
    enableAkamaiAdvancedFeatures: false
  },
  
  // Default detector configuration
  detector: {
    cache: {
      maxSize: 1000,
      pruneAmount: 100,
      enableCache: true,
      ttl: 3600000 // 1 hour in milliseconds
    },
    strategies: {
      clientHints: {
        priority: 100,
        enabled: true
      },
      acceptHeader: {
        priority: 80,
        enabled: true
      },
      userAgent: {
        priority: 60,
        enabled: true,
        maxUALength: 100
      },
      staticData: {
        priority: 20,
        enabled: true
      },
      defaults: {
        priority: 0,
        enabled: true
      }
    },
    performanceBudget: {
      quality: {
        low: {
          min: 60,
          max: 80,
          target: 70
        },
        medium: {
          min: 65,
          max: 85,
          target: 75
        },
        high: {
          min: 70,
          max: 95,
          target: 85
        }
      },
      dimensions: {
        maxWidth: {
          low: 1000,
          medium: 1500,
          high: 2500
        },
        maxHeight: {
          low: 1000,
          medium: 1500,
          high: 2500
        }
      },
      preferredFormats: {
        low: ['webp', 'jpeg'],
        medium: ['webp', 'avif', 'jpeg'],
        high: ['avif', 'webp', 'jpeg']
      }
    },
    deviceClassification: {
      thresholds: {
        lowEnd: 30,
        highEnd: 70
      },
      platformScores: {
        'iOS': 70,
        'macOS': 70,
        'Windows': 50,
        'Android': 40,
        'Linux': 60,
        'Chrome OS': 50
      }
    },
    hashAlgorithm: 'simple',
    logLevel: 'info'
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
    remoteAuth: {
      enabled: false,
      type: 'aws-s3',
      region: 'us-east-1',
      service: 's3',
      accessKeyVar: 'AWS_ACCESS_KEY_ID',
      secretKeyVar: 'AWS_SECRET_ACCESS_KEY'
    },
    fallbackAuth: {
      enabled: false,
      type: 'bearer',
      tokenHeaderName: 'Authorization'
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
      enableAkamaiCompatibility: true, // Enable in development for testing
      enableAkamaiAdvancedFeatures: true // Enable advanced features in development
    },
    // Development-specific detector configuration
    detector: {
      cache: {
        maxSize: 500, // Smaller cache in development
        pruneAmount: 50,
        enableCache: true,
        ttl: 60000 // 1 minute cache in dev
      },
      strategies: {
        clientHints: {
          priority: 100,
          enabled: true
        },
        acceptHeader: {
          priority: 80,
          enabled: true
        },
        userAgent: {
          priority: 60,
          enabled: true,
          maxUALength: 200 // Process longer UAs for better debugging
        },
        staticData: {
          priority: 20,
          enabled: true
        },
        defaults: {
          priority: 0,
          enabled: true
        }
      },
      performanceBudget: {
        quality: {
          low: {
            min: 60,
            max: 80,
            target: 70
          },
          medium: {
            min: 65,
            max: 85,
            target: 75
          },
          high: {
            min: 70,
            max: 95,
            target: 85
          }
        },
        dimensions: {
          maxWidth: {
            low: 1000,
            medium: 1500,
            high: 2500
          },
          maxHeight: {
            low: 1000,
            medium: 1500,
            high: 2500
          }
        },
        preferredFormats: {
          low: ['webp', 'jpeg'],
          medium: ['webp', 'avif', 'jpeg'],
          high: ['avif', 'webp', 'jpeg']
        }
      },
      deviceClassification: {
        thresholds: {
          lowEnd: 30,
          highEnd: 70
        },
        platformScores: {
          'iOS': 70,
          'macOS': 70,
          'Windows': 50,
          'Android': 40,
          'Linux': 60,
          'Chrome OS': 50
        }
      },
      hashAlgorithm: 'simple',
      logLevel: 'debug' // More verbose logging in development
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
      remoteAuth: {
        enabled: true,
        type: 'aws-s3',
        region: 'us-east-1',
        service: 's3',
        accessKeyVar: 'AWS_ACCESS_KEY_ID',
        secretKeyVar: 'AWS_SECRET_ACCESS_KEY'
      },
      fallbackAuth: {
        enabled: false,
        type: 'bearer'
      },
      auth: {
        enabled: true,
        useOriginAuth: true,
        sharePublicly: true,
        cacheTtl: 60, // Short TTL for development
        securityLevel: 'permissive' // More permissive in development
      }
    }
  },
  
  staging: {
    features: {
      enableAkamaiCompatibility: true, // Enable in staging for testing 
      enableAkamaiAdvancedFeatures: true // Enable advanced features in staging
    },
    // Staging-specific detector configuration
    detector: {
      cache: {
        maxSize: 2000, // Medium cache in staging
        pruneAmount: 200,
        enableCache: true,
        ttl: 600000 // 10 minutes in staging
      },
      strategies: {
        clientHints: {
          priority: 100,
          enabled: true
        },
        acceptHeader: {
          priority: 80,
          enabled: true
        },
        userAgent: {
          priority: 60,
          enabled: true,
          maxUALength: 150 // Moderately long UAs in staging
        },
        staticData: {
          priority: 20,
          enabled: true
        },
        defaults: {
          priority: 0,
          enabled: true
        }
      },
      performanceBudget: {
        quality: {
          low: {
            min: 60,
            max: 80,
            target: 70
          },
          medium: {
            min: 65,
            max: 85,
            target: 75
          },
          high: {
            min: 70,
            max: 95,
            target: 85
          }
        },
        dimensions: {
          maxWidth: {
            low: 1000,
            medium: 1500,
            high: 2500
          },
          maxHeight: {
            low: 1000,
            medium: 1500,
            high: 2500
          }
        },
        preferredFormats: {
          low: ['webp', 'jpeg'],
          medium: ['webp', 'avif', 'jpeg'],
          high: ['avif', 'webp', 'jpeg']
        }
      },
      deviceClassification: {
        thresholds: {
          lowEnd: 30,
          highEnd: 70
        },
        platformScores: {
          'iOS': 70,
          'macOS': 70,
          'Windows': 50,
          'Android': 40,
          'Linux': 60,
          'Chrome OS': 50
        }
      },
      hashAlgorithm: 'simple',
      logLevel: 'info' // Standard logging in staging
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
      remoteAuth: {
        enabled: true,
        type: 'aws-s3',
        region: 'us-east-1',
        service: 's3',
        accessKeyVar: 'AWS_ACCESS_KEY_ID',
        secretKeyVar: 'AWS_SECRET_ACCESS_KEY'
      },
      fallbackAuth: {
        enabled: false,
        type: 'bearer'
      },
      auth: {
        enabled: true,
        useOriginAuth: true,
        sharePublicly: true,
        cacheTtl: 3600, // 1 hour for staging
        securityLevel: 'strict'
      }
    }
  },
  
  production: {
    features: {
      enableAkamaiCompatibility: false, // Initially disabled in production
      enableAkamaiAdvancedFeatures: false // Initially disabled in production
    },
    // Production-specific detector configuration
    detector: {
      cache: {
        maxSize: 5000, // Larger cache in production for better performance
        pruneAmount: 500,
        enableCache: true,
        ttl: 3600000 // 1 hour in production
      },
      strategies: {
        clientHints: {
          priority: 100,
          enabled: true
        },
        acceptHeader: {
          priority: 80,
          enabled: true
        },
        userAgent: {
          priority: 60,
          enabled: true,
          maxUALength: 100 // Standard UA length in production
        },
        staticData: {
          priority: 20,
          enabled: true
        },
        defaults: {
          priority: 0,
          enabled: true
        }
      },
      performanceBudget: {
        // Slightly higher quality targets for production
        quality: {
          low: {
            min: 65,
            max: 85,
            target: 75
          },
          medium: {
            min: 70,
            max: 90,
            target: 80
          },
          high: {
            min: 75,
            max: 95,
            target: 90
          }
        },
        dimensions: {
          maxWidth: {
            low: 1000,
            medium: 1500,
            high: 2500
          },
          maxHeight: {
            low: 1000,
            medium: 1500,
            high: 2500
          }
        },
        preferredFormats: {
          low: ['webp', 'jpeg'],
          medium: ['webp', 'avif', 'jpeg'],
          high: ['avif', 'webp', 'jpeg']
        }
      },
      deviceClassification: {
        thresholds: {
          lowEnd: 30,
          highEnd: 70
        },
        platformScores: {
          'iOS': 70,
          'macOS': 70,
          'Windows': 50,
          'Android': 40,
          'Linux': 60,
          'Chrome OS': 50
        }
      },
      hashAlgorithm: 'fnv1a', // Use more efficient hashing in production
      logLevel: 'warn' // Only log warnings and errors in production
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
      remoteAuth: {
        enabled: true,
        type: 'aws-s3',
        region: 'us-east-1',
        service: 's3',
        accessKeyVar: 'AWS_ACCESS_KEY_ID',
        secretKeyVar: 'AWS_SECRET_ACCESS_KEY'
      },
      fallbackAuth: {
        enabled: false,
        type: 'bearer'
      },
      auth: {
        enabled: true,
        useOriginAuth: true,
        sharePublicly: true,
        cacheTtl: 86400, // 24 hours for production
        securityLevel: 'strict'
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
        securityLevel: 'strict',
        cacheTtl: 3600
      };
    } else {
      config.storage.auth.enabled = env.AUTH_ENABLED === 'true';
    }
  }
  
  // Configure Remote Auth from environment
  if (env.REMOTE_AUTH_ENABLED) {
    if (!config.storage.remoteAuth) {
      config.storage.remoteAuth = {
        enabled: env.REMOTE_AUTH_ENABLED === 'true',
        type: (env.REMOTE_AUTH_TYPE || 'aws-s3') as 'aws-s3' | 'bearer' | 'header' | 'query',
        region: env.REMOTE_AUTH_REGION || 'us-east-1',
        service: env.REMOTE_AUTH_SERVICE || 's3',
        accessKeyVar: env.REMOTE_AUTH_ACCESS_KEY_VAR || 'AWS_ACCESS_KEY_ID',
        secretKeyVar: env.REMOTE_AUTH_SECRET_KEY_VAR || 'AWS_SECRET_ACCESS_KEY'
      };
    } else {
      config.storage.remoteAuth.enabled = env.REMOTE_AUTH_ENABLED === 'true';
    }
  }
  
  // Configure Fallback Auth from environment
  if (env.FALLBACK_AUTH_ENABLED) {
    if (!config.storage.fallbackAuth) {
      config.storage.fallbackAuth = {
        enabled: env.FALLBACK_AUTH_ENABLED === 'true',
        type: (env.FALLBACK_AUTH_TYPE || 'bearer') as 'aws-s3' | 'bearer' | 'header' | 'query'
      };
    } else {
      config.storage.fallbackAuth.enabled = env.FALLBACK_AUTH_ENABLED === 'true';
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
  
  // Enable Advanced Akamai features if specified
  if (env.ENABLE_AKAMAI_ADVANCED_FEATURES) {
    config.features.enableAkamaiAdvancedFeatures = env.ENABLE_AKAMAI_ADVANCED_FEATURES === 'true';
  }
  
  // Configure any derivatives from env (JSON object or string)
  if ('DERIVATIVES' in env) {
    try {
      let customDerivatives;
      
      // Cast env to a record with unknown values for type safety
      const safeEnv = env as Record<string, unknown>;
      
      if (typeof safeEnv.DERIVATIVES === 'string') {
        // Parse from JSON string
        customDerivatives = JSON.parse(safeEnv.DERIVATIVES);
      } else if (typeof safeEnv.DERIVATIVES === 'object' && safeEnv.DERIVATIVES !== null) {
        // Use directly as object
        customDerivatives = safeEnv.DERIVATIVES;
      }
      
      if (customDerivatives) {
        // Merge with existing derivatives
        config.derivatives = {
          ...config.derivatives,
          ...customDerivatives
        };
        
        console.log('Loaded custom derivatives from environment', {
          derivatives: Object.keys(customDerivatives as Record<string, unknown>),
          totalDerivatives: Object.keys(config.derivatives).length
        });
      }
    } catch (e) {
      const safeEnv = env as Record<string, unknown>;
      console.error('Error processing DERIVATIVES from environment', {
        error: e instanceof Error ? e.message : String(e),
        value: typeof safeEnv.DERIVATIVES === 'string' 
          ? safeEnv.DERIVATIVES.substring(0, 100) + '...' 
          : 'object'
      });
    }
  }
  
  // Check for individual derivative definitions (for easier configuration in wrangler.jsonc)
  // Format: DERIVATIVE_NAME = JSON string of options
  // Example: DERIVATIVE_VIDEO_HIGH = {"width": 1280, "height": 720, "quality": 90}
  const derivativePrefix = 'DERIVATIVE_';
  
  // Safe way to check keys without triggering TypeScript errors
  const envKeys = Object.keys(env as Record<string, unknown>);
  
  envKeys.forEach(key => {
    // First check if key exists and then check type
    const value = (env as Record<string, unknown>)[key];
    if (key.startsWith(derivativePrefix) && typeof value === 'string') {
      try {
        // Convert DERIVATIVE_VIDEO_HIGH to video-high
        const derivativeName = key.substring(derivativePrefix.length)
          .toLowerCase()
          .replace(/_/g, '-');
        
        // Parse the derivative configuration
        const derivativeConfig = JSON.parse(value);
        
        // Add to the derivatives object
        config.derivatives[derivativeName] = derivativeConfig;
        
        console.log(`Added derivative from environment: ${derivativeName}`, {
          options: Object.keys(derivativeConfig).join(', ')
        });
      } catch (e) {
        console.error(`Error parsing derivative configuration: ${key}`, {
          error: e instanceof Error ? e.message : String(e),
          value: value
        });
      }
    }
  });
  
  // Load detector configuration from environment variables
  if (!config.detector) {
    // If no detector config exists yet, create one from environment variables
    const detectorConfig = loadDetectorConfigFromEnv(env);
    if (Object.keys(detectorConfig).length > 0) {
      config.detector = detectorConfig as DetectorConfig;
    }
  } else {
    // Merge environment values with existing detector config
    const detectorEnvConfig = loadDetectorConfigFromEnv(env);
    
    // Merge cache configuration
    if (detectorEnvConfig.cache && config.detector.cache) {
      config.detector.cache = {
        ...config.detector.cache,
        ...detectorEnvConfig.cache
      };
    }
    
    // Set hash algorithm and log level if provided
    if (detectorEnvConfig.hashAlgorithm) {
      config.detector.hashAlgorithm = detectorEnvConfig.hashAlgorithm;
    }
    
    if (detectorEnvConfig.logLevel) {
      config.detector.logLevel = detectorEnvConfig.logLevel;
    }
  }
  
  return config;
}