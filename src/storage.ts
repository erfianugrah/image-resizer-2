/**
 * Storage utilities for the image resizer worker
 *
 * This module provides functions for retrieving images from different storage sources
 * including R2 buckets, remote URLs, and fallback URLs.
 */

import { ImageResizerConfig } from './config';
import { StorageError } from './utils/errors';
import { createLogger, defaultLogger, Logger } from './utils/logging';
// We'll use the AuthService instead of direct function calls

// Extended auth types used internally
interface ExtendedAuthConfig {
  tokenVar?: string;
  queryParams?: Record<string, string>;
  expirationToken?: {
    expiresInSec?: number;
    timestampParam?: string;
    signatureParam?: string;
    secretVar?: string;
  };
}

// Use default logger until a configured one is provided
let logger: Logger = defaultLogger;

/**
 * Set the logger for the storage module
 *
 * @param configuredLogger The logger to use
 */
export function setLogger(configuredLogger: Logger): void {
  logger = configuredLogger;
}

// Fetch options will be initialized from config

/**
 * Result of a storage operation
 * Note: in services/interfaces.ts there's a more strict version of this
 * interface that doesn't allow null values for contentType and size.
 * The DefaultStorageService does the conversion.
 */
export interface StorageResult {
  response: Response;
  sourceType: 'r2' | 'remote' | 'fallback' | 'error';
  contentType: string | null;
  size: number | null;
  originalUrl?: string;
  error?: Error;
  path?: string; // The path to the image being accessed
  width?: number; // The width of the image if available
  height?: number; // The height of the image if available
  aspectRatio?: number; // The aspect ratio (width/height) of the image if available
  originalFormat?: string; // The original format of the image if available
}

// Cache for path transformations
const pathTransformCache = new Map<string, string>();
const MAX_CACHE_SIZE = 1000;

/**
 * Apply path transformations for any origin type
 * This helper function is used to transform paths based on origin type
 */
function applyPathTransformation(
  path: string,
  config: ImageResizerConfig,
  originType: 'r2' | 'remote' | 'fallback',
): string {
  // Create a cache key
  const cacheKey = `${path}:${originType}`;

  // Check cache first
  if (pathTransformCache.has(cacheKey)) {
    return pathTransformCache.get(cacheKey)!;
  }

  // Skip if no pathTransforms in config
  if (!config.pathTransforms) {
    return path;
  }

  // Normalize path by removing leading slash
  let normalizedPath = path.startsWith('/') ? path.substring(1) : path;

  // Get the original path segments to check for transforms
  const segments = path.split('/').filter(Boolean);

  // Check if any segment has a transform configuration
  for (const segment of segments) {
    if (config.pathTransforms[segment]) {
      const transform = config.pathTransforms[segment];

      // Check for origin-specific transforms first, fall back to generic transform
      const originTransform = transform[originType] || transform;

      // If this segment should be removed and replaced with a prefix
      if (
        originTransform.removePrefix && originTransform.prefix !== undefined
      ) {
        // Create a new path with the proper prefix and without the matched segment
        const pathWithoutSegment = segments
          .filter((s) => s !== segment) // Remove the segment
          .join('/');

        // Apply the new prefix
        normalizedPath = originTransform.prefix + pathWithoutSegment;

        logger.debug(`Applied path transformation for ${originType}`, {
          segment,
          originalPath: path,
          transformed: normalizedPath,
        });

        break; // Only apply one transformation
      }
    }
  }

  // Save result in cache
  pathTransformCache.set(cacheKey, normalizedPath);

  // Prune cache if too large
  if (pathTransformCache.size > MAX_CACHE_SIZE) {
    // Remove oldest entry (first in map)
    const iterator = pathTransformCache.keys().next();
    if (iterator && !iterator.done && iterator.value) {
      pathTransformCache.delete(iterator.value);
    }
  }

  return normalizedPath;
}

/**
 * Helper function to extract conditional request options
 */
function extractConditionalOptions(request: Request): R2GetOptions {
  const options: R2GetOptions = {};

  // Process If-None-Match / If-Modified-Since
  const ifNoneMatch = request.headers.get('If-None-Match');
  const ifModifiedSince = request.headers.get('If-Modified-Since');

  if (ifNoneMatch) {
    options.onlyIf = { etagDoesNotMatch: ifNoneMatch };
  } else if (ifModifiedSince) {
    const ifModifiedSinceDate = new Date(ifModifiedSince);
    if (!isNaN(ifModifiedSinceDate.getTime())) {
      options.onlyIf = { uploadedAfter: ifModifiedSinceDate };
    }
  }

  // Process Range header
  const rangeHeader = request.headers.get('Range');
  if (rangeHeader && rangeHeader.startsWith('bytes=')) {
    try {
      const rangeValue = rangeHeader.substring(6);
      const [start, end] = rangeValue.split('-').map((v) => parseInt(v, 10));

      if (!isNaN(start)) {
        const range: R2Range = { offset: start };

        if (!isNaN(end)) {
          range.length = end - start + 1;
        }

        options.range = range;
      }
    } catch (e) {
      // Invalid range header, ignore
      logger.warn('Invalid range header', { rangeHeader });
    }
  }

  return options;
}

/**
 * Helper function to create R2 response
 */
function createR2Response(
  object: any, // Using any to avoid type issues with R2ObjectBody vs R2Object
  options: R2GetOptions,
  normalizedPath: string,
  config?: ImageResizerConfig,
): StorageResult {
  // Create headers using R2 object's writeHttpMetadata
  const headers = new Headers();
  object.writeHttpMetadata(headers);

  // Add additional headers
  const r2CacheTtl = config?.cache.ttl.r2Headers || 86400;
  headers.set('Cache-Control', `public, max-age=${r2CacheTtl}`);
  headers.set('Accept-Ranges', 'bytes');

  // Set status based on range request
  let status = 200;
  if (options.range && 'offset' in options.range) {
    status = 206;
    const offset = options.range.offset || 0;
    const length = options.range.length || 0;
    const end = offset + length - 1;
    const total = object.size;
    headers.set('Content-Range', `bytes ${offset}-${end}/${total}`);
  }

  // Return a successful result with the object details
  return {
    response: new Response(object.body, {
      headers,
      status,
    }),
    sourceType: 'r2',
    contentType: object.httpMetadata?.contentType || null,
    size: object.size,
    path: normalizedPath,
  };
}

