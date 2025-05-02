/**
 * Request context management
 * 
 * Provides utilities for creating and managing request-scoped context
 * including breadcrumb trails for debugging request flows.
 */

import { v4 as uuidv4 } from 'uuid';

// Import the logger, but be careful about circular dependencies
import { Logger, createLogger } from './logging';

/**
 * Breadcrumb for tracking events during request processing
 */
export interface Breadcrumb {
  timestamp: number;        // When this event occurred
  category: string;         // Component/category name
  message: string;          // Event description
  data?: Record<string, unknown>; // Additional context data
  durationMs?: number;      // Duration since last breadcrumb
  elapsedMs?: number;       // Time since request start
}

/**
 * Diagnostics information for the request
 */
export interface DiagnosticsInfo {
  originalUrl: string;     // The original URL of the request
  [key: string]: unknown;  // Allow additional diagnostic fields
}

/**
 * Request context for tracking request lifecycle
 */
export interface RequestContext {
  // Request identification
  requestId: string;      // Unique ID for the request
  url: string;            // Original request URL
  startTime: number;      // Request start timestamp
  
  // Tracking data
  breadcrumbs: Breadcrumb[];  // Chronological events during processing
  diagnostics: DiagnosticsInfo; // Diagnostic information
  
  // Performance tracking
  componentTiming: Record<string, number>; // Time spent in each component
  operations?: Record<string, TimedOperation>; // For tracking timed operations
  
  // Feature flags
  debugEnabled: boolean;  // Whether debug mode is enabled
  verboseEnabled: boolean; // Whether verbose logging is enabled
  
  // For waitUntil operations
  executionContext?: ExecutionContext; // Worker execution context for waitUntil
  
  // Environment for service access
  env?: unknown;         // The environment variables/bindings
}

/**
 * Timed operation for tracking performance
 */
export interface TimedOperation {
  startTime: number;      // When the operation started
  endTime?: number;       // When the operation ended (if completed)
  duration?: number;      // Duration of the operation
  category?: string;      // Category for breadcrumb grouping
}

// Local utility for logging that avoids circular dependencies
function logDebug(message: string, data?: Record<string, unknown>): void {
  // Only use console.debug since we're in a core module that may be imported by the logging system
  console.debug(`RequestContext: ${message}`, data || {});
}

function logWarn(message: string, data?: Record<string, unknown>): void {
  // Only use console.warn since we're in a core module that may be imported by the logging system
  console.warn(`RequestContext: ${message}`, data || {});
}

/**
 * Create a new request context
 * @param request The HTTP request
 * @param ctx Optional execution context for waitUntil operations
 * @param env Optional environment variables/bindings
 * @returns A new RequestContext object
 */
export function createRequestContext(
  request: Request, 
  ctx?: ExecutionContext,
  env?: unknown
): RequestContext {
  const url = new URL(request.url);
  
  // Check for debug parameters
  const urlHasDebug = url.searchParams.has('debug');
  const headerHasDebug = request.headers.get('X-Debug') === 'true';
  
  // If URL explicitly sets debug=false, respect that
  const debugEnabled = urlHasDebug 
    ? (url.searchParams.get('debug') !== 'false')
    : headerHasDebug;
  
  const verboseEnabled = debugEnabled && 
                        (url.searchParams.has('verbose') || 
                         url.searchParams.get('debug') === 'verbose');
  
  // Create the context
  const context: RequestContext = {
    requestId: request.headers.get('X-Request-ID') || uuidv4(),
    url: request.url,
    startTime: performance.now(),
    breadcrumbs: [],
    diagnostics: {
      originalUrl: request.url
    },
    componentTiming: {},
    debugEnabled,
    verboseEnabled
  };
  
  // Store the execution context if provided, for waitUntil operations
  if (ctx) {
    context.executionContext = ctx;
  }
  
  // Store the environment if provided
  if (env) {
    context.env = env;
  }
  
  return context;
}

/**
 * Global breadcrumb configuration
 */
interface BreadcrumbConfig {
  enabled: boolean;
  maxItems: number;
}

// Default breadcrumb configuration with initialization tracking
interface BreadcrumbConfigWithInit extends BreadcrumbConfig {
  initialized: boolean;
}

