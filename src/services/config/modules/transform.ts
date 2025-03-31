/**
 * Transform configuration module
 * 
 * This module provides configuration for image transformation, including:
 * - Default transformation settings
 * - Format quality settings
 * - Derivatives
 * - Size codes
 */

import { ConfigModule, ModuleRegistration } from '../interfaces';

/**
 * Transform module schema
 */
export const TRANSFORM_SCHEMA = {
  type: 'object',
  properties: {
    defaults: {
      type: 'object',
      properties: {
        quality: {
          type: 'number',
          minimum: 1,
          maximum: 100,
          description: 'Default image quality'
        },
        format: {
          type: 'string',
          description: 'Default output format'
        },
        fit: {
          type: 'string',
          enum: ['scale-down', 'contain', 'cover', 'crop', 'pad'],
          description: 'Default fit mode'
        },
        metadata: {
          type: 'string',
          enum: ['none', 'copyright', 'keep'],
          description: 'Default metadata handling'
        }
      },
      description: 'Default transformation settings'
    },
    formatQuality: {
      type: 'object',
      additionalProperties: {
        type: 'number',
        minimum: 1,
        maximum: 100
      },
      description: 'Quality settings by format'
    },
    derivatives: {
      type: 'object',
      additionalProperties: {
        type: 'object'
      },
      description: 'Pre-defined transformation templates'
    },
    sizeCodes: {
      type: 'object',
      additionalProperties: {
        type: 'number',
        minimum: 1
      },
      description: 'Size code mappings'
    }
  },
  description: 'Image transformation settings'
};

/**
 * Default transform configuration
 */
export const DEFAULT_TRANSFORM_CONFIG = {
  defaults: {
    quality: 85,
    format: 'auto',
    fit: 'scale-down',
    metadata: 'none'
  },
  formatQuality: {
    'webp': 85,
    'avif': 80,
    'jpeg': 85,
    'png': 90,
    'gif': 85
  },
  derivatives: {
    'thumbnail': {
      width: 320,
      height: 150,
      fit: 'cover',
      gravity: 'auto'
    },
    'avatar': {
      width: 180,
      height: 180,
      fit: 'cover',
      gravity: 'face'
    },
    'banner': {
      width: 1600,
      height: 400,
      fit: 'cover',
      gravity: 'auto'
    },
    'product': {
      width: 800,
      height: 800,
      fit: 'contain',
      background: 'white'
    },
    'og': {
      width: 1200,
      height: 630,
      fit: 'cover',
      gravity: 'auto'
    },
    'twitter': {
      width: 1200,
      height: 600,
      fit: 'cover',
      gravity: 'auto'
    },
    'mobile': {
      width: 480,
      format: 'auto',
      quality: 80
    },
    'desktop': {
      width: 1440,
      format: 'auto',
      quality: 85
    }
  },
  sizeCodes: {
    'xxu': 40,    // Extra extra ultra small
    'xu': 80,     // Extra ultra small
    'u': 160,     // Ultra small
    'xxxs': 300,  // Triple extra small
    'xxs': 400,   // Double extra small
    'xs': 500,    // Extra small
    's': 600,     // Small
    'm': 700,     // Medium
    'l': 750,     // Large
    'xl': 900,    // Extra large
    'xxl': 1100,  // Double extra large
    'xxxl': 1400, // Triple extra large
    'sg': 1600,   // Small giant
    'g': 2000,    // Giant
    'xg': 3000,   // Extra giant
    'xxg': 4000   // Double extra giant
  }
};

/**
 * Transform module registration
 */
export const transformModuleRegistration: ModuleRegistration = {
  name: 'transform',
  version: '1.0.0',
  description: 'Image transformation settings',
  schema: TRANSFORM_SCHEMA,
  defaults: DEFAULT_TRANSFORM_CONFIG
};

/**
 * Transform module instance
 */
export const transformModule: ConfigModule = {
  _meta: {
    name: transformModuleRegistration.name,
    version: transformModuleRegistration.version,
    description: transformModuleRegistration.description,
    schema: transformModuleRegistration.schema,
    defaults: transformModuleRegistration.defaults
  },
  config: DEFAULT_TRANSFORM_CONFIG
};