/**
 * Logging service implementation
 * 
 * Provides centralized logging functionality to replace the direct use
 * of logging utilities throughout the codebase.
 */

import { ImageResizerConfig } from '../config';
import { Logger, LogLevel, LogData } from '../utils/logging';
import { LoggingService } from './interfaces';

// Mapping from string log levels to enum values
const LOG_LEVEL_MAP: Record<string, LogLevel> = {
  'DEBUG': LogLevel.DEBUG,
  'INFO': LogLevel.INFO,
  'WARN': LogLevel.WARN,
  'ERROR': LogLevel.ERROR
};

/**
 * Default implementation of the LoggingService interface
 */
export class DefaultLoggingService implements LoggingService {
  private config: ImageResizerConfig;
  private loggers: Map<string, Logger> = new Map();
  private defaultLogLevel: string = 'INFO';
  
  /**
   * Create a new DefaultLoggingService
   * 
   * @param config The application configuration
   */
  constructor(config: ImageResizerConfig) {
    this.config = config;
    this.defaultLogLevel = config.logging?.level || 'INFO';
  }
  
  /**
   * Configure the logging service
   * 
   * @param config Updated configuration
   */
  configure(config: ImageResizerConfig): void {
    this.config = config;
    this.defaultLogLevel = config.logging?.level || 'INFO';
    
    // Clear existing loggers so they will be recreated with new settings
    this.loggers.clear();
  }
  
  /**
   * Get the current log level
   * 
   * @returns The current log level as a string
   */
  getLogLevel(): string {
    return this.config.logging?.level || this.defaultLogLevel;
  }
  
  /**
   * Set the log level
   * 
   * @param level The log level to set
   */
  setLogLevel(level: string): void {
    if (!this.config.logging) {
      this.config.logging = {
        level: 'INFO',
        includeTimestamp: true,
        enableStructuredLogs: false
      };
    }
    
    if (LOG_LEVEL_MAP[level] !== undefined) {
      this.config.logging.level = level as 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
      this.defaultLogLevel = level;
      
      // Clear existing loggers so they will be recreated with new settings
      this.loggers.clear();
    }
  }
  
  /**
   * Get a logger for a specific context
   * 
   * @param context The context for the logger
   * @returns A configured logger instance
   */
  getLogger(context: string): Logger {
    // Check if we already have a logger for this context
    if (this.loggers.has(context)) {
      return this.loggers.get(context)!;
    }
    
    // Create a new logger for this context
    const logger = this.createLoggerInstance(context);
    this.loggers.set(context, logger);
    return logger;
  }
  
  /**
   * Create a new logger instance
   * 
   * @param context The context for the logger
   * @returns A new Logger instance
   */
  private createLoggerInstance(context: string): Logger {
    // Get configured log level, defaulting to INFO
    const configuredLevel = this.config.logging?.level || 'INFO';
    const minLevel = LOG_LEVEL_MAP[configuredLevel] || LogLevel.INFO;
    
    // Include timestamp in logs if configured
    const includeTimestamp = this.config.logging?.includeTimestamp !== false;
    
    // Enable structured logs if configured
    const useStructuredLogs = this.config.logging?.enableStructuredLogs === true;
    
    // Enable breadcrumbs if configured
    const enableBreadcrumbs = this.config.logging?.enableBreadcrumbs !== false;
    
    // Return a logger object with methods for each log level
    return {
      debug(message: string, data?: LogData): void {
        if (minLevel <= LogLevel.DEBUG) {
          DefaultLoggingService.logMessage(LogLevel.DEBUG, message, data, context, includeTimestamp, useStructuredLogs);
        }
      },
      
      info(message: string, data?: LogData): void {
        if (minLevel <= LogLevel.INFO) {
          DefaultLoggingService.logMessage(LogLevel.INFO, message, data, context, includeTimestamp, useStructuredLogs);
        }
      },
      
      warn(message: string, data?: LogData): void {
        if (minLevel <= LogLevel.WARN) {
          DefaultLoggingService.logMessage(LogLevel.WARN, message, data, context, includeTimestamp, useStructuredLogs);
        }
      },
      
      error(message: string, data?: LogData): void {
        if (minLevel <= LogLevel.ERROR) {
          DefaultLoggingService.logMessage(LogLevel.ERROR, message, data, context, includeTimestamp, useStructuredLogs);
        }
      },
      
      breadcrumb(step: string, duration?: number, data?: LogData): void {
        // Only log breadcrumbs if enabled in config
        if (enableBreadcrumbs && minLevel <= LogLevel.INFO) {
          const breadcrumbData = {
            ...data,
            ...(duration !== undefined ? { durationMs: duration } : {})
          };
          
          DefaultLoggingService.logMessage(
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
   * Static helper method to format and log messages
   */
  private static logMessage(
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
      
      // Log the message
      console.log(logMsg);
      
      // Log additional data on a separate line if provided
      if (data) {
        console.log('Additional data:', data);
      }
    }
  }
}