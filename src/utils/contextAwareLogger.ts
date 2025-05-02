/**
 * Context-Aware Logger
 * 
 * Extends the existing logging system with request context awareness,
 * automatically adding breadcrumbs and tracking request lifecycle events.
 */

import { ImageResizerConfig } from '../config';
import { Logger, LogData, LogLevel, createLogger as createBaseLogger } from './logging';
import { 
  RequestContext, 
  getCurrentContext, 
  addBreadcrumb 
} from './requestContext';
import { BreadcrumbLogger } from './breadcrumbLogger';

/**
 * Create a context-aware logger that automatically adds breadcrumbs
 * 
 * @param config The image resizer configuration
 * @param componentName Name of the component using this logger
 * @param context Optional explicit request context (uses current context if not provided)
 * @returns A context-aware logger instance
 */
export function createContextAwareLogger(
  config: ImageResizerConfig,
  componentName: string,
  context?: RequestContext
): Logger {
  // Create base logger
  const baseLogger = createBaseLogger(config, componentName);
  
  // Create breadcrumb logger that will handle the context interaction
  const breadcrumbLogger = new BreadcrumbLogger(baseLogger, componentName, context);
  
  // Return a logger that matches the Logger interface but uses BreadcrumbLogger
  return {
    debug: (message: string, data?: LogData) => breadcrumbLogger.debug(message, data),
    info: (message: string, data?: LogData) => breadcrumbLogger.info(message, data),
    warn: (message: string, data?: LogData) => breadcrumbLogger.warn(message, data),
    error: (message: string, data?: LogData) => breadcrumbLogger.error(message, data),
    
    // Special handling for breadcrumb to maintain compatibility
    breadcrumb: (step: string, duration?: number, data?: LogData) => {
      const ctx = context || getCurrentContext();
      
      if (ctx) {
        // Convert duration to an object property if provided
        const breadcrumbData = {
          ...(data || {}),
          ...(duration !== undefined ? { durationMs: duration } : {})
        };
        
        addBreadcrumb(ctx, componentName, step, breadcrumbData);
      }
      
      // Also log as a debug message to maintain compatibility
      baseLogger.debug(`Breadcrumb: ${step}`, {
        ...(data || {}), 
        ...(duration !== undefined ? { durationMs: duration } : {})
      });
    }
  };
}

/**
 * LoggingServiceFactory interface for creating context-aware loggers
 */
export interface LoggingServiceFactory {
  /**
   * Get a logger for a specific component
   * @param componentName The name of the component requesting the logger
   * @param context Optional explicit request context
   */
  getLogger(componentName: string, context?: RequestContext): Logger;
  
  /**
   * Get the current log level
   */
  getLogLevel(): LogLevel;
  
  /**
   * Create a logger for a request with context
   * @param request The request object
   * @param componentName The name of the component
   */
  createRequestLogger(request: Request, componentName: string): Logger;
}

/**
 * Factory for creating context-aware loggers
 */
export class ContextAwareLoggingService implements LoggingServiceFactory {
  private config: ImageResizerConfig;
  
  constructor(config: ImageResizerConfig) {
    this.config = config;
  }
  
  /**
   * Get a logger for a specific component
   * @param componentName The name of the component requesting the logger
   * @param context Optional explicit request context
   */
  getLogger(componentName: string, context?: RequestContext): Logger {
    return createContextAwareLogger(this.config, componentName, context);
  }
  
  /**
   * Get the current log level
   */
  getLogLevel(): LogLevel {
    // Map the string level to enum
    const levelMap: Record<string, LogLevel> = {
      'DEBUG': LogLevel.DEBUG,
      'INFO': LogLevel.INFO,
      'WARN': LogLevel.WARN,
      'ERROR': LogLevel.ERROR
    };
    
    return levelMap[this.config.logging.level] || LogLevel.INFO;
  }
  
  /**
   * Create a logger for a request with context
   * 
   * @param request The request object
   * @param componentName The name of the component
   */
  createRequestLogger(request: Request, componentName: string): Logger {
    const context = (request as any).context as RequestContext | undefined;
    return this.getLogger(componentName, context);
  }
  
  /**
   * Update configuration
   * @param config New configuration
   */
  updateConfig(config: ImageResizerConfig): void {
    this.config = config;
  }
}