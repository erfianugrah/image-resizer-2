/**
 * Optimized logging utilities for the image resizer worker
 * 
 * This module provides a performance-optimized version of the logging system
 * with features to reduce overhead for disabled log levels and expensive operations.
 */

import { ImageResizerConfig } from '../config';
import { LogLevel, LogData, Logger } from './logging';

// Mapping from string log levels to enum values
const LOG_LEVEL_MAP: Record<string, LogLevel> = {
  'DEBUG': LogLevel.DEBUG,
  'INFO': LogLevel.INFO,
  'WARN': LogLevel.WARN,
  'ERROR': LogLevel.ERROR
};

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
  // Get configured log level, defaulting to INFO
  const configuredLevel = config.logging?.level || 'INFO';
  const minLevel = LOG_LEVEL_MAP[configuredLevel] || LogLevel.INFO;
  
  // Include timestamp in logs if configured
  const includeTimestamp = config.logging?.includeTimestamp !== false;
  
  // Enable structured logs if configured
  const useStructuredLogs = config.logging?.enableStructuredLogs === true;
  
  // Enable breadcrumbs if configured
  const enableBreadcrumbs = config.logging?.enableBreadcrumbs !== false;
  
  // Enable performance tracking
  const enablePerformanceTracking = config.debug?.performanceTracking !== false;
  
  // Pre-check if various log levels are enabled to avoid repeated checks
  const isDebugEnabled = minLevel <= LogLevel.DEBUG;
  const isInfoEnabled = minLevel <= LogLevel.INFO;
  const isWarnEnabled = minLevel <= LogLevel.WARN;
  const isErrorEnabled = minLevel <= LogLevel.ERROR;
  const isBreadcrumbEnabled = enableBreadcrumbs && isInfoEnabled;
  
  // Return an optimized logger object with additional helper methods
  return {
    debug(message: string, data?: LogData): void {
      if (isDebugEnabled) {
        logMessage(LogLevel.DEBUG, message, data, context, includeTimestamp, useStructuredLogs);
      }
    },
    
    info(message: string, data?: LogData): void {
      if (isInfoEnabled) {
        logMessage(LogLevel.INFO, message, data, context, includeTimestamp, useStructuredLogs);
      }
    },
    
    warn(message: string, data?: LogData): void {
      if (isWarnEnabled) {
        logMessage(LogLevel.WARN, message, data, context, includeTimestamp, useStructuredLogs);
      }
    },
    
    error(message: string, data?: LogData): void {
      if (isErrorEnabled) {
        logMessage(LogLevel.ERROR, message, data, context, includeTimestamp, useStructuredLogs);
      }
    },
    
    breadcrumb(step: string, duration?: number, data?: LogData): void {
      if (isBreadcrumbEnabled) {
        const breadcrumbData = duration !== undefined 
          ? { ...data, durationMs: duration } 
          : data;
        
        logMessage(
          LogLevel.INFO, 
          `BREADCRUMB: ${step}`, 
          breadcrumbData, 
          context, 
          includeTimestamp, 
          useStructuredLogs,
          true // mark as breadcrumb
        );
      }
    },
    
    // Enhanced methods for performance optimization
    
    isLevelEnabled(level: keyof typeof LogLevel): boolean {
      return minLevel <= LogLevel[level];
    },
    
    getMinLevel(): LogLevel {
      return minLevel;
    },
    
    trackedBreadcrumb(step: string, startTime?: number, data?: LogData): number {
      const now = Date.now();
      
      // Only calculate duration and log if both enabled
      if (isBreadcrumbEnabled && enablePerformanceTracking && startTime !== undefined) {
        const duration = now - startTime;
        this.breadcrumb(step, duration, data);
      } else if (isBreadcrumbEnabled) {
        // Just log the breadcrumb without timing if tracking disabled
        this.breadcrumb(step, undefined, data);
      }
      
      return now;
    }
  };
}

/**
 * Internal function to format and log messages
 * This is copied from the original logging.ts to keep compatibility
 */
function logMessage(
  level: LogLevel,
  message: string,
  data?: LogData,
  context?: string,
  includeTimestamp = true,
  useStructuredLogs = false,
  isBreadcrumb = false
): void {
  // Get level name for display
  const levelName = LogLevel[level];
  
  if (useStructuredLogs) {
    // Create structured log object with known properties
    const logObj: Record<string, string | number | boolean | null | LogData | undefined> = {
      level: levelName,
      message
    };
    
    // Add timestamp if configured
    if (includeTimestamp) {
      logObj.timestamp = new Date().toISOString();
    }
    
    // Add context if provided
    if (context) {
      logObj.context = context;
    }
    
    // Mark as breadcrumb if it is one
    if (isBreadcrumb) {
      logObj.type = 'breadcrumb';
    }
    
    // Add additional data if provided
    if (data) {
      // Avoid overwriting existing properties
      logObj.data = data;
    }
    
    // Log as JSON - use a single operation
    console.log(JSON.stringify(logObj));
  } else {
    // Create formatted log message
    let logMsg = `[${levelName}]`;
    
    // Add timestamp if configured
    if (includeTimestamp) {
      logMsg = `${new Date().toISOString()} ${logMsg}`;
    }
    
    // Add context if provided
    if (context) {
      logMsg = `${logMsg} [${context}]`;
    }
    
    // Add breadcrumb marker for easier visual identification
    if (isBreadcrumb) {
      logMsg = `${logMsg} 🔶`;
    }
    
    // Add message
    logMsg = `${logMsg} ${message}`;
    
    // Log the message - using a single console operation when possible
    if (data) {
      console.log(logMsg, data);
    } else {
      console.log(logMsg);
    }
  }
}