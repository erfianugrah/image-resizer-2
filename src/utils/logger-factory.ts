/**
 * Logger factory to support both legacy and Pino-based logging
 * 
 * This module provides a unified factory function that can create either
 * the legacy logger or the new Pino-based logger based on configuration.
 */

import { ImageResizerConfig } from '../config';
import { Logger, createLogger as createLegacyLogger } from './logging';
import { OptimizedLogger, createOptimizedLogger as createLegacyOptimizedLogger } from './optimized-logging';
import { createCompatiblePinoLogger, createOptimizedPinoLogger } from './pino-index';

/**
 * Create a logger instance using either legacy or Pino implementation
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
  // Check if Pino is enabled in config
  const usePino = config.logging?.usePino === true;
  
  if (usePino) {
    // Use Pino implementations
    return useOptimized
      ? createOptimizedPinoLogger(config, context)
      : createCompatiblePinoLogger(config, context);
  } else {
    // Use original implementations
    return useOptimized
      ? createLegacyOptimizedLogger(config, context)
      : createLegacyLogger(config, context);
  }
}