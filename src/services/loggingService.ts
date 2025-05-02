/**
 * Logging service implementation
 * 
 * Provides centralized logging functionality to replace the direct use
 * of logging utilities throughout the codebase.
 */

import { ImageResizerConfig } from '../config';
import { 
  Logger, 
  LogLevel,
  // LogData is imported for type reference but not directly used
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  LogData
} from '../utils/logging';
import { OptimizedLogger } from '../utils/optimized-logging';
import { createLogger } from '../utils/logger-factory';
import { LoggingService } from './interfaces';

// Add imports for context-aware logging
import { 
  RequestContext, 
  getCurrentContext 
} from '../utils/requestContext';
import { 
  createContextAwareLogger
} from '../utils/contextAwareLogger';

// Mapping from string log levels to enum values
const LOG_LEVEL_MAP: Record<string, LogLevel> = {
  'DEBUG': LogLevel.DEBUG,
  'INFO': LogLevel.INFO,
  'WARN': LogLevel.WARN,
  'ERROR': LogLevel.ERROR
};

/**
 * Default implementation of the LoggingService interface
 * 
 * This service provides a centralized way to manage logging throughout the application,
 * ensuring consistent log formats and levels across different components.
 * 
 * Enhanced with request context awareness for breadcrumb tracking and diagnostic information.
 */
export class DefaultLoggingService implements LoggingService {
  private config: ImageResizerConfig;
  private loggers: Map<string, Logger | OptimizedLogger> = new Map();
  private defaultLogLevel: string = 'INFO';
  private useOptimizedLoggers: boolean = false;
  // Self-reference for logging
  private internalLogger: Logger | OptimizedLogger | null = null;
  // Track whether we're using context-aware logging
  private useContextLogging: boolean = true;
  
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
    // Enable context logging by default unless explicitly disabled
    this.useContextLogging = config.logging?.enableBreadcrumbs !== false;
    
    // Create internal logger for the service itself
    const standardLogger = createLogger(config, 'LoggingService', false);
    this.internalLogger = standardLogger;
    
