/**
 * Storage configuration module
 * 
 * This module provides configuration for storage operations, including:
 * - Storage priority order
 * - R2 settings
 * - Remote URL settings
 * - Fallback URL settings
 * - Authentication settings
 */

import { ConfigModule, ModuleRegistration } from '../interfaces';

/**
 * Storage module schema
 */
export const STORAGE_SCHEMA = {
  type: 'object',
  properties: {
    priority: {
      type: 'array',
      items: {
        type: 'string',
        enum: ['r2', 'remote', 'fallback']
      },
      description: 'Storage priority order'
    },
    r2: {
      type: 'object',
      properties: {
        enabled: {
          type: 'boolean',
          description: 'Enable R2 storage'
        },
        bindingName: {
          type: 'string',
          description: 'R2 bucket binding name'
        }
      },
      required: ['enabled'],
      description: 'R2 storage configuration'
    },
    remote: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'Remote URL for images'
        },
        auth: {
          type: 'object',
          properties: {
            enabled: {
              type: 'boolean',
              description: 'Enable authentication for remote URL'
            },
            type: {
              type: 'string',
              enum: ['aws-s3', 'bearer', 'header', 'query'],
              description: 'Authentication type'
            }
          },
          required: ['enabled'],
          description: 'Remote URL authentication settings'
        },
        fetchOptions: {
          type: 'object',
          properties: {
            userAgent: {
              type: 'string',
              description: 'User agent for fetch requests'
            },
            headers: {
              type: 'object',
              additionalProperties: {
                type: 'string'
              },
              description: 'Additional headers for fetch requests'
            }
          },
          description: 'Fetch options for remote URL'
        }
      },
      description: 'Remote URL configuration'
    },
    fallback: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          description: 'Fallback URL for images'
        },
        auth: {
          type: 'object',
          properties: {
            enabled: {
              type: 'boolean',
              description: 'Enable authentication for fallback URL'
            },
            type: {
              type: 'string',
              enum: ['aws-s3', 'bearer', 'header', 'query'],
              description: 'Authentication type'
            }
          },
          required: ['enabled'],
          description: 'Fallback URL authentication settings'
        }
      },
      description: 'Fallback URL configuration'
    },
    auth: {
      type: 'object',
      properties: {
        useOriginAuth: {
          type: 'boolean',
          description: 'Use Cloudflare origin-auth feature'
        },
        sharePublicly: {
          type: 'boolean',
          description: 'Share authenticated images publicly'
        },
        securityLevel: {
          type: 'string',
          enum: ['strict', 'permissive'],
          description: 'How to handle auth errors'
        },
        cacheTtl: {
          type: 'number',
          description: 'TTL for authenticated requests in seconds'
        }
      },
      description: 'Global authentication settings'
    },
    pathTransforms: {
      type: 'object',
      additionalProperties: {
        type: 'object'
      },
      description: 'Path transformations for directory structure'
    }
  },
  required: ['priority'],
  description: 'Storage configuration settings'
};

/**
 * Default storage configuration
 */
export const DEFAULT_STORAGE_CONFIG = {
  priority: ['r2', 'remote', 'fallback'],
  r2: {
    enabled: true,
    bindingName: 'IMAGES_BUCKET'
  },
  remote: {
    url: 'https://cdn.example.com',
    auth: {
      enabled: false,
      type: 'aws-s3'
    },
    fetchOptions: {
      userAgent: 'Cloudflare-Image-Resizer/1.0',
      headers: {
        'Accept': 'image/*'
      }
    }
  },
  fallback: {
    url: 'https://placehold.com',
    auth: {
      enabled: false,
      type: 'bearer'
    }
  },
  auth: {
    useOriginAuth: false,
    sharePublicly: false,
    securityLevel: 'strict',
    cacheTtl: 3600
  },
  pathTransforms: {
    'images': {
      prefix: '',
      removePrefix: true
    },
    'assets': {
      prefix: 'img/',
      removePrefix: true,
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

/**
 * Storage module registration
 */
export const storageModuleRegistration: ModuleRegistration = {
  name: 'storage',
  version: '1.0.0',
  description: 'Storage configuration settings',
  schema: STORAGE_SCHEMA,
  defaults: DEFAULT_STORAGE_CONFIG
};

/**
 * Storage module instance
 */
export const storageModule: ConfigModule = {
  _meta: {
    name: storageModuleRegistration.name,
    version: storageModuleRegistration.version,
    description: storageModuleRegistration.description,
    schema: storageModuleRegistration.schema,
    defaults: storageModuleRegistration.defaults
  },
  config: DEFAULT_STORAGE_CONFIG
};