let breadcrumbConfig: BreadcrumbConfigWithInit = {
  enabled: true,
  maxItems: 100,
  initialized: false
};

// Helper function to update breadcrumb config
export function updateBreadcrumbConfig(config: { enabled: boolean, maxItems: number }) {
  if (config && typeof config.enabled === 'boolean' && typeof config.maxItems === 'number') {
    breadcrumbConfig = {
      enabled: config.enabled,
      maxItems: config.maxItems,
      initialized: true
    };
    
    logDebug('Updated breadcrumb config', { enabled: config.enabled, maxItems: config.maxItems });
  }
}

// Global store for the current request context
// In a worker environment, this will be scoped to the current request
let currentRequestContext: RequestContext | undefined;

/**
 * Set the current request context
 * This is called at the start of request processing to establish the context
 * @param context The request context to set as current
 */
export function setCurrentContext(context: RequestContext): void {
  currentRequestContext = context;
  logDebug('Set current request context', { 
    requestId: context.requestId,
    url: context.url,
    timestamp: new Date().toISOString()
  });
}

/**
 * Get the current request context
 * This is a convenience function for logging and accessing request-scoped data
 * @returns The current request context or undefined if not available
 */
export function getCurrentContext(): RequestContext | undefined {
  if (!currentRequestContext) {
    logDebug('getCurrentContext called but no context is set');
  }
  return currentRequestContext;
}

/**
 * Add a new breadcrumb to the request context
 * @param context The request context
 * @param category The component or category name
 * @param message The event message
 * @param data Additional context data
 * @returns The created breadcrumb
 */
export function addBreadcrumb(
  context: RequestContext,
  category: string,
  message: string,
  data?: Record<string, unknown>
): Breadcrumb {
  const timestamp = performance.now();
  const elapsedMs = timestamp - context.startTime;
  
  // Create the breadcrumb
  const breadcrumb: Breadcrumb = {
    timestamp,
    category,
    message,
    data,
    elapsedMs,
    durationMs: undefined
  };
  
  // Make sure the breadcrumbs array exists
  if (!context.breadcrumbs) {
    context.breadcrumbs = [];
    logDebug('Created breadcrumbs array for context');
  }

  // Only add breadcrumb to the context if breadcrumbs are enabled
  if (breadcrumbConfig.enabled) {
    // Calculate duration from previous breadcrumb if available
    if (context.breadcrumbs.length > 0) {
      const lastBreadcrumb = context.breadcrumbs[context.breadcrumbs.length - 1];
      breadcrumb.durationMs = timestamp - lastBreadcrumb.timestamp;
    }
    
    // Add to breadcrumbs array, respecting maxItems
    context.breadcrumbs.push(breadcrumb);
    
    // Trim breadcrumbs if they exceed maxItems
    if (context.breadcrumbs.length > breadcrumbConfig.maxItems) {
      context.breadcrumbs = context.breadcrumbs.slice(-breadcrumbConfig.maxItems);
    }
    
    // Update component timing if durationMs was calculated
    if (breadcrumb.durationMs !== undefined) {
      // Make sure the componentTiming object exists
      if (!context.componentTiming) {
        context.componentTiming = {};
      }
      
      context.componentTiming[category] = (context.componentTiming[category] || 0) + breadcrumb.durationMs;
    }
  }
  
  return breadcrumb;
}

/**
 * Start a timed operation in the request context
 * This is useful for tracking performance metrics for specific operations
 * @param context The request context
 * @param operationName The name of the operation
 * @param category Optional category for grouping operations
 */
export function startTimedOperation(context: RequestContext, operationName: string, category?: string): void {
  if (!context.operations) {
    context.operations = {};
  }
  
  context.operations[operationName] = {
    startTime: performance.now(),
    endTime: undefined,
    duration: undefined,
    category: category || 'Operation'
  };
  
  // Add a breadcrumb to mark the start of this operation
  addBreadcrumb(context, category || 'Performance', `Started ${operationName}`, {
    operationType: 'start',
    operation: operationName
  });
}

/**
 * End a timed operation in the request context
 * Call this after startTimedOperation to record the duration
 * @param context The request context
 * @param operationName The name of the operation
 * @param metadata Optional metadata about the operation result
 * @returns Duration in milliseconds
 */