    // Log initialization with standardized fields
    this.internalLogger.debug('Logging service initialized', {
      operation: 'logger_service_init',
      category: 'logging',
      result: 'success',
      durationMs: 0, // No timing information available
      logLevel: this.defaultLogLevel,
      optimizedLogging: this.useOptimizedLoggers,
      contextLogging: this.useContextLogging
    });
  }
  
  /**
   * Configure the logging service
   * 
   * @param config Updated configuration
   */
  configure(config: ImageResizerConfig): void {
    const startTime = Date.now();
    
    // Save old settings for logging changes
    const oldLevel = this.defaultLogLevel;
    const oldOptimized = this.useOptimizedLoggers;
    const oldContextLogging = this.useContextLogging;
    
    // Update settings
    this.config = config;
    this.defaultLogLevel = config.logging?.level || 'INFO';
    this.useOptimizedLoggers = config.performance?.optimizedLogging !== false;
    this.useContextLogging = config.logging?.enableBreadcrumbs !== false;
    
    // Clear existing loggers so they will be recreated with new settings
    const loggerCount = this.loggers.size;
    this.loggers.clear();
    
    // Recreate internal logger with new settings
    const standardLogger = createLogger(config, 'LoggingService', false);
    this.internalLogger = standardLogger;
    
    // Calculate duration
    const duration = Date.now() - startTime;
    
    // Log configuration with standardized fields
    this.internalLogger.info('Logging service reconfigured', {
      operation: 'logger_service_configure',
      category: 'logging',
      result: 'success',
      durationMs: duration,
      oldLogLevel: oldLevel,
      newLogLevel: this.defaultLogLevel,
      oldOptimized: oldOptimized,
      newOptimized: this.useOptimizedLoggers,
      oldContextLogging: oldContextLogging,
      newContextLogging: this.useContextLogging,
      clearedLoggers: loggerCount
    });
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
    const startTime = Date.now();
    
    // Save old level for logging
    const oldLevel = this.defaultLogLevel;
    
    // Create logging config if it doesn't exist
    if (!this.config.logging) {
      this.config.logging = {
        level: 'INFO',
        includeTimestamp: true,
        enableStructuredLogs: false
      };
    }
    
    // Update log level if valid
    if (LOG_LEVEL_MAP[level] !== undefined) {
      this.config.logging.level = level as 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
      this.defaultLogLevel = level;
      
      // Clear existing loggers so they will be recreated with new settings
      const loggerCount = this.loggers.size;
      this.loggers.clear();
      
      // Log level change with standardized fields if we have internal logger
      if (this.internalLogger) {
        this.internalLogger.info(`Changed log level from ${oldLevel} to ${level}`, {
          operation: 'set_log_level',
          category: 'logging',
          result: 'success',
          durationMs: Date.now() - startTime,
          oldLevel,
          newLevel: level,
          clearedLoggers: loggerCount
        });
      }
    } else {
      // Log invalid level with standardized fields if we have internal logger
      if (this.internalLogger) {
        this.internalLogger.warn(`Invalid log level: ${level}`, {
          operation: 'set_log_level',
          category: 'logging',
          result: 'error',
          durationMs: Date.now() - startTime,
          requestedLevel: level,
          validLevels: Object.keys(LOG_LEVEL_MAP).join(', '),
          currentLevel: this.defaultLogLevel
        });
      }
    }
  }
  
  /**
   * Get a logger for a specific context
   * 
   * @param context The context for the logger
   * @returns A configured logger instance
   */
  getLogger(context: string): Logger | OptimizedLogger {
    const startTime = Date.now();
    
    // Get the current request context if available
    const requestContext = getCurrentContext();
    
    // Check if we already have a logger for this context
    const cacheKey = `${context}${requestContext ? '_with_context' : ''}`;
    if (this.loggers.has(cacheKey)) {
      const logger = this.loggers.get(cacheKey)!;
      
      // Log retrieval with standardized fields if we have internal logger
      if (this.internalLogger) {
        this.internalLogger.debug(`Retrieved existing logger for context: ${context}`, {
          operation: 'get_logger',
          category: 'logging',
          result: 'cache_hit',
          durationMs: Date.now() - startTime,
          context,
          hasRequestContext: !!requestContext,
          optimized: this.useOptimizedLoggers,
          contextLoggerEnabled: this.useContextLogging,
          loggerType: this.useContextLogging && requestContext 
            ? 'context_aware'
            : this.useOptimizedLoggers ? 'optimized' : 'standard'
        });
      }
      
      return logger;
    }
    
    // If context-aware logging is enabled and request context is available,
    // create a context-aware logger
    let logger: Logger | OptimizedLogger;
    
    if (this.useContextLogging && requestContext) {
      // Create context-aware logger
      logger = createContextAwareLogger(this.config, context, requestContext);
    } else {
      // Create standard logger using the factory function
      logger = createLogger(this.config, context, this.useOptimizedLoggers);
    }
    
    // Store in cache
    this.loggers.set(cacheKey, logger);
    
    // Log creation with standardized fields if we have internal logger
    if (this.internalLogger) {
      this.internalLogger.debug(`Created new logger for context: ${context}`, {
        operation: 'get_logger',
        category: 'logging',
        result: 'created',
        durationMs: Date.now() - startTime,
        context,
        hasRequestContext: !!requestContext,
        optimized: this.useOptimizedLoggers,
        contextLoggerEnabled: this.useContextLogging,
        loggerType: this.useContextLogging && requestContext 
          ? 'context_aware'
          : this.useOptimizedLoggers ? 'optimized' : 'standard',
        logLevel: this.config.logging?.level || this.defaultLogLevel
      });
    }
    
    return logger;
  }

  /**
   * Create a context-aware logger for a specific request
   * 
   * @param request The HTTP request
   * @param context The context for the logger
   * @returns A logger that automatically tracks breadcrumbs for the request
   */
  createRequestLogger(request: Request, context: string): Logger {
    // Check if request has context attached
    const requestContext = (request as any).context as RequestContext | undefined;
    
    // Create logger with request context if available
    const logger = requestContext && this.useContextLogging
      ? createContextAwareLogger(this.config, context, requestContext)
      : this.getLogger(context);
      
    return logger;
  }

  /**
   * Get a context-aware logger for the current request context
   * 
   * @param context The context for the logger
   * @returns A logger that automatically tracks breadcrumbs
   */
  getContextLogger(context: string): Logger {
    const requestContext = getCurrentContext();
    
    // Create context-aware logger if context is available and enabled
    if (requestContext && this.useContextLogging) {
      return createContextAwareLogger(this.config, context, requestContext);
    }
    
    // Fall back to standard logger
    return this.getLogger(context);
  }
}