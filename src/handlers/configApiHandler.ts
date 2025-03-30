/**
 * Configuration API Handler
 * 
 * This handler provides REST API endpoints for managing configuration settings.
 * It includes authentication and validation for configuration changes.
 */

import { ConfigurationApiService, ConfigurationSystem } from '../services/config/interfaces';
import { Logger } from '../utils/logging';
import { ServiceContainer } from '../services/serviceContainer';
import { Env } from '../types';
import { authenticateConfigRequest, createAuthResponse } from './configAuthMiddleware';

// Define API route patterns for more structured route matching
const API_ROUTES = {
  GET_CONFIG: { method: 'GET', pattern: /^\/api\/config\/?$/ },
  LIST_VERSIONS: { method: 'GET', pattern: /^\/api\/config\/versions\/?$/ },
  GET_VERSION: { method: 'GET', pattern: /^\/api\/config\/version\/([^/]+)\/?$/ },
  CREATE_CONFIG: { method: 'POST', pattern: /^\/api\/config\/?$/ },
  ACTIVATE_VERSION: { method: 'PUT', pattern: /^\/api\/config\/activate\/([^/]+)\/?$/ },
  COMPARE_VERSIONS: { method: 'GET', pattern: /^\/api\/config\/diff\/([^/]+)\/([^/]+)\/?$/ },
  LIST_MODULES: { method: 'GET', pattern: /^\/api\/config\/modules\/?$/ },
  GET_MODULE: { method: 'GET', pattern: /^\/api\/config\/modules\/([^/]+)\/?$/ },
  UPDATE_MODULE: { method: 'PUT', pattern: /^\/api\/config\/modules\/([^/]+)\/?$/ },
  REGISTER_MODULE: { method: 'POST', pattern: /^\/api\/config\/modules\/?$/ },
  GET_SCHEMA: { method: 'GET', pattern: /^\/api\/config\/schema\/?$/ },
  GET_MODULE_SCHEMA: { method: 'GET', pattern: /^\/api\/config\/schema\/([^/]+)\/?$/ },
  BULK_UPDATE: { method: 'PUT', pattern: /^\/api\/config\/bulk-update\/?$/ },
  RESOLVE_ENV_VARS: { method: 'POST', pattern: /^\/api\/config\/resolve-env\/?$/ },
  HEALTH_CHECK: { method: 'GET', pattern: /^\/api\/config\/health\/?$/ }
};

/**
 * Handles a request to the Configuration API
 * 
 * @param request The HTTP request
 * @param url The parsed URL
 * @param serviceContainer The service container
 * @param env Environment variables
 * @returns Response with appropriate status and data
 */
