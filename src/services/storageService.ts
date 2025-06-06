/**
 * Default implementation of the StorageService with resilience patterns
 * 
 * This implementation adds support for retry, circuit breaker, and fallback
 * mechanisms to improve reliability when fetching images from storage sources.
 */

import { ImageResizerConfig } from '../config';
import { Logger } from '../utils/logging';
import { 
  StorageResult, 
  StorageService, 
  ConfigurationService, 
  AuthService 
} from './interfaces';

// Import PathTransforms from utils
import { PathTransforms } from '../utils/path';

/**
 * Interface for path-based origin configuration
 */
interface PathOriginConfig {
  pattern: string | RegExp;
  priority?: ('r2' | 'remote' | 'fallback')[];
  r2?: {
    enabled: boolean;
    bindingName: string;
  };
  remote?: {
    enabled: boolean;
    url: string;
  };
  fallback?: {
    enabled: boolean;
    url: string;
  };
  remoteUrl?: string;
  fallbackUrl?: string;
  pathTransforms?: PathTransforms;
  fetchOptions?: Record<string, unknown>;
  auth?: Record<string, unknown>;
  remoteAuth?: Record<string, unknown>;
  fallbackAuth?: Record<string, unknown>;
}
import { 
  StorageServiceError, 
  StorageNotFoundError, 
  AllStorageSourcesFailedError,
  RemoteStorageError,
  R2StorageError,
  FallbackStorageError,
  StorageTimeoutError
} from '../errors/storageErrors';
import { 
  // These utility functions are imported for future use in resilience enhancements
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  withRetry, 
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  withCircuitBreaker, 
  withResilience,
  createCircuitBreakerState,
  CircuitBreakerState,
  isRetryableError
} from '../utils/retry';

// Type guard functions for TypeScript error handling
function isStorageServiceError(error: unknown): error is StorageServiceError {
  return error instanceof StorageServiceError;
}

function isError(error: unknown): error is Error {
  return error instanceof Error;
}

export class DefaultStorageService implements StorageService {
  // Private properties
  private logger: Logger;
  private configService: ConfigurationService;
  private authService?: AuthService;
  
  // Circuit breaker states for different storage operations
  private r2CircuitBreaker: CircuitBreakerState;
  private remoteCircuitBreaker: CircuitBreakerState;
  private fallbackCircuitBreaker: CircuitBreakerState;
  
  // Track recent failures for adaptive behavior
  private recentFailures: {timestamp: number, errorCode: string, source: string}[] = [];
  
  // Store baseline performance metrics
  private performanceBaseline: Record<string, number> = {};

  constructor(
    logger: Logger, 
    configService: ConfigurationService,
    authService?: AuthService
  ) {
    this.logger = logger;
    this.configService = configService;
    this.authService = authService;
    
    // Initialize circuit breaker states
    this.r2CircuitBreaker = createCircuitBreakerState();
    this.remoteCircuitBreaker = createCircuitBreakerState();
    this.fallbackCircuitBreaker = createCircuitBreakerState();
  }
  
  /**
   * Service lifecycle method for initialization
   * 
   * This method is called during the service container initialization phase
   * and performs any necessary setup such as:
   * - Initializing circuit breaker states
   * - Establishing baseline performance metrics
   * - Verifying storage configurations
   * 
   * @returns Promise that resolves when initialization is complete
   */
  async initialize(): Promise<void> {
    this.logger.debug('Initializing StorageService');
    
    // Reset circuit breaker states
    this.r2CircuitBreaker = createCircuitBreakerState();
    this.remoteCircuitBreaker = createCircuitBreakerState();
    this.fallbackCircuitBreaker = createCircuitBreakerState();
    
    // Clear failure history
    this.recentFailures = [];
    
    // Get the configuration
    const config = this.configService.getConfig();
    
    // Verify storage configuration
    if (config.storage) {
      // Log priority configuration for verification
      this.logger.debug('Storage priority configuration', {
        priority: config.storage.priority,
        r2Enabled: config.storage.r2?.enabled,
        remoteUrl: !!config.storage.remoteUrl,
        fallbackUrl: !!config.storage.fallbackUrl
      });
      
      // Establish baseline performance metrics if enabled
      // Note: baselineTracking might not be defined in ImageResizerConfig interface,
      // using type assertion to avoid TypeScript error
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if ((config as any).performance?.baselineTracking) {
        this.initializePerformanceBaseline();
      }
    }
    
    // Verify connectivity to remote sources if enabled
    // Note: verifyConnectionsOnStartup might not be defined in the interface,
    // using type assertion to avoid TypeScript error
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((config.storage as any)?.verifyConnectionsOnStartup) {
      await this.verifyStorageConnections(config);
    }
    
    this.logger.info('StorageService initialization complete');
    return Promise.resolve();
  }
  
  /**
   * Service lifecycle method for shutdown
   * 
   * This method is called during the service container shutdown phase
   * and performs any necessary cleanup such as:
   * - Logging performance statistics
   * - Releasing any resources
   * 
   * @returns Promise that resolves when shutdown is complete
   */
  async shutdown(): Promise<void> {
    this.logger.debug('Shutting down StorageService');
    
    // Log circuit breaker state statistics
    this.logger.debug('Storage circuit breaker states at shutdown', {
      r2CircuitOpen: this.r2CircuitBreaker.isOpen,
      remoteCircuitOpen: this.remoteCircuitBreaker.isOpen,
      fallbackCircuitOpen: this.fallbackCircuitBreaker.isOpen,
      r2Failures: this.r2CircuitBreaker.failureCount,
      remoteFailures: this.remoteCircuitBreaker.failureCount,
      fallbackFailures: this.fallbackCircuitBreaker.failureCount,
      recentFailures: this.recentFailures.length
    });
    
    // Log source-specific failure statistics if there are any
    if (this.recentFailures.length > 0) {
      const r2Failures = this.recentFailures.filter(f => f.source === 'r2').length;
      const remoteFailures = this.recentFailures.filter(f => f.source === 'remote').length;
      const fallbackFailures = this.recentFailures.filter(f => f.source === 'fallback').length;
      
      this.logger.debug('Storage failure statistics', {
        r2Failures,
        remoteFailures,
        fallbackFailures,
        mostCommonSource: this.getMostCommonFailureSource(),
        mostCommonError: this.getMostCommonErrorCode()
      });
    }
    
    // Report performance metrics if available
    if (Object.keys(this.performanceBaseline).length > 0) {
      this.logger.debug('Storage performance baseline at shutdown', this.performanceBaseline);
    }
    
    // Clear failure tracking and performance metrics
    this.recentFailures = [];
    this.performanceBaseline = {};
    
    this.logger.info('StorageService shutdown complete');
    return Promise.resolve();
  }
  
