/**
 * Context Middleware
 * 
 * Middleware to set up request context, tracking, and diagnostics
 * for each request. This serves as the foundation for request tracing
 * and performance monitoring.
 */

import {
  createRequestContext,
  setCurrentContext,
  addBreadcrumb,
  addClientDiagnostics,
  RequestContext
} from '../utils/requestContext';
import { BreadcrumbLogger } from '../utils/breadcrumbLogger';
import { Logger } from '../utils/logging';

/**
 * Interface for context-enhanced request
 */
export interface ContextRequest extends Request {
  context: RequestContext;
}

/**
 * Type guard to check if a request has an attached context
 */
export function hasContext(request: Request): request is ContextRequest {
  return 'context' in request;
}

/**
 * Get context from request or throw error if not available
 */
export function getContextFromRequest(request: Request): RequestContext {
  if (hasContext(request)) {
    return request.context;
  }
  throw new Error('Request context not available. Ensure context middleware is used.');
}

/**
 * Create a middleware function to set up request context
 */
export function createContextMiddleware(logger: Logger) {
  return async (request: Request, env: unknown, ctx: ExecutionContext) => {
    // Create request context with execution context and environment
    const context = createRequestContext(request, ctx, env);
    
    // Create breadcrumb logger
    const breadcrumbLogger = new BreadcrumbLogger(logger, 'Middleware', context);
    
    // Set as current context for the duration of this request
    setCurrentContext(context);
    
    // Enhance request object with context
    (request as ContextRequest).context = context;
    
    // Add initial breadcrumb for request start
    addBreadcrumb(context, 'Request', 'Request started', {
      method: request.method,
      url: request.url,
      headers: Object.fromEntries([...request.headers].filter(([key]) => {
        // Only include safe headers in breadcrumb
        const safeHeaders = ['content-type', 'accept', 'user-agent', 'referer', 'cf-ray'];
        return safeHeaders.includes(key.toLowerCase());
      }))
    });
    
    // Add client diagnostics
    addClientDiagnostics(context, request);
    
    breadcrumbLogger.info('Request context initialized', {
      requestId: context.requestId,
      debugEnabled: context.debugEnabled
    });
    
    return request;
  };
}

/**
 * Middleware for wrapping responses with context
 * Adds diagnostic headers for debugging
 */
export function createResponseMiddleware(logger: Logger) {
  return async (response: Response, request: Request) => {
    if (!hasContext(request)) {
      return response;
    }
    
    const { context } = request as ContextRequest;
    const breadcrumbLogger = new BreadcrumbLogger(logger, 'Middleware', context);
    
    // Add final breadcrumb for response
    addBreadcrumb(context, 'Response', 'Response generated', {
      status: response.status,
      statusText: response.statusText,
      headers: Object.fromEntries([...response.headers])
    });
    
    // Log completion
    breadcrumbLogger.info('Request completed', {
      status: response.status,
      breadcrumbCount: context.breadcrumbs.length,
      totalTimeMs: performance.now() - context.startTime
    });
    
    // Add diagnostic headers if debug is enabled
    if (context.debugEnabled) {
      // Clone response to modify headers
      const headers = new Headers(response.headers);
      
      // Add debug headers
      headers.set('X-Request-ID', context.requestId);
      headers.set('X-Processing-Time', `${(performance.now() - context.startTime).toFixed(2)}ms`);
      headers.set('X-Breadcrumb-Count', `${context.breadcrumbs.length}`);
      
      // Return new response with debug headers
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers
      });
    }
    
    return response;
  };
}