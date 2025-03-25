/**
 * Core Pino logger implementation for the image resizer worker
 * 
 * This module provides the base Pino logger setup with configuration mappings
 * from our existing logger options to Pino options.
 */

import pino, { Logger as PinoLogger } from 'pino';
import { ImageResizerConfig } from '../config';
import { LogLevel, LogData } from './logging';

// Map our log levels to Pino levels
const LOG_LEVEL_MAP: Record<LogLevel | string, string> = {
  [LogLevel.DEBUG]: 'debug',
  [LogLevel.INFO]: 'info',
  [LogLevel.WARN]: 'warn',
  [LogLevel.ERROR]: 'error',
  'DEBUG': 'debug',
  'INFO': 'info',
  'WARN': 'warn',
  'ERROR': 'error'
};

// Fields that should be redacted for security/privacy
const SENSITIVE_FIELDS = [
  'password',
  'token',
  'secret',
  'authorization',
  'key',
  'apiKey',
  'auth',
  'credentials',
  'jwt'
];

/**
 * Creates a properly configured Pino logger instance
 * 
 * @param config The image resizer configuration
 * @param context Optional context name for the logger
 * @returns A configured Pino logger instance
 */
export function createPinoInstance(
  config: ImageResizerConfig,
  context?: string
): PinoLogger {
  // Extract logging config with safe defaults
  const loggingConfig = config.logging || {} as Record<string, unknown>;
  
  // Determine log level
  const configuredLevel = (loggingConfig.level as string) || 'INFO';
  const pinoLevel = LOG_LEVEL_MAP[configuredLevel] || 'info';
  
  // Configure base options
  const pinoOptions: pino.LoggerOptions = {
    // Core options
    level: pinoLevel,
    // We use timestamp option for consistency with our existing logger
    timestamp: (loggingConfig.includeTimestamp as boolean) !== false,
    // Set message key for proper formatting
    messageKey: 'message',
    // Set base properties for context
    base: context ? { context } : {},
    // Use browser-compatible settings for Cloudflare Workers
    browser: {
      asObject: true
    },
    // Redaction configuration for sensitive fields
    redact: {
      paths: SENSITIVE_FIELDS,
      censor: '[REDACTED]'
    }
  };
  
  // Apply pretty printing if enabled
  const isPrettyPrint = (loggingConfig.prettyPrint as boolean) === true;
  const useColors = (loggingConfig.colorize as boolean) === true;
  
  if (isPrettyPrint) {
    pinoOptions.transport = {
      target: 'pino-pretty',
      options: {
        colorize: useColors,
        translateTime: true,
        ignore: 'pid,hostname',
        // Custom formatting
        messageFormat: '{levelLabel} {if context} [{context}]{end} {if breadcrumb} 🔶{end} {msg}',
        // Create custom level labels
        customLevels: {
          10: 'TRACE',
          20: 'DEBUG',
          30: 'INFO',
          40: 'WARN',
          50: 'ERROR',
          60: 'FATAL'
        },
        customColors: 'debug:blue,info:green,warn:yellow,error:red'
      }
    };
  }
  
  // Create the logger instance
  return pino(pinoOptions);
}

/**
 * Helper function to convert our LogData to Pino format
 * 
 * @param data Optional log data in our format
 * @returns Log data formatted for Pino
 */
export function prepareLogData(data?: LogData): Record<string, unknown> {
  if (!data) return {};
  
  // If data is already an object, just return it
  if (typeof data === 'object' && data !== null) {
    return data;
  }
  
  // Otherwise wrap non-object data
  return { data };
}