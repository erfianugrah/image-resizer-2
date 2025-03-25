/**
 * Logging service implementation
 * 
 * Provides centralized logging functionality to replace the direct use
 * of logging utilities throughout the codebase.
 */

import { ImageResizerConfig } from '../config';
import { Logger, LogLevel, LogData, createLogger } from '../utils/logging';
import { OptimizedLogger } from '../utils/optimized-logging';
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
  private loggers: Map<string, Logger | OptimizedLogger> = new Map();
  private defaultLogLevel: string = 'INFO';
  private useOptimizedLoggers: boolean = false;
  
  /**
   * Create a new DefaultLoggingService
   * 
   * @param config The application configuration
   */
  constructor(config: ImageResizerConfig) {
    this.config = config;
    this.defaultLogLevel = config.logging?.level || 'INFO';
    // Enable optimized logging by default if performance optimization is enabled
    this.useOptimizedLoggers = config.performance?.optimizedLogging !== false;
  }
  
  /**
   * Configure the logging service
   * 
   * @param config Updated configuration
   */
  configure(config: ImageResizerConfig): void {
    this.config = config;
    this.defaultLogLevel = config.logging?.level || 'INFO';
    this.useOptimizedLoggers = config.performance?.optimizedLogging !== false;
    
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
  getLogger(context: string): Logger | OptimizedLogger {
    // Check if we already have a logger for this context
    if (this.loggers.has(context)) {
      return this.loggers.get(context)!;
    }
    
    // Create a new logger for this context using the factory function
    const logger = createLogger(this.config, context, this.useOptimizedLoggers);
    this.loggers.set(context, logger);
    return logger;
  }
}