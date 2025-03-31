/**
 * Cache configuration module
 * 
 * This module provides configuration for the caching system, including:
 * - Cache method selection
 * - TTL settings
 * - Cache tags configuration
 * - Bypass rules
 * - KV Transform cache settings
 */

import { ConfigModule, ModuleRegistration } from '../interfaces';

/**
 * Cache module schema
 */
export const CACHE_SCHEMA = {
  type: 'object',
  properties: {
    method: {
      type: 'string',
      enum: ['cf', 'cache-api', 'none'],
      description: 'Caching method to use'
    },
    ttl: {
      type: 'object',
      properties: {
        default: {
          type: 'number',
          minimum: 0,
          description: 'Default cache TTL in seconds'
        },
        status: {
          type: 'object',
          properties: {
            success: {
              type: 'number',
              minimum: 0,
              description: 'TTL for successful responses (200-299)'
            },
            redirects: {
              type: 'number',
              minimum: 0, 
              description: 'TTL for redirect responses (300-399)'
            },
            clientError: {
              type: 'number',
              minimum: 0,
              description: 'TTL for client error responses (400-499)'
            },
            serverError: {
              type: 'number',
              minimum: 0,
              description: 'TTL for server error responses (500-599)'
            }
          },
          description: 'TTL settings by status code'
        },
        contentType: {
          type: 'object',
          additionalProperties: { type: 'number' },
          description: 'TTL settings by content type'
        }
      },
      required: ['default'],
      description: 'Cache TTL settings'
    },
    tags: {
      type: 'object',
      properties: {
        enabled: { 
          type: 'boolean', 
          description: 'Enable cache tagging'
        },
        prefix: { 
          type: 'string', 
          description: 'Prefix for all cache tags'
        },
        includeImageDimensions: { 
          type: 'boolean', 
          description: 'Include image dimensions in tags'
        },
        includeFormat: { 
          type: 'boolean', 
          description: 'Include format in tags'
        },
        includeQuality: { 
          type: 'boolean', 
          description: 'Include quality in tags'
        },
        includeDerivative: { 
          type: 'boolean', 
          description: 'Include derivative in tags'
        },
        customTags: {
          type: 'array',
          items: { type: 'string' },
          description: 'Custom tags to include'
        },
        maxTags: {
          type: 'number',
          description: 'Maximum number of tags to include'
        }
      },
      required: ['enabled'],
      description: 'Cache tagging configuration'
    },
    bypass: {
      type: 'object',
      properties: {
        paths: {
          type: 'array',
          items: { type: 'string' },
          description: 'Paths that should bypass the cache'
        },
        params: {
          type: 'array',
          items: { type: 'string' },
          description: 'Query parameters that trigger cache bypass'
        },
        inDevelopment: {
          type: 'boolean',
          description: 'Always bypass cache in development environment'
        },
        forAdmin: {
          type: 'boolean',
          description: 'Bypass cache for admin users'
        },
        formats: {
          type: 'array',
          items: { type: 'string' },
          description: 'Formats that should bypass cache'
        }
      },
      description: 'Cache bypass rules'
    },
    transformCache: {
      type: 'object',
      properties: {
        enabled: { 
          type: 'boolean', 
          description: 'Enable KV-based transform caching'
        },
        binding: { 
          type: 'string', 
          description: 'KV namespace binding name'
        },
        prefix: { 
          type: 'string', 
          description: 'Key prefix for transform cache'
        },
        maxSize: { 
          type: 'number', 
          description: 'Maximum size to cache in bytes'
        },
        defaultTtl: { 
          type: 'number', 
          description: 'Default TTL in seconds'
        },
        backgroundIndexing: { 
          type: 'boolean', 
          description: 'Process cache operations in background'
        },
        disallowedPaths: {
          type: 'array',
          items: { type: 'string' },
          description: 'Paths that should not be cached'
        }
      },
      required: ['enabled'],
      description: 'KV Transform cache configuration'
    }
  },
  required: ['method', 'ttl'],
  description: 'Cache configuration settings'
};

/**
 * Default cache configuration
 */
export const DEFAULT_CACHE_CONFIG = {
  method: 'cf',
  ttl: {
    default: 86400, // 24 hours
    status: {
      success: 86400,   // 24 hours
      redirects: 3600,  // 1 hour
      clientError: 60,  // 1 minute
      serverError: 10   // 10 seconds
    },
    contentType: {
      'image/jpeg': 604800,  // 7 days
      'image/png': 604800,   // 7 days
      'image/webp': 604800,  // 7 days
      'image/avif': 604800,  // 7 days
      'image/gif': 604800,   // 7 days
      'image/svg+xml': 2592000 // 30 days
    }
  },
  tags: {
    enabled: true,
    prefix: 'img-',
    includeImageDimensions: true,
    includeFormat: true,
    includeQuality: true,
    includeDerivative: true,
    customTags: [],
    maxTags: 10
  },
  bypass: {
    paths: [
      '/admin/',
      '/preview/',
      '/draft/',
      '/temp/',
      '/test/'
    ],
    params: ['nocache', 'refresh', 'force-refresh'],
    inDevelopment: true,
    forAdmin: true,
    formats: []
  },
  transformCache: {
    enabled: true,
    binding: 'IMAGE_TRANSFORMATIONS_CACHE',
    prefix: 'transform',
    maxSize: 26214400, // 25MB
    defaultTtl: 86400, // 1 day
    backgroundIndexing: true,
    disallowedPaths: [
      '/admin/',
      '/preview/',
      '/draft/',
      '/temp/'
    ]
  }
};

/**
 * Cache module registration
 */
export const cacheModuleRegistration: ModuleRegistration = {
  name: 'cache',
  version: '1.0.0',
  description: 'Cache configuration settings',
  schema: CACHE_SCHEMA,
  defaults: DEFAULT_CACHE_CONFIG
};

/**
 * Cache module instance
 */
export const cacheModule: ConfigModule = {
  _meta: {
    name: cacheModuleRegistration.name,
    version: cacheModuleRegistration.version,
    description: cacheModuleRegistration.description,
    schema: cacheModuleRegistration.schema,
    defaults: cacheModuleRegistration.defaults
  },
  config: DEFAULT_CACHE_CONFIG
};