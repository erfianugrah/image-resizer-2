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