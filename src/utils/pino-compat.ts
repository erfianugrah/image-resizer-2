/**
 * Compatibility layer for Pino logger integration
 * 
 * This module provides adapters that implement our Logger interface
 * using Pino as the underlying implementation.
 */

import { ImageResizerConfig } from '../config';
import { Logger, LogData, 
  // LogLevel is imported for consistency with other modules
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  LogLevel 
} from './logging';
import { createPinoInstance, prepareLogData } from './pino-core';

/**
 * Create a logger instance using Pino that's compatible with our Logger interface
 * 
 * @param config The image resizer configuration
 * @param context Optional context name for the logger
 * @returns A logger object implementing our Logger interface
 */
export function createCompatiblePinoLogger(
  config: ImageResizerConfig,
  context?: string
): Logger {
  // Create the underlying Pino instance
  const pinoLogger = createPinoInstance(config, context);
  
  // Extract and normalize logging configuration
  const loggingConfig = config.logging || {
    level: 'INFO',
    includeTimestamp: true,
    enableStructuredLogs: false,
    enableBreadcrumbs: true
  };
  
  // Determine if breadcrumbs are enabled (default to true)
  const enableBreadcrumbs = loggingConfig.enableBreadcrumbs !== false;
  
  // Determine if structured logs are enabled (default to false)
  const useStructuredLogs = loggingConfig.enableStructuredLogs === true;
  
  /**
   * Log a message at DEBUG level
   * 
   * @param message The message to log
   * @param data Optional data to include in the log
   */
  function debug(message: string, data?: LogData): void {
    pinoLogger.debug(prepareLogData(data), message);
  }
  
  /**
   * Log a message at INFO level
   * 
   * @param message The message to log
   * @param data Optional data to include in the log
   */
  function info(message: string, data?: LogData): void {
    pinoLogger.info(prepareLogData(data), message);
  }
  
  /**
   * Log a message at WARN level
   * 
   * @param message The message to log
   * @param data Optional data to include in the log
   */
  function warn(message: string, data?: LogData): void {
    pinoLogger.warn(prepareLogData(data), message);
  }
  
  /**
   * Log a message at ERROR level
   * 
   * @param message The message to log
   * @param data Optional data to include in the log
   */
  function error(message: string, data?: LogData): void {
    pinoLogger.error(prepareLogData(data), message);
  }
  
  /**
   * Log a breadcrumb entry for tracking the execution path
   * 
   * @param step The description of the execution step
   * @param duration Optional duration in milliseconds
   * @param data Optional additional data
   */
  function breadcrumb(step: string, duration?: number, data?: LogData): void {
    if (enableBreadcrumbs) {
      // Create the breadcrumb data object
      const breadcrumbData = {
        type: 'breadcrumb',
        breadcrumb: true, // Flag for pretty printing
        ...(useStructuredLogs ? prepareLogData(data) : {}),
        ...(duration !== undefined ? { durationMs: duration } : {})
      };
      
      // If not using structured logs, add data directly to the message
      let message = `BREADCRUMB: ${step}`;
      if (!useStructuredLogs && data) {
        try {
          // Try to format data as a string if it's not already an object
          const dataStr = typeof data === 'object' 
            ? JSON.stringify(data)
            : String(data);
          message += ` ${dataStr}`;
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (e) {
          // The error details are intentionally ignored
          // If JSON stringification fails, just add data as-is
          // We intentionally ignore the error details
          message += ` ${data}`;
        }
      }
      
      // Log at INFO level
      pinoLogger.info(breadcrumbData, message);
    }
  }
  
  // Return the logger interface implementation
  return {
    debug,
    info,
    warn,
    error,
    breadcrumb
  };
}