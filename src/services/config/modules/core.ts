/**
 * Core configuration module
 * 
 * This module provides the core system settings, including:
 * - Environment information
 * - Feature flags
 * - Debug settings
 * - Logging configuration
 */

import { ConfigModule, ModuleRegistration } from '../interfaces';

/**
 * Core module schema
 */
export const CORE_SCHEMA = {
  type: 'object',
  properties: {
    environment: {
      type: 'string',
      enum: ['development', 'staging', 'production'],
      description: 'Current environment'
    },
    debug: {
      type: 'object',
      properties: {
        enabled: { type: 'boolean', description: 'Master toggle for debug headers' },
        verbose: { type: 'boolean', description: 'Enable verbose debug information' },
        headers: { 
          type: 'array', 
          items: { type: 'string' },
          description: 'Categories of headers to include'
        },
        allowedEnvironments: {
          type: 'array',
          items: { type: 'string' },
          description: 'Environments where debugging is allowed'
        },
        includePerformance: { 
          type: 'boolean', 
          description: 'Include performance timing headers'
        }
      },
      required: ['enabled'],
      description: 'Debug settings'
    },
    features: {
      type: 'object',
      additionalProperties: { type: 'boolean' },
      description: 'Feature flags'
    },
    logging: {
      type: 'object',
      properties: {
        level: { 
          type: 'string', 
          enum: ['DEBUG', 'INFO', 'WARN', 'ERROR'],
          description: 'Minimum log level'
        },
        includeTimestamp: { 
          type: 'boolean', 
          description: 'Whether to include timestamps'
        },
        enableStructuredLogs: { 
          type: 'boolean', 
          description: 'Whether to output logs in JSON format'
        },
        enableBreadcrumbs: { 
          type: 'boolean', 
          description: 'Whether to enable breadcrumb tracing'
        },
        usePino: { 
          type: 'boolean', 
          description: 'Use Pino logger instead of built-in logger'
        },
        prettyPrint: { 
          type: 'boolean', 
          description: 'Format logs in a human-readable format'
        },
        colorize: { 
          type: 'boolean', 
          description: 'Use colors in pretty-printed logs'
        }
      },
      required: ['level'],
      description: 'Logging configuration'
    }
  },
  required: ['environment'],
  description: 'Core system settings'
};

/**
 * Default core configuration
 */
export const DEFAULT_CORE_CONFIG = {
  environment: 'development',
  debug: {
    enabled: true,
    verbose: true,
    headers: ['ir', 'cache', 'mode', 'client-hints', 'ua', 'device', 'strategy'],
    allowedEnvironments: ['development', 'staging'],
    includePerformance: true
  },
  features: {
    enableAkamaiCompatibility: true,
    enableAkamaiAdvancedFeatures: true,
    optimizedLogging: true,
    lazyServiceInitialization: true,
    optimizedClientDetection: true,
    optimizedCaching: true,
    optimizedMetadataFetching: true
  },
  logging: {
    level: 'DEBUG',
    includeTimestamp: true,
    enableStructuredLogs: true,
    enableBreadcrumbs: true,
    usePino: true,
    prettyPrint: true,
    colorize: true
  }
};

/**
 * Core module registration
 */
export const coreModuleRegistration: ModuleRegistration = {
  name: 'core',
  version: '1.0.0',
  description: 'Core system settings',
  schema: CORE_SCHEMA,
  defaults: DEFAULT_CORE_CONFIG
};

/**
 * Core module instance
 */
export const coreModule: ConfigModule = {
  _meta: {
    name: coreModuleRegistration.name,
    version: coreModuleRegistration.version,
    description: coreModuleRegistration.description,
    schema: coreModuleRegistration.schema,
    defaults: coreModuleRegistration.defaults
  },
  config: DEFAULT_CORE_CONFIG
};