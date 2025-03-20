/**
 * Authentication utilities for the image resizer worker
 * 
 * This module provides functions for authenticating requests to protected image origins
 * including bearer tokens, basic auth, and signed URLs.
 */

import { ImageResizerConfig } from '../config';
import { Logger, defaultLogger } from './logging';

// Use default logger until a configured one is provided
let logger: Logger = defaultLogger;

/**
 * Set the logger for the auth module
 * 
 * @param configuredLogger The logger to use
 */
export function setLogger(configuredLogger: Logger): void {
  logger = configuredLogger;
}
// Import relevant utilities, remove unused import
//import { StorageError } from './errors';

/**
 * Types of authentication supported by the image resizer
 */
export enum AuthType {
  BEARER = 'bearer',
  BASIC = 'basic',
  HEADER = 'header',
  QUERY = 'query'
}

/**
 * Result of an authentication operation
 */
export interface AuthResult {
  success: boolean;
  url: string;
  headers?: Record<string, string>;
  error?: string;
}

/**
 * Parse a URL to get the origin domain
 * @param url URL to parse
 * @returns Origin domain without protocol
 */
function getOriginDomain(url: string): string {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.hostname;
  } catch (e) {
    logger.error('Invalid URL in getOriginDomain', { url, error: String(e) });
    return '';
  }
}

/**
 * Find the appropriate auth origin for a URL
 * @param url URL to authenticate
 * @param config Authentication configuration
 * @returns Origin ID and origin configuration
 */
function findAuthOrigin(url: string, config: ImageResizerConfig) {
  // Parse the domain from the URL
  const domain = getOriginDomain(url);
  
  // Try to find a matching origin in the configuration
  if (config.storage.auth && config.storage.auth.origins) {
    for (const [id, origin] of Object.entries(config.storage.auth.origins)) {
      if (!origin.domain) continue;
      
      // Check for exact domain match
      if (origin.domain === domain) {
        return { originId: id, origin };
      }
      
      // Check for wildcard and pattern matches
      if (origin.domain.includes('*')) {
        const pattern = origin.domain
          .replace(/\./g, '\\.') // Escape dots
          .replace(/\*/g, '.*'); // Convert * to regex wildcard
        
        try {
          const regex = new RegExp(`^${pattern}$`);
          if (regex.test(domain)) {
            return { originId: id, origin };
          }
        } catch (error) {
          logger.error('Error creating regex pattern for domain', { 
            pattern, 
            domain: origin.domain, 
            error: String(error) 
          });
        }
      }
    }
  }
  
  // No matching origin
  return { originId: null, origin: null };
}

/**
 * Find origin configuration for a given path
 * 
 * @param path URL path to check
 * @param config Image resizer configuration
 * @param env Environment variables
 * @returns Origin context with environment or null if no match
 */
/**
 * Type for origin configuration settings
 */
export interface OriginConfig {
  domain: string;
  type: 'bearer' | 'basic' | 'header' | 'query';
  tokenSecret?: string;
  tokenHeaderName?: string;
  tokenParam?: string;
  tokenExpiration?: number;
  username?: string;
  password?: string;
  headers?: Record<string, string>;
  signedUrlExpiration?: number;
  hashAlgorithm?: string;
}

export interface OriginContext {
  originId: string;
  origin: OriginConfig;
  env: Env;
}

export function findOriginForPath(
  path: string, 
  config: ImageResizerConfig, 
  env: Env
): OriginContext | null {
  // If auth is disabled, return null
  if (!config.storage.auth?.enabled) {
    return null;
  }
  
  // Add protocol to the path if it doesn't have one
  const url = path.startsWith('http') ? path : `https://${path}`;
  
  const result = findAuthOrigin(url, config);
  if (!result.originId || !result.origin) {
    return null;
  }
  
  return {
    ...result,
    env
  };
}

/**
 * Generate a bearer token for authentication
 * 
 * @param url URL to authenticate
 * @param origin Auth origin configuration
 * @param env Environment variables
 * @returns Bearer token or null if unable to generate
 */
