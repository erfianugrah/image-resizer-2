/**
 * Background Operations Utility
 * 
 * Provides utilities for executing operations in the background using 
 * the waitUntil pattern to improve response times.
 */

import { getCurrentContext, addBreadcrumb } from './requestContext';
import { Logger } from './logging';

/**
 * Execute an operation in the background using waitUntil if available
 * 
 * @param operation The operation to execute in the background
 * @param operationName A name for the operation (for logs and tracking)
 * @param logger Logger instance for logging
 * @param ctx Optional execution context (if not provided, will attempt to get it from request context)
 * @returns True if the operation was scheduled in the background, false if it will execute synchronously
 */
export function runInBackground<T>(
  operation: () => Promise<T>,
  operationName: string,
  logger: Logger,
  ctx?: ExecutionContext
): boolean {
  // Try to get execution context from provided ctx or current request context
  const executionContext = ctx || getCurrentContext()?.executionContext;
  
  // If we have an execution context with waitUntil, use it
  if (executionContext && typeof executionContext.waitUntil === 'function') {
    logger.debug(`Running ${operationName} in background with waitUntil`, {
      operation: operationName,
      background: true
    });
    
    // Get request context for breadcrumb if available
    const requestContext = getCurrentContext();
    if (requestContext) {
      addBreadcrumb(requestContext, 'Background', `Started background operation: ${operationName}`, {
        usedWaitUntil: true
      });
    }
    
    // Execute the operation in the background
    const deferredPromise = new Promise<void>((resolve, reject) => {
      queueMicrotask(() => {
        operation()
          .then(() => {
            logger.debug(`Background operation ${operationName} completed successfully`, {
              operation: operationName,
              background: true,
              success: true
            });
            
            if (requestContext) {
              addBreadcrumb(requestContext, 'Background', `Completed background operation: ${operationName}`, {
                usedWaitUntil: true,
                success: true
              });
            }
            
            resolve();
          })
          .catch(error => {
            logger.error(`Background operation ${operationName} failed`, {
              operation: operationName,
              background: true,
              error: error instanceof Error ? error.message : String(error),
              stack: error instanceof Error ? error.stack : undefined
            });
            
            if (requestContext) {
              addBreadcrumb(requestContext, 'Background', `Failed background operation: ${operationName}`, {
                usedWaitUntil: true,
                success: false,
                error: error instanceof Error ? error.message : String(error)
              });
            }
            
            reject(error);
          });
      });
    });
    
    executionContext.waitUntil(deferredPromise);
    
    return true;
  } else {
    // No waitUntil available, so we'll have to execute synchronously
    logger.debug(`Running ${operationName} synchronously (no waitUntil available)`, {
      operation: operationName,
      background: false
    });
    
    // Get request context for breadcrumb if available
    const requestContext = getCurrentContext();
    if (requestContext) {
      addBreadcrumb(requestContext, 'Background', `No waitUntil available, executing synchronously: ${operationName}`, {
        usedWaitUntil: false
      });
    }
    
    return false;
  }
}

/**
 * Get the execution context from either the provided context, the request object,
 * or the current request context
 * 
 * @param ctx Optional execution context
 * @param request Optional request object that might have ctx attached
 * @returns Execution context or undefined if not available
 */
export function getExecutionContext(
  ctx?: ExecutionContext,
  request?: Request
): ExecutionContext | undefined {
  // If context is directly provided, use it
  if (ctx && typeof ctx.waitUntil === 'function') {
    return ctx;
  }
  
  // Try to get it from the request object if available
  if (request) {
    // Note: This is a non-standard approach but commonly used in Cloudflare Workers
    const reqWithCtx = request as any;
    if (reqWithCtx.ctx && typeof reqWithCtx.ctx.waitUntil === 'function') {
      return reqWithCtx.ctx;
    }
  }
  
  // Try to get it from the current request context
  const requestContext = getCurrentContext();
  if (requestContext?.executionContext && 
      typeof requestContext.executionContext.waitUntil === 'function') {
    return requestContext.executionContext;
  }
  
  // No execution context available
  return undefined;
}

/**
 * Check if waitUntil is available from various possible sources
 * 
 * @param ctx Optional execution context
 * @param request Optional request object that might have ctx attached
 * @returns True if waitUntil is available
 */
export function isWaitUntilAvailable(
  ctx?: ExecutionContext,
  request?: Request
): boolean {
  return !!getExecutionContext(ctx, request);
}

/**
 * Wrapper around async operations that may be executed in the background with waitUntil
 * 
 * @param operation Operation to execute
 * @param operationName Name of the operation (for logs)
 * @param logger Logger to use
 * @param ctx Optional execution context
 * @param force Whether to force background execution even if it's a trivial operation
 * @returns Promise with the operation result
 */
export async function executeOperationWithBackgroundFallback<T>(
  operation: () => Promise<T>,
  operationName: string,
  logger: Logger,
  ctx?: ExecutionContext,
  force?: boolean
): Promise<T> {
  try {
    // Simple helper to execute the operation and log errors
    const executeOperation = async (): Promise<T> => {
      try {
        return await operation();
      } catch (error) {
        logger.error(`Operation ${operationName} failed`, {
          operation: operationName,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined
        });
        
        throw error;
      }
    };
    
    // First, check if the operation is trivial enough to just execute directly
    // This avoids overhead for simple operations
    if (!force) {
      return await executeOperation();
    }
    
    // Try to run in background
    const executionContext = getExecutionContext(ctx);
    if (executionContext) {
      // Operation will be logged by runInBackground
      runInBackground(operation, operationName, logger, executionContext);
      
      // Return a resolved promise since the operation is running in the background
      return Promise.resolve(undefined as unknown as T);
    } else {
      // No background execution available, run synchronously
      logger.debug(`Executing ${operationName} synchronously (no background execution available)`, {
        operation: operationName
      });
      
      return await executeOperation();
    }
  } catch (error) {
    logger.error(`Failed to execute operation ${operationName}`, {
      operation: operationName,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    
    throw error;
  }
}
