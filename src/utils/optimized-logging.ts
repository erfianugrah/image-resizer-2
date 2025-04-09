/**
 * Optimized logging utilities for the image resizer worker
 * 
 * This module provides a compatibility layer for the optimized logging interface,
 * maintaining the same API while delegating to Pino underneath.
 */

import { ImageResizerConfig } from '../config';
import { LogLevel, LogData, Logger } from './logging';
import { createOptimizedPinoLogger } from './pino-optimized';

/**
 * Enhanced logger interface with level checking capabilities
 */
export interface OptimizedLogger extends Logger {
  /**
   * Check if a specific log level is enabled
   * @param level The log level to check
   * @returns true if the level is enabled, false otherwise
   */
  isLevelEnabled(level: keyof typeof LogLevel): boolean;
  
  /**
   * Get the current minimum log level
   */
  getMinLevel(): LogLevel;
  
  /**
   * Enhanced breadcrumb method that only records timing when performance
   * tracking is enabled.
   * @param step The breadcrumb step name
   * @param startTime The start time to measure from (optional)
   * @param data Additional data to log
   * @returns The current time for chaining performance measurements
   */
  trackedBreadcrumb(step: string, startTime?: number, data?: LogData): number;
}

/**
 * Create an optimized logger instance with enhanced performance characteristics
 * 
 * @param config The image resizer configuration
 * @param context Optional context name for the logger
 * @returns An optimized logger object with additional helpers
 */
export function createOptimizedLogger(config: ImageResizerConfig, context?: string): OptimizedLogger {
  // Delegate to the Pino implementation
  return createOptimizedPinoLogger(config, context);
}