function generateBearerToken(url: string, origin: OriginConfig, env: Env): string | null {
  // Use Record for string indexing while keeping safety
  const envRecord = env as unknown as Record<string, string | undefined>;
  
  // Get the token secret from environment variable or config
  const originId = Object.keys(envRecord).find(key => 
    envRecord[key] && origin.domain && envRecord[key] === origin.domain
  ) || 'default';
  
  const secretKey = `AUTH_TOKEN_SECRET_${originId.toUpperCase()}`;
  const tokenSecret = envRecord[secretKey] || origin.tokenSecret; // Fallback to config if available
  
  if (!tokenSecret) {
    logger.error('Bearer token secret not found for origin', { originId });
    return null;
  }
  
  // Simple token generation - in a real implementation, this would use a more secure method
  // such as JWT or a signed token with an expiration
  try {
    // Generate a token: domain+timestamp+secret
    const timestamp = Math.floor(Date.now() / 1000);
    const domain = getOriginDomain(url);
    
    // This is a simple token generation example - production should use a proper JWT or similar
    const tokenValue = `${domain}:${timestamp}:${tokenSecret}`;
    
    // In the real implementation, this would be signed/encrypted
    const token = btoa(tokenValue);
    
    return token;
  } catch (error) {
    logger.error('Error generating bearer token', { 
      error: error instanceof Error ? error.message : String(error),
      url
    });
    return null;
  }
}

/**
 * Generate basic auth credentials
 * 
 * @param url URL to authenticate
 * @param origin Auth origin configuration
 * @param env Environment variables
 * @returns Basic auth header value or null if unable to generate
 */
function generateBasicAuth(url: string, origin: OriginConfig, env: Env): string | null {
  // Use Record for string indexing while keeping safety
  const envRecord = env as unknown as Record<string, string | undefined>;
  
  // Get the credentials from environment variable or config
  const originId = Object.keys(envRecord).find(key => 
    envRecord[key] && origin.domain && envRecord[key] === origin.domain
  ) || 'default';
  
  const usernameKey = `AUTH_BASIC_USERNAME_${originId.toUpperCase()}`;
  const passwordKey = `AUTH_BASIC_PASSWORD_${originId.toUpperCase()}`;
  
  const username = envRecord[usernameKey] || origin.username;
  const password = envRecord[passwordKey] || origin.password;
  
  if (!username || !password) {
    logger.error('Basic auth credentials not found for origin', { originId });
    return null;
  }
  
  try {
    // Create the basic auth string: username:password
    const credentials = `${username}:${password}`;
    
    // Base64 encode the credentials
    const encoded = btoa(credentials);
    
    return `Basic ${encoded}`;
  } catch (error) {
    logger.error('Error generating basic auth', { 
      error: error instanceof Error ? error.message : String(error),
      url
    });
    return null;
  }
}

/**
 * Generate a signed URL with expiration
 * 
 * @param url URL to sign
 * @param origin Auth origin configuration
 * @param env Environment variables
 * @returns Signed URL or original URL if unable to sign
 */
function generateSignedUrl(url: string, origin: any, env: Env): string {
  try {
    // Use Record<string, any> to allow for string indexing
    const envRecord = env as Record<string, any>;
    
    // Get the signing secret from environment variable or config
    const originId = Object.keys(envRecord).find(key => 
      envRecord[key] && origin.domain && envRecord[key] === origin.domain
    ) || 'default';
    
    const secretKey = `AUTH_SIGNING_SECRET_${originId.toUpperCase()}`;
    const signingSecret = envRecord[secretKey] || origin.tokenSecret; // Fallback to config if available
    
    if (!signingSecret) {
      logger.error('Signing secret not found for origin', { originId });
      return url;
    }
    
    // Parse the URL
    const parsedUrl = new URL(url);
    
    // Get the token parameter name
    const tokenParam = origin.tokenParam || 'token';
    
    // Calculate expiration
    const expiration = Math.floor(Date.now() / 1000) + 
      (origin.signedUrlExpiration || 86400); // Default to 24 hours
    
    // Add expiration to URL
    parsedUrl.searchParams.set('expires', expiration.toString());
    
    // Generate a signature (in a real implementation, this would use HMAC)
    // For this example, we'll create a simple signature
    const pathAndQuery = parsedUrl.pathname + parsedUrl.search;
    
    // This is just an example - real implementation should use crypto.subtle or similar
    // to generate a proper signature with HMAC
    // Simple signature for demo purposes
    const signature = btoa(`${pathAndQuery}:${signingSecret}:${expiration}`);
    
    // Add the signature to the URL
    parsedUrl.searchParams.set(tokenParam, signature);
    
    return parsedUrl.toString();
  } catch (error) {
    logger.error('Error generating signed URL', { 
      error: error instanceof Error ? error.message : String(error),
      url
    });
    return url;
  }
}