/**
 * Fetch an image from R2 storage
 */
async function fetchFromR2(
  path: string,
  bucket: R2Bucket,
  request?: Request,
  config?: ImageResizerConfig,
): Promise<StorageResult | null> {
  try {
    // Normalize the path by removing leading slashes
    const normalizedPath = path.replace(/^\/+/, '');

    // Prepare options - empty by default
    const options: R2GetOptions = {};

    // Add conditional request options if we have a request
    if (request) {
      // Extract and apply conditional options
      const conditionalOptions = extractConditionalOptions(request);
      Object.assign(options, conditionalOptions);
    }

    // Single code path for fetching with options
    const object = await bucket.get(normalizedPath, options);

    // Handle 304 Not Modified for conditional requests
    if (
      object === null && request &&
      (request.headers.get('If-None-Match') ||
        request.headers.get('If-Modified-Since'))
    ) {
      return {
        response: new Response(null, { status: 304 }),
        sourceType: 'r2',
        contentType: null,
        size: 0,
      };
    }

    // Return null if object not found
    if (!object) {
      return null;
    }

    // Create response using helper function
    return createR2Response(object, options, normalizedPath, config);
  } catch (error) {
    logger.error('Error fetching from R2', {
      error: error instanceof Error ? error.message : String(error),
      path,
    });
    throw new StorageError('Error accessing R2 storage', {
      originalError: error instanceof Error ? error.message : String(error),
      path,
    });
  }
}

/**
 * Fetch an image from a remote URL
 */
