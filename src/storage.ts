/**
 * Storage utilities for the image resizer worker
 * 
 * This module provides functions for retrieving images from different storage sources
 * including R2 buckets, remote URLs, and fallback URLs.
 */

import { ImageResizerConfig } from './config';
import { StorageError } from './utils/errors';
import { authenticateRequest } from './utils/auth';
import { createLogger, Logger, defaultLogger } from './utils/logging';

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

/**
 * Apply path transformations for any origin type
 * This helper function is used to transform paths based on origin type
 */
function applyPathTransformation(
  path: string, 
  config: ImageResizerConfig, 
  originType: 'r2' | 'remote' | 'fallback'
): string {
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
      if (originTransform.removePrefix && originTransform.prefix !== undefined) {
        // Create a new path with the proper prefix and without the matched segment
        const pathWithoutSegment = segments
          .filter(s => s !== segment) // Remove the segment
          .join('/');
          
        // Apply the new prefix
        normalizedPath = originTransform.prefix + pathWithoutSegment;
        
        logger.debug(`Applied path transformation for ${originType}`, {
          segment,
          originalPath: path,
          transformed: normalizedPath
        });
        
        break; // Only apply one transformation
      }
    }
  }
  
  return normalizedPath;
}

/**
 * Fetch an image from R2 storage
 */