/**
 * Authenticate a request to a protected origin
 * 
 * @param url URL to authenticate
 * @param config Authentication configuration
 * @param env Environment variables
 * @returns Authentication result with success status, URL and headers
 */
export function authenticateRequest(
  url: string, 
  config: ImageResizerConfig,
  env: Env
): AuthResult {
  logger.breadcrumb('Authenticating request', undefined, { 
    url, 
    authEnabled: config.storage.auth?.enabled === true
  });
  
  // If auth is not enabled, return success with original URL
  if (!config.storage.auth?.enabled) {
    logger.breadcrumb('Authentication disabled, passing request through');
    return {
      success: true,
      url: url
    };
  }
  
  try {
    // Find the appropriate origin for this URL
    const { originId, origin } = findAuthOrigin(url, config);
    
    // If no matching origin, return success with original URL
    if (!originId || !origin) {
      logger.breadcrumb('No matching auth origin found for URL', undefined, { url });
      return {
        success: true,
        url: url
      };
    }
    
    // Determine auth type
    const authType = origin.type || AuthType.BEARER;
    
    logger.breadcrumb('Applying authentication', undefined, { 
      originId, 
      authType,
      securityLevel: config.storage.auth?.securityLevel || 'strict'
    });
    
    // Apply authentication based on type
    switch (authType) {
    case AuthType.BEARER: {
      logger.breadcrumb('Generating bearer token');
      // Generate bearer token
      const token = generateBearerToken(url, origin, env);
      
      // If token generation failed
      if (!token) {
        // Check security level - permissive will continue without token
        if (config.storage.auth?.securityLevel === 'permissive') {
          logger.warn('Bearer token generation failed, continuing in permissive mode', { url });
          logger.breadcrumb('Bearer token generation failed, but permissive mode enabled', undefined, { url });
          return {
            success: true,
            url: url,
            headers: {}
          };
        }
        
        logger.breadcrumb('Bearer token generation failed in strict mode', undefined, { url });
        // Strict mode returns error
        return {
          success: false,
          url: url,
          error: 'Failed to generate bearer token'
        };
      }
      
      // Header name (default to Authorization)
      const headerName = origin.tokenHeaderName || 'Authorization';
      
      logger.breadcrumb('Bearer token generated successfully', undefined, {
        headerName,
        tokenLength: token.length
      });
      
      // Return success with original URL and header
      return {
        success: true,
        url: url,
        headers: {
          [headerName]: `Bearer ${token}`
        }
      };
    }
      
    case AuthType.BASIC: {
      // Generate basic auth
      const basicAuth = generateBasicAuth(url, origin, env);
      
      // If basic auth generation failed, return error
      if (!basicAuth) {
        return {
          success: false,
          url: url,
          error: 'Failed to generate basic auth credentials'
        };
      }
      
      // Return success with original URL and header
      return {
        success: true,
        url: url,
        headers: {
          'Authorization': basicAuth
        }
      };
    }
      
    case AuthType.HEADER: {
      // Get custom headers from config
      const headers = origin.headers || {};
      
      // Return success with original URL and headers
      return {
        success: true,
        url: url,
        headers
      };
    }
      
    case AuthType.QUERY: {
      // Generate signed URL
      const signedUrl = generateSignedUrl(url, origin, env);
      
      // Return success with signed URL
      return {
        success: true,
        url: signedUrl
      };
    }
      
    default:
      // Unsupported auth type
      return {
        success: false,
        url: url,
        error: `Unsupported auth type: ${authType}`
      };
    }
  } catch (error) {
    // Return error
    const errorMsg = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    
    logger.error('Authentication error', { 
      error: errorMsg,
      stack,
      url
    });
    
    logger.breadcrumb('Authentication failed with error', undefined, {
      error: errorMsg,
      url
    });
    
    return {
      success: false,
      url: url,
      error: errorMsg
    };
  }
}