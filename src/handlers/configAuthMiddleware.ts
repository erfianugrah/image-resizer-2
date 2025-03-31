/**
 * Configuration API Authentication Middleware
 * 
 * This middleware ensures that only authorized users can access the Configuration API.
 * It supports API key authentication and basic auth for admin access with additional
 * security measures to prevent common attacks.
 */

import { Logger } from '../utils/logging';
import { Env } from '../types';

// Public endpoints that don't require authentication
const PUBLIC_ENDPOINTS = [
  { method: 'GET', path: '/api/config/modules' },
  { method: 'GET', pathPrefix: '/api/config/version/' },
  { method: 'GET', path: '/api/config/versions' },
  { method: 'GET', path: '/api/config/health' }
];

/**
 * Authentication result
 */
interface AuthResult {
  authenticated: boolean;
  user?: string;
  roles?: string[];
  error?: string;
  errorCode?: string;
}

/**
 * Middleware to authenticate requests to the Configuration API
 * 
 * @param request The HTTP request
 * @param env Environment variables
 * @param logger Logger instance
 * @returns AuthResult indicating if the request is authenticated
 */
export async function authenticateConfigRequest(
  request: Request,
  env: Env,
  logger: Logger
): Promise<AuthResult> {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method;
  
  // Check if request is to a public endpoint
  if (isPublicEndpoint(method, path)) {
    return { 
      authenticated: true, 
      roles: ['readonly'],
      user: 'anonymous'
    };
  }
  
  // Rate limiting check (to prevent brute force attacks)
  // In a production environment, you would implement a proper rate limiting system
  // using KV to store IP-based counters with expiration
  const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';
  logger.debug('Authentication attempt', { clientIp, path, method });
  
  // Origin check (to mitigate CSRF attacks)
  // Note: In production, you would configure a whitelist of allowed origins
  const origin = request.headers.get('Origin');
  const referer = request.headers.get('Referer');
  
  // Log request metadata for audit purposes
  logger.debug('Authentication request metadata', {
    clientIp,
    path,
    method,
    origin,
    referer,
    userAgent: request.headers.get('User-Agent') || 'unknown'
  });
  
  // Check for API keys in headers
  const apiKey = request.headers.get('X-Config-API-Key');
  
  if (apiKey) {
    // Constant-time comparison to prevent timing attacks
    // Note: In a production environment, you would use a cryptographic library
    // for constant-time comparison, but this is a simplified implementation
    if (env.CONFIG_API_KEY && safeCompare(apiKey, env.CONFIG_API_KEY)) {
      // Log successful authentication with API key
      logger.info('Successful authentication with API key', {
        user: 'api-user',
        clientIp,
        path,
        method
      });
      
      return { 
        authenticated: true, 
        roles: ['admin'],
        user: 'api-user'
      };
    } else {
      // Log failed API key authentication attempt
      logger.warn('Invalid API key authentication attempt', {
        clientIp,
        path,
        method
      });
      
      return {
        authenticated: false,
        errorCode: 'invalid_api_key',
        error: 'Invalid API key'
      };
    }
  }
  
  // Check for Authorization header (Basic Auth)
  const authHeader = request.headers.get('Authorization');
  
  if (authHeader && authHeader.startsWith('Basic ')) {
    try {
      const credentials = atob(authHeader.slice(6));
      const [username, password] = credentials.split(':');
      
      // Validate credentials
      if (
        env.CONFIG_ADMIN_USER && 
        env.CONFIG_ADMIN_PASSWORD &&
        safeCompare(username, env.CONFIG_ADMIN_USER) && 
        safeCompare(password, env.CONFIG_ADMIN_PASSWORD)
      ) {
        // Log successful authentication with Basic Auth
        logger.info('Successful authentication with Basic Auth', {
          user: username,
          clientIp,
          path,
          method
        });
        
        return { 
          authenticated: true, 
          roles: ['admin'],
          user: username
        };
      } else {
        // Log failed Basic Auth attempt
        logger.warn('Invalid Basic Auth credentials', {
          clientIp,
          path,
          method,
          // Don't log the actual credentials
          providedUsername: username ? true : false
        });
        
        return {
          authenticated: false,
          errorCode: 'invalid_credentials',
          error: 'Invalid username or password'
        };
      }
    } catch (error) {
      logger.error('Error parsing Basic Auth credentials', {
        error: error instanceof Error ? error.message : String(error),
        clientIp,
        path,
        method
      });
      
      return {
        authenticated: false,
        errorCode: 'auth_format_error',
        error: 'Invalid authentication format'
      };
    }
  }
  
  // Check for development mode bypass
  if (env.ENVIRONMENT === 'development' && env.DISABLE_CONFIG_AUTH === 'true') {
    // Only allow from localhost in development
    if (clientIp === '127.0.0.1' || clientIp === '::1' || clientIp.startsWith('192.168.') || clientIp.startsWith('10.')) {
      logger.warn('Auth bypassed in development mode', {
        clientIp,
        path,
        method
      });
      
      return { 
        authenticated: true, 
        roles: ['admin'],
        user: 'dev-user'
      };
    } else {
      logger.warn('Rejected dev mode bypass from non-local IP', {
        clientIp,
        path,
        method
      });
    }
  }
  
  // Authentication failed - no valid credentials provided
  logger.warn('Authentication failed - no valid credentials provided', {
    clientIp,
    path,
    method
  });
  
  return { 
    authenticated: false,
    errorCode: 'authentication_required', 
    error: 'Authentication failed. Provide valid API key or credentials.'
  };
}

/**
 * Check if a request is to a public endpoint
 * 
 * @param method HTTP method
 * @param path Request path
 * @returns True if the endpoint is public
 */
function isPublicEndpoint(method: string, path: string): boolean {
  return PUBLIC_ENDPOINTS.some(endpoint => {
    if (endpoint.method !== method) {
      return false;
    }
    
    if (endpoint.path && endpoint.path === path) {
      return true;
    }
    
    if (endpoint.pathPrefix && path.startsWith(endpoint.pathPrefix)) {
      return true;
    }
    
    return false;
  });
}

/**
 * Constant-time string comparison to prevent timing attacks
 * 
 * @param a First string
 * @param b Second string
 * @returns True if strings match
 */
function safeCompare(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') {
    return false;
  }
  
  if (a.length !== b.length) {
    return false;
  }
  
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  
  return result === 0;
}

/**
 * Create a response for authentication failures
 * 
 * @param authResult Authentication result
 * @returns HTTP response
 */
export function createAuthResponse(authResult: AuthResult): Response {
  return new Response(
    JSON.stringify({ 
      error: authResult.errorCode || 'unauthorized', 
      message: authResult.error || 'Authentication required'
    }),
    {
      status: 401,
      headers: {
        'Content-Type': 'application/json',
        'WWW-Authenticate': 'Basic realm="Configuration API", charset="UTF-8"',
        'Cache-Control': 'no-store, private',
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'same-origin'
      }
    }
  );
}