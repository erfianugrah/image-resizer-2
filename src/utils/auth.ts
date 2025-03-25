/**
 * Authentication utilities for the image resizer worker
 * 
 * This module provides functions for authenticating requests to protected image origins
 * including bearer tokens, basic auth, and signed URLs.
 */

import { ImageResizerConfig } from '../config';
import { Logger, defaultLogger } from './logging';
import { AwsClient } from 'aws4fetch';
import { Env } from '../types';

// Use default logger until a configured one is provided
let logger: Logger = defaultLogger;

// Pre-loaded AWS client
let awsClientInitialized = false;

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
  BASIC = 'basic', // Kept for backwards compatibility but not actively used
  HEADER = 'header',
  QUERY = 'query',
  AWS_S3 = 'aws-s3'  // S3/R2/GCS compatible API
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
    // Make sure we have origins object
    const origins = config.storage.auth.origins || {};
    
    for (const [id, originConfig] of Object.entries(origins)) {
      // Skip invalid entries
      if (!originConfig || !originConfig.domain) continue;
      
      // Check for exact domain match
      if (originConfig.domain === domain) {
        return { originId: id, origin: originConfig };
      }
      
      // Check for wildcard and pattern matches
      if (originConfig.domain.includes('*')) {
        const pattern = originConfig.domain
          .replace(/\./g, '\\.') // Escape dots
          .replace(/\*/g, '.*'); // Convert * to regex wildcard
        
        try {
          const regex = new RegExp(`^${pattern}$`);
          if (regex.test(domain)) {
            return { originId: id, origin: originConfig };
          }
        } catch (error) {
          logger.error('Error creating regex pattern for domain', { 
            pattern, 
            domain: originConfig.domain, 
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
 * 
 * Note: For S3, R2, and GCS (using S3-compatible API), use the AWS_S3 auth type
 * and set accessKey/secretKey in environment variables. Make sure useOriginAuth: true
 * is set so Cloudflare passes the authentication headers to the origin.
 */
export interface OriginConfig {
  domain: string;
  type: 'bearer' | 'header' | 'query' | 'aws-s3' | 'basic';  // Added aws-s3 support and kept basic for compatibility
  tokenSecret?: string;
  tokenHeaderName?: string;
  tokenParam?: string;
  tokenExpiration?: number;
  // S3/R2/GCS specific settings
  region?: string;             // AWS/GCS region (e.g., us-east-1, us-central1)
  service?: string;            // Default 's3' for S3/R2, 'storage' for GCS
  accessKeyEnvVar?: string;    // Environment variable name containing access key
  secretKeyEnvVar?: string;    // Environment variable name containing secret key
  accessKeyVar?: string;       // Alternative name for accessKeyEnvVar
  secretKeyVar?: string;       // Alternative name for secretKeyEnvVar
  // Other settings
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
  
  // Ensure the origin is properly typed
  const originConfig: OriginConfig = result.origin;
  
  return {
    originId: result.originId,
    origin: originConfig,
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
 * [REMOVED] Basic auth is no longer supported.
 * Use aws-s3 type with origin-auth for S3, R2, and GCS authentication.
 */

/**
 * Sign a request for S3, R2, or GCS (S3-compatible API)
 * 
 * @param url URL to sign
 * @param origin Auth origin configuration
 * @param env Environment variables
 * @returns An object with signed headers for the request
 */
async function signAwsRequest(url: string, origin: OriginConfig, env: Env): Promise<Record<string, string> | null> {
  try {
    // Get credentials from environment variables
    // Try the new naming first, then fall back to the old naming
    const accessKeyEnvVar = origin.accessKeyVar || origin.accessKeyEnvVar || 'AWS_ACCESS_KEY_ID';
    const secretKeyEnvVar = origin.secretKeyVar || origin.secretKeyEnvVar || 'AWS_SECRET_ACCESS_KEY';
    
    // Access environment variables safely
    const envRecord = env as unknown as Record<string, string | undefined>;
    
    const accessKey = envRecord[accessKeyEnvVar];
    const secretKey = envRecord[secretKeyEnvVar];
    
    if (!accessKey || !secretKey) {
      logger.error('AWS credentials not found in environment variables', { 
        accessKeyVar: accessKeyEnvVar, 
        secretKeyVar: secretKeyEnvVar 
      });
      return null;
    }
    
    // Note: We're using the pre-imported AwsClient instead of dynamically importing it
    // Set up AWS client
    const aws = new AwsClient({
      accessKeyId: accessKey,
      secretAccessKey: secretKey,
      service: origin.service || 's3',
      region: origin.region || 'us-east-1'
    });
    
    // Create a request to sign
    const request = new Request(url, {
      method: 'GET'
    });
    
    // Sign the request
    const signedRequest = await aws.sign(request);
    
    // Extract the headers
    const headers: Record<string, string> = {};
    signedRequest.headers.forEach((value, key) => {
      // Only include AWS specific headers
      if (key.startsWith('x-amz-') || key === 'authorization') {
        headers[key] = value;
      }
    });
    
    logger.debug('Generated AWS signed headers', { 
      url,
      headerCount: Object.keys(headers).length,
      service: origin.service || 's3',
      region: origin.region || 'us-east-1'
    });
    
    return headers;
  } catch (error) {
    logger.error('Error signing AWS request', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
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
function generateSignedUrl(url: string, origin: OriginConfig, env: Env): string {
  try {
    // First cast to unknown, then to Record type for type safety
    const envRecord = env as unknown as Record<string, string | undefined>;
    
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
/**
 * Fast path function for when auth is disabled
 * Avoids all unnecessary processing and logging
 */
export function getNoAuthResult(url: string): AuthResult {
  return {
    success: true,
    url: url
  };
}

export async function authenticateRequest(
  url: string, 
  config: ImageResizerConfig,
  env: Env
): Promise<AuthResult> {
  // Fast path - avoid even creating breadcrumbs when auth is disabled
  if (!config.storage.auth?.enabled) {
    return getNoAuthResult(url);
  }
  
  logger.breadcrumb('Authenticating request', undefined, { 
    url, 
    authEnabled: true
  });
  
  // This check is now redundant but keeping for safety
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
    
    // Create an empty origin object if none found
    const authOrigin: OriginConfig = origin || {
      domain: '',
      type: 'bearer'
    };
    
    // If no matching origin, return success with original URL
    if (!originId || !origin) {
      logger.breadcrumb('No matching auth origin found for URL', undefined, { url });
      return {
        success: true,
        url: url
      };
    }
    
    // Determine auth type
    const authType = authOrigin.type || AuthType.BEARER;
    
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
      const token = generateBearerToken(url, authOrigin, env);
      
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
      const headerName = authOrigin.tokenHeaderName || 'Authorization';
      
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
      // Basic auth is no longer supported
      logger.warn('Basic auth is no longer supported, use origin-auth for S3/GCS or BEARER/HEADER for custom auth', {
        url
      });
      
      return {
        success: false,
        url: url,
        error: 'Basic auth is no longer supported'
      };
    }
      
    case AuthType.HEADER: {
      // Get custom headers from config
      const headers = authOrigin.headers || {};
      
      // Return success with original URL and headers
      return {
        success: true,
        url: url,
        headers
      };
    }
      
    case AuthType.QUERY: {
      // Generate signed URL
      const signedUrl = generateSignedUrl(url, authOrigin, env);
      
      // Return success with signed URL
      return {
        success: true,
        url: signedUrl
      };
    }
      
    case AuthType.AWS_S3: {
      logger.breadcrumb('Generating AWS S3 signature');
      // Generate AWS signature
      const headers = await signAwsRequest(url, authOrigin, env);
      
      // If signature generation failed
      if (!headers) {
        // Check security level - permissive will continue without auth
        if (config.storage.auth?.securityLevel === 'permissive') {
          logger.warn('AWS signature generation failed, continuing in permissive mode', { url });
          logger.breadcrumb('AWS signature generation failed, but permissive mode enabled', undefined, { url });
          return {
            success: true,
            url: url,
            headers: {}
          };
        }
        
        logger.breadcrumb('AWS signature generation failed in strict mode', undefined, { url });
        // Strict mode returns error
        return {
          success: false,
          url: url,
          error: 'Failed to generate AWS S3 signature'
        };
      }
      
      logger.breadcrumb('AWS signature generated successfully', undefined, {
        headerCount: Object.keys(headers).length
      });
      
      // Return success with original URL and headers
      return {
        success: true,
        url: url,
        headers
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