async function fetchFromR2(
  path: string, 
  bucket: R2Bucket,
  request?: Request,
  config?: ImageResizerConfig
): Promise<StorageResult | null> {
  try {
    // Normalize the path by removing leading slashes
    const normalizedPath = path.replace(/^\/+/, '');
    
    // Handle conditional requests if we have a request object
    if (request) {
      const ifNoneMatch = request.headers.get('If-None-Match');
      const ifModifiedSince = request.headers.get('If-Modified-Since');
      
      // Check for conditional request options
      const options: R2GetOptions = {};
      
      if (ifNoneMatch) {
        options.onlyIf = { etagDoesNotMatch: ifNoneMatch };
      } else if (ifModifiedSince) {
        const ifModifiedSinceDate = new Date(ifModifiedSince);
        if (!isNaN(ifModifiedSinceDate.getTime())) {
          options.onlyIf = { uploadedAfter: ifModifiedSinceDate };
        }
      }
      
      // Handle range requests
      const rangeHeader = request.headers.get('Range');
      if (rangeHeader && rangeHeader.startsWith('bytes=')) {
        try {
          const rangeValue = rangeHeader.substring(6);
          const [start, end] = rangeValue.split('-').map(v => parseInt(v, 10));
          
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
      
      // Attempt to get the object from R2 with options
      const object = await bucket.get(normalizedPath, options);
      
      // Handle 304 Not Modified
      if (object === null && (ifNoneMatch || ifModifiedSince)) {
        return {
          response: new Response(null, { status: 304 }),
          sourceType: 'r2',
          contentType: null,
          size: 0
        };
      }
      
      if (!object) {
        return null;
      }
      
      // Create headers using R2 object's writeHttpMetadata
      const headers = new Headers();
      object.writeHttpMetadata(headers);
      
      // Add additional headers
      const r2CacheTtl = config?.cache.ttl.r2Headers || 86400;
      headers.set('Cache-Control', `public, max-age=${r2CacheTtl}`);
      headers.set('Accept-Ranges', 'bytes');
      
      // The Range response
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
          status
        }),
        sourceType: 'r2',
        contentType: object.httpMetadata?.contentType || null,
        size: object.size,
        path: normalizedPath
      };
    } else {
      // Simple case - no request object
      const object = await bucket.get(normalizedPath);
      
      if (!object) {
        return null;
      }
      
      // Create headers using R2 object's writeHttpMetadata
      const headers = new Headers();
      object.writeHttpMetadata(headers);
      
      // Add additional headers
      const r2CacheTtl = config?.cache.ttl.r2Headers || 86400;
      headers.set('Cache-Control', `public, max-age=${r2CacheTtl}`);
      headers.set('Accept-Ranges', 'bytes');
      
      // Return a successful result with the object details
      return {
        response: new Response(object.body, { headers }),
        sourceType: 'r2',
        contentType: object.httpMetadata?.contentType || null,
        size: object.size,
        path: normalizedPath
      };
    }
  } catch (error) {
    logger.error('Error fetching from R2', { 
      error: error instanceof Error ? error.message : String(error),
      path
    });
    throw new StorageError('Error accessing R2 storage', { 
      originalError: error instanceof Error ? error.message : String(error),
      path
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
  env: Env
): Promise<StorageResult | null> {
  try {
    // Build fetch options from config
    const fetchOptions: RequestInit = {
      cf: {
        cacheTtl: config.cache.ttl.remoteFetch || 3600,
        cacheEverything: true,
      },
      headers: {
        'User-Agent': config.storage.fetchOptions?.userAgent || 'Cloudflare-Image-Resizer/1.0',
      },
    };
    
    // Add any additional headers from config
    if (config.storage.fetchOptions?.headers) {
      Object.entries(config.storage.fetchOptions.headers).forEach(([key, value]) => {
        if (fetchOptions.headers && typeof fetchOptions.headers === 'object') {
          // Add the headers from config
          (fetchOptions.headers as Record<string, string>)[key] = value;
        }
      });
    }
    
    // Apply path transformations for remote URLs
    const transformedPath = applyPathTransformation(path, config, 'remote');
    logger.debug('Remote path after transformation', { 
      originalPath: path, 
      transformedPath 
    });
    
    // Check if authentication is required for this origin
    let finalUrl: string;
    
    // Set the base URL
    finalUrl = new URL(transformedPath, baseUrl).toString();
    
    // Check if remote auth is enabled specifically for this remote URL
    if (config.storage.remoteAuth?.enabled) {
      logger.debug('Remote auth enabled', {
        type: config.storage.remoteAuth.type,
        url: finalUrl
      });
      
      // Handle different auth types
      if (config.storage.remoteAuth.type === 'aws-s3') {
        // Check if we're using origin-auth
        if (config.storage.auth?.useOriginAuth) {
          // With origin-auth, we sign the headers and let Cloudflare pass them through
          // Create an AWS-compatible signer
          const accessKeyVar = config.storage.remoteAuth.accessKeyVar || 'AWS_ACCESS_KEY_ID';
          const secretKeyVar = config.storage.remoteAuth.secretKeyVar || 'AWS_SECRET_ACCESS_KEY';
          
          // Access environment variables
          const envRecord = env as unknown as Record<string, string | undefined>;
          
          const accessKey = envRecord[accessKeyVar];
          const secretKey = envRecord[secretKeyVar];
          
          if (accessKey && secretKey) {
            try {
              // Import AwsClient
              const { AwsClient } = await import('aws4fetch');
              
              // Setup AWS client
              const aws = new AwsClient({
                accessKeyId: accessKey,
                secretAccessKey: secretKey,
                service: config.storage.remoteAuth.service || 's3',
                region: config.storage.remoteAuth.region || 'us-east-1'
              });
              
              // Create a request to sign
              const signRequest = new Request(finalUrl, {
                method: 'GET'
              });
              
              // Sign the request
              const signedRequest = await aws.sign(signRequest);
              
              // Extract the headers and add them to fetch options
              signedRequest.headers.forEach((value, key) => {
                // Only include AWS specific headers
                if (key.startsWith('x-amz-') || key === 'authorization') {
                  if (fetchOptions.headers && typeof fetchOptions.headers === 'object') {
                    (fetchOptions.headers as Record<string, string>)[key] = value;
                  }
                }
              });
              
              logger.debug('Added AWS signed headers', {
                url: finalUrl,
                headerCount: Object.keys(fetchOptions.headers || {}).length
              });
            } catch (error) {
              logger.error('Error signing AWS request', {
                error: error instanceof Error ? error.message : String(error),
                url: finalUrl
              });
              
              // Continue without authentication if in permissive mode
              if (config.storage.auth?.securityLevel !== 'permissive') {
                return null;
              }
            }
          } else {
            logger.error('AWS credentials not found', {
              accessKeyVar,
              secretKeyVar
            });
            
            // Continue without authentication if in permissive mode
            if (config.storage.auth?.securityLevel !== 'permissive') {
              return null;
            }
          }
        } else {
          logger.warn('AWS S3 auth requires origin-auth to be enabled', {
            url: finalUrl
          });
        }
      } else if (config.storage.remoteAuth.type === 'bearer') {
        // TODO: Implement bearer token auth
        logger.warn('Bearer token auth not implemented yet');
      } else if (config.storage.remoteAuth.type === 'header') {
        // Add custom headers
        if (config.storage.remoteAuth.headers) {
          Object.entries(config.storage.remoteAuth.headers).forEach(([key, value]) => {
            if (fetchOptions.headers && typeof fetchOptions.headers === 'object') {
              (fetchOptions.headers as Record<string, string>)[key] = value;
            }
          });
        }
      } else if (config.storage.remoteAuth.type === 'query') {
        // TODO: Add signed URL query params
        logger.warn('Query auth not implemented yet');
      }
      
      // Set cache TTL for authenticated requests
      if (config.storage.auth?.cacheTtl) {
        if (fetchOptions.cf && typeof fetchOptions.cf === 'object') {
          (fetchOptions.cf as any).cacheTtl = config.storage.auth.cacheTtl;
        }
      }
    } else {
      logger.debug('Remote auth not enabled for this URL', {
        url: finalUrl
      });
    }
    
    // Fetch the image from the remote URL
    logger.debug('Fetching from remote URL', { url: finalUrl });
    const response = await fetch(finalUrl, fetchOptions);
    
    if (!response.ok) {
      logger.warn('Remote fetch failed', { 
        url: finalUrl, 
        status: response.status, 
        statusText: response.statusText 
      });
      return null;
    }
    
    // Clone the response to ensure we can access its body multiple times
    const clonedResponse = response.clone();
    
    return {
      response: clonedResponse,
      sourceType: 'remote',
      contentType: response.headers.get('Content-Type'),
      size: parseInt(response.headers.get('Content-Length') || '0', 10) || null,
      originalUrl: finalUrl,
      path: transformedPath
    };
  } catch (error) {
    logger.error('Error fetching from remote', { 
      error: error instanceof Error ? error.message : String(error),
      url: baseUrl,
      path
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
  env: Env
): Promise<StorageResult | null> {
  try {
    // Build fetch options from config
    const fetchOptions: RequestInit = {
      cf: {
        cacheTtl: config.cache.ttl.remoteFetch || 3600,
        cacheEverything: true,
      },
      headers: {
        'User-Agent': config.storage.fetchOptions?.userAgent || 'Cloudflare-Image-Resizer/1.0',
      },
    };
    
    // Add any additional headers from config
    if (config.storage.fetchOptions?.headers) {
      Object.entries(config.storage.fetchOptions.headers).forEach(([key, value]) => {
        if (fetchOptions.headers && typeof fetchOptions.headers === 'object') {
          // Add the headers from config
          (fetchOptions.headers as Record<string, string>)[key] = value;
        }
      });
    }
    
    // Apply path transformations for fallback URLs
    const transformedPath = applyPathTransformation(path, config, 'fallback');
    logger.debug('Fallback path after transformation', { 
      originalPath: path, 
      transformedPath 
    });
    
    // Check if authentication is required for this origin
    let finalUrl: string;
    
    // Set the base URL
    finalUrl = new URL(transformedPath, fallbackUrl).toString();
    
    // Check if fallback auth is enabled specifically for this URL
    if (config.storage.fallbackAuth?.enabled) {
      logger.debug('Fallback auth enabled', {
        type: config.storage.fallbackAuth.type,
        url: finalUrl
      });
      
      // Handle different auth types
      if (config.storage.fallbackAuth.type === 'aws-s3') {
        // Check if we're using origin-auth
        if (config.storage.auth?.useOriginAuth) {
          // With origin-auth, we sign the headers and let Cloudflare pass them through
          // Create an AWS-compatible signer
          const accessKeyVar = config.storage.fallbackAuth.accessKeyVar || 'AWS_ACCESS_KEY_ID';
          const secretKeyVar = config.storage.fallbackAuth.secretKeyVar || 'AWS_SECRET_ACCESS_KEY';
          
          // Access environment variables
          const envRecord = env as unknown as Record<string, string | undefined>;
          
          const accessKey = envRecord[accessKeyVar];
          const secretKey = envRecord[secretKeyVar];
          
          if (accessKey && secretKey) {
            try {
              // Import AwsClient
              const { AwsClient } = await import('aws4fetch');
              
              // Setup AWS client
              const aws = new AwsClient({
                accessKeyId: accessKey,
                secretAccessKey: secretKey,
                service: config.storage.fallbackAuth.service || 's3',
                region: config.storage.fallbackAuth.region || 'us-east-1'
              });
              
              // Create a request to sign
              const signRequest = new Request(finalUrl, {
                method: 'GET'
              });
              
              // Sign the request
              const signedRequest = await aws.sign(signRequest);
              
              // Extract the headers and add them to fetch options
              signedRequest.headers.forEach((value, key) => {
                // Only include AWS specific headers
                if (key.startsWith('x-amz-') || key === 'authorization') {
                  if (fetchOptions.headers && typeof fetchOptions.headers === 'object') {
                    (fetchOptions.headers as Record<string, string>)[key] = value;
                  }
                }
              });
              
              logger.debug('Added AWS signed headers', {
                url: finalUrl,
                headerCount: Object.keys(fetchOptions.headers || {}).length
              });
            } catch (error) {
              logger.error('Error signing AWS request', {
                error: error instanceof Error ? error.message : String(error),
                url: finalUrl
              });
              
              // Continue without authentication if in permissive mode
              if (config.storage.auth?.securityLevel !== 'permissive') {
                return null;
              }
            }
          } else {
            logger.error('AWS credentials not found', {
              accessKeyVar,
              secretKeyVar
            });
            
            // Continue without authentication if in permissive mode
            if (config.storage.auth?.securityLevel !== 'permissive') {
              return null;
            }
          }
        } else {
          logger.warn('AWS S3 auth requires origin-auth to be enabled', {
            url: finalUrl
          });
        }
      } else if (config.storage.fallbackAuth.type === 'bearer') {
        // TODO: Implement bearer token auth
        logger.warn('Bearer token auth not implemented yet');
      } else if (config.storage.fallbackAuth.type === 'header') {
        // Add custom headers
        if (config.storage.fallbackAuth.headers) {
          Object.entries(config.storage.fallbackAuth.headers).forEach(([key, value]) => {
            if (fetchOptions.headers && typeof fetchOptions.headers === 'object') {
              (fetchOptions.headers as Record<string, string>)[key] = value;
            }
          });
        }
      } else if (config.storage.fallbackAuth.type === 'query') {
        // TODO: Add signed URL query params
        logger.warn('Query auth not implemented yet');
      }
      
      // Set cache TTL for authenticated requests
      if (config.storage.auth?.cacheTtl) {
        if (fetchOptions.cf && typeof fetchOptions.cf === 'object') {
          (fetchOptions.cf as any).cacheTtl = config.storage.auth.cacheTtl;
        }
      }
    } else {
      logger.debug('Fallback auth not enabled for this URL', {
        url: finalUrl
      });
    }
    
    // Fetch the image from the fallback URL
    logger.debug('Fetching from fallback URL', { url: finalUrl });
    const response = await fetch(finalUrl, fetchOptions);
    
    if (!response.ok) {
      logger.warn('Fallback fetch failed', { 
        url: finalUrl, 
        status: response.status, 
        statusText: response.statusText 
      });
      return null;
    }
    
    // Clone the response to ensure we can access its body multiple times
    const clonedResponse = response.clone();
    
    return {
      response: clonedResponse,
      sourceType: 'fallback',
      contentType: response.headers.get('Content-Type'),
      size: parseInt(response.headers.get('Content-Length') || '0', 10) || null,
      originalUrl: finalUrl,
      path: transformedPath
    };
  } catch (error) {
    logger.error('Error fetching from fallback', { 
      error: error instanceof Error ? error.message : String(error),
      url: fallbackUrl,
      path
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
  request?: Request
): Promise<StorageResult> {
  logger.breadcrumb('Starting image fetch', undefined, {
    path,
    hasRequest: !!request,
    storageOptions: config.storage.priority
  });
  
  // First, check the request type to determine if this is a Cloudflare Image Resizing subrequest
  const via = request?.headers.get('via') || '';
  const isImageResizingSubrequest = via.includes('image-resizing');
  
  // Log the request type for debugging
  logger.debug('Image fetch request analysis', { 
    path, 
    isImageResizingSubrequest,
    via
  });
  
  // Special handling for Image Resizing subrequests
  // These come from Cloudflare's infrastructure when using cf.image properties
  if (isImageResizingSubrequest) {
    logger.breadcrumb('Detected image-resizing subrequest', undefined, { path });
    
    // First, determine if R2 should be used based on storage priority
    const shouldUseR2 = config.storage.priority.includes('r2') && 
                       config.storage.r2.enabled && 
                       env.IMAGES_BUCKET;
                       
    // Use simpler debugging approach to avoid TypeScript errors
    logger.debug('Subrequest storage evaluation', {
      path: path,
      storageOrder: config.storage.priority.join(','),
      r2Available: config.storage.r2.enabled && !!env.IMAGES_BUCKET ? true : false,
      shouldUseR2: shouldUseR2 ? true : false
    });
    
    // Check if R2 is available, enabled, and in the priority list
    if (shouldUseR2) {
      logger.debug('Using R2 for image-resizing subrequest', { path });
      const bucket = env.IMAGES_BUCKET;
      const fetchStart = Date.now();
      
      // Apply path transformations for R2 storage
      const r2Key = applyPathTransformation(path, config, 'r2');
      
      logger.debug('Image key for subrequest', { 
        originalPath: path,
        transformedKey: r2Key,
        url: request?.url
      });
      
      // Try to get the object from R2
      try {
        // Make sure bucket is defined before using it
        if (!bucket) {
          logger.error('R2 bucket is undefined', { path: r2Key });
          throw new Error('R2 bucket is undefined');
        }
        
        const result = await fetchFromR2(r2Key, bucket, request, config);
        const fetchEnd = Date.now();
        
        if (result) {
          logger.debug('Found image in R2 bucket for subrequest', { r2Key });
          logger.breadcrumb('R2 fetch successful for image-resizing subrequest', fetchEnd - fetchStart, {
            contentType: result.contentType,
            size: result.size,
            key: r2Key
          });
          return result;
        }
        
        // If the image is not found with transformed path, try the simple normalized path as fallback
        const normalizedPath = path.startsWith('/') ? path.substring(1) : path;
        if (r2Key !== normalizedPath) {
          logger.debug('Image not found with transformed key, trying normalized path', { 
            r2Key, 
            normalizedPath 
          });
          
          // Make sure bucket is defined before using it
          if (!bucket) {
            logger.error('R2 bucket is undefined', { path: normalizedPath });
            throw new Error('R2 bucket is undefined');
          }
          
          const fallbackResult = await fetchFromR2(normalizedPath, bucket, request, config);
          if (fallbackResult) {
            logger.debug('Found image in R2 bucket using normalized path', { normalizedPath });
            logger.breadcrumb('R2 fallback fetch successful', Date.now() - fetchStart, {
              contentType: fallbackResult.contentType,
              size: fallbackResult.size,
              key: normalizedPath
            });
            return fallbackResult;
          }
        }
        
        logger.breadcrumb('Image not found in R2 for subrequest', fetchEnd - fetchStart, {
          paths: r2Key !== normalizedPath ? `${r2Key}, ${normalizedPath}` : r2Key
        });
      } catch (error) {
        logger.error('Error in R2 fetch for subrequest', {
          error: error instanceof Error ? error.message : String(error),
          path: r2Key
        });
      }
    } else {
      logger.debug('R2 not available for image-resizing subrequest', { 
        r2Enabled: config.storage.r2.enabled,
        hasBucket: !!env.IMAGES_BUCKET
      });
    }
  }

  // Determine available storage options
  const availableStorage = [...config.storage.priority];
  logger.debug('Trying storage options in priority order', { 
    storageOrder: availableStorage,
    r2Enabled: config.storage.r2.enabled && !!env.IMAGES_BUCKET,
    remoteUrlSet: !!config.storage.remoteUrl,
    fallbackUrlSet: !!config.storage.fallbackUrl
  });
  logger.breadcrumb('Trying storage options in priority order', undefined, { 
    storageOrder: availableStorage.join(','),
    r2Enabled: config.storage.r2.enabled && !!env.IMAGES_BUCKET ? 'yes' : 'no',
    remoteUrl: config.storage.remoteUrl ? 'configured' : 'not configured',
    fallbackUrl: config.storage.fallbackUrl ? 'configured' : 'not configured'
  });
  
  // Try each storage option in order of priority
  for (const storageType of availableStorage) {
    let result: StorageResult | null = null;
    
    // Try to fetch from R2
    if (storageType === 'r2' && config.storage.r2.enabled && env.IMAGES_BUCKET) {
      logger.debug('Trying R2 storage', { path });
      logger.breadcrumb('Attempting R2 storage fetch', undefined, { path });
      
      // Apply path transformations for R2
      const transformedPath = applyPathTransformation(path, config, 'r2');
      logger.debug('R2 path after transformation', { originalPath: path, transformedPath });
      
      const bucket = env.IMAGES_BUCKET;
      const fetchStart = Date.now();
      // Make sure bucket is defined before using it
      if (!bucket) {
        logger.error('R2 bucket is undefined', { path: transformedPath });
        throw new Error('R2 bucket is undefined');
      }
      result = await fetchFromR2(transformedPath, bucket, request, config);
      const fetchEnd = Date.now();
      
      if (result) {
        logger.breadcrumb('R2 fetch successful', fetchEnd - fetchStart, {
          size: result.size,
          contentType: result.contentType
        });
      } else {
        logger.breadcrumb('R2 fetch failed', fetchEnd - fetchStart);
      }
    }
    
    // Try to fetch from remote URL
    if (storageType === 'remote' && config.storage.remoteUrl) {
      logger.debug('Trying remote URL', { path, remoteUrl: config.storage.remoteUrl });
      logger.breadcrumb('Attempting remote URL fetch', undefined, { 
        path, 
        baseUrl: new URL(config.storage.remoteUrl).hostname 
      });
      
      // Apply path transformations for remote
      const transformedPath = applyPathTransformation(path, config, 'remote');
      logger.debug('Remote path after transformation', { originalPath: path, transformedPath });
      
      const fetchStart = Date.now();
      result = await fetchFromRemote(transformedPath, config.storage.remoteUrl, config, env);
      const fetchEnd = Date.now();
      
      if (result) {
        logger.breadcrumb('Remote fetch successful', fetchEnd - fetchStart, {
          size: result.size,
          contentType: result.contentType
        });
      } else {
        logger.breadcrumb('Remote fetch failed', fetchEnd - fetchStart);
      }
    }
    
    // Try to fetch from fallback URL
    if (storageType === 'fallback' && config.storage.fallbackUrl) {
      logger.debug('Trying fallback URL', { path, fallbackUrl: config.storage.fallbackUrl });
      logger.breadcrumb('Attempting fallback URL fetch', undefined, { 
        path, 
        baseUrl: new URL(config.storage.fallbackUrl).hostname 
      });
      
      // Apply path transformations for fallback
      const transformedPath = applyPathTransformation(path, config, 'fallback');
      logger.debug('Fallback path after transformation', { originalPath: path, transformedPath });
      
      const fetchStart = Date.now();
      result = await fetchFromFallback(transformedPath, config.storage.fallbackUrl, config, env);
      const fetchEnd = Date.now();
      
      if (result) {
        logger.breadcrumb('Fallback fetch successful', fetchEnd - fetchStart, {
          size: result.size,
          contentType: result.contentType
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
        size: result.size 
      });
      logger.breadcrumb('Image found in storage', undefined, {
        sourceType: result.sourceType,
        contentType: result.contentType,
        size: result.size
      });
      return result;
    }
  }
  
  // If we couldn't find the image anywhere, return an error
  logger.warn('Image not found in any storage location', { path });
  logger.breadcrumb('Image not found in any storage location', undefined, { 
    path,
    triedStorageTypes: availableStorage.join(',')
  });
  
  return {
    response: new Response('Image not found', { status: 404 }),
    sourceType: 'error',
    contentType: null,
    size: null,
    error: new Error('Image not found in any storage location'),
    path: path
  };
}