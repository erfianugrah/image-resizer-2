/**
 * Logging utilities for the image resizer worker
 * 
 * This module provides centralized logging functions with configurable log levels
 * and structured logging capabilities.
 */

import { ImageResizerConfig } from '../config';

// Define log levels for clarity and control
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3
}

// Mapping from string log levels to enum values
const LOG_LEVEL_MAP: Record<string, LogLevel> = {
  'DEBUG': LogLevel.DEBUG,
  'INFO': LogLevel.INFO,
  'WARN': LogLevel.WARN,
  'ERROR': LogLevel.ERROR
};

/**
 * Type for log data with flexible structure but known types
 */
export type LogData = Record<string, string | number | boolean | null | undefined | string[] | number[] | Record<string, string | number | boolean | null | undefined>>;

/**
 * Logger interface
 */
export interface Logger {
  debug(message: string, data?: LogData): void;
  info(message: string, data?: LogData): void;
  warn(message: string, data?: LogData): void;
  error(message: string, data?: LogData): void;
  breadcrumb(step: string, duration?: number, data?: LogData): void;
}

/**
 * Create a logger instance
 * 
 * @param config The image resizer configuration
 * @param context Optional context name for the logger (e.g., 'Akamai', 'Storage')
 * @returns A logger object
 */
export function createLogger(config: ImageResizerConfig, context?: string): Logger {
  // Get configured log level, defaulting to INFO
  const configuredLevel = config.logging?.level || 'INFO';
  const minLevel = LOG_LEVEL_MAP[configuredLevel] || LogLevel.INFO;
  
  // Include timestamp in logs if configured
  const includeTimestamp = config.logging?.includeTimestamp !== false;
  
  // Enable structured logs if configured
  const useStructuredLogs = config.logging?.enableStructuredLogs === true;
  
  // Enable breadcrumbs if configured
  const enableBreadcrumbs = config.logging?.enableBreadcrumbs !== false;
  
  // Return a logger object with methods for each log level
  return {
    debug(message: string, data?: LogData): void {
      if (minLevel <= LogLevel.DEBUG) {
        logMessage(LogLevel.DEBUG, message, data, context, includeTimestamp, useStructuredLogs);
      }
    },
    
    info(message: string, data?: LogData): void {
      if (minLevel <= LogLevel.INFO) {
        logMessage(LogLevel.INFO, message, data, context, includeTimestamp, useStructuredLogs);
      }
    },
    
    warn(message: string, data?: LogData): void {
      if (minLevel <= LogLevel.WARN) {
        logMessage(LogLevel.WARN, message, data, context, includeTimestamp, useStructuredLogs);
      }
    },
    
    error(message: string, data?: LogData): void {
      if (minLevel <= LogLevel.ERROR) {
        logMessage(LogLevel.ERROR, message, data, context, includeTimestamp, useStructuredLogs);
      }
    },
    
    breadcrumb(step: string, duration?: number, data?: LogData): void {
      // Only log breadcrumbs if enabled in config
      if (enableBreadcrumbs && minLevel <= LogLevel.INFO) {
        const breadcrumbData = {
          ...data,
          ...(duration !== undefined ? { durationMs: duration } : {})
        };
        
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
    }
  };
}

/**
 * Internal function to format and log messages
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
    
    // Log as JSON
    console[getConsoleMethod(level)](JSON.stringify(logObj));
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
    
    // Log the message
    console[getConsoleMethod(level)](logMsg);
    
    // Log additional data on a separate line if provided
    if (data) {
      console[getConsoleMethod(level)]('Additional data:', data);
    }
  }
}

/**
 * Get the appropriate console method for the log level
 */
function getConsoleMethod(_level: LogLevel): 'log' {
  // In Cloudflare Workers, console.log is the most reliable method
  // Other methods (debug, info) might not show up in wrangler tail
  return 'log';
}

// Export a default logger that can be used before config is loaded
export const defaultLogger: Logger = {
  debug(message: string, data?: LogData): void {
    console.log(`[DEBUG] ${message}`, data || '');
  },
  info(message: string, data?: LogData): void {
    console.log(`[INFO] ${message}`, data || '');
  },
  warn(message: string, data?: LogData): void {
    console.log(`[WARN] ${message}`, data || '');
  },
  error(message: string, data?: LogData): void {
    console.log(`[ERROR] ${message}`, data || '');
  },
  breadcrumb(step: string, duration?: number, data?: LogData): void {
    const breadcrumbData = {
      ...data,
      ...(duration !== undefined ? { durationMs: duration } : {})
    };
    console.log(`[INFO] 🔶 BREADCRUMB: ${step}`, breadcrumbData || '');
  }
};