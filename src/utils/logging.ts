/**
 * Logging utilities for the image resizer worker
 * 
 * This module provides centralized logging functions with configurable log levels
 * and structured logging capabilities. It serves as a compatibility layer that
 * delegates to Pino, allowing for a smooth transition to the new logging system.
 */

import { ImageResizerConfig } from '../config';
import { createCompatiblePinoLogger } from './pino-compat';
import { createOptimizedPinoLogger } from './pino-optimized';
import { OptimizedLogger } from './optimized-logging';

// Define log levels for compatibility with existing code
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3
}

// Type for log data with flexible structure but known types - kept for compatibility
export type LogData = Record<string, string | number | boolean | null | undefined | string[] | number[] | Record<string, string | number | boolean | null | undefined>>;

/**
 * Logger interface - kept the same for backward compatibility
 */
export interface Logger {
  debug(message: string, data?: LogData): void;
  info(message: string, data?: LogData): void;
  warn(message: string, data?: LogData): void;
  error(message: string, data?: LogData): void;
  breadcrumb(step: string, duration?: number, data?: LogData): void;
}

/**
 * Create a logger instance - wrapper that uses Pino underneath
 * 
 * @param config The image resizer configuration
 * @param context Optional context name for the logger (e.g., 'Akamai', 'Storage')
 * @param useOptimized Whether to use the optimized logger implementation
 * @returns A logger object
 */
export function createLogger(
  config: ImageResizerConfig, 
  context?: string, 
  useOptimized: boolean = false
): Logger | OptimizedLogger {
  // Use Pino implementations based on optimization preference
  return useOptimized
    ? createOptimizedPinoLogger(config, context)
    : createCompatiblePinoLogger(config, context);
}

// Export a default logger that can be used before config is loaded
// This now uses a simplified Pino logger without full configuration
export const defaultLogger: Logger = createCompatiblePinoLogger({
  environment: 'development',
  version: '1.0.0',
  debug: { 
    enabled: true, 
    headers: [], 
    allowedEnvironments: [], 
    verbose: false, 
    includePerformance: false 
  },
  cache: {
    method: 'cf',
    ttl: { ok: 86400, clientError: 60, serverError: 10 },
    cacheability: true
  },
  responsive: {
    breakpoints: [320, 640, 768, 1024, 1440, 1920],
    deviceWidths: { mobile: 480, tablet: 768, desktop: 1440 },
    quality: 85,
    fit: 'scale-down',
    format: 'auto',
    metadata: 'none'
  },
  storage: {
    priority: ['r2', 'remote', 'fallback'],
    r2: { enabled: false, bindingName: 'IMAGES_BUCKET' }
  },
  derivatives: {},
  logging: {
    level: 'DEBUG',
    includeTimestamp: true,
    enableStructuredLogs: true,
    enableBreadcrumbs: true,
    useLegacy: false,
    prettyPrint: false,
    colorize: false
  }
}, 'default');