/**
 * Simplified Configuration Schema
 * 
 * This module defines TypeScript interfaces for the simplified configuration structure
 * and provides JSON Schema definitions for validation.
 */

/**
 * Core configuration for basic service settings
 */
export interface CoreConfig {
  environment: 'development' | 'staging' | 'production';
  debug: {
    enabled: boolean;
    headers?: boolean;
    detailedErrors?: boolean;
  };
  logging: {
    level: 'debug' | 'info' | 'warn' | 'error';
    structured?: boolean;
  };
  features: {
    responsiveImages?: boolean;
    clientHints?: boolean;
    smartCropping?: boolean;
    cacheTags?: boolean;
    watermarks?: boolean;
    [key: string]: boolean | undefined;
  };
}

/**
 * Transform configuration for image processing settings
 */
export interface TransformConfig {
  formats: {
    preferWebp?: boolean;
    preferAvif?: boolean;
    allowOriginalFormat?: boolean;
    jpegQuality?: number;
    webpQuality?: number;
    avifQuality?: number;
  };
  sizes: {
    maxWidth?: number;
    maxHeight?: number;
    defaultFit?: 'scale-down' | 'contain' | 'cover' | 'crop' | 'pad';
  };
  optimizations: {
    stripMetadata?: boolean;
    autoCompress?: boolean;
    optimizeForWeb?: boolean;
  };
  derivatives?: Record<string, {
    width?: number;
    height?: number;
    fit?: string;
    format?: string;
    quality?: number;
    [key: string]: any;
  }>;
}

/**
 * Cache configuration for controlling caching behavior
 */
export interface CacheConfig {
  method: 'cf' | 'cache-api' | 'none';
  ttl: {
    default: number;
    success?: number;
    redirects?: number;
    clientErrors?: number;
    serverErrors?: number;
  };
  tags?: {
    enabled?: boolean;
    prefix?: string;
    includeOrigin?: boolean;
    includeFormat?: boolean;
  };
  bypass?: {
    debugMode?: boolean;
    noCache?: boolean;
  };
}

/**
 * Storage configuration for image sources
 */
export interface StorageConfig {
  sources: Array<'r2' | 'remote' | 'fallback'>;
  r2?: {
    enabled: boolean;
    binding?: string;
  };
  remote?: {
    enabled: boolean;
    url: string;
    auth?: {
      type: 'none' | 'basic' | 'bearer' | 's3';
      username?: string;
      password?: string;
      token?: string;
      region?: string;
      accessKey?: string;
      secretKey?: string;
    };
  };
  fallback?: {
    enabled: boolean;
    url?: string;
  };
  pathTransforms?: {
    enabled: boolean;
    rules?: Record<string, string>;
  };
}

/**
 * Client detection configuration
 */
export interface ClientConfig {
  detection: {
    enabled: boolean;
    useClientHints?: boolean;
    useAcceptHeader?: boolean;
    useUserAgent?: boolean;
    cacheDuration?: number;
  };
  responsive: {
    enabled: boolean;
    defaultSizes?: number[];
    devicePixelRatio?: boolean;
    qualityAdjustment?: boolean;
  };
}

/**
 * Security configuration 
 */
export interface SecurityConfig {
  headers?: {
    cacheControl?: boolean;
    strictTransportSecurity?: boolean;
    contentTypeNosniff?: boolean;
    referrerPolicy?: string;
  };
  cors?: {
    enabled: boolean;
    allowedOrigins?: string[];
    allowedMethods?: string[];
  };
}

/**
 * Monitoring configuration
 */
export interface MonitoringConfig {
  performance?: {
    enabled: boolean;
    sampleRate?: number;
  };
  errorTracking?: {
    enabled: boolean;
    captureStackTraces?: boolean;
  };
}

/**
 * Complete simplified configuration
 */
export interface SimplifiedConfig {
  core: CoreConfig;
  transform?: TransformConfig;
  cache?: CacheConfig;
  storage?: StorageConfig;
  client?: ClientConfig;
  security?: SecurityConfig;
  monitoring?: MonitoringConfig;
}

/**
 * JSON Schema definitions for validation
 */
export const coreSchema = {
  type: 'object',
  required: ['environment', 'debug', 'logging'],
  properties: {
    environment: {
      type: 'string',
      enum: ['development', 'staging', 'production']
    },
    debug: {
      type: 'object',
      required: ['enabled'],
      properties: {
        enabled: { type: 'boolean' },
        headers: { type: 'boolean' },
        detailedErrors: { type: 'boolean' }
      }
    },
    logging: {
      type: 'object',
      required: ['level'],
      properties: {
        level: {
          type: 'string',
          enum: ['debug', 'info', 'warn', 'error']
        },
        structured: { type: 'boolean' }
      }
    },
    features: {
      type: 'object',
      additionalProperties: { type: 'boolean' }
    }
  }
};

