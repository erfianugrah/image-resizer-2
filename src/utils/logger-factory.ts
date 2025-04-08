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
  // Always use Pino unless explicitly disabled with usePino=false
  const usePino = config.logging?.usePino !== false;
  
  // Ensure config.logging exists
  if (!config.logging) {
    config.logging = {
      level: 'INFO',
      includeTimestamp: true,
      enableStructuredLogs: true
    };
  }
  
  // Force usePino to true if not explicitly disabled
  config.logging.usePino = usePino;
  
  // Use appropriate logger implementation
  if (usePino) {
    // Use Pino implementations
    return useOptimized
      ? createOptimizedPinoLogger(config, context)
      : createCompatiblePinoLogger(config, context);
  } else {
    // Legacy implementations - only used if explicitly requested
    return useOptimized
      ? createLegacyOptimizedLogger(config, context)
      : createLegacyLogger(config, context);
  }
}