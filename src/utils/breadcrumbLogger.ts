/**
 * Breadcrumb Logger
 * 
 * Enhanced logging system that automatically adds breadcrumbs to the request context
 * and provides structured logging with tracing.
 */

import { Logger } from './logging';
import { 
  RequestContext, 
  addBreadcrumb, 
  getCurrentContext 
} from './requestContext';

/**
 * BreadcrumbLogger extends the base Logger functionality
 * to automatically add breadcrumbs for important log events
 */
export class BreadcrumbLogger {
  private logger: Logger;
  private category: string;
  private context: RequestContext | undefined;

  /**
   * Create a new BreadcrumbLogger
   * 
   * @param logger Base logger to use
   * @param category Category name for this logger component
   * @param context Optional request context (will use current context if not provided)
   */
  constructor(logger: Logger, category: string, context?: RequestContext) {
    this.logger = logger;
    this.category = category;
    this.context = context;
  }

  /**
   * Get the current request context
   * Uses explicitly provided context or falls back to current global context
   */
  private getContext(): RequestContext | undefined {
    return this.context || getCurrentContext();
  }

  /**
   * Log a message at INFO level and add a breadcrumb
   * 
   * @param message Message to log
   * @param data Optional data to include
   */
  info(message: string, data?: Record<string, unknown>): void {
    this.logger.info(message, data);
    
    const context = this.getContext();
    if (context) {
      addBreadcrumb(context, this.category, message, data);
    }
  }

  /**
   * Log a message at DEBUG level and add a breadcrumb
   * 
   * @param message Message to log
   * @param data Optional data to include
   */
  debug(message: string, data?: Record<string, unknown>): void {
    this.logger.debug(message, data);
    
    const context = this.getContext();
    if (context && context.debugEnabled) {
      addBreadcrumb(context, this.category, `DEBUG: ${message}`, data);
    }
  }

  /**
   * Log a message at WARN level and add a breadcrumb
   * 
   * @param message Message to log
   * @param data Optional data to include
   */
  warn(message: string, data?: Record<string, unknown>): void {
    this.logger.warn(message, data);
    
    const context = this.getContext();
    if (context) {
      addBreadcrumb(context, this.category, `WARNING: ${message}`, data);
    }
  }

  /**
   * Log a message at ERROR level and add a breadcrumb
   * 
   * @param message Message to log
   * @param data Optional data to include
   */
  error(message: string, data?: Record<string, unknown>): void {
    this.logger.error(message, data);
    
    const context = this.getContext();
    if (context) {
      addBreadcrumb(context, this.category, `ERROR: ${message}`, data);
    }
  }

  /**
   * Add a breadcrumb without generating a log message
   * Useful for tracking operations that don't need to be logged
   * 
   * @param message Breadcrumb message
   * @param data Optional data to include
   */
  breadcrumb(message: string, data?: Record<string, unknown>): void {
    const context = this.getContext();
    if (context) {
      addBreadcrumb(context, this.category, message, data);
    }
  }

  /**
   * Track the beginning of an operation
   * Adds a breadcrumb and starts a timed operation in the context
   * 
   * @param operationName Name of the operation
   * @param data Additional data to include
   */
  beginOperation(operationName: string, data?: Record<string, unknown>): void {
    const context = this.getContext();
    if (!context) {
      this.debug(`Cannot track operation ${operationName}, no context available`);
      return;
    }

    // Add a detailed breadcrumb
    addBreadcrumb(context, this.category, `Begin operation: ${operationName}`, data);
    
    // Start timing the operation
    if (!context.operations) {
      context.operations = {};
    }
    
    context.operations[operationName] = {
      startTime: performance.now(),
      category: this.category
    };
  }

  /**
   * Track the end of an operation
   * Adds a breadcrumb and records the operation duration
   * 
   * @param operationName Name of the operation
   * @param data Additional data to include
   * @returns Duration in milliseconds, or undefined if operation wasn't started
   */
  endOperation(operationName: string, data?: Record<string, unknown>): number | undefined {
    const context = this.getContext();
    if (!context || !context.operations || !context.operations[operationName]) {
      this.debug(`Cannot end operation ${operationName}, not found or no context available`);
      return undefined;
    }

    const operation = context.operations[operationName];
    operation.endTime = performance.now();
    operation.duration = operation.endTime - operation.startTime;

    // Add a breadcrumb with timing information
    addBreadcrumb(context, this.category, `End operation: ${operationName}`, {
      durationMs: operation.duration,
      ...data
    });

    // Update component timing
    if (!context.componentTiming) {
      context.componentTiming = {};
    }
    
    const componentName = this.category;
    context.componentTiming[componentName] = 
      (context.componentTiming[componentName] || 0) + operation.duration;

    return operation.duration;
  }

  /**
   * Creates a child logger with a subcategory
   * Inherits the parent's context but uses a different category name
   * 
   * @param subCategory Sub-category name
   * @returns A new BreadcrumbLogger instance
   */
  createSubLogger(subCategory: string): BreadcrumbLogger {
    const combinedCategory = `${this.category}.${subCategory}`;
    return new BreadcrumbLogger(this.logger, combinedCategory, this.context);
  }

  /**
   * Log the time taken to execute a function
   * Acts as a decorator for a function to log its execution time
   * 
   * @param operationName Name of the operation
   * @param fn Function to execute
   * @param args Arguments to pass to the function
   * @returns The result of the function
   */
  async timeOperation<T>(
    operationName: string, 
    fn: (...args: any[]) => Promise<T>, 
    ...args: any[]
  ): Promise<T> {
    this.beginOperation(operationName);
    
    try {
      const result = await fn(...args);
      this.endOperation(operationName, { success: true });
      return result;
    } catch (error) {
      this.endOperation(operationName, { 
        success: false, 
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }
}