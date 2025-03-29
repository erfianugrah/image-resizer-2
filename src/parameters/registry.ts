/**
 * Parameter Registry - Defines all supported transformation parameters
 */

import { TransformParameterDefinition } from '../utils/path';

/**
 * Central registry of all supported parameters with their definitions
 */
export const parameterRegistry: Record<string, TransformParameterDefinition> = {
  width: {
    name: 'width',
    aliases: ['w'],
    type: 'auto-or-number',
    validator: (value) => value === 'auto' || (typeof value === 'number' && value > 0),
    defaultValue: null, // No default, use responsive logic or original dimensions
    priority: 100,
  },
  height: {
    name: 'height',
    aliases: ['h'],
    type: 'auto-or-number',
    validator: (value) => value === 'auto' || (typeof value === 'number' && value > 0),
    defaultValue: null, // No default, use responsive logic or original dimensions
    priority: 100,
  },
  aspect: {
    name: 'aspect',
    aliases: ['r'],
    type: 'string',
    validator: (value) => /^\d+:\d+$|^\d+-\d+$/.test(value),
    priority: 90,
  },
  focal: {
    name: 'focal',
    aliases: ['p'],
    type: 'coordinate',
    validator: (value) => {
      if (typeof value !== 'string') return false;
      const [x, y] = value.split(',').map(v => parseFloat(v));
      return !isNaN(x) && !isNaN(y) && x >= 0 && x <= 1 && y >= 0 && y <= 1;
    },
    priority: 80,
  },
  ctx: {
    name: 'ctx',
    aliases: ['s', 'smart'], // Support both new compact form and legacy parameter
    type: 'boolean',
    validator: (value) => typeof value === 'boolean' || value === 'true' || value === 'false',
    priority: 70,
  },
  fit: {
    name: 'fit',
    type: 'enum',
    allowedValues: ['cover', 'contain', 'crop', 'pad', 'scale-down'],
    defaultValue: 'cover',
    priority: 85,
  },
  format: {
    name: 'format',
    type: 'enum',
    allowedValues: ['webp', 'avif', 'jpeg', 'png', 'auto', 'json', 'baseline-jpeg'],
    defaultValue: 'auto',
    priority: 95,
  },
  quality: {
    name: 'quality',
    type: 'auto-or-number',
    validator: (value) => {
      if (value === 'auto') return true;
      if (typeof value === 'string') {
        const qualityEnums = ['high', 'medium-high', 'medium-low', 'low'];
        return qualityEnums.includes(value);
      }
      return typeof value === 'number' && value >= 1 && value <= 100;
    },
    defaultValue: 85,
    priority: 75,
  },
  f: {
    name: 'f',
    type: 'size-code',
    allowedValues: [
      'xxu', 'xu', 'u', 'xxxs', 'xxs', 'xs', 's', 'm', 'l',
      'xl', 'xxl', 'xxxl', 'sg', 'g', 'xg', 'xxg'
    ],
    priority: 60,
  },
  dpr: {
    name: 'dpr',
    type: 'number',
    validator: (value) => typeof value === 'number' && value >= 1 && value <= 3,
    defaultValue: 1,
    priority: 65,
  },
  gravity: {
    name: 'gravity',
    type: 'string',
    allowedValues: [
      'center', 'face', 'auto', 'left', 'right', 'top', 'bottom',
      'top-left', 'top-right', 'bottom-left', 'bottom-right'
    ],
    defaultValue: 'center',
    priority: 80,
  },
  blur: {
    name: 'blur',
    type: 'number',
    validator: (value) => typeof value === 'number' && value >= 1 && value <= 250,
    priority: 50,
  },
  sharpen: {
    name: 'sharpen',
    type: 'number',
    validator: (value) => value === true || (typeof value === 'number' && value >= 0 && value <= 10),
    priority: 50,
  },
  brightness: {
    name: 'brightness',
    type: 'number',
    validator: (value) => typeof value === 'number' && value >= 0 && value <= 10,
    defaultValue: 1,
    priority: 50,
  },
  contrast: {
    name: 'contrast',
    type: 'number',
    validator: (value) => typeof value === 'number' && value >= 0 && value <= 10,
    defaultValue: 1,
    priority: 50,
  },
  saturation: {
    name: 'saturation',
    type: 'number',
    validator: (value) => typeof value === 'number' && value >= 0 && value <= 10,
    defaultValue: 1,
    priority: 50,
  },
  rotate: {
    name: 'rotate',
    type: 'enum',
    allowedValues: [0, 90, 180, 270],
    defaultValue: 0,
    priority: 60,
  },
  flip: {
    name: 'flip',
    type: 'enum',
    allowedValues: [true, false, 'h', 'v', 'hv', 'horizontal', 'vertical', 'both'],
    priority: 60,
  },
  flop: {
    name: 'flop',
    type: 'boolean',
    priority: 55,
  },
  trim: {
    name: 'trim',
    type: 'boolean',
    priority: 65,
  },
  background: {
    name: 'background',
    type: 'string',
    validator: (value) => typeof value === 'string' && (value === 'transparent' || /^#[0-9A-Fa-f]{6}$/.test(value)),
    priority: 65,
  },
  metadata: {
    name: 'metadata',
    type: 'enum',
    allowedValues: ['none', 'copyright', 'keep'],
    defaultValue: 'none',
    priority: 60,
  },
  strip: {
    name: 'strip',
    type: 'boolean',
    defaultValue: false,
    priority: 60,
  },
  anim: {
    name: 'anim',
    type: 'boolean',
    defaultValue: true,
    priority: 65,
  },
  derivative: {
    name: 'derivative',
    type: 'string',
    priority: 110, // Higher priority than individual parameters
  },
  platform: {
    name: 'platform',
    type: 'enum',
    allowedValues: ['web', 'mobile', 'ios', 'android'],
    priority: 40,
  },
  content: {
    name: 'content',
    type: 'enum',
    allowedValues: ['portrait', 'product', 'banner'],
    priority: 40,
  },
  device: {
    name: 'device',
    type: 'enum',
    allowedValues: ['mobile', 'tablet', 'desktop'],
    priority: 40,
  },
  allowExpansion: {
    name: 'allowExpansion',
    type: 'boolean',
    defaultValue: false,
    priority: 70,
  },
  compression: {
    name: 'compression',
    type: 'enum',
    allowedValues: ['fast'],
    priority: 40,
  },
  'origin-auth': {
    name: 'origin-auth',
    type: 'string',
    priority: 40,
  },
  onerror: {
    name: 'onerror',
    type: 'enum',
    allowedValues: ['redirect'],
    priority: 45,
  },
  // Include additional parameters here
};

/**
 * Size code mapping for the 'f' parameter
 */
export const sizeCodeMap: Record<string, number> = {
  'xxu': 40,
  'xu': 80,
  'u': 160,
  'xxxs': 300,
  'xxs': 400,
  'xs': 500,
  's': 600,
  'm': 700,
  'l': 750,
  'xl': 900,
  'xxl': 1100,
  'xxxl': 1400,
  'sg': 1600,
  'g': 2000,
  'xg': 3000,
  'xxg': 4000
};