async function fetchFromRemote(
  path: string,
  baseUrl: string,
  config: ImageResizerConfig,
  env: Env,
): Promise<StorageResult | null> {
  try {
    // Build fetch options from config
    const fetchOptions: RequestInit = {
      cf: {
        cacheTtl: config.cache.ttl.remoteFetch || 3600,
        cacheEverything: true,
      },
      headers: {
        'User-Agent': config.storage.fetchOptions?.userAgent ||
          'Cloudflare-Image-Resizer/1.0',
      },
    };

    // Add any additional headers from config
    if (config.storage.fetchOptions?.headers) {
      Object.entries(config.storage.fetchOptions.headers).forEach(
        ([key, value]) => {
          if (
            fetchOptions.headers && typeof fetchOptions.headers === 'object'
          ) {
            // Add the headers from config
            (fetchOptions.headers as Record<string, string>)[key] = value;
          }
        },
      );
    }

    // Apply path transformations for remote URLs
    const transformedPath = applyPathTransformation(path, config, 'remote');
    logger.debug('Remote path after transformation', {
      originalPath: path,
      transformedPath,
    });

    // Check if authentication is required for this origin
    let finalUrl: string;

    // Set the base URL
    finalUrl = new URL(transformedPath, baseUrl).toString();
    
    // More detailed logging for URL construction
    logger.debug('Remote URL construction details', {
      baseUrl: baseUrl,
      transformedPath: transformedPath,
      finalUrl: finalUrl,
      hasTrailingSlashOnBase: baseUrl.endsWith('/'),
      startsWithSlash: transformedPath.startsWith('/')
    });

    // Check if remote auth is enabled specifically for this remote URL
    if (config.storage.remoteAuth?.enabled) {
      logger.debug('Remote auth enabled', {
        type: config.storage.remoteAuth.type,
        url: finalUrl,
      });

      // Handle different auth types
      if (config.storage.remoteAuth.type === 'aws-s3') {
        // Check if we're using origin-auth
        if (config.storage.auth?.useOriginAuth) {
          // With origin-auth, we sign the headers and let Cloudflare pass them through
          // Create an AWS-compatible signer
          const accessKeyVar = config.storage.remoteAuth.accessKeyVar ||
            'AWS_ACCESS_KEY_ID';
          const secretKeyVar = config.storage.remoteAuth.secretKeyVar ||
            'AWS_SECRET_ACCESS_KEY';

          // Access environment variables
          const envRecord = env as unknown as Record<
            string,
            string | undefined
          >;

          const accessKey = envRecord[accessKeyVar];
          const secretKey = envRecord[secretKeyVar];

          // Log auth variables for debugging (without exposing secrets)
          logger.debug('AWS S3 auth configuration', {
            accessKeyVar,
            secretKeyVar,
            hasAccessKey: !!accessKey,
            hasSecretKey: !!secretKey,
            service: config.storage.remoteAuth.service || 's3',
            region: config.storage.remoteAuth.region || 'us-east-1',
            useOriginAuth: config.storage.auth?.useOriginAuth
          });
          
          // Add a breadcrumb for more visibility in logs
          logger.breadcrumb('AWS S3 authentication preparation', undefined, {
            source: 'remote',
            authType: 'aws-s3',
            useOriginAuth: !!config.storage.auth?.useOriginAuth,
            hasCredentials: !!(accessKey && secretKey)
          });

          if (accessKey && secretKey) {
            try {
              // Import AwsClient
              const { AwsClient } = await import('aws4fetch');

              // Setup AWS client
              const aws = new AwsClient({
                accessKeyId: accessKey,
                secretAccessKey: secretKey,
                service: config.storage.remoteAuth.service || 's3',
                region: config.storage.remoteAuth.region || 'us-east-1',
              });

              // Create a request to sign
              const signRequest = new Request(finalUrl, {
                method: 'GET',
              });

              logger.debug('Signing AWS request', {
                url: finalUrl,
                method: 'GET',
                service: config.storage.remoteAuth.service || 's3',
                region: config.storage.remoteAuth.region || 'us-east-1'
              });

              // Sign the request
              const signedRequest = await aws.sign(signRequest);

              // Log signing process
              const awsHeaderKeys: string[] = [];
              signedRequest.headers.forEach((_: string, key: string) => {
                awsHeaderKeys.push(key);
              });
              
              logger.debug('AWS request signed successfully', {
                headerKeys: awsHeaderKeys.join(', '),
                hasAuthHeader: signedRequest.headers.has('authorization')
              });
              
              // Add breadcrumb for successful signing
              logger.breadcrumb('AWS request signature generated', undefined, {
                source: 'remote',
                url: finalUrl.split('?')[0], // Don't log query params
                headerCount: awsHeaderKeys.length,
                hasAuthHeader: signedRequest.headers.has('authorization')
              });

              // Extract the headers and add them to fetch options
              const addedHeaders: string[] = [];
              signedRequest.headers.forEach((value: string, key: string) => {
                // Only include AWS specific headers
                if (key.startsWith('x-amz-') || key === 'authorization') {
                  if (
                    fetchOptions.headers &&
                    typeof fetchOptions.headers === 'object'
                  ) {
                    (fetchOptions.headers as Record<string, string>)[key] =
                      value;
                    addedHeaders.push(key);
                  }
                }
              });

              logger.debug('Added AWS signed headers', {
                url: finalUrl,
                headerCount: Object.keys(fetchOptions.headers || {}).length,
                addedHeaders: addedHeaders.join(', ')
              });
              
              // Add breadcrumb for headers added to request
              logger.breadcrumb('AWS signed headers applied to request', undefined, {
                source: 'remote',
                headerCount: addedHeaders.length,
                headerTypes: addedHeaders.map(h => h.startsWith('x-amz-') ? 'amz' : 'auth').join(',')
              });
            } catch (error) {
              logger.error('Error signing AWS request', {
                error: error instanceof Error ? error.message : String(error),
                url: finalUrl,
              });

              // Continue without authentication if in permissive mode
              if (config.storage.auth?.securityLevel !== 'permissive') {
                return null;
              }
            }
          } else {
            logger.error('AWS credentials not found', {
              accessKeyVar,
              secretKeyVar,
            });

            // Continue without authentication if in permissive mode
            if (config.storage.auth?.securityLevel !== 'permissive') {
              return null;
            }
          }
        } else {
          logger.warn('AWS S3 auth requires origin-auth to be enabled', {
            url: finalUrl,
          });
        }
      } else if (config.storage.remoteAuth.type === 'bearer') {
        // Implement bearer token auth
        const remoteAuth = config.storage.remoteAuth as typeof config.storage.remoteAuth & ExtendedAuthConfig;
        const tokenVar = remoteAuth.tokenVar || 'BEARER_TOKEN';
        const envRecord = env as unknown as Record<string, string | undefined>;
        const token = envRecord[tokenVar];
        
        logger.debug('Bearer token auth configuration for remote', {
          tokenVar: tokenVar,
          hasToken: !!token,
          securityLevel: config.storage.auth?.securityLevel || 'strict'
        });
        
        // Add a breadcrumb for bearer token auth preparation
        logger.breadcrumb('Bearer token authentication preparation', undefined, {
          source: 'remote',
          authType: 'bearer',
          hasToken: !!token
        });
        
        if (token) {
          if (fetchOptions.headers && typeof fetchOptions.headers === 'object') {
            (fetchOptions.headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
            logger.debug('Added bearer token authorization to remote request', {
              url: finalUrl,
              headerName: 'Authorization',
              tokenPrefix: 'Bearer'
            });
            
            // Add breadcrumb for token being applied
            logger.breadcrumb('Bearer token applied to request', undefined, {
              source: 'remote',
              headerName: 'Authorization'
            });
          }
        } else {
          logger.error('Bearer token not found for remote auth', { 
            tokenVar,
            permissiveMode: config.storage.auth?.securityLevel === 'permissive'
          });
          
          // Continue without authentication if in permissive mode
          if (config.storage.auth?.securityLevel !== 'permissive') {
            return null;
          }
        }
      } else if (config.storage.remoteAuth.type === 'header') {
        // Add custom headers
        if (config.storage.remoteAuth.headers) {
          Object.entries(config.storage.remoteAuth.headers).forEach(
            ([key, value]) => {
              if (
                fetchOptions.headers && typeof fetchOptions.headers === 'object'
              ) {
                (fetchOptions.headers as Record<string, string>)[key] = value;
              }
            },
          );
        }
      } else if (config.storage.remoteAuth.type === 'query') {
        // Add signed URL query params
        const remoteAuth = config.storage.remoteAuth as typeof config.storage.remoteAuth & ExtendedAuthConfig;
        
        logger.debug('Query auth configuration for remote', {
          hasQueryParams: !!remoteAuth.queryParams,
          hasExpirationToken: !!remoteAuth.expirationToken,
          securityLevel: config.storage.auth?.securityLevel || 'strict'
        });
        
        if (remoteAuth.queryParams) {
          const url = new URL(finalUrl);
          const originalParams = Array.from(url.searchParams.entries());
          logger.debug('Original URL parameters', {
            url: finalUrl,
            params: originalParams.length > 0 ? 
              originalParams.map(([k,v]) => `${k}=${v}`).join('&') : 
              '(none)'
          });
          
          // Add configured query parameters
          const addedParams: string[] = [];
          Object.entries(remoteAuth.queryParams).forEach(
            ([key, value]) => {
              url.searchParams.set(key, value);
              addedParams.push(`${key}=${value}`);
            }
          );
          
          logger.debug('Added basic query parameters', {
            addedParams: addedParams.join('&')
          });
          
          // Check if we need to add a timestamp-based expiration token
          if (remoteAuth.expirationToken) {
            const expirationConfig = remoteAuth.expirationToken;
            const expiresInSec = expirationConfig.expiresInSec || 300; // Default 5 minutes
            const timestampParam = expirationConfig.timestampParam || 'expires';
            
            logger.debug('Expiration token configuration', {
              expiresInSec,
              timestampParam,
              signatureParam: expirationConfig.signatureParam,
              secretVarConfigured: !!expirationConfig.secretVar
            });
            
            // Calculate expiration timestamp
            const expiresTimestamp = Math.floor(Date.now() / 1000) + expiresInSec;
            url.searchParams.set(timestampParam, expiresTimestamp.toString());
            
            // Add signature if configured
            if (expirationConfig.signatureParam && expirationConfig.secretVar) {
              const envRecord = env as unknown as Record<string, string | undefined>;
              const secret = envRecord[expirationConfig.secretVar];
              
              logger.debug('Signature configuration', {
                secretVar: expirationConfig.secretVar,
                hasSecret: !!secret,
                signatureParam: expirationConfig.signatureParam
              });
              
              if (secret) {
                try {
                  // Create a simple signature using the concatenated parameters and secret
                  // In production, you might want to use a more robust hashing algorithm
                  const message = Array.from(url.searchParams.entries())
                    .filter(([k]) => k !== expirationConfig.signatureParam)
                    .map(([k, v]) => `${k}=${v}`)
                    .sort()
                    .join('&');
                  
                  logger.debug('Signature message before hashing', {
                    message, // Don't log secret!
                    messageLength: message.length,
                    parametersIncluded: url.searchParams.size
                  });
                  
                  // Use TextEncoder and crypto API for hashing
                  const encoder = new TextEncoder();
                  const data = encoder.encode(message + secret);
                  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
                  
                  // Convert hash to hex string
                  const hashArray = Array.from(new Uint8Array(hashBuffer));
                  const signature = hashArray
                    .map(b => b.toString(16).padStart(2, '0'))
                    .join('');
                  
                  url.searchParams.set(
                    expirationConfig.signatureParam,
                    signature
                  );
                  
                  logger.debug('Added signed URL parameters', {
                    url: url.toString().replace(signature, 'SIGNATURE'), // Don't log the actual signature
                    expires: expiresTimestamp,
                    signatureLength: signature.length,
                    algorithm: 'SHA-256'
                  });
                } catch (error) {
                  logger.error('Error generating URL signature', {
                    error: error instanceof Error ? error.message : String(error),
                  });
                }
              } else {
                logger.error('Signature secret not found', {
                  secretVar: expirationConfig.secretVar,
                  permissiveMode: config.storage.auth?.securityLevel === 'permissive'
                });
                
                // Continue without signature if in permissive mode
                if (config.storage.auth?.securityLevel !== 'permissive') {
                  return null;
                }
              }
            }
          }
          
          // Update the final URL
          finalUrl = url.toString();
          logger.debug('Applied query authentication parameters for remote', {
            url: finalUrl.replace(/signature=[^&]+/, 'signature=SIGNATURE'), // Mask signature
            paramCount: url.searchParams.size,
            paramsAdded: url.searchParams.size - originalParams.length
          });
        }
      }

      // Set cache TTL for authenticated requests
      if (config.storage.auth?.cacheTtl) {
        if (fetchOptions.cf && typeof fetchOptions.cf === 'object') {
          (fetchOptions.cf as any).cacheTtl = config.storage.auth.cacheTtl;
        }
      }
    } else {
      logger.debug('Remote auth not enabled for this URL', {
        url: finalUrl,
      });
    }

    // Fetch the image from the remote URL
    logger.debug('Fetching from remote URL', { 
      url: finalUrl,
      authHeaders: fetchOptions.headers ? Object.keys(fetchOptions.headers) : [],
      cacheTtl: fetchOptions.cf ? (fetchOptions.cf as any).cacheTtl : null,
      cacheEverything: fetchOptions.cf ? (fetchOptions.cf as any).cacheEverything : null,
    });
    
    // Add breadcrumb for the remote fetch operation
    logger.breadcrumb('Starting remote URL fetch operation', undefined, {
      url: finalUrl.split('?')[0], // Don't log query params
      hasAuthHeaders: fetchOptions.headers ? 
        Object.keys(fetchOptions.headers).some(h => h === 'Authorization' || h.startsWith('x-amz-')) : false
    });
    
    // Track the start time for performance logging
    const fetchStart = Date.now();
    const response = await fetch(finalUrl, fetchOptions);
    const fetchDuration = Date.now() - fetchStart;

    if (!response.ok) {
      logger.warn('Remote fetch failed', {
        url: finalUrl,
        status: response.status,
        statusText: response.statusText,
        durationMs: fetchDuration,
        responseHeaders: Array.from(response.headers.keys())
      });
      return null;
    }
    
    // Log success with performance metrics
    logger.debug('Remote fetch succeeded', {
      url: finalUrl,
      status: response.status,
      contentType: response.headers.get('Content-Type'),
      contentLength: response.headers.get('Content-Length'),
      durationMs: fetchDuration,
      cacheStatus: response.headers.get('CF-Cache-Status') || 'unknown'
    });
    
    // Add breadcrumb for successful fetch completion
    logger.breadcrumb('Remote fetch completed successfully', fetchDuration, {
      status: response.status,
      contentType: response.headers.get('Content-Type'),
      size: response.headers.get('Content-Length'),
      cacheStatus: response.headers.get('CF-Cache-Status')
    });

    // Clone the response to ensure we can access its body multiple times
    const clonedResponse = response.clone();

    return {
      response: clonedResponse,
      sourceType: 'remote',
      contentType: response.headers.get('Content-Type'),
      size: parseInt(response.headers.get('Content-Length') || '0', 10) || null,
      originalUrl: finalUrl,
      path: transformedPath,
    };
  } catch (error) {
    logger.error('Error fetching from remote', {
      error: error instanceof Error ? error.message : String(error),
      url: baseUrl,
      path,
    });
    return null;
  }
}

/**
 * Fetch an image from a fallback URL
 */
async function fetchFromFallback(
  path: string,
  fallbackUrl: string,
  config: ImageResizerConfig,
  env: Env,
): Promise<StorageResult | null> {
  try {
    // Build fetch options from config
    const fetchOptions: RequestInit = {
      cf: {
        cacheTtl: config.cache.ttl.remoteFetch || 3600,
        cacheEverything: true,
      },
      headers: {
        'User-Agent': config.storage.fetchOptions?.userAgent ||
          'Cloudflare-Image-Resizer/1.0',
      },
    };

    // Add any additional headers from config
    if (config.storage.fetchOptions?.headers) {
      Object.entries(config.storage.fetchOptions.headers).forEach(
        ([key, value]) => {
          if (
            fetchOptions.headers && typeof fetchOptions.headers === 'object'
          ) {
            // Add the headers from config
            (fetchOptions.headers as Record<string, string>)[key] = value;
          }
        },
      );
    }

    // Apply path transformations for fallback URLs
    const transformedPath = applyPathTransformation(path, config, 'fallback');
    logger.debug('Fallback path after transformation', {
      originalPath: path,
      transformedPath,
    });

    // Check if authentication is required for this origin
    let finalUrl: string;

    // Set the base URL
    finalUrl = new URL(transformedPath, fallbackUrl).toString();

    // Check if fallback auth is enabled specifically for this URL
    if (config.storage.fallbackAuth?.enabled) {
      logger.debug('Fallback auth enabled', {
        type: config.storage.fallbackAuth.type,
        url: finalUrl,
      });

      // Handle different auth types
      if (config.storage.fallbackAuth.type === 'aws-s3') {
        // Check if we're using origin-auth
        if (config.storage.auth?.useOriginAuth) {
          // With origin-auth, we sign the headers and let Cloudflare pass them through
          // Create an AWS-compatible signer
          const accessKeyVar = config.storage.fallbackAuth.accessKeyVar ||
            'AWS_ACCESS_KEY_ID';
          const secretKeyVar = config.storage.fallbackAuth.secretKeyVar ||
            'AWS_SECRET_ACCESS_KEY';

          // Access environment variables
          const envRecord = env as unknown as Record<
            string,
            string | undefined
          >;

          const accessKey = envRecord[accessKeyVar];
          const secretKey = envRecord[secretKeyVar];

          // Log auth variables for debugging (without exposing secrets)
          logger.debug('AWS S3 fallback auth configuration', {
            accessKeyVar,
            secretKeyVar,
            hasAccessKey: !!accessKey,
            hasSecretKey: !!secretKey,
            service: config.storage.fallbackAuth.service || 's3',
            region: config.storage.fallbackAuth.region || 'us-east-1',
            useOriginAuth: config.storage.auth?.useOriginAuth
          });

          if (accessKey && secretKey) {
            try {
              // Import AwsClient
              const { AwsClient } = await import('aws4fetch');

              // Setup AWS client
              const aws = new AwsClient({
                accessKeyId: accessKey,
                secretAccessKey: secretKey,
                service: config.storage.fallbackAuth.service || 's3',
                region: config.storage.fallbackAuth.region || 'us-east-1',
              });

              // Create a request to sign
              const signRequest = new Request(finalUrl, {
                method: 'GET',
              });

              logger.debug('Signing AWS fallback request', {
                url: finalUrl,
                method: 'GET',
                service: config.storage.fallbackAuth.service || 's3',
                region: config.storage.fallbackAuth.region || 'us-east-1'
              });

              // Sign the request
              const signedRequest = await aws.sign(signRequest);

              // Log signing process
              const awsHeaderKeys: string[] = [];
              signedRequest.headers.forEach((_: string, key: string) => {
                awsHeaderKeys.push(key);
              });
              
              logger.debug('AWS fallback request signed successfully', {
                headerKeys: awsHeaderKeys.join(', '),
                hasAuthHeader: signedRequest.headers.has('authorization')
              });

              // Extract the headers and add them to fetch options
              const addedHeaders: string[] = [];
              signedRequest.headers.forEach((value: string, key: string) => {
                // Only include AWS specific headers
                if (key.startsWith('x-amz-') || key === 'authorization') {
                  if (
                    fetchOptions.headers &&
                    typeof fetchOptions.headers === 'object'
                  ) {
                    (fetchOptions.headers as Record<string, string>)[key] =
                      value;
                    addedHeaders.push(key);
                  }
                }
              });

              logger.debug('Added AWS signed headers for fallback', {
                url: finalUrl,
                headerCount: Object.keys(fetchOptions.headers || {}).length,
                addedHeaders: addedHeaders.join(', ')
              });
            } catch (error) {
              logger.error('Error signing AWS request', {
                error: error instanceof Error ? error.message : String(error),
                url: finalUrl,
              });

              // Continue without authentication if in permissive mode
              if (config.storage.auth?.securityLevel !== 'permissive') {
                return null;
              }
            }
          } else {
            logger.error('AWS credentials not found', {
              accessKeyVar,
              secretKeyVar,
            });

            // Continue without authentication if in permissive mode
            if (config.storage.auth?.securityLevel !== 'permissive') {
              return null;
            }
          }
        } else {
          logger.warn('AWS S3 auth requires origin-auth to be enabled', {
            url: finalUrl,
          });
        }
      } else if (config.storage.fallbackAuth.type === 'bearer') {
        // Implement bearer token auth
        const fallbackAuth = config.storage.fallbackAuth as typeof config.storage.fallbackAuth & ExtendedAuthConfig;
        const tokenVar = fallbackAuth.tokenVar || 'BEARER_TOKEN';
        const envRecord = env as unknown as Record<string, string | undefined>;
        const token = envRecord[tokenVar];
        
        logger.debug('Bearer token auth configuration for fallback', {
          tokenVar: tokenVar,
          hasToken: !!token,
          securityLevel: config.storage.auth?.securityLevel || 'strict'
        });
        
        if (token) {
          if (fetchOptions.headers && typeof fetchOptions.headers === 'object') {
            (fetchOptions.headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
            logger.debug('Added bearer token authorization to fallback request', {
              url: finalUrl,
              headerName: 'Authorization',
              tokenPrefix: 'Bearer'
            });
          }
        } else {
          logger.error('Bearer token not found for fallback auth', { 
            tokenVar,
            permissiveMode: config.storage.auth?.securityLevel === 'permissive'
          });
          
          // Continue without authentication if in permissive mode
          if (config.storage.auth?.securityLevel !== 'permissive') {
            return null;
          }
        }
      } else if (config.storage.fallbackAuth.type === 'header') {
        // Add custom headers
        if (config.storage.fallbackAuth.headers) {
          Object.entries(config.storage.fallbackAuth.headers).forEach(
            ([key, value]) => {
              if (
                fetchOptions.headers && typeof fetchOptions.headers === 'object'
              ) {
                (fetchOptions.headers as Record<string, string>)[key] = value;
              }
            },
          );
        }
      } else if (config.storage.fallbackAuth.type === 'query') {
        // Add signed URL query params
        const fallbackAuth = config.storage.fallbackAuth as typeof config.storage.fallbackAuth & ExtendedAuthConfig;
        
        logger.debug('Query auth configuration for fallback', {
          hasQueryParams: !!fallbackAuth.queryParams,
          hasExpirationToken: !!fallbackAuth.expirationToken,
          securityLevel: config.storage.auth?.securityLevel || 'strict'
        });
        
        if (fallbackAuth.queryParams) {
          const url = new URL(finalUrl);
          const originalParams = Array.from(url.searchParams.entries());
          logger.debug('Original URL parameters for fallback', {
            url: finalUrl,
            params: originalParams.length > 0 ? 
              originalParams.map(([k,v]) => `${k}=${v}`).join('&') : 
              '(none)'
          });
          
          // Add configured query parameters
          const addedParams: string[] = [];
          Object.entries(fallbackAuth.queryParams).forEach(
            ([key, value]) => {
              url.searchParams.set(key, value);
              addedParams.push(`${key}=${value}`);
            }
          );
          
          logger.debug('Added basic query parameters to fallback', {
            addedParams: addedParams.join('&')
          });
          
          // Check if we need to add a timestamp-based expiration token
          if (fallbackAuth.expirationToken) {
            const expirationConfig = fallbackAuth.expirationToken;
            const expiresInSec = expirationConfig.expiresInSec || 300; // Default 5 minutes
            const timestampParam = expirationConfig.timestampParam || 'expires';
            
            logger.debug('Expiration token configuration for fallback', {
              expiresInSec,
              timestampParam,
              signatureParam: expirationConfig.signatureParam,
              secretVarConfigured: !!expirationConfig.secretVar
            });
            
            // Calculate expiration timestamp
            const expiresTimestamp = Math.floor(Date.now() / 1000) + expiresInSec;
            url.searchParams.set(timestampParam, expiresTimestamp.toString());
            
            // Add signature if configured
            if (expirationConfig.signatureParam && expirationConfig.secretVar) {
              const envRecord = env as unknown as Record<string, string | undefined>;
              const secret = envRecord[expirationConfig.secretVar];
              
              logger.debug('Signature configuration for fallback', {
                secretVar: expirationConfig.secretVar,
                hasSecret: !!secret,
                signatureParam: expirationConfig.signatureParam
              });
              
              if (secret) {
                try {
                  // Create a simple signature using the concatenated parameters and secret
                  // In production, you might want to use a more robust hashing algorithm
                  const message = Array.from(url.searchParams.entries())
                    .filter(([k]) => k !== expirationConfig.signatureParam)
                    .map(([k, v]) => `${k}=${v}`)
                    .sort()
                    .join('&');
                  
                  logger.debug('Signature message before hashing for fallback', {
                    message, // Don't log secret!
                    messageLength: message.length,
                    parametersIncluded: url.searchParams.size
                  });
                  
                  // Use TextEncoder and crypto API for hashing
                  const encoder = new TextEncoder();
                  const data = encoder.encode(message + secret);
                  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
                  
                  // Convert hash to hex string
                  const hashArray = Array.from(new Uint8Array(hashBuffer));
                  const signature = hashArray
                    .map(b => b.toString(16).padStart(2, '0'))
                    .join('');
                  
                  url.searchParams.set(
                    expirationConfig.signatureParam,
                    signature
                  );
                  
                  logger.debug('Added signed URL parameters for fallback', {
                    url: url.toString().replace(signature, 'SIGNATURE'), // Don't log the actual signature
                    expires: expiresTimestamp,
                    signatureLength: signature.length,
                    algorithm: 'SHA-256'
                  });
                } catch (error) {
                  logger.error('Error generating URL signature for fallback', {
                    error: error instanceof Error ? error.message : String(error),
                  });
                }
              } else {
                logger.error('Signature secret not found for fallback', {
                  secretVar: expirationConfig.secretVar,
                  permissiveMode: config.storage.auth?.securityLevel === 'permissive'
                });
                
                // Continue without signature if in permissive mode
                if (config.storage.auth?.securityLevel !== 'permissive') {
                  return null;
                }
              }
            }
          }
          
          // Update the final URL
          finalUrl = url.toString();
          logger.debug('Applied query authentication parameters for fallback', {
            url: finalUrl.replace(/signature=[^&]+/, 'signature=SIGNATURE'), // Mask signature
            paramCount: url.searchParams.size,
            paramsAdded: url.searchParams.size - originalParams.length
          });
        }
      }

      // Set cache TTL for authenticated requests
      if (config.storage.auth?.cacheTtl) {
        if (fetchOptions.cf && typeof fetchOptions.cf === 'object') {
          (fetchOptions.cf as any).cacheTtl = config.storage.auth.cacheTtl;
        }
      }
    } else {
      logger.debug('Fallback auth not enabled for this URL', {
        url: finalUrl,
      });
    }

    // Fetch the image from the fallback URL
    logger.debug('Fetching from fallback URL', { 
      url: finalUrl,
      authHeaders: fetchOptions.headers ? Object.keys(fetchOptions.headers) : [],
      cacheTtl: fetchOptions.cf ? (fetchOptions.cf as any).cacheTtl : null,
      cacheEverything: fetchOptions.cf ? (fetchOptions.cf as any).cacheEverything : null,
    });
    
    // Track the start time for performance logging
    const fetchStart = Date.now();
    const response = await fetch(finalUrl, fetchOptions);
    const fetchDuration = Date.now() - fetchStart;

    if (!response.ok) {
      logger.warn('Fallback fetch failed', {
        url: finalUrl,
        status: response.status,
        statusText: response.statusText,
        durationMs: fetchDuration,
        responseHeaders: Array.from(response.headers.keys())
      });
      return null;
    }
    
    // Log success with performance metrics
    logger.debug('Fallback fetch succeeded', {
      url: finalUrl,
      status: response.status,
      contentType: response.headers.get('Content-Type'),
      contentLength: response.headers.get('Content-Length'),
      durationMs: fetchDuration,
      cacheStatus: response.headers.get('CF-Cache-Status') || 'unknown'
    });

    // Clone the response to ensure we can access its body multiple times
    const clonedResponse = response.clone();

    return {
      response: clonedResponse,
      sourceType: 'fallback',
      contentType: response.headers.get('Content-Type'),
      size: parseInt(response.headers.get('Content-Length') || '0', 10) || null,
      originalUrl: finalUrl,
      path: transformedPath,
    };
  } catch (error) {
    logger.error('Error fetching from fallback', {
      error: error instanceof Error ? error.message : String(error),
      url: fallbackUrl,
      path,
    });
    return null;
  }
}

/**
 * Fetch an image from any available storage source
 *
 * @param path The path to the image
 * @param config The image resizer configuration
 * @param env The Cloudflare environment
 * @returns A StorageResult object or null if the image couldn't be found
 */
export async function fetchImage(
  path: string,
  config: ImageResizerConfig,
  env: Env,
  request?: Request,
): Promise<StorageResult> {
  logger.breadcrumb('Starting image fetch', undefined, {
    path,
    hasRequest: !!request,
    storageOptions: config.storage.priority,
  });

  // First, check the request type to determine if this is a Cloudflare Image Resizing subrequest
  const via = request?.headers.get('via') || '';
  const isImageResizingSubrequest = via.includes('image-resizing');

  // Log the request type for debugging
  logger.debug('Image fetch request analysis', {
    path,
    isImageResizingSubrequest,
    via,
  });

  // Special handling for Image Resizing subrequests
  // These come from Cloudflare's infrastructure when using cf.image properties
  if (isImageResizingSubrequest) {
    logger.breadcrumb('Detected image-resizing subrequest', undefined, {
      path,
    });

    // First, determine if R2 should be used based on storage priority
    const shouldUseR2 = config.storage.priority.includes('r2') &&
      config.storage.r2.enabled &&
      (env as any).IMAGES_BUCKET;

    // Use simpler debugging approach to avoid TypeScript errors
    logger.debug('Subrequest storage evaluation', {
      path: path,
      storageOrder: config.storage.priority.join(','),
      r2Available: config.storage.r2.enabled && !!(env as any).IMAGES_BUCKET
        ? true
        : false,
      shouldUseR2: shouldUseR2 ? true : false,
    });

    // Check if R2 is available, enabled, and in the priority list
    if (shouldUseR2) {
      logger.debug('Using R2 for image-resizing subrequest', { path });
      const bucket = (env as any).IMAGES_BUCKET;
      const fetchStart = Date.now();

      // Apply path transformations for R2 storage
      const r2Key = applyPathTransformation(path, config, 'r2');

      logger.debug('Image key for subrequest', {
        originalPath: path,
        transformedKey: r2Key,
        url: request?.url,
      });

      // Try to get the object from R2
      try {
        // Make sure bucket is defined before using it
        if (!bucket) {
          logger.error('R2 bucket is undefined', { path: r2Key });
          throw new Error('R2 bucket is undefined');
        }

        // Only do parallel fetches when paths might be different
        const normalizedPath = path.startsWith('/') ? path.substring(1) : path;

        if (r2Key !== normalizedPath) {
          // Use parallel fetching to optimize performance
          logger.debug('Using parallel R2 fetch for subrequest', {
            r2Key,
            normalizedPath,
          });

          // Start both fetches in parallel
          const [transformedResult, normalizedResult] = await Promise
            .allSettled([
              fetchFromR2(r2Key, bucket, request, config),
              fetchFromR2(normalizedPath, bucket, request, config),
            ]);

          // Check transformed path result first
          if (
            transformedResult.status === 'fulfilled' && transformedResult.value
          ) {
            const fetchEnd = Date.now();
            logger.debug('Found image in R2 bucket using transformed key', {
              r2Key,
            });
            logger.breadcrumb(
              'R2 parallel fetch successful for transformed key',
              fetchEnd - fetchStart,
              {
                contentType: transformedResult.value.contentType,
                size: transformedResult.value.size,
                key: r2Key,
              },
            );
            return transformedResult.value;
          }

          // Then check normalized path result
          if (
            normalizedResult.status === 'fulfilled' && normalizedResult.value
          ) {
            const fetchEnd = Date.now();
            logger.debug('Found image in R2 bucket using normalized path', {
              normalizedPath,
            });
            logger.breadcrumb(
              'R2 parallel fetch successful for normalized path',
              fetchEnd - fetchStart,
              {
                contentType: normalizedResult.value.contentType,
                size: normalizedResult.value.size,
                key: normalizedPath,
              },
            );
            return normalizedResult.value;
          }

          // Neither fetch worked
          const fetchEnd = Date.now();
          logger.breadcrumb(
            'Image not found in R2 for subrequest (parallel fetch)',
            fetchEnd - fetchStart,
            {
              paths: `${r2Key}, ${normalizedPath}`,
              fetchMethod: 'parallel',
            },
          );
        } else {
          // Paths are the same, just do one fetch
          const result = await fetchFromR2(r2Key, bucket, request, config);
          const fetchEnd = Date.now();

          if (result) {
            logger.debug('Found image in R2 bucket for subrequest', { r2Key });
            logger.breadcrumb(
              'R2 fetch successful for image-resizing subrequest',
              fetchEnd - fetchStart,
              {
                contentType: result.contentType,
                size: result.size,
                key: r2Key,
              },
            );
            return result;
          }

          logger.breadcrumb(
            'Image not found in R2 for subrequest',
            fetchEnd - fetchStart,
            {
              path: r2Key,
              fetchMethod: 'single',
            },
          );
        }
      } catch (error) {
        logger.error('Error in R2 fetch for subrequest', {
          error: error instanceof Error ? error.message : String(error),
          path: r2Key,
        });
      }
    } else {
      logger.debug('R2 not available for image-resizing subrequest', {
        r2Enabled: config.storage.r2.enabled,
        hasBucket: !!(env as any).IMAGES_BUCKET,
      });
    }
  }

  // Determine available storage options
  const availableStorage = [...config.storage.priority];
  logger.debug('Trying storage options in priority order', {
    storageOrder: availableStorage,
    r2Enabled: config.storage.r2.enabled && !!(env as any).IMAGES_BUCKET,
    remoteUrlSet: !!config.storage.remoteUrl,
    fallbackUrlSet: !!config.storage.fallbackUrl,
  });
  logger.breadcrumb('Trying storage options in priority order', undefined, {
    storageOrder: availableStorage.join(','),
    r2Enabled: config.storage.r2.enabled && !!(env as any).IMAGES_BUCKET ? 'yes' : 'no',
    remoteUrl: config.storage.remoteUrl ? 'configured' : 'not configured',
    fallbackUrl: config.storage.fallbackUrl ? 'configured' : 'not configured',
  });

  // Try each storage option in order of priority
  for (const storageType of availableStorage) {
    let result: StorageResult | null = null;

    // Try to fetch from R2
    if (
      storageType === 'r2' && config.storage.r2.enabled && (env as any).IMAGES_BUCKET
    ) {
      logger.debug('Trying R2 storage', { path });
      logger.breadcrumb('Attempting R2 storage fetch', undefined, { path });

      // Apply path transformations for R2
      const transformedPath = applyPathTransformation(path, config, 'r2');
      logger.debug('R2 path after transformation', {
        originalPath: path,
        transformedPath,
      });

      const bucket = (env as any).IMAGES_BUCKET;
      const fetchStart = Date.now();

      // Make sure bucket is defined before using it
      if (!bucket) {
        logger.error('R2 bucket is undefined', { path: transformedPath });
        throw new Error('R2 bucket is undefined');
      }

      // Only do parallel fetches when paths might be different
      if (
        transformedPath !== path && transformedPath !== path.replace(/^\/+/, '')
      ) {
        // Create normalized path for parallel fetch
        const normalizedPath = path.startsWith('/') ? path.substring(1) : path;

        // Start both fetches in parallel
        logger.debug(
          'Using parallel R2 fetch for transformed and normalized paths',
          {
            transformedPath,
            normalizedPath,
          },
        );

        const fetchPromises = [
          fetchFromR2(transformedPath, bucket, request, config)
            .then((result) => result ? { result, path: 'transformed' } : null),
          fetchFromR2(normalizedPath, bucket, request, config)
            .then((result) => result ? { result, path: 'normalized' } : null),
        ];

        // Wait for results - use Promise.allSettled to get both results
        const results = await Promise.allSettled(fetchPromises);
        let finalResult = null;

        // Process results - first check for success
        for (const promiseResult of results) {
          if (promiseResult.status === 'fulfilled' && promiseResult.value) {
            finalResult = promiseResult.value;
            break;
          }
        }

        const fetchEnd = Date.now();

        if (finalResult) {
          logger.debug('Parallel R2 fetch succeeded using path strategy', {
            pathType: finalResult.path,
          });

          result = finalResult.result;

          logger.breadcrumb('R2 fetch successful', fetchEnd - fetchStart, {
            size: result.size,
            contentType: result.contentType,
            pathStrategy: finalResult.path,
          });
        } else {
          logger.breadcrumb(
            'Parallel R2 fetch failed for all paths',
            fetchEnd - fetchStart,
          );
        }
      } else {
        // Single path fetch - original behavior
        result = await fetchFromR2(transformedPath, bucket, request, config);
        const fetchEnd = Date.now();

        if (result) {
          logger.breadcrumb('R2 fetch successful', fetchEnd - fetchStart, {
            size: result.size,
            contentType: result.contentType,
          });
        } else {
          logger.breadcrumb('R2 fetch failed', fetchEnd - fetchStart);
        }
      }
    }

    // Try to fetch from remote URL
    if (storageType === 'remote' && config.storage.remoteUrl) {
      logger.debug('Trying remote URL', {
        path,
        remoteUrl: config.storage.remoteUrl,
      });
      logger.breadcrumb('Attempting remote URL fetch', undefined, {
        path,
        baseUrl: new URL(config.storage.remoteUrl).hostname,
      });

      // Apply path transformations for remote
      const transformedPath = applyPathTransformation(path, config, 'remote');
      logger.debug('Remote path after transformation', {
        originalPath: path,
        transformedPath,
      });

      const fetchStart = Date.now();
      result = await fetchFromRemote(
        transformedPath,
        config.storage.remoteUrl,
        config,
        env,
      );
      const fetchEnd = Date.now();

      if (result) {
        logger.breadcrumb('Remote fetch successful', fetchEnd - fetchStart, {
          size: result.size,
          contentType: result.contentType,
        });
      } else {
        logger.breadcrumb('Remote fetch failed', fetchEnd - fetchStart);
      }
    }

    // Try to fetch from fallback URL
    if (storageType === 'fallback' && config.storage.fallbackUrl) {
      logger.debug('Trying fallback URL', {
        path,
        fallbackUrl: config.storage.fallbackUrl,
      });
      logger.breadcrumb('Attempting fallback URL fetch', undefined, {
        path,
        baseUrl: new URL(config.storage.fallbackUrl).hostname,
      });

      // Apply path transformations for fallback
      const transformedPath = applyPathTransformation(path, config, 'fallback');
      logger.debug('Fallback path after transformation', {
        originalPath: path,
        transformedPath,
      });

      const fetchStart = Date.now();
      result = await fetchFromFallback(
        transformedPath,
        config.storage.fallbackUrl,
        config,
        env,
      );
      const fetchEnd = Date.now();

      if (result) {
        logger.breadcrumb('Fallback fetch successful', fetchEnd - fetchStart, {
          size: result.size,
          contentType: result.contentType,
        });
      } else {
        logger.breadcrumb('Fallback fetch failed', fetchEnd - fetchStart);
      }
    }

    // If we found the image, return it
    if (result) {
      logger.debug('Found image in storage', {
        sourceType: result.sourceType,
        contentType: result.contentType,
        size: result.size,
      });
      logger.breadcrumb('Image found in storage', undefined, {
        sourceType: result.sourceType,
        contentType: result.contentType,
        size: result.size,
      });
      return result;
    }
  }

  // If we couldn't find the image anywhere, return an error
  logger.warn('Image not found in any storage location', { path });
  logger.breadcrumb('Image not found in any storage location', undefined, {
    path,
    triedStorageTypes: availableStorage.join(','),
  });

  return {
    response: new Response('Image not found', { status: 404 }),
    sourceType: 'error',
    contentType: null,
    size: null,
    error: new Error('Image not found in any storage location'),
    path: path,
  };
}