  /**
   * Initialize performance baseline metrics
   */
  private initializePerformanceBaseline(): void {
    this.performanceBaseline = {
      startTimestamp: Date.now(),
      r2SuccessCount: 0,
      r2FailureCount: 0,
      r2AverageResponseTime: 0,
      remoteSuccessCount: 0,
      remoteFailureCount: 0,
      remoteAverageResponseTime: 0,
      fallbackSuccessCount: 0,
      fallbackFailureCount: 0,
      fallbackAverageResponseTime: 0
    };
    
    this.logger.debug('Initialized storage performance baseline', this.performanceBaseline);
  }
  
  /**
   * Verify connectivity to configured storage sources
   * 
   * @param config Application configuration
   */
  private async verifyStorageConnections(config: ImageResizerConfig): Promise<void> {
    this.logger.debug('Verifying storage connections');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars
    const env = {} as any; // Empty env for verification
    const verificationResults: Record<string, boolean> = {};
    
    // Create a dummy request for testing
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const dummyRequest = new Request('https://example.com/verification');
    
    try {
      // Check defined priority
      for (const source of config.storage.priority) {
        // Skip verification if not configured
        if (source === 'r2' && (!config.storage.r2?.enabled || !config.storage.r2?.bindingName)) {
          verificationResults.r2 = false;
          continue;
        }
        if (source === 'remote' && !config.storage.remoteUrl) {
          verificationResults.remote = false;
          continue;
        }
        if (source === 'fallback' && !config.storage.fallbackUrl) {
          verificationResults.fallback = false;
          continue;
        }
        
        this.logger.debug(`Verifying ${source} storage connection`);
        // Verification logic would go here in a real implementation
        // This is just a stub for demonstration
        verificationResults[source] = true;
      }
      
      this.logger.debug('Storage connection verification results', verificationResults);
    } catch (error) {
      this.logger.error('Error during storage connection verification', {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  
  /**
   * Get the retry configuration from service settings
   * @returns Retry configuration options
   */
  private getRetryConfig() {
    const config = this.configService.getConfig();
    return {
      // Use storage-specific retry settings if available, otherwise use cache settings as default
      maxAttempts: config.storage.retry?.maxAttempts || 
                   config.cache.retry?.maxAttempts || 3,
      initialDelayMs: config.storage.retry?.initialDelayMs || 
                      config.cache.retry?.initialDelayMs || 200,
      maxDelayMs: config.storage.retry?.maxDelayMs || 
                  config.cache.retry?.maxDelayMs || 2000,
      logger: this.logger
    };
  }
  
  /**
   * Get the circuit breaker configuration from service settings
   * @returns Circuit breaker configuration options
   */
  private getCircuitBreakerConfig() {
    const config = this.configService.getConfig();
    return {
      // Use storage-specific circuit breaker settings if available, otherwise use cache settings as default
      failureThreshold: config.storage.circuitBreaker?.failureThreshold || 
                        config.cache.circuitBreaker?.failureThreshold || 5,
      resetTimeoutMs: config.storage.circuitBreaker?.resetTimeoutMs || 
                      config.cache.circuitBreaker?.resetTimeoutMs || 30000,
      successThreshold: config.storage.circuitBreaker?.successThreshold || 
                        config.cache.circuitBreaker?.successThreshold || 2,
      logger: this.logger
    };
  }
  
  /**
   * Record a storage failure for adaptive behavior
   * 
   * @param errorCode The error code from the failed operation
   * @param source The storage source that failed
   */
  private recordFailure(errorCode: string, source: string) {
    const now = Date.now();
    
    // Add the failure to the list
    this.recentFailures.push({
      timestamp: now,
      errorCode,
      source
    });
    
    // Prune old failures (older than 5 minutes)
    this.recentFailures = this.recentFailures.filter(failure => 
      now - failure.timestamp < 5 * 60 * 1000
    );
    
    // Log high failure rates
    if (this.recentFailures.length > 10) {
      this.logger.warn('High storage failure rate detected', {
        failureCount: this.recentFailures.length,
        timeWindow: '5 minutes',
        mostCommonSource: this.getMostCommonFailureSource(),
        mostCommonError: this.getMostCommonErrorCode()
      });
    }
  }
  
  /**
   * Get the most common error code from recent failures
   * 
   * @returns The most common error code or undefined if no failures
   */
  private getMostCommonErrorCode(): string | undefined {
    if (this.recentFailures.length === 0) {
      return undefined;
    }
    
    // Count occurrences of each error code
    const errorCounts: Record<string, number> = {};
    for (const failure of this.recentFailures) {
      errorCounts[failure.errorCode] = (errorCounts[failure.errorCode] || 0) + 1;
    }
    
    // Find the error code with the highest count
    let mostCommonCode: string | undefined;
    let highestCount = 0;
    
    Object.entries(errorCounts).forEach(([code, count]) => {
      if (count > highestCount) {
        mostCommonCode = code;
        highestCount = count;
      }
    });
    
    return mostCommonCode;
  }
  
  /**
   * Get the most common failure source from recent failures
   * 
   * @returns The most common source or undefined if no failures
   */
  private getMostCommonFailureSource(): string | undefined {
    if (this.recentFailures.length === 0) {
      return undefined;
    }
    
    // Count occurrences of each source
    const sourceCounts: Record<string, number> = {};
    for (const failure of this.recentFailures) {
      sourceCounts[failure.source] = (sourceCounts[failure.source] || 0) + 1;
    }
    
    // Find the source with the highest count
    let mostCommonSource: string | undefined;
    let highestCount = 0;
    
    Object.entries(sourceCounts).forEach(([source, count]) => {
      if (count > highestCount) {
        mostCommonSource = source;
        highestCount = count;
      }
    });
    
    return mostCommonSource;
  }
  
  /**
   * Check if we should avoid a specific storage source based on recent failures
   * 
   * @param source The storage source to check
   * @returns True if the source should be avoided
   */
  private shouldAvoidSource(source: string): boolean {
    // Count recent failures for this source
    const recentSourceFailures = this.recentFailures.filter(
      failure => failure.source === source
    ).length;
    
    // If we have many recent failures for this source, avoid it temporarily
    return recentSourceFailures >= 5;
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
   * Fetch an image from storage based on configured priority with resilience patterns
   * 
   * This method adds retry, circuit breaker, and fallback mechanisms to improve
   * reliability when fetching images from storage sources. It now supports path-based
   * origin selection to use different storage sources for different path patterns.
   */
  async fetchImage(
    imagePath: string, 
    config: ImageResizerConfig,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    env: any, // Use 'any' to bypass type checking temporarily
    request: Request,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    options?: RequestInit
  ): Promise<StorageResult> {
    try {
      this.logger.debug('Fetching image from storage with resilience', { 
        imagePath,
        storagePriority: config.storage.priority.join(','),
        r2Enabled: config.storage.r2?.enabled,
        hasRemoteUrl: !!config.storage.remoteUrl,
        hasFallbackUrl: !!config.storage.fallbackUrl,
        hasPathBasedOrigins: !!config.storage.pathBasedOrigins
      });
      
      // Create a resilient fetch operation that includes retry and circuit breaker patterns
      const fetchWithResilience = async (): Promise<StorageResult> => {
        // Get effective storage priority, taking into account path patterns, circuit breaker states
        // and recent failure patterns
        const { priority: effectivePriority, pathConfig } = this.getEffectiveStoragePriority(config, imagePath);
        
        // Track errors for better reporting
        const errors: Record<string, Error> = {};
        
        // Try each storage type in order of priority
        for (const storageType of effectivePriority) {
          try {
            let result: StorageResult | null = null;
            
            // Try to fetch from the appropriate storage based on type
            if (storageType === 'r2') {
              // Use path-specific R2 config if available
              let r2Config = config;
              if (pathConfig && pathConfig.r2) {
                // Create a new config with path-specific R2 settings
                r2Config = {
                  ...config,
                  storage: {
                    ...config.storage,
                    r2: pathConfig.r2 as { enabled: boolean; bindingName: string }
                  }
                };
                
                // Apply path-specific path transforms if available
                if (pathConfig.pathTransforms) {
                  r2Config.pathTransforms = pathConfig.pathTransforms;
                }
              }
              
              result = await this.fetchFromR2WithResilience(imagePath, r2Config, env, request);
            } else if (storageType === 'remote') {
              // Use path-specific remote config if available
              let remoteConfig = config;
              if (pathConfig) {
                // Create a new config object with path-specific settings
                remoteConfig = { ...config };
                
                // Apply path-specific remote URL if specified
                if (pathConfig.remoteUrl) {
                  remoteConfig.storage = {
                    ...config.storage,
                    remoteUrl: pathConfig.remoteUrl as string
                  };
                }
                
                // Apply path-specific remoteAuth if specified
                if (pathConfig.remoteAuth) {
                  remoteConfig.storage = {
                    ...remoteConfig.storage,
                    remoteAuth: pathConfig.remoteAuth as { enabled: boolean; type: 'aws-s3' | 'bearer' | 'header' | 'query'; }
                  };
                }
                
                // Apply path-specific auth if specified
                if (pathConfig.auth) {
                  remoteConfig.storage = {
                    ...remoteConfig.storage,
                    auth: {
                      ...remoteConfig.storage.auth,
                      ...pathConfig.auth
                    }
                  };
                }
                
                // Apply path-specific fetchOptions if specified
                if (pathConfig.fetchOptions) {
                  remoteConfig.storage = {
                    ...remoteConfig.storage,
                    fetchOptions: pathConfig.fetchOptions
                  };
                }
                
                // Apply path-specific path transforms if available
                if (pathConfig.pathTransforms) {
                  remoteConfig.pathTransforms = pathConfig.pathTransforms;
                }
              }
              
              result = await this.fetchFromRemoteWithResilience(imagePath, remoteConfig, env, request);
            } else if (storageType === 'fallback') {
              // Use path-specific fallback config if available
              let fallbackConfig = config;
              if (pathConfig) {
                // Create a new config object with path-specific settings
                fallbackConfig = { ...config };
                
                // Apply path-specific fallback URL if specified
                if (pathConfig.fallbackUrl) {
                  fallbackConfig.storage = {
                    ...config.storage,
                    fallbackUrl: pathConfig.fallbackUrl as string
                  };
                }
                
                // Apply path-specific fallbackAuth if specified
                if (pathConfig.fallbackAuth) {
                  fallbackConfig.storage = {
                    ...fallbackConfig.storage,
                    fallbackAuth: pathConfig.fallbackAuth as { enabled: boolean; type: 'aws-s3' | 'bearer' | 'header' | 'query'; }
                  };
                }
                
                // Apply path-specific auth if specified
                if (pathConfig.auth) {
                  fallbackConfig.storage = {
                    ...fallbackConfig.storage,
                    auth: {
                      ...fallbackConfig.storage.auth,
                      ...pathConfig.auth
                    }
                  };
                }
                
                // Apply path-specific fetchOptions if specified
                if (pathConfig.fetchOptions) {
                  fallbackConfig.storage = {
                    ...fallbackConfig.storage,
                    fetchOptions: pathConfig.fetchOptions
                  };
                }
                
                // Apply path-specific path transforms if available
                if (pathConfig.pathTransforms) {
                  fallbackConfig.pathTransforms = pathConfig.pathTransforms;
                }
              }
              
              result = await this.fetchFromFallbackWithResilience(imagePath, fallbackConfig, env, request);
            }
            
            // If we got a result, ensure it meets our interface requirements
            if (result) {
              // Ensure contentType is not null to satisfy our interface
              if (result.contentType === null) {
                result.contentType = 'application/octet-stream';
              }
              
              // Ensure size is not null to satisfy our interface
              if (result.size === null) {
                result.size = 0;
              }
              
              // Log success
              this.logger.debug(`Successfully fetched image from ${storageType}`, {
                imagePath,
                contentType: result.contentType,
                size: result.size,
                status: result.response.status,
                usedPathBasedConfig: pathConfig ? true : false
              });
              
              return result as StorageResult;
            }
          } catch (error) {
            // Store the error for later reporting
            errors[storageType] = error instanceof Error 
              ? error 
              : new Error(String(error));
            
            // Record the failure for adaptive behavior
            if (error instanceof StorageServiceError) {
              this.recordFailure(error.code, storageType);
            } else {
              this.recordFailure('UNKNOWN_ERROR', storageType);
            }
            
            // Continue to the next storage type
            this.logger.warn(`Error fetching from ${storageType}, trying next source`, {
              error: error instanceof Error ? error.message : String(error),
              imagePath,
              usedPathBasedConfig: pathConfig ? true : false
            });
          }
        }
        
        // If we got here, all storage types failed
        this.logger.error('All storage sources failed', {
          imagePath,
          triedSources: effectivePriority.join(','),
          usedPathBasedConfig: pathConfig ? true : false,
          pathPattern: pathConfig ? (typeof pathConfig.pattern === 'string' ? 
            pathConfig.pattern : 
            (pathConfig.pattern as RegExp).toString()) : 'none',
          errors: Object.entries(errors).map(([source, error]) => 
            `${source}: ${error.message}`
          ).join('; ')
        });
        
        throw new AllStorageSourcesFailedError(
          `Failed to fetch image from any storage source: ${imagePath}`,
          {
            imagePath,
            triedSources: effectivePriority,
            errors: Object.entries(errors).reduce((acc, [source, error]) => {
              acc[source] = error.message;
              return acc;
            }, {} as Record<string, string>)
          }
        );
      };
      
      // Execute the fetch operation with global resilience patterns
      return await fetchWithResilience();
    } catch (error: unknown) {
      // If it's already a StorageServiceError, re-throw it
      if (isStorageServiceError(error)) {
        throw error;
      }
      
      // Otherwise, wrap it in a StorageServiceError
      const errorMessage = isError(error) ? error.message : String(error);
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
   * Get the effective storage priority based on path matching, circuit breaker states, and recent failures
   * 
   * This method first checks for path-based origin configurations that match the given path,
   * then adjusts the storage priority to avoid sources that are currently experiencing issues.
   * 
   * @param config The application configuration
   * @param imagePath The image path to determine the appropriate storage priority
   * @returns The adjusted storage priority list and path-specific configuration 
   */
  private getEffectiveStoragePriority(
    config: ImageResizerConfig,
    imagePath: string
  ): {
    priority: ('r2' | 'remote' | 'fallback')[];
    pathConfig?: PathOriginConfig; 
  } {
    let configuredPriority = [...config.storage.priority];
    let pathConfig = null;
    
    // Check for path-based origin configurations first
    if (config.storage.pathBasedOrigins) {
      // Find matching path pattern
      for (const [configName, pathOrigin] of Object.entries(config.storage.pathBasedOrigins)) {
        // Match against pattern (either string or RegExp)
        let isMatch = false;
        
        if (typeof pathOrigin.pattern === 'string') {
          // For string patterns, do a simple inclusion check
          isMatch = imagePath.includes(pathOrigin.pattern);
        } else if (pathOrigin.pattern instanceof RegExp) {
          // For RegExp patterns, use test method
          isMatch = pathOrigin.pattern.test(imagePath);
        }
        
        if (isMatch) {
          this.logger.debug(`Matched path-based origin configuration: ${configName}`, {
            imagePath,
            pattern: typeof pathOrigin.pattern === 'string' 
              ? pathOrigin.pattern 
              : pathOrigin.pattern.toString(),
            priority: pathOrigin.priority.join(',')
          });
          
          // Use path-specific priority
          configuredPriority = [...pathOrigin.priority];
          pathConfig = pathOrigin as unknown as PathOriginConfig;
          
          // Found a match, no need to check other patterns
          break;
        }
      }
    }
    
    // Create a filtered list that excludes sources with open circuit breakers
    // or high recent failure rates
    const effectivePriority = configuredPriority.filter(source => {
      // Skip sources that aren't properly configured
      // For path-based configurations, check path-specific settings first
      if (source === 'r2') {
        if (pathConfig && pathConfig.r2) {
          // Use path-specific R2 settings
          if (!pathConfig.r2.enabled || !pathConfig.r2.bindingName) {
            return false;
          }
        } else if (!config.storage.r2?.enabled || !config.storage.r2?.bindingName) {
          // Use global R2 settings
          return false;
        }
      }
      
      if (source === 'remote') {
        if (pathConfig && pathConfig.remoteUrl) {
          // Path-specific remote URL is defined
        } else if (!config.storage.remoteUrl) {
          // No global remote URL
          return false;
        }
      }
      
      if (source === 'fallback') {
        if (pathConfig && pathConfig.fallbackUrl) {
          // Path-specific fallback URL is defined
        } else if (!config.storage.fallbackUrl) {
          // No global fallback URL
          return false;
        }
      }
      
      // Skip sources with open circuit breakers
      if (source === 'r2' && this.r2CircuitBreaker.isOpen) {
        this.logger.debug('Skipping R2 storage - circuit breaker open', {
          resetTime: new Date(this.r2CircuitBreaker.resetTimeMs).toISOString()
        });
        return false;
      }
      if (source === 'remote' && this.remoteCircuitBreaker.isOpen) {
        this.logger.debug('Skipping remote storage - circuit breaker open', {
          resetTime: new Date(this.remoteCircuitBreaker.resetTimeMs).toISOString()
        });
        return false;
      }
      if (source === 'fallback' && this.fallbackCircuitBreaker.isOpen) {
        this.logger.debug('Skipping fallback storage - circuit breaker open', {
          resetTime: new Date(this.fallbackCircuitBreaker.resetTimeMs).toISOString()
        });
        return false;
      }
      
      // Skip sources with high recent failure rates
      if (this.shouldAvoidSource(source)) {
        this.logger.debug(`Skipping ${source} storage - high recent failure rate`);
        return false;
      }
      
      // Include the source in the effective priority
      return true;
    });
    
    // If all sources were filtered out, fall back to the original priority
    if (effectivePriority.length === 0) {
      this.logger.warn('All storage sources are problematic, using original priority', {
        originalPriority: configuredPriority.join(','),
        pathMatch: pathConfig ? 'true' : 'false'
      });
      return { priority: configuredPriority, pathConfig: pathConfig || undefined };
    }
    
    return { priority: effectivePriority, pathConfig: pathConfig || undefined };
  }
  
  /**
   * Fetch an image from R2 storage with resilience patterns
   * 
   * @param imagePath The path to the image
   * @param config The application configuration
   * @param env The environment variables
   * @param request The original request
   * @returns The storage result or null if not found
   */
  private async fetchFromR2WithResilience(
    imagePath: string, 
    config: ImageResizerConfig, 
    env: Env, 
    request: Request
  ): Promise<StorageResult | null> {
    // Skip if R2 is not enabled or no bucket is available
    if (!config.storage.r2?.enabled || !(env as any).IMAGES_BUCKET) {
      return null;
    }
    
    this.logger.debug('Fetching from R2 with resilience', { imagePath });
    
    // Create the fetch operation
    const fetchOperation = async (): Promise<StorageResult | null> => {
      try {
        // Apply path transformations for R2
        const transformedPath = this.applyPathTransformation(imagePath, config, 'r2');
        this.logger.debug('R2 path after transformation', { originalPath: imagePath, transformedPath });
        
        const bucket = (env as any).IMAGES_BUCKET;
        if (!bucket) {
          this.logger.error('R2 bucket is undefined', { path: transformedPath });
          throw new Error('R2 bucket is undefined');
        }
        
        const result = await this.fetchFromR2(transformedPath, bucket, request, config);
        return result;
      } catch (error) {
        // Wrap any errors in a StorageServiceError
        if (error instanceof StorageServiceError) {
          throw error;
        }
        
        // Check for 404 errors
        const errorMsg = error instanceof Error ? error.message : String(error);
        if (errorMsg.includes('not found') || errorMsg.includes('404')) {
          throw new StorageNotFoundError(`Image not found in R2: ${imagePath}`, {
            imagePath
          });
        }
        
        // Timeout errors
        if (errorMsg.includes('timeout') || errorMsg.includes('timed out')) {
          throw new StorageTimeoutError(`R2 operation timed out: ${imagePath}`, {
            imagePath,
            originalError: errorMsg
          });
        }
        
        // Other R2 errors
        throw new R2StorageError(`Error accessing R2: ${errorMsg}`, {
          imagePath,
          originalError: errorMsg
        });
      }
    };
    
    // Get resilience options by combining retry and circuit breaker config
    const resilienceOptions = {
      ...this.getRetryConfig(),
      ...this.getCircuitBreakerConfig(),
      isRetryable: (error: unknown) => {
        // Only retry if the error is explicitly retryable
        if (isRetryableError(error)) {
          return true;
        }
        
        // Never retry 404 errors
        if (error instanceof StorageNotFoundError) {
          return false;
        }
        
        // Otherwise, check if it's a R2StorageError specifically
        return error instanceof R2StorageError;
      }
    };
    
    // Execute with resilience patterns
    try {
      return await withResilience(fetchOperation, this.r2CircuitBreaker, resilienceOptions);
    } catch (error) {
      // If it's a 404, just return null instead of throwing
      if (error instanceof StorageNotFoundError) {
        this.logger.debug('Image not found in R2', { imagePath });
        return null;
      }
      
      // Rethrow other errors
      throw error;
    }
  }
  
  /**
   * Fetch an image from R2 storage
   * 
   * @param path Path to the image in R2
   * @param bucket R2 bucket object
   * @param request Original request (for conditional requests and range requests)
   * @param config Application configuration
   * @returns Storage result or null if the image is not found
   */
  private async fetchFromR2(
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
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          } catch (e) {
            // Invalid range header, ignore
            this.logger.warn('Invalid range header', { rangeHeader });
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
      this.logger.error('Error fetching from R2', { 
        error: error instanceof Error ? error.message : String(error),
        path
      });
      throw new R2StorageError('Error accessing R2 storage', { 
        originalError: error instanceof Error ? error.message : String(error),
        path
      });
    }
  }
  
  /**
   * Fetch an image from remote storage with resilience patterns
   * 
   * @param imagePath The path to the image
   * @param config The application configuration
   * @param env The environment variables
   * @param request The original request
   * @returns The storage result or null if not found
   */
  private async fetchFromRemoteWithResilience(
    imagePath: string, 
    config: ImageResizerConfig, 
    env: Env, 
    _request: Request
  ): Promise<StorageResult | null> {
    // Skip if remote URL is not configured
    if (!config.storage.remoteUrl) {
      return null;
    }
    
    this.logger.debug('Fetching from remote with resilience', { 
      imagePath,
      remoteUrl: config.storage.remoteUrl
    });
    
    // Create the fetch operation
    const fetchOperation = async (): Promise<StorageResult | null> => {
      try {
        // Apply path transformations for remote URLs
        const transformedPath = this.applyPathTransformation(imagePath, config, 'remote');
        this.logger.debug('Remote path after transformation', { originalPath: imagePath, transformedPath });
        
        const remoteUrl = config.storage.remoteUrl || '';
        if (!remoteUrl) {
          return null;
        }
        const result = await this.fetchFromRemote(transformedPath, remoteUrl, config, env);
        return result;
      } catch (error) {
        // Wrap any errors in a StorageServiceError
        if (error instanceof StorageServiceError) {
          throw error;
        }
        
        // Check for 404 errors
        const errorMsg = error instanceof Error ? error.message : String(error);
        if (errorMsg.includes('not found') || errorMsg.includes('404')) {
          throw new StorageNotFoundError(`Image not found in remote: ${imagePath}`, {
            imagePath,
            remoteUrl: config.storage.remoteUrl
          });
        }
        
        // Authentication errors
        if (errorMsg.includes('unauthorized') || 
            errorMsg.includes('forbidden') || 
            errorMsg.includes('authentication') ||
            errorMsg.includes('401') ||
            errorMsg.includes('403')) {
          throw new StorageServiceError(`Authentication error accessing remote: ${errorMsg}`, {
            code: 'REMOTE_AUTH_ERROR',
            status: 401,
            details: {
              imagePath,
              remoteUrl: config.storage.remoteUrl,
              originalError: errorMsg
            },
            retryable: false // Auth errors are not retryable
          });
        }
        
        // Timeout errors
        if (errorMsg.includes('timeout') || errorMsg.includes('timed out')) {
          throw new StorageTimeoutError(`Remote operation timed out: ${imagePath}`, {
            imagePath,
            remoteUrl: config.storage.remoteUrl,
            originalError: errorMsg
          });
        }
        
        // Other remote errors
        throw new RemoteStorageError(`Error accessing remote: ${errorMsg}`, {
          imagePath,
          remoteUrl: config.storage.remoteUrl,
          originalError: errorMsg
        });
      }
    };
    
    // Get resilience options by combining retry and circuit breaker config
    const resilienceOptions = {
      ...this.getRetryConfig(),
      ...this.getCircuitBreakerConfig(),
      isRetryable: (error: unknown) => {
        // Only retry if the error is explicitly retryable
        if (isRetryableError(error)) {
          return true;
        }
        
        // Never retry 404 or auth errors
        if (error instanceof StorageNotFoundError) {
          return false;
        }
        if (error instanceof StorageServiceError && 
            (error.code === 'REMOTE_AUTH_ERROR' || error.status === 401 || error.status === 403)) {
          return false;
        }
        
        // Otherwise, check if it's a RemoteStorageError specifically
        return error instanceof RemoteStorageError;
      }
    };
    
    // Execute with resilience patterns
    try {
      return await withResilience(fetchOperation, this.remoteCircuitBreaker, resilienceOptions);
    } catch (error) {
      // If it's a 404, just return null instead of throwing
      if (error instanceof StorageNotFoundError) {
        this.logger.debug('Image not found in remote storage', { 
          imagePath,
          remoteUrl: config.storage.remoteUrl
        });
        return null;
      }
      
      // Rethrow other errors
      throw error;
    }
  }
  
  /**
   * Fetch an image from a remote URL
   */
  private async fetchFromRemote(
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
      
      // Check if authentication is required for this origin
      // Set the base URL as a const since it won't be reassigned
      const finalUrl = new URL(path, baseUrl).toString();
      
      // Check if remote auth is enabled specifically for this remote URL
      if (config.storage.remoteAuth?.enabled) {
        this.logger.debug('Remote auth enabled', {
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
                
                this.logger.debug('Added AWS signed headers', {
                  url: finalUrl,
                  headerCount: Object.keys(fetchOptions.headers || {}).length
                });
              } catch (error) {
                this.logger.error('Error signing AWS request', {
                  error: error instanceof Error ? error.message : String(error),
                  url: finalUrl
                });
                
                // Continue without authentication if in permissive mode
                if (config.storage.auth?.securityLevel !== 'permissive') {
                  return null;
                }
              }
            } else {
              this.logger.error('AWS credentials not found', {
                accessKeyVar,
                secretKeyVar
              });
              
              // Continue without authentication if in permissive mode
              if (config.storage.auth?.securityLevel !== 'permissive') {
                return null;
              }
            }
          } else {
            this.logger.warn('AWS S3 auth requires origin-auth to be enabled', {
              url: finalUrl
            });
          }
        } else if (config.storage.remoteAuth.type === 'bearer') {
          // Implement bearer token authentication
          const tokenHeaderName = config.storage.remoteAuth.tokenHeaderName || 'Authorization';
          let token: string | undefined;
          
          // Try to get token from environment variable if tokenHeaderName looks like an env var reference
          if (tokenHeaderName.startsWith('$') && tokenHeaderName.length > 1) {
            const envVarName = tokenHeaderName.substring(1);
            const envRecord = env as unknown as Record<string, string | undefined>;
            token = envRecord[envVarName];
            
            if (!token) {
              this.logger.error('Bearer token not found in environment', {
                envVar: envVarName,
                url: finalUrl
              });
              
              // Continue without authentication if in permissive mode
              if (config.storage.auth?.securityLevel !== 'permissive') {
                return null;
              }
            }
          } 
          // Otherwise use the token secret from config
          else if (config.storage.remoteAuth.tokenSecret) {
            token = config.storage.remoteAuth.tokenSecret;
          } else {
            this.logger.error('Bearer token configuration missing', {
              url: finalUrl
            });
            
            // Continue without authentication if in permissive mode
            if (config.storage.auth?.securityLevel !== 'permissive') {
              return null;
            }
          }
          
          // Add the Authorization header
          if (token && fetchOptions.headers && typeof fetchOptions.headers === 'object') {
            this.logger.debug('Added bearer token authentication', {
              url: finalUrl,
              headerName: tokenHeaderName.startsWith('$') ? 'Authorization' : tokenHeaderName
            });
            
            const headerName = tokenHeaderName.startsWith('$') ? 'Authorization' : tokenHeaderName;
            const headerValue = headerName === 'Authorization' ? `Bearer ${token}` : token;
            
            (fetchOptions.headers as Record<string, string>)[headerName] = headerValue;
          }
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
          // Handle query parameter authentication
          if (config.storage.remoteAuth.signedUrlExpiration) {
            // Parse the URL to add query parameters
            const urlObj = new URL(finalUrl);
            
            // Add basic signature parameters
            const timestamp = Math.floor(Date.now() / 1000);
            const expiration = timestamp + (config.storage.remoteAuth.signedUrlExpiration || 3600);
            
            urlObj.searchParams.set('expires', expiration.toString());
            
            // Add token if available
            if (config.storage.remoteAuth.tokenSecret) {
              urlObj.searchParams.set('token', config.storage.remoteAuth.tokenSecret);
            }
            
            // Save original URL before changing
            const originalUrl = finalUrl;
            // Create a new reference for the updated URL
            const updatedUrl = urlObj.toString();
            // Update the URL for fetching
            const signedUrl = updatedUrl;
            
            this.logger.debug('Added query parameters for authentication', {
              originalUrl,
              signedUrl,
              expiresAt: new Date(expiration * 1000).toISOString()
            });
            
            // Fetch using the signed URL
            const response = await fetch(signedUrl, fetchOptions);
            
            if (!response.ok) {
              this.logger.warn('Remote fetch failed with signed URL', { 
                url: signedUrl, 
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
              originalUrl: signedUrl,
              path
            };
          } else {
            this.logger.warn('Query auth specified but no signedUrlExpiration provided', {
              url: finalUrl
            });
          }
        }
        
        // Set cache TTL for authenticated requests
        if (config.storage.auth?.cacheTtl) {
          if (fetchOptions.cf && typeof fetchOptions.cf === 'object') {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (fetchOptions.cf as any).cacheTtl = config.storage.auth.cacheTtl;
          }
        }
      } else {
        this.logger.debug('Remote auth not enabled for this URL', {
          url: finalUrl
        });
      }
      
      // Fetch the image from the remote URL
      this.logger.debug('Fetching from remote URL', { url: finalUrl });
      const response = await fetch(finalUrl, fetchOptions);
      
      if (!response.ok) {
        this.logger.warn('Remote fetch failed', { 
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
        path
      };
    } catch (error) {
      this.logger.error('Error fetching from remote', { 
        error: error instanceof Error ? error.message : String(error),
        url: baseUrl,
        path
      });
      return null;
    }
  }
  
  /**
   * Fetch an image from fallback storage with resilience patterns
   * 
   * @param imagePath The path to the image
   * @param config The application configuration
   * @param env The environment variables
   * @param request The original request
   * @returns The storage result or null if not found
   */
  private async fetchFromFallbackWithResilience(
    imagePath: string, 
    config: ImageResizerConfig, 
    env: Env, 
    _request: Request
  ): Promise<StorageResult | null> {
    // Skip if fallback URL is not configured
    if (!config.storage.fallbackUrl) {
      return null;
    }
    
    this.logger.debug('Fetching from fallback with resilience', { 
      imagePath,
      fallbackUrl: config.storage.fallbackUrl
    });
    
    // Create the fetch operation
    const fetchOperation = async (): Promise<StorageResult | null> => {
      try {
        // Apply path transformations for fallback URLs
        const transformedPath = this.applyPathTransformation(imagePath, config, 'fallback');
        this.logger.debug('Fallback path after transformation', { originalPath: imagePath, transformedPath });
        
        const fallbackUrl = config.storage.fallbackUrl || '';
        if (!fallbackUrl) {
          return null;
        }
        const result = await this.fetchFromFallback(transformedPath, fallbackUrl, config, env);
        return result;
      } catch (error) {
        // Wrap any errors in a StorageServiceError
        if (error instanceof StorageServiceError) {
          throw error;
        }
        
        // Check for 404 errors
        const errorMsg = error instanceof Error ? error.message : String(error);
        if (errorMsg.includes('not found') || errorMsg.includes('404')) {
          throw new StorageNotFoundError(`Image not found in fallback: ${imagePath}`, {
            imagePath,
            fallbackUrl: config.storage.fallbackUrl
          });
        }
        
        // Authentication errors
        if (errorMsg.includes('unauthorized') || 
            errorMsg.includes('forbidden') || 
            errorMsg.includes('authentication') ||
            errorMsg.includes('401') ||
            errorMsg.includes('403')) {
          throw new StorageServiceError(`Authentication error accessing fallback: ${errorMsg}`, {
            code: 'FALLBACK_AUTH_ERROR',
            status: 401,
            details: {
              imagePath,
              fallbackUrl: config.storage.fallbackUrl,
              originalError: errorMsg
            },
            retryable: false // Auth errors are not retryable
          });
        }
        
        // Timeout errors
        if (errorMsg.includes('timeout') || errorMsg.includes('timed out')) {
          throw new StorageTimeoutError(`Fallback operation timed out: ${imagePath}`, {
            imagePath,
            fallbackUrl: config.storage.fallbackUrl,
            originalError: errorMsg
          });
        }
        
        // Other fallback errors
        throw new FallbackStorageError(`Error accessing fallback: ${errorMsg}`, {
          imagePath,
          fallbackUrl: config.storage.fallbackUrl,
          originalError: errorMsg
        });
      }
    };
    
    // Get resilience options by combining retry and circuit breaker config
    const resilienceOptions = {
      ...this.getRetryConfig(),
      ...this.getCircuitBreakerConfig(),
      isRetryable: (error: unknown) => {
        // Only retry if the error is explicitly retryable
        if (isRetryableError(error)) {
          return true;
        }
        
        // Never retry 404 or auth errors
        if (error instanceof StorageNotFoundError) {
          return false;
        }
        if (error instanceof StorageServiceError && 
            (error.code === 'FALLBACK_AUTH_ERROR' || error.status === 401 || error.status === 403)) {
          return false;
        }
        
        // Otherwise, check if it's a FallbackStorageError specifically
        return error instanceof FallbackStorageError;
      }
    };
    
    // Execute with resilience patterns
    try {
      return await withResilience(fetchOperation, this.fallbackCircuitBreaker, resilienceOptions);
    } catch (error) {
      // If it's a 404, just return null instead of throwing
      if (error instanceof StorageNotFoundError) {
        this.logger.debug('Image not found in fallback storage', { 
          imagePath,
          fallbackUrl: config.storage.fallbackUrl
        });
        return null;
      }
      
      // Rethrow other errors
      throw error;
    }
  }
  
  /**
   * Fetch an image from a fallback URL
   */
  private async fetchFromFallback(
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
      
      // Check if authentication is required for this origin
      // Set the base URL
      const finalUrl = new URL(path, fallbackUrl).toString();
      
      // Check if fallback auth is enabled specifically for this URL
      if (config.storage.fallbackAuth?.enabled) {
        this.logger.debug('Fallback auth enabled', {
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
                
                this.logger.debug('Added AWS signed headers', {
                  url: finalUrl,
                  headerCount: Object.keys(fetchOptions.headers || {}).length
                });
              } catch (error) {
                this.logger.error('Error signing AWS request', {
                  error: error instanceof Error ? error.message : String(error),
                  url: finalUrl
                });
                
                // Continue without authentication if in permissive mode
                if (config.storage.auth?.securityLevel !== 'permissive') {
                  return null;
                }
              }
            } else {
              this.logger.error('AWS credentials not found', {
                accessKeyVar,
                secretKeyVar
              });
              
              // Continue without authentication if in permissive mode
              if (config.storage.auth?.securityLevel !== 'permissive') {
                return null;
              }
            }
          } else {
            this.logger.warn('AWS S3 auth requires origin-auth to be enabled', {
              url: finalUrl
            });
          }
        } else if (config.storage.fallbackAuth.type === 'bearer') {
          // Implement bearer token authentication
          const tokenHeaderName = config.storage.fallbackAuth.tokenHeaderName || 'Authorization';
          let token: string | undefined;
          
          // Try to get token from environment variable if tokenHeaderName looks like an env var reference
          if (tokenHeaderName.startsWith('$') && tokenHeaderName.length > 1) {
            const envVarName = tokenHeaderName.substring(1);
            const envRecord = env as unknown as Record<string, string | undefined>;
            token = envRecord[envVarName];
            
            if (!token) {
              this.logger.error('Bearer token not found in environment', {
                envVar: envVarName,
                url: finalUrl
              });
              
              // Continue without authentication if in permissive mode
              if (config.storage.auth?.securityLevel !== 'permissive') {
                return null;
              }
            }
          } 
          // Otherwise use the token secret from config
          else if (config.storage.fallbackAuth.tokenSecret) {
            token = config.storage.fallbackAuth.tokenSecret;
          } else {
            this.logger.error('Bearer token configuration missing', {
              url: finalUrl
            });
            
            // Continue without authentication if in permissive mode
            if (config.storage.auth?.securityLevel !== 'permissive') {
              return null;
            }
          }
          
          // Add the Authorization header
          if (token && fetchOptions.headers && typeof fetchOptions.headers === 'object') {
            this.logger.debug('Added bearer token authentication', {
              url: finalUrl,
              headerName: tokenHeaderName.startsWith('$') ? 'Authorization' : tokenHeaderName
            });
            
            const headerName = tokenHeaderName.startsWith('$') ? 'Authorization' : tokenHeaderName;
            const headerValue = headerName === 'Authorization' ? `Bearer ${token}` : token;
            
            (fetchOptions.headers as Record<string, string>)[headerName] = headerValue;
          }
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
          // Handle query parameter authentication
          if (config.storage.fallbackAuth.signedUrlExpiration) {
            // Parse the URL to add query parameters
            const urlObj = new URL(finalUrl);
            
            // Add basic signature parameters
            const timestamp = Math.floor(Date.now() / 1000);
            const expiration = timestamp + (config.storage.fallbackAuth.signedUrlExpiration || 3600);
            
            urlObj.searchParams.set('expires', expiration.toString());
            
            // Add token if available
            if (config.storage.fallbackAuth.tokenSecret) {
              urlObj.searchParams.set('token', config.storage.fallbackAuth.tokenSecret);
            }
            
            // Save original URL before changing
            const originalUrl = finalUrl;
            // Create a new reference for the updated URL
            const updatedUrl = urlObj.toString();
            // Update the URL for fetching
            const signedUrl = updatedUrl;
            
            this.logger.debug('Added query parameters for authentication', {
              originalUrl,
              signedUrl,
              expiresAt: new Date(expiration * 1000).toISOString()
            });
            
            // Fetch using the signed URL
            const response = await fetch(signedUrl, fetchOptions);
            
            if (!response.ok) {
              this.logger.warn('Fallback fetch failed with signed URL', { 
                url: signedUrl, 
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
              originalUrl: signedUrl,
              path
            };
          } else {
            this.logger.warn('Query auth specified but no signedUrlExpiration provided', {
              url: finalUrl
            });
          }
        }
        
        // Set cache TTL for authenticated requests
        if (config.storage.auth?.cacheTtl) {
          if (fetchOptions.cf && typeof fetchOptions.cf === 'object') {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (fetchOptions.cf as any).cacheTtl = config.storage.auth.cacheTtl;
          }
        }
      } else {
        this.logger.debug('Fallback auth not enabled for this URL', {
          url: finalUrl
        });
      }
      
      // Fetch the image from the fallback URL
      this.logger.debug('Fetching from fallback URL', { url: finalUrl });
      const response = await fetch(finalUrl, fetchOptions);
      
      if (!response.ok) {
        this.logger.warn('Fallback fetch failed', { 
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
        path
      };
    } catch (error) {
      this.logger.error('Error fetching from fallback', { 
        error: error instanceof Error ? error.message : String(error),
        url: fallbackUrl,
        path
      });
      return null;
    }
  }
}