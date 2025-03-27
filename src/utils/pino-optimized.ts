/**
 * Optimized Pino logger implementation for the image resizer worker
 * 
 * This module provides a performance-optimized Pino-based implementation
 * that extends our OptimizedLogger interface.
 */

import { ImageResizerConfig } from '../config';
import { LogLevel, LogData } from './logging';
import { OptimizedLogger } from './optimized-logging';
import { createCompatiblePinoLogger } from './pino-compat';
import { createPinoInstance } from './pino-core';

// Explicit type mappings from string log levels to enum values
const LOG_LEVEL_MAP: Record<string, LogLevel> = {
  'DEBUG': LogLevel.DEBUG,
  'INFO': LogLevel.INFO,
  'WARN': LogLevel.WARN,
  'ERROR': LogLevel.ERROR
};

// Pino has level numbers that are inverse of our levels
// Higher number = higher priority in Pino
const PINO_LEVEL_MAP: Record<keyof typeof LogLevel, number> = {
  'DEBUG': 20,
  'INFO': 30,
  'WARN': 40, 
  'ERROR': 50
};

// Mapping from Pino level names to numeric values
const PINO_LEVEL_VALUES: Record<string, number> = {
  'debug': 20,
  'info': 30,
  'warn': 40,
  'error': 50,
  'fatal': 60,
  'trace': 10,
  'silent': Infinity
};

/**
 * Create an optimized logger instance with Pino
 * 
 * @param config The image resizer configuration
 * @param context Optional context name for the logger
 * @returns An optimized logger object with additional helpers
 */
export function createOptimizedPinoLogger(
  config: ImageResizerConfig,
  context?: string
): OptimizedLogger {
  // Create the base logger
  const baseLogger = createCompatiblePinoLogger(config, context);
  
  // Get the underlying Pino instance for direct operations
  const pinoLogger = createPinoInstance(config, context);
  
  // Extract configuration values (safely)
  const loggingConfig = config.logging || {
    level: 'INFO',
    includeTimestamp: true,
    enableStructuredLogs: false,
    enableBreadcrumbs: true
  };
  const debugConfig = config.debug || {
    enabled: false,
    headers: [],
    allowedEnvironments: [],
    verbose: false,
    includePerformance: true
  };
  
  const configuredLevel = loggingConfig.level || 'INFO';
  const minLevel = LOG_LEVEL_MAP[configuredLevel] || LogLevel.INFO;
  const enableBreadcrumbs = loggingConfig.enableBreadcrumbs !== false;
  const enablePerformanceTracking = debugConfig.includePerformance !== false;
  
  /**
   * Checks if a specific log level is enabled
   * 
   * @param level The log level to check
   * @returns True if the level is enabled, false otherwise
   */
  function isLevelEnabled(level: keyof typeof LogLevel): boolean {
    // Get the level value for the requested level
    const requestedLevelValue = PINO_LEVEL_MAP[level] || PINO_LEVEL_VALUES.info;
    
    // Get the current level from the logger
    // If pinoLogger.level is not a string (which it should be), default to 'info'
    const currentLevelName = typeof pinoLogger.level === 'string' ? pinoLogger.level : 'info';
    const currentLevelValue = PINO_LEVEL_VALUES[currentLevelName] || PINO_LEVEL_VALUES.info;
    
    // In Pino, level numbers work opposite to what we want:
    // - Higher number = higher priority
    // - A level is enabled if its value is >= the current level
    // If current level is 'info' (30), and requested level is 'debug' (20),
    // debug will not be enabled because 20 < 30.
    return requestedLevelValue >= currentLevelValue;
  }
  
  /**
   * Records a breadcrumb with optional performance tracking
   * 
   * @param step The step description for the breadcrumb
   * @param startTime Optional start time for duration calculation
   * @param data Optional additional data for the breadcrumb
   * @returns The current timestamp
   */
  function trackedBreadcrumb(step: string, startTime?: number, data?: LogData): number {
    const now = Date.now();
    
    if (enableBreadcrumbs && enablePerformanceTracking && startTime !== undefined) {
      const duration = now - startTime;
      baseLogger.breadcrumb(step, duration, data);
    } else if (enableBreadcrumbs) {
      baseLogger.breadcrumb(step, undefined, data);
    }
    
    return now;
  }
  
  /**
   * Gets the minimum log level configured for this logger
   * 
   * @returns The minimum log level
   */
  function getMinLevel(): LogLevel {
    return minLevel;
  }
  
  // Return the optimized logger with all required methods
  return {
    ...baseLogger,
    isLevelEnabled,
    getMinLevel,
    trackedBreadcrumb
  };
}