export function endTimedOperation(
  context: RequestContext, 
  operationName: string, 
  metadata?: Record<string, unknown>
): number | undefined {
  if (!context.operations || !context.operations[operationName]) {
    return undefined;
  }
  
  const operation = context.operations[operationName];
  operation.endTime = performance.now();
  operation.duration = operation.endTime - operation.startTime;
  
  // Add a breadcrumb to mark the end of this operation with duration
  addBreadcrumb(context, operation.category || 'Performance', `Completed ${operationName}`, {
    operationType: 'end',
    operation: operationName,
    durationMs: operation.duration,
    ...metadata
  });
  
  return operation.duration;
}

/**
 * Get performance metrics from the request context
 * @param context The request context
 * @returns Performance metrics
 */
export function getPerformanceMetrics(context: RequestContext) {
  // Gather all operation durations
  const operations: Record<string, number> = {};
  
  if (context.operations) {
    Object.entries(context.operations).forEach(([name, operation]) => {
      if (operation.duration !== undefined) {
        operations[name] = operation.duration;
      }
    });
  }
  
  return {
    totalElapsedMs: performance.now() - context.startTime,
    componentTiming: context.componentTiming,
    operations,
    breadcrumbCount: context.breadcrumbs.length
  };
}

/**
 * Get breadcrumbs from the request context
 * @param context The request context
 * @returns Breadcrumbs array
 */
export function getBreadcrumbs(context: RequestContext): Breadcrumb[] {
  return context.breadcrumbs;
}

/**
 * Utility function to execute an operation in the background using waitUntil
 * Falls back to regular execution if waitUntil isn't available
 * 
 * @param context The request context
 * @param operation The operation to execute
 * @param operationName A name for the operation (for tracking)
 */
export function runInBackground<T>(
  context: RequestContext,
  operation: () => Promise<T>,
  operationName: string
): void {
  // Get execution context if available
  const ctx = context.executionContext;
  
  if (ctx && typeof ctx.waitUntil === 'function') {
    // Use waitUntil to run in the background
    startTimedOperation(context, `background_${operationName}`);
    
    ctx.waitUntil(
      operation()
        .then(result => {
          endTimedOperation(context, `background_${operationName}`, {
            success: true,
            result: typeof result === 'object' ? 'object' : result
          });
          return result;
        })
        .catch(err => {
          endTimedOperation(context, `background_${operationName}`, {
            success: false,
            error: err instanceof Error ? err.message : String(err)
          });
          throw err;
        })
    );
    
    addBreadcrumb(context, 'Background', `Started background operation: ${operationName}`, {
      usedWaitUntil: true
    });
  } else {
    // Fall back to regular execution
    addBreadcrumb(context, 'Background', `No waitUntil available, executing synchronously: ${operationName}`, {
      usedWaitUntil: false
    });
    
    // Still execute the operation, but not in the background
    startTimedOperation(context, operationName);
    operation()
      .then(() => {
        endTimedOperation(context, operationName, { usedWaitUntil: false });
      })
      .catch(err => {
        endTimedOperation(context, operationName, { 
          usedWaitUntil: false,
          error: err instanceof Error ? err.message : String(err)
        });
      });
  }
}

/**
 * Add client diagnostics information to the request context
 * @param context The request context
 * @param request The HTTP request
 */
export function addClientDiagnostics(context: RequestContext, request: Request): void {
  const userAgent = request.headers.get('User-Agent') || '';
  const acceptHeader = request.headers.get('Accept') || '';
  const clientWidth = request.headers.get('Viewport-Width') || request.headers.get('Width') || '';
  const clientDpr = request.headers.get('DPR') || '';
  
  const diagnostics: Record<string, unknown> = {
    userAgent,
    acceptHeader,
    clientWidth: clientWidth ? parseInt(clientWidth, 10) : undefined,
    clientDpr: clientDpr ? parseFloat(clientDpr) : undefined,
    hasClientHints: !!(clientWidth || clientDpr),
  };
  
  // Add to request context diagnostics
  context.diagnostics = {
    ...context.diagnostics,
    client: diagnostics
  };
  
  addBreadcrumb(context, 'ClientInfo', 'Added client diagnostics', {
    userAgent: userAgent.substring(0, 50) + (userAgent.length > 50 ? '...' : ''),
    hasClientHints: !!(clientWidth || clientDpr)
  });
}