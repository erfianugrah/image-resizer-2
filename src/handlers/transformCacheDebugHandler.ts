/**
 * Handler for KV transform cache debugging and management
 * 
 * This handler provides endpoints for viewing cache statistics,
 * listing cached items, and purging cache entries.
 */

import { ServiceContainer } from '../services/interfaces';

/**
 * Process transform cache debug requests
 * 
 * Endpoints:
 * - /debug/transform-cache/stats - View cache statistics
 * - /debug/transform-cache/list - List cached items
 * - /debug/transform-cache/purge/tag/:tag - Purge by tag
 * - /debug/transform-cache/purge/path/:pattern - Purge by path pattern
 * 
 * @param request The original request
 * @param serviceContainer Service container
 * @param env Environment variables
 * @param ctx Execution context
 * @param config Application configuration (optional, will be fetched if not provided)
 * @returns Response with debug information
 */
export async function transformCacheDebugHandler(
  request: Request,
  serviceContainer: ServiceContainer,
  env: any,
  ctx: ExecutionContext,
  config?: any
): Promise<Response> {
  const { cacheService, configurationService, debugService } = serviceContainer;
  
  // Use provided config or get it from the service if not provided
  if (!config) {
    config = configurationService.getConfig();
  }
  
  // Only allow if debug is enabled
  if (!debugService.isDebugEnabled(request, config)) {
    return new Response('Debug mode not enabled', { status: 403 });
  }
  
  // Check if KV transform cache is enabled
  if (!config.cache.transformCache?.enabled) {
    return new Response('KV transform cache is not enabled', { 
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }
  
  const url = new URL(request.url);
  const path = url.pathname;
  
  // Route to appropriate handler based on the path
  if (path.endsWith('/stats')) {
    return handleCacheStats(cacheService);
  } else if (path.endsWith('/list')) {
    return handleCacheList(cacheService, url);
  } else if (path.match(/\/purge\/tag\/([^/]+)$/)) {
    const tag = path.match(/\/purge\/tag\/([^/]+)$/)?.[1] || '';
    return handleTagPurge(cacheService, tag, ctx);
  } else if (path.match(/\/purge\/path\/([^/]+)$/)) {
    const pattern = path.match(/\/purge\/path\/([^/]+)$/)?.[1] || '';
    return handlePathPurge(cacheService, pattern, ctx);
  }
  
  // Default response with help information
  return new Response(JSON.stringify({
    status: 'error',
    message: 'Invalid debug endpoint',
    availableEndpoints: [
      '/debug/transform-cache/stats',
      '/debug/transform-cache/list',
      '/debug/transform-cache/purge/tag/:tag',
      '/debug/transform-cache/purge/path/:pattern'
    ]
  }, null, 2), { 
    status: 400,
    headers: { 'Content-Type': 'application/json' }
  });
}

/**
 * Handle request for cache statistics
 */
async function handleCacheStats(cacheService: any): Promise<Response> {
  try {
    const stats = await cacheService.getTransformCacheStats();
    
    return new Response(JSON.stringify({
      status: 'success',
      stats
    }, null, 2), { 
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({
      status: 'error',
      message: error instanceof Error ? error.message : String(error)
    }, null, 2), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Handle request to list cached items
 */
async function handleCacheList(cacheService: any, url: URL): Promise<Response> {
  try {
    const limit = parseInt(url.searchParams.get('limit') || '20', 10);
    const cursor = url.searchParams.get('cursor') || undefined;
    
    const result = await cacheService.listTransformCacheEntries(limit, cursor);
    
    return new Response(JSON.stringify({
      status: 'success',
      entries: result.entries,
      cursor: result.cursor,
      complete: result.complete
    }, null, 2), { 
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({
      status: 'error',
      message: error instanceof Error ? error.message : String(error)
    }, null, 2), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Handle request to purge by tag
 */
async function handleTagPurge(cacheService: any, tag: string, ctx: ExecutionContext): Promise<Response> {
  try {
    if (!tag) {
      return new Response(JSON.stringify({
        status: 'error',
        message: 'Tag parameter is required'
      }, null, 2), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    const count = await cacheService.purgeTransformsByTag(tag, ctx);
    
    return new Response(JSON.stringify({
      status: 'success',
      message: `Purge by tag initiated for: ${tag}`,
      purgeCount: count
    }, null, 2), { 
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({
      status: 'error',
      message: error instanceof Error ? error.message : String(error)
    }, null, 2), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Handle request to purge by path pattern
 */
async function handlePathPurge(cacheService: any, pattern: string, ctx: ExecutionContext): Promise<Response> {
  try {
    if (!pattern) {
      return new Response(JSON.stringify({
        status: 'error',
        message: 'Path pattern parameter is required'
      }, null, 2), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Decode URL-encoded pattern
    const decodedPattern = decodeURIComponent(pattern);
    
    const count = await cacheService.purgeTransformsByPath(decodedPattern, ctx);
    
    return new Response(JSON.stringify({
      status: 'success',
      message: `Purge by path pattern initiated for: ${decodedPattern}`,
      purgeCount: count
    }, null, 2), { 
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({
      status: 'error',
      message: error instanceof Error ? error.message : String(error)
    }, null, 2), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}