export const transformSchema = {
  type: 'object',
  properties: {
    formats: {
      type: 'object',
      properties: {
        preferWebp: { type: 'boolean' },
        preferAvif: { type: 'boolean' },
        allowOriginalFormat: { type: 'boolean' },
        jpegQuality: { type: 'integer', minimum: 1, maximum: 100 },
        webpQuality: { type: 'integer', minimum: 1, maximum: 100 },
        avifQuality: { type: 'integer', minimum: 1, maximum: 100 }
      }
    },
    sizes: {
      type: 'object',
      properties: {
        maxWidth: { type: 'integer', minimum: 1 },
        maxHeight: { type: 'integer', minimum: 1 },
        defaultFit: { 
          type: 'string',
          enum: ['scale-down', 'contain', 'cover', 'crop', 'pad']
        }
      }
    },
    optimizations: {
      type: 'object',
      properties: {
        stripMetadata: { type: 'boolean' },
        autoCompress: { type: 'boolean' },
        optimizeForWeb: { type: 'boolean' }
      }
    },
    derivatives: {
      type: 'object',
      additionalProperties: {
        type: 'object',
        properties: {
          width: { type: 'integer', minimum: 1 },
          height: { type: 'integer', minimum: 1 },
          fit: { type: 'string' },
          format: { type: 'string' },
          quality: { type: 'integer', minimum: 1, maximum: 100 }
        }
      }
    }
  }
};

export const cacheSchema = {
  type: 'object',
  required: ['method', 'ttl'],
  properties: {
    method: {
      type: 'string',
      enum: ['cf', 'cache-api', 'none']
    },
    ttl: {
      type: 'object',
      required: ['default'],
      properties: {
        default: { type: 'integer', minimum: 0 },
        success: { type: 'integer', minimum: 0 },
        redirects: { type: 'integer', minimum: 0 },
        clientErrors: { type: 'integer', minimum: 0 },
        serverErrors: { type: 'integer', minimum: 0 }
      }
    },
    tags: {
      type: 'object',
      properties: {
        enabled: { type: 'boolean' },
        prefix: { type: 'string' },
        includeOrigin: { type: 'boolean' },
        includeFormat: { type: 'boolean' }
      }
    },
    bypass: {
      type: 'object',
      properties: {
        debugMode: { type: 'boolean' },
        noCache: { type: 'boolean' }
      }
    }
  }
};

export const storageSchema = {
  type: 'object',
  required: ['sources'],
  properties: {
    sources: {
      type: 'array',
      items: {
        type: 'string',
        enum: ['r2', 'remote', 'fallback']
      }
    },
    r2: {
      type: 'object',
      required: ['enabled'],
      properties: {
        enabled: { type: 'boolean' },
        binding: { type: 'string' }
      }
    },
    remote: {
      type: 'object',
      required: ['enabled', 'url'],
      properties: {
        enabled: { type: 'boolean' },
        url: { type: 'string' },
        auth: {
          type: 'object',
          properties: {
            type: { 
              type: 'string',
              enum: ['none', 'basic', 'bearer', 's3']
            },
            username: { type: 'string' },
            password: { type: 'string' },
            token: { type: 'string' },
            region: { type: 'string' },
            accessKey: { type: 'string' },
            secretKey: { type: 'string' }
          }
        }
      }
    },
    fallback: {
      type: 'object',
      required: ['enabled'],
      properties: {
        enabled: { type: 'boolean' },
        url: { type: 'string' }
      }
    },
    pathTransforms: {
      type: 'object',
      required: ['enabled'],
      properties: {
        enabled: { type: 'boolean' },
        rules: {
          type: 'object',
          additionalProperties: { type: 'string' }
        }
      }
    }
  }
};

export const simplifiedConfigSchema = {
  type: 'object',
  required: ['core'],
  properties: {
    core: coreSchema,
    transform: transformSchema,
    cache: cacheSchema,
    storage: storageSchema,
    client: {
      type: 'object',
      properties: {
        detection: {
          type: 'object',
          required: ['enabled'],
          properties: {
            enabled: { type: 'boolean' },
            useClientHints: { type: 'boolean' },
            useAcceptHeader: { type: 'boolean' },
            useUserAgent: { type: 'boolean' },
            cacheDuration: { type: 'integer', minimum: 0 }
          }
        },
        responsive: {
          type: 'object',
          required: ['enabled'],
          properties: {
            enabled: { type: 'boolean' },
            defaultSizes: {
              type: 'array',
              items: { type: 'integer', minimum: 1 }
            },
            devicePixelRatio: { type: 'boolean' },
            qualityAdjustment: { type: 'boolean' }
          }
        }
      }
    },
    security: {
      type: 'object',
      properties: {
        headers: {
          type: 'object',
          properties: {
            cacheControl: { type: 'boolean' },
            strictTransportSecurity: { type: 'boolean' },
            contentTypeNosniff: { type: 'boolean' },
            referrerPolicy: { type: 'string' }
          }
        },
        cors: {
          type: 'object',
          required: ['enabled'],
          properties: {
            enabled: { type: 'boolean' },
            allowedOrigins: {
              type: 'array',
              items: { type: 'string' }
            },
            allowedMethods: {
              type: 'array',
              items: { type: 'string' }
            }
          }
        }
      }
    },
    monitoring: {
      type: 'object',
      properties: {
        performance: {
          type: 'object',
          required: ['enabled'],
          properties: {
            enabled: { type: 'boolean' },
            sampleRate: { type: 'number', minimum: 0, maximum: 1 }
          }
        },
        errorTracking: {
          type: 'object',
          required: ['enabled'],
          properties: {
            enabled: { type: 'boolean' },
            captureStackTraces: { type: 'boolean' }
          }
        }
      }
    }
  }
};