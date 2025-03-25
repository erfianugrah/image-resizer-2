/**
 * Optimized Storage Service
 * 
 * Implements parallel storage operations for improved performance.
 * This service fetches from multiple storage sources simultaneously.
 */

import { Env } from '../types';
import { ImageResizerConfig } from '../config';
import { Logger } from '../utils/logging';
import { OptimizedLogger } from '../utils/optimized-logging';
import { StorageResult, StorageService, ConfigurationService } from './interfaces';
import { 
  StorageServiceError, 
  StorageNotFoundError, 
  AllStorageSourcesFailedError,
  StorageTimeoutError
} from '../errors/storageErrors';
import { PerformanceBaseline } from '../utils/performance-metrics';

/**
 * Storage operation result with additional metadata
 */
interface StorageOperationResult {
  result: StorageResult | null;
  source: 'r2' | 'remote' | 'fallback';
  error?: Error;
}

/**
 * Optimized implementation of the StorageService interface
 * with parallel fetch operations.
 */
export class OptimizedStorageService implements StorageService {
  private isOptimizedLogger: boolean;
  private performanceBaseline: PerformanceBaseline;
  protected logger: Logger | OptimizedLogger;
  private configService: ConfigurationService;
  
  /**
   * Create a new OptimizedStorageService
   * 
   * @param logger Logger instance
   * @param configService Configuration service
   */
  constructor(logger: Logger | OptimizedLogger, configService: ConfigurationService) {
    this.logger = logger;
    this.configService = configService;
    this.isOptimizedLogger = !!(logger as OptimizedLogger).isLevelEnabled;
    this.performanceBaseline = PerformanceBaseline.getInstance(logger);
  }
  
