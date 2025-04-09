/**
 * Logger factory to support both legacy and Pino-based logging
 * 
 * This module provides a unified factory function that can create either
 * the legacy logger or the new Pino-based logger based on configuration.
 * It also supports creating performance-enhanced Pino loggers for performance-critical code paths.
 */

import { ImageResizerConfig } from '../config';
import { Logger, createLogger as createLegacyLogger } from './logging';
import { OptimizedLogger, createOptimizedLogger as createLegacyOptimizedLogger } from './optimized-logging';
import { 
  createCompatiblePinoLogger, 
  createOptimizedPinoLogger,
  createPerformancePinoLogger,
  createOptimizedPerformancePinoLogger
} from './pino-index';
import { PerformanceBaseline } from './performance-metrics';

// Extended interfaces for performance-enhanced loggers
export interface PerformanceLogger extends Logger {
  withPerformance: (metrics: Record<string, number>) => Logger;
  startTimer: (operationName: string) => any;
  recordOperation: (category: string, operation: string, duration: number, data?: Record<string, unknown>) => void;
}

export interface OptimizedPerformanceLogger extends OptimizedLogger {
  withPerformance: (metrics: Record<string, number>) => OptimizedLogger;
  startTimer: (operationName: string) => any;
  recordOperation: (category: string, operation: string, duration: number, data?: Record<string, unknown>) => void;
  trackMetrics: (metrics: any) => void;
}

/**
 * Create a logger instance using Pino implementation by default
 * 
 * @param config The image resizer configuration
 * @param context Optional context name for the logger
 * @param useOptimized Whether to use the optimized logger implementation
 * @returns A logger object
 */
export function createLogger(
  config: ImageResizerConfig,
  context?: string,
  useOptimized: boolean = false
): Logger | OptimizedLogger {
  // Use Pino by default, unless explicitly disabled
  const useLegacy = config.logging?.useLegacy === true;
  
  if (useLegacy) {
    // Use original implementations if explicitly requested
    return useOptimized
      ? createLegacyOptimizedLogger(config, context)
      : createLegacyLogger(config, context);
  } else {
    // Use Pino implementations by default
    return useOptimized
      ? createOptimizedPinoLogger(config, context)
      : createCompatiblePinoLogger(config, context);
  }
}

/**
 * Create a performance-enhanced logger instance
 * 
 * This version of the logger includes additional methods for performance tracking
 * and automatically attaches performance metrics to log entries.
 * 
 * @param config The image resizer configuration
 * @param context Optional context name for the logger
 * @param performanceBaseline Optional performance baseline instance for recording metrics
 * @param useOptimized Whether to use the optimized logger implementation
 * @returns A performance-enhanced logger object
 */
export function createPerformanceLogger(
  config: ImageResizerConfig,
  context?: string,
  performanceBaseline?: PerformanceBaseline,
  useOptimized: boolean = false
): PerformanceLogger | OptimizedPerformanceLogger {
  // Use Pino by default, unless explicitly disabled
  const useLegacy = config.logging?.useLegacy === true;
  
  if (useLegacy) {
    // Legacy loggers don't have performance enhancements, so just return regular loggers
    return useOptimized
      ? createLegacyOptimizedLogger(config, context) as unknown as OptimizedPerformanceLogger
      : createLegacyLogger(config, context) as unknown as PerformanceLogger;
  } else {
    // Use performance-enhanced Pino implementations
    return useOptimized
      ? createOptimizedPerformancePinoLogger(config, context, performanceBaseline)
      : createPerformancePinoLogger(config, context, performanceBaseline);
  }
}