export async function handleConfigApiRequest(
  request: Request,
  url: URL,
  serviceContainer: ServiceContainer,
  env: Env
): Promise<Response> {
  const logger = serviceContainer.logger;
  const path = url.pathname;
  const method = request.method;
  
  // Health check endpoint - no authentication required
  if (matchRoute(API_ROUTES.HEALTH_CHECK, method, path)) {
    return jsonResponse({
      status: 'ok',
      version: '1.0.0',
      timestamp: new Date().toISOString()
    });
  }
  
  // Check if the configApiService is available
  if (!serviceContainer.configApiService) {
    logger.error('Configuration API service not available in service container');
    return jsonResponse({ 
      error: 'service_unavailable',
      message: 'Configuration API service not available' 
    }, 500);
  }
  
  // Public endpoints - no authentication required
  const isPublicEndpoint = (
    (matchRoute(API_ROUTES.LIST_MODULES, method, path)) ||
    (matchRoute(API_ROUTES.GET_VERSION, method, path)) ||
    (matchRoute(API_ROUTES.LIST_VERSIONS, method, path))
  );
  
  // Other endpoints require authentication
  if (!isPublicEndpoint) {
    // Authenticate the request
    const authResult = await authenticateConfigRequest(request, env, logger);
    
    // If not authenticated, return 401 response
    if (!authResult.authenticated) {
      logger.warn('Unauthorized access attempt to Configuration API', {
        path: url.pathname,
        method: request.method,
        ip: request.headers.get('CF-Connecting-IP') || 'unknown'
      });
      return createAuthResponse(authResult);
    }
    
    // Log authenticated access for audit purposes
    logger.info('Authenticated access to Configuration API', {
      user: authResult.user,
      roles: authResult.roles,
      path: url.pathname,
      method: request.method
    });
  }
  
  const configApi = serviceContainer.configApiService;
  
  try {
    // GET /api/config - Get current configuration
    if (matchRoute(API_ROUTES.GET_CONFIG, method, path)) {
      const config = await configApi.getConfig();
      return jsonResponse(config);
    }
    
    // GET /api/config/versions - List available versions
    if (matchRoute(API_ROUTES.LIST_VERSIONS, method, path)) {
      const limit = url.searchParams.get('limit') ? 
        parseInt(url.searchParams.get('limit') as string, 10) : 
        100;
      
      if (isNaN(limit) || limit < 1 || limit > 1000) {
        return jsonResponse({ 
          error: 'invalid_parameter', 
          message: 'Limit must be a number between 1 and 1000' 
        }, 400);
      }
      
      const versions = await configApi.listVersions(limit);
      return jsonResponse({ versions });
    }
    
    // GET /api/config/version/:id - Get a specific version
    if (matchRoute(API_ROUTES.GET_VERSION, method, path)) {
      const matches = path.match(API_ROUTES.GET_VERSION.pattern);
      const versionId = matches ? matches[1] : '';
      
      if (!versionId) {
        return jsonResponse({ 
          error: 'invalid_parameter', 
          message: 'Version ID is required' 
        }, 400);
      }
      
      const config = await configApi.getVersion(versionId);
      
      if (!config) {
        return jsonResponse({ 
          error: 'not_found', 
          message: 'Version not found' 
        }, 404);
      }
      
      return jsonResponse(config);
    }
    
    // POST /api/config - Create a new configuration
    if (matchRoute(API_ROUTES.CREATE_CONFIG, method, path)) {
      // Parse request body
      let body: {
        config?: any;
        comment?: string;
        author?: string;
        modules?: string[];
        tags?: string[];
      };
      
      try {
        body = await request.json();
      } catch (error) {
        return jsonResponse({ 
          error: 'invalid_request', 
          message: 'Invalid JSON in request body' 
        }, 400);
      }
      
      // Validate required fields
      if (!body.config) {
        return jsonResponse({ 
          error: 'missing_field', 
          message: 'Missing required field: config' 
        }, 400);
      }
      
      if (!body.comment) {
        return jsonResponse({ 
          error: 'missing_field', 
          message: 'Missing required field: comment' 
        }, 400);
      }
      
      // Store the new configuration
      try {
        const metadata = await configApi.storeConfig(body.config, {
          author: body.author || 'api-user',
          comment: body.comment,
          modules: Array.isArray(body.modules) ? body.modules : Object.keys(body.config.modules || {}),
          tags: Array.isArray(body.tags) ? body.tags : [],
          changes: [] // Will be populated by the store
        });
        
        return jsonResponse({ 
          message: 'Configuration stored successfully', 
          version: metadata 
        }, 201);
      } catch (error) {
        logger.error('Error storing configuration', {
          error: error instanceof Error ? error.message : String(error)
        });
        
        return jsonResponse({ 
          error: 'validation_error', 
          message: error instanceof Error ? error.message : String(error) 
        }, 400);
      }
    }
    
    // PUT /api/config/activate/:id - Activate a specific version
    if (matchRoute(API_ROUTES.ACTIVATE_VERSION, method, path)) {
      const matches = path.match(API_ROUTES.ACTIVATE_VERSION.pattern);
      const versionId = matches ? matches[1] : '';
      
      if (!versionId) {
        return jsonResponse({ 
          error: 'invalid_parameter', 
          message: 'Version ID is required' 
        }, 400);
      }
      
      const success = await configApi.activateVersion(versionId);
      
      if (!success) {
        return jsonResponse({ 
          error: 'activation_failed', 
          message: 'Failed to activate version' 
        }, 400);
      }
      
      return jsonResponse({ 
        message: `Version ${versionId} activated successfully` 
      });
    }
    
    // GET /api/config/diff/:id1/:id2 - Compare two versions
    if (matchRoute(API_ROUTES.COMPARE_VERSIONS, method, path)) {
      const matches = path.match(API_ROUTES.COMPARE_VERSIONS.pattern);
      
      if (!matches || matches.length < 3) {
        return jsonResponse({ 
          error: 'invalid_parameter', 
          message: 'Two version IDs are required for comparison' 
        }, 400);
      }
      
      const id1 = matches[1];
      const id2 = matches[2];
      
      try {
        const diff = await configApi.compareVersions(id1, id2);
        return jsonResponse(diff);
      } catch (error) {
        logger.error('Error comparing versions', {
          error: error instanceof Error ? error.message : String(error),
          versions: [id1, id2]
        });
        
        return jsonResponse({ 
          error: 'comparison_error', 
          message: error instanceof Error ? error.message : String(error) 
        }, 400);
      }
    }
    
    // GET /api/config/modules - List all modules
    if (matchRoute(API_ROUTES.LIST_MODULES, method, path)) {
      const config = await configApi.getConfig();
      const modules = Object.keys(config.modules).map(name => {
        const module = config.modules[name];
        return {
          name,
          version: module._meta.version,
          description: module._meta.description
        };
      });
      
      return jsonResponse({ modules });
    }
    
    // GET /api/config/modules/:name - Get configuration for a module
    if (matchRoute(API_ROUTES.GET_MODULE, method, path)) {
      const matches = path.match(API_ROUTES.GET_MODULE.pattern);
      const moduleName = matches ? matches[1] : '';
      
      if (!moduleName) {
        return jsonResponse({ 
          error: 'invalid_parameter', 
          message: 'Module name is required' 
        }, 400);
      }
      
      const moduleConfig = await configApi.getModule(moduleName);
      
      if (!moduleConfig) {
        return jsonResponse({ 
          error: 'not_found', 
          message: `Module ${moduleName} not found` 
        }, 404);
      }
      
      return jsonResponse(moduleConfig);
    }
    
    // PUT /api/config/modules/:name - Update configuration for a module
    if (matchRoute(API_ROUTES.UPDATE_MODULE, method, path)) {
      const matches = path.match(API_ROUTES.UPDATE_MODULE.pattern);
      const moduleName = matches ? matches[1] : '';
      
      if (!moduleName) {
        return jsonResponse({ 
          error: 'invalid_parameter', 
          message: 'Module name is required' 
        }, 400);
      }
      
      // Parse request body
      let body: {
        config?: any;
        comment?: string;
        author?: string;
      };
      
      try {
        body = await request.json();
      } catch (error) {
        return jsonResponse({ 
          error: 'invalid_request', 
          message: 'Invalid JSON in request body' 
        }, 400);
      }
      
      // Validate required fields
      if (!body.config) {
        return jsonResponse({ 
          error: 'missing_field', 
          message: 'Missing required field: config' 
        }, 400);
      }
      
      if (!body.comment) {
        return jsonResponse({ 
          error: 'missing_field', 
          message: 'Missing required field: comment' 
        }, 400);
      }
      
      try {
        // Update the module
        const metadata = await configApi.updateModule(
          moduleName,
          body.config,
          body.comment,
          body.author || 'api-user'
        );
        
        return jsonResponse({ 
          message: `Module ${moduleName} updated successfully`, 
          version: metadata 
        });
      } catch (error) {
        logger.error(`Error updating module ${moduleName}`, {
          error: error instanceof Error ? error.message : String(error)
        });
        
        return jsonResponse({ 
          error: 'update_failed', 
          message: error instanceof Error ? error.message : String(error) 
        }, 400);
      }
    }
    
    // GET /api/config/schema - Get full configuration schema 
    if (matchRoute(API_ROUTES.GET_SCHEMA, method, path)) {
      const config = await configApi.getConfig();
      
      // Extract schemas from all modules
      const schemas: Record<string, any> = {};
      
      for (const [moduleName, moduleData] of Object.entries(config.modules)) {
        if (moduleData._meta && moduleData._meta.schema) {
          schemas[moduleName] = moduleData._meta.schema;
        }
      }
      
      return jsonResponse({ schemas });
    }
    
    // GET /api/config/schema/:name - Get schema for a specific module
    if (matchRoute(API_ROUTES.GET_MODULE_SCHEMA, method, path)) {
      const matches = path.match(API_ROUTES.GET_MODULE_SCHEMA.pattern);
      const moduleName = matches ? matches[1] : '';
      
      if (!moduleName) {
        return jsonResponse({ 
          error: 'invalid_parameter', 
          message: 'Module name is required' 
        }, 400);
      }
      
      const config = await configApi.getConfig();
      const module = config.modules[moduleName];
      
      if (!module) {
        return jsonResponse({ 
          error: 'not_found', 
          message: `Module ${moduleName} not found` 
        }, 404);
      }
      
      const schema = module._meta.schema;
      
      return jsonResponse({ 
        name: moduleName,
        version: module._meta.version,
        schema 
      });
    }
    
    // POST /api/config/modules - Register a new module
    if (matchRoute(API_ROUTES.REGISTER_MODULE, method, path)) {
      // Parse request body
      let body: {
        name?: string;
        version?: string;
        description?: string;
        schema?: Record<string, any>;
        defaults?: Record<string, any>;
        dependencies?: string[];
      };
      
      try {
        body = await request.json();
      } catch (error) {
        return jsonResponse({ 
          error: 'invalid_request', 
          message: 'Invalid JSON in request body' 
        }, 400);
      }
      
      // Validate required fields
      if (!body.name) {
        return jsonResponse({ 
          error: 'missing_field', 
          message: 'Missing required field: name' 
        }, 400);
      }
      
      if (!body.version) {
        return jsonResponse({ 
          error: 'missing_field', 
          message: 'Missing required field: version' 
        }, 400);
      }
      
      if (!body.schema) {
        return jsonResponse({ 
          error: 'missing_field', 
          message: 'Missing required field: schema' 
        }, 400);
      }
      
      if (!body.defaults) {
        return jsonResponse({ 
          error: 'missing_field', 
          message: 'Missing required field: defaults' 
        }, 400);
      }
      
      try {
        // Register the module
        await configApi.registerModule({
          name: body.name,
          version: body.version,
          description: body.description || `Module: ${body.name}`,
          schema: body.schema,
          defaults: body.defaults,
          dependencies: body.dependencies
        });
        
        return jsonResponse({ 
          message: `Module ${body.name} registered successfully` 
        }, 201);
      } catch (error) {
        logger.error(`Error registering module ${body.name}`, {
          error: error instanceof Error ? error.message : String(error)
        });
        
        return jsonResponse({ 
          error: 'registration_failed', 
          message: error instanceof Error ? error.message : String(error) 
        }, 400);
      }
    }
    
    // PUT /api/config/bulk-update - Update multiple modules at once
    if (matchRoute(API_ROUTES.BULK_UPDATE, method, path)) {
      // Parse request body
      let body: {
        modules?: Record<string, any>;
        comment?: string;
        author?: string;
      };
      
      try {
        body = await request.json();
      } catch (error) {
        return jsonResponse({ 
          error: 'invalid_request', 
          message: 'Invalid JSON in request body' 
        }, 400);
      }
      
      // Validate required fields
      if (!body.modules || typeof body.modules !== 'object') {
        return jsonResponse({ 
          error: 'missing_field', 
          message: 'Missing required field: modules' 
        }, 400);
      }
      
      if (!body.comment) {
        return jsonResponse({ 
          error: 'missing_field', 
          message: 'Missing required field: comment' 
        }, 400);
      }
      
      // Get current config
      const config = await configApi.getConfig();
      
      // Create a new config with updated modules
      const newConfig: ConfigurationSystem = {
        ...config,
        modules: { ...config.modules }
      };
      
      // Update each module
      for (const [moduleName, moduleConfig] of Object.entries(body.modules)) {
        if (!config.modules[moduleName]) {
          return jsonResponse({ 
            error: 'not_found', 
            message: `Module ${moduleName} not found` 
          }, 404);
        }
        
        newConfig.modules[moduleName] = {
          ...config.modules[moduleName],
          config: moduleConfig
        };
      }
      
      try {
        // Store the updated configuration
        const metadata = await configApi.storeConfig(
          newConfig, 
          {
            author: body.author || 'api-user',
            comment: body.comment,
            modules: Object.keys(body.modules),
            changes: [] // Will be populated by the store
          }
        );
        
        return jsonResponse({ 
          message: 'Bulk update completed successfully', 
          version: metadata 
        });
      } catch (error) {
        logger.error('Error performing bulk update', {
          error: error instanceof Error ? error.message : String(error)
        });
        
        return jsonResponse({ 
          error: 'update_failed', 
          message: error instanceof Error ? error.message : String(error) 
        }, 400);
      }
    }
    
    // POST /api/config/resolve-env - Resolve environment variables in a configuration value
    if (matchRoute(API_ROUTES.RESOLVE_ENV_VARS, method, path)) {
      // Parse request body
      let body: {
        value?: any;
      };
      
      try {
        body = await request.json();
      } catch (error) {
        return jsonResponse({ 
          error: 'invalid_request', 
          message: 'Invalid JSON in request body' 
        }, 400);
      }
      
      // Validate required fields
      if (body.value === undefined) {
        return jsonResponse({ 
          error: 'missing_field', 
          message: 'Missing required field: value' 
        }, 400);
      }
      
      try {
        // Use the getValue method to resolve environment variables
        // This leverages the ConfigValueResolver internally
        const resolvedValue = await configApi.getValue('', body.value);
        
        return jsonResponse({ 
          original: body.value,
          resolved: resolvedValue
        });
      } catch (error) {
        logger.error('Error resolving environment variables', {
          error: error instanceof Error ? error.message : String(error)
        });
        
        return jsonResponse({ 
          error: 'resolution_failed', 
          message: error instanceof Error ? error.message : String(error) 
        }, 400);
      }
    }
    
    // If we reach here, the endpoint wasn't found
    return jsonResponse({ 
      error: 'not_found', 
      message: 'Endpoint not found' 
    }, 404);
  } catch (error) {
    logger.error('Error handling config API request', {
      path,
      method: request.method,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    
    return jsonResponse({ 
      error: 'internal_error', 
      message: error instanceof Error ? error.message : String(error) 
    }, 500);
  }
}

/**
 * Match a route pattern against a request method and path
 * 
 * @param route Route definition with method and pattern
 * @param method Request method
 * @param path Request path
 * @returns True if the route matches
 */
function matchRoute(
  route: { method: string, pattern: RegExp },
  method: string,
  path: string
): boolean {
  return method === route.method && route.pattern.test(path);
}

/**
 * Helper to create a JSON response
 * 
 * @param data Data to include in the response
 * @param status HTTP status code
 * @returns Response object
 */
function jsonResponse(data: any, status: number = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      'Referrer-Policy': 'same-origin'
    }
  });
}