  /**
   * Fetch an image from storage using parallel operations
   * 
   * This implementation fetches from multiple storage sources simultaneously
   * and returns the first successful result.
   * 
   * @param imagePath The path to the image
   * @param config The application configuration
   * @param env The environment variables
   * @param request The original request
   * @returns The storage result
   */
  async fetchImage(
    imagePath: string, 
    config: ImageResizerConfig, 
    env: Env, 
    request: Request
  ): Promise<StorageResult> {
    // Create a performance timer for this operation
    const startTime = Date.now();
    
    try {
      if (this.isOptimizedLogger && (this.logger as OptimizedLogger).isLevelEnabled('DEBUG')) {
        this.logger.debug('Fetching image using parallel storage operations', { 
          imagePath,
          storagePriority: config.storage.priority.join(','),
          r2Enabled: config.storage.r2?.enabled,
          hasRemoteUrl: !!config.storage.remoteUrl,
          hasFallbackUrl: !!config.storage.fallbackUrl
        });
      } else if (!this.isOptimizedLogger) {
        this.logger.debug('Fetching image using parallel storage operations', { 
          imagePath,
          storagePriority: config.storage.priority.join(','),
          r2Enabled: config.storage.r2?.enabled,
          hasRemoteUrl: !!config.storage.remoteUrl,
          hasFallbackUrl: !!config.storage.fallbackUrl
        });
      }
      
      // Get effective storage priority based on circuit breaker and recent failures
      const effectivePriority = this.getEffectiveStoragePriority(config);
      
      // If no valid storage sources, throw an error
      if (effectivePriority.length === 0) {
        throw new AllStorageSourcesFailedError(
          `No valid storage sources available for: ${imagePath}`,
          {
            imagePath,
            triedSources: [],
            errors: {}
          }
        );
      }
      
      // Create fetch promises for each storage source
      const fetchPromises: Promise<StorageOperationResult>[] = effectivePriority.map(source => {
        return this.createStorageFetchPromise(source, imagePath, config, env, request);
      });
      
      // If we only have one source, just use it directly
      if (fetchPromises.length === 1) {
        const result = await fetchPromises[0];
        
        // If there was an error, throw it
        if (result.error) {
          throw result.error;
        }
        
        // If no result was found, throw a not found error
        if (!result.result) {
          throw new StorageNotFoundError(`Image not found in any storage source: ${imagePath}`, {
            imagePath
          });
        }
        
        // Record performance metrics
        const duration = Date.now() - startTime;
        this.performanceBaseline.record('storage', 'fetchImage', duration, {
          source: result.source,
          parallel: false,
          imagePath
        });
        
        return result.result;
      }
      
      // Use Promise.any to get the first successful result
      try {
        // Await the first successful fetch
        const result = await Promise.any(fetchPromises);
        
        // If no result was found, but no error was thrown, throw a not found error
        if (!result.result) {
          throw new StorageNotFoundError(`Image not found in any storage source: ${imagePath}`, {
            imagePath
          });
        }
        
        // Log success
        if (this.isOptimizedLogger && (this.logger as OptimizedLogger).isLevelEnabled('DEBUG')) {
          this.logger.debug(`Successfully fetched image from ${result.source} using parallel operations`, {
            imagePath,
            contentType: result.result.contentType,
            size: result.result.size,
            status: result.result.response.status
          });
        } else if (!this.isOptimizedLogger) {
          this.logger.debug(`Successfully fetched image from ${result.source} using parallel operations`, {
            imagePath,
            contentType: result.result.contentType,
            size: result.result.size,
            status: result.result.response.status
          });
        }
        
        // Record performance metrics
        const duration = Date.now() - startTime;
        this.performanceBaseline.record('storage', 'fetchImage', duration, {
          source: result.source,
          parallel: true,
          imagePath
        });
        
        return result.result;
      } catch (aggregateError) {
        // All promises were rejected
        // Extract the individual errors
        const errors: Record<string, string> = {};
        
        // Fetch all results to check errors
        const results = await Promise.allSettled(fetchPromises);
        
        results.forEach((result, index) => {
          const source = effectivePriority[index];
          
          if (result.status === 'rejected') {
            errors[source] = result.reason instanceof Error ? result.reason.message : String(result.reason);
          } else if (result.value.error) {
            errors[source] = result.value.error.message;
          }
        });
        
        // Throw a comprehensive error
        throw new AllStorageSourcesFailedError(
          `Failed to fetch image from any storage source: ${imagePath}`,
          {
            imagePath,
            triedSources: effectivePriority,
            errors
          }
        );
      }
    } catch (error) {
      // Record error metrics
      const duration = Date.now() - startTime;
      this.performanceBaseline.record('storage', 'fetchImageError', duration, {
        imagePath,
        error: error instanceof Error ? error.message : String(error)
      });
      
      // If it's already a StorageServiceError, re-throw it
      if (error instanceof StorageServiceError) {
        throw error;
      }
      
      // Otherwise, wrap it in a StorageServiceError
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new StorageServiceError(`Failed to fetch image: ${errorMessage}`, {
        code: 'STORAGE_FETCH_ERROR',
        status: 500,
        details: {
          originalError: errorMessage,
          imagePath
        },
        retryable: true
      });
    }
  }
  
  /**
   * Create a promise for fetching from a specific storage source with timeout
   * 
   * @param source The storage source to fetch from
   * @param imagePath The path to the image
   * @param config The application configuration
   * @param env The environment variables
   * @param request The original request
   * @returns Promise that resolves to a storage operation result
   */
  private createStorageFetchPromise(
    source: 'r2' | 'remote' | 'fallback',
    imagePath: string,
    config: ImageResizerConfig,
    env: Env,
    request: Request
  ): Promise<StorageOperationResult> {
    // Set timeout based on configuration
    const timeout = config.performance?.timeoutMs || 5000;
    
    // Create the fetch operation based on source
    const fetchPromise = this.createFetchPromiseForSource(source, imagePath, config, env, request);
    
    // Create a promise that either resolves with the result or rejects with a timeout error
    return Promise.race([
      // The actual fetch operation
      fetchPromise.then(result => ({
        result,
        source,
        error: result ? undefined : new StorageNotFoundError(`Image not found in ${source}: ${imagePath}`, { imagePath })
      })).catch(error => ({
        result: null,
        source,
        error
      })),
      
      // Timeout promise
      new Promise<StorageOperationResult>((_, reject) => {
        setTimeout(() => {
          const error = new StorageTimeoutError(`Timeout fetching from ${source}: ${imagePath}`, {
            imagePath,
            source,
            timeout
          });
          
          // Log the timeout
          if (this.isOptimizedLogger && (this.logger as OptimizedLogger).isLevelEnabled('WARN')) {
            this.logger.warn(`Storage operation timed out after ${timeout}ms`, {
              source,
              imagePath,
              timeout
            });
          } else if (!this.isOptimizedLogger) {
            this.logger.warn(`Storage operation timed out after ${timeout}ms`, {
              source,
              imagePath,
              timeout
            });
          }
          
          reject(error);
        }, timeout);
      })
    ]);
  }
  
  /**
   * Create fetch promise for a specific storage source
   */
  private async createFetchPromiseForSource(
    source: 'r2' | 'remote' | 'fallback',
    imagePath: string,
    config: ImageResizerConfig,
    env: Env,
    request: Request
  ): Promise<StorageResult | null> {
    try {
      // Different implementations for each source type
      if (source === 'r2') {
        return await this.fetchFromR2(imagePath, config, env, request);
      } else if (source === 'remote') {
        return await this.fetchFromRemote(imagePath, config, env, request);
      } else {
        return await this.fetchFromFallback(imagePath, config, env, request);
      }
    } catch (error) {
      // Log the error
      this.logger.warn(`Error fetching from ${source}`, {
        error: error instanceof Error ? error.message : String(error),
        imagePath
      });
      
      // Rethrow to be handled by the caller
      throw error;
    }
  }
  
  /**
   * Fetch from R2 storage
   */
  private async fetchFromR2(
    imagePath: string,
    config: ImageResizerConfig,
    env: Env,
    request: Request
  ): Promise<StorageResult | null> {
    // Skip if R2 is not enabled or no bucket is available
    if (!config.storage.r2?.enabled || !env.IMAGES_BUCKET) {
      return null;
    }
    
    try {
      // Apply path transformations for R2
      const transformedPath = this.applyPathTransformation(imagePath, config, 'r2');
      
      this.logger.debug('Parallel R2 fetch', { originalPath: imagePath, transformedPath });
      
      const bucket = env.IMAGES_BUCKET;
      if (!bucket) {
        this.logger.error('R2 bucket is undefined', { path: transformedPath });
        throw new Error('R2 bucket is undefined');
      }
      
      // Get object from R2
      const object = await bucket.get(transformedPath);
      
      if (!object) {
        return null;
      }
      
      // Create headers
      const headers = new Headers();
      object.writeHttpMetadata(headers);
      
      // Add cache headers
      headers.set('Cache-Control', `public, max-age=${config.cache.ttl.r2Headers || 86400}`);
      headers.set('Accept-Ranges', 'bytes');
      
      // Return the result
      return {
        response: new Response(object.body, { headers }),
        sourceType: 'r2',
        contentType: object.httpMetadata?.contentType || 'application/octet-stream',
        size: object.size,
        path: transformedPath
      };
    } catch (error) {
      this.logger.error('Error fetching from R2', {
        error: error instanceof Error ? error.message : String(error),
        path: imagePath
      });
      throw error;
    }
  }
  
  /**
   * Fetch from remote storage
   */
  private async fetchFromRemote(
    imagePath: string,
    config: ImageResizerConfig,
    env: Env,
    request: Request
  ): Promise<StorageResult | null> {
    // Skip if remote URL is not configured
    if (!config.storage.remoteUrl) {
      return null;
    }
    
    try {
      // Apply path transformations for remote
      const transformedPath = this.applyPathTransformation(imagePath, config, 'remote');
      
      this.logger.debug('Parallel remote fetch', { originalPath: imagePath, transformedPath });
      
      // Create fetch options
      const fetchOptions: RequestInit = {
        cf: {
          cacheTtl: config.cache.ttl.remoteFetch || 3600,
          cacheEverything: true,
        },
        headers: {
          'User-Agent': config.storage.fetchOptions?.userAgent || 'Cloudflare-Image-Resizer/1.0',
        },
      };
      
      // Build the URL
      const finalUrl = new URL(transformedPath, config.storage.remoteUrl).toString();
      
      // Fetch from the remote URL
      const response = await fetch(finalUrl, fetchOptions);
      
      if (!response.ok) {
        return null;
      }
      
      return {
        response: response.clone(),
        sourceType: 'remote',
        contentType: response.headers.get('Content-Type') || 'application/octet-stream',
        size: parseInt(response.headers.get('Content-Length') || '0', 10) || 0,
        originalUrl: finalUrl,
        path: transformedPath
      };
    } catch (error) {
      this.logger.error('Error fetching from remote', {
        error: error instanceof Error ? error.message : String(error),
        path: imagePath
      });
      throw error;
    }
  }
  
  /**
   * Fetch from fallback storage
   */
  private async fetchFromFallback(
    imagePath: string,
    config: ImageResizerConfig,
    env: Env,
    request: Request
  ): Promise<StorageResult | null> {
    // Skip if fallback URL is not configured
    if (!config.storage.fallbackUrl) {
      return null;
    }
    
    try {
      // Apply path transformations for fallback
      const transformedPath = this.applyPathTransformation(imagePath, config, 'fallback');
      
      this.logger.debug('Parallel fallback fetch', { originalPath: imagePath, transformedPath });
      
      // Create fetch options
      const fetchOptions: RequestInit = {
        cf: {
          cacheTtl: config.cache.ttl.remoteFetch || 3600,
          cacheEverything: true,
        },
        headers: {
          'User-Agent': config.storage.fetchOptions?.userAgent || 'Cloudflare-Image-Resizer/1.0',
        },
      };
      
      // Build the URL
      const finalUrl = new URL(transformedPath, config.storage.fallbackUrl).toString();
      
      // Fetch from the fallback URL
      const response = await fetch(finalUrl, fetchOptions);
      
      if (!response.ok) {
        return null;
      }
      
      return {
        response: response.clone(),
        sourceType: 'fallback',
        contentType: response.headers.get('Content-Type') || 'application/octet-stream',
        size: parseInt(response.headers.get('Content-Length') || '0', 10) || 0,
        originalUrl: finalUrl,
        path: transformedPath
      };
    } catch (error) {
      this.logger.error('Error fetching from fallback', {
        error: error instanceof Error ? error.message : String(error),
        path: imagePath
      });
      throw error;
    }
  }
  
  /**
   * Apply path transformations for any origin type
   * This helper function is used to transform paths based on origin type
   */
  private applyPathTransformation(
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
          
          this.logger.debug(`Applied path transformation for ${originType}`, {
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
   * Get the effective storage priority based on config and status
   */
  private getEffectiveStoragePriority(config: ImageResizerConfig): ('r2' | 'remote' | 'fallback')[] {
    // Start with the configured priority
    const configuredPriority = [...config.storage.priority];
    
    // Filter out sources that aren't properly configured
    return configuredPriority.filter(source => {
      if (source === 'r2' && (!config.storage.r2?.enabled || !config.storage.r2?.bindingName)) {
        return false;
      }
      if (source === 'remote' && !config.storage.remoteUrl) {
        return false;
      }
      if (source === 'fallback' && !config.storage.fallbackUrl) {
        return false;
      }
      
      // Include the source in the effective priority
      return true;
    });
  }
}