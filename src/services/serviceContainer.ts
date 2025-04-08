/**
 * Service container factory for creating and managing services
 */

// Re-export the ServiceContainer interface for external use
export type { ServiceContainer } from './interfaces';

import { Env } from '../types';
import { createLogger } from '../utils/logger-factory';
import { 
  AuthService,
  CacheService, 
  DebugService, 
  ImageTransformationService, 
  ServiceContainer, 
  StorageService,
  ClientDetectionService,
  ConfigurationService,
  LoggingService,
  MetadataFetchingService
} from './interfaces';
import { DefaultCacheService } from './cacheService';
import { DefaultDebugService } from './debugService';
import { DefaultImageTransformationService } from './transformationService';
import { DefaultStorageService } from './storageService';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { DefaultClientDetectionService } from './clientDetectionService';
import { DefaultConfigurationService } from './configurationService';
import { DefaultLoggingService } from './loggingService';
import { createClientDetectionService } from './clientDetectionFactory';
import { createAuthService } from './authServiceFactory';
import { createMetadataService } from './metadataServiceFactory';
import { CacheTagsManager } from './cache/CacheTagsManager';
import { KVConfigStore } from './config/KVConfigStore';
import { DefaultConfigurationApiService } from './config/ConfigurationApiService';
import { ConfigStoreInterface, ConfigurationApiService } from './config/interfaces';

/**
 * Create a service container with all required services
 * 
 * @param env Environment variables from Cloudflare
 * @param initializeLifecycle Whether to initialize service lifecycle
 * @returns Service container with all services
 */
export async function createServiceContainer(env: Env, initializeLifecycle = false): Promise<ServiceContainer> {
  // Create the configuration service first
  // Create a minimal logger for bootstrapping the configuration service
  // We're using any here because we need to bootstrap without a full config
  const bootstrapConfig = { 
    environment: 'dev',
    debug: { enabled: true },
    cache: {},
    responsive: {},
    storage: {},
    features: {},
    version: '1.0.0',
    logging: { level: 'INFO' },
    performance: { 
      optimizedLogging: true,
      optimizedClientDetection: true
    }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
  
  // Create a temporary logger for bootstrapping, using optimized logging
  const configLogger = createLogger(bootstrapConfig, 'ConfigurationService', true);
  
  // Initialize the configuration service
  const configurationService: ConfigurationService = new DefaultConfigurationService(configLogger, env);
  const config = configurationService.getConfig();
  
  // Create the logging service
  const loggingService: LoggingService = new DefaultLoggingService(config);
  
  // Now use the logging service to get loggers for each service
  const mainLogger = loggingService.getLogger('ServiceContainer');
  const storageLogger = loggingService.getLogger('StorageService');
  const transformationLogger = loggingService.getLogger('TransformationService');
  const cacheLogger = loggingService.getLogger('CacheService');
  const debugLogger = loggingService.getLogger('DebugService');
  const clientDetectionLogger = loggingService.getLogger('ClientDetectionService');
  const authLogger = loggingService.getLogger('AuthService');
  const metadataLogger = loggingService.getLogger('MetadataService');

  // Create the auth service
  const authService: AuthService = createAuthService(config, authLogger);

  // Create service instances
  const storageService: StorageService = new DefaultStorageService(storageLogger, configurationService, authService) as StorageService;
  
  // Create path service
  const pathServiceLogger = loggingService.getLogger('PathService');
  let pathServiceImpl;
  try {
    // Dynamic import would be better but we need synchronous behavior here
    // We're disabling the linting rule in CLAUDE.md but fixing it here for the PR
    const { createPathService } = await import('./pathService');
    pathServiceImpl = createPathService(pathServiceLogger, config);
    mainLogger.debug('Path service initialized successfully');
  } catch (err) {
    mainLogger.warn('Error loading path service', {
      error: err instanceof Error ? err.message : String(err)
    });
  }
  
  // Create detector service using factory
  const detectorServiceLogger = loggingService.getLogger('DetectorService');
  let detectorServiceImpl;
  try {
    // Dynamic import would be better but we need synchronous behavior here
    // We're disabling the linting rule in CLAUDE.md but fixing it here for the PR
    const { createDetectorService } = await import('./detectorServiceFactory');
    detectorServiceImpl = createDetectorService(config, detectorServiceLogger);
    mainLogger.debug('Detector service initialized successfully');
  } catch (err) {
    mainLogger.warn('Error loading detector service', {
      error: err instanceof Error ? err.message : String(err)
    });
  }
  
  // Get the KV namespace from the environment
  const transformCacheBinding = config.cache.transformCache?.binding || 'IMAGE_TRANSFORMATIONS_CACHE';
  // Use type assertion to fix TS7053 error
  // Double cast to avoid type errors - first to unknown, then to KVNamespace
  const kvNamespace = ((env as Record<string, unknown>)[transformCacheBinding]) as unknown as KVNamespace;
  
  // Create the cache service with the KV namespace
  const cacheService: CacheService = new DefaultCacheService(
    cacheLogger, 
    configurationService,
    kvNamespace
  );
  
  // Create CacheTagsManager for the debug service
  const cacheTagsManager = new CacheTagsManager(debugLogger, configurationService);
  
  const debugService: DebugService = new DefaultDebugService(debugLogger, cacheTagsManager);
  
  // Create client detection service using factory (creates optimized version based on config)
  const clientDetectionService: ClientDetectionService = createClientDetectionService(
    config, 
    clientDetectionLogger
  );
  
  // Create transformation service with proper dependencies
  const transformationService: ImageTransformationService = new DefaultImageTransformationService(
    transformationLogger, 
    undefined, // Will set client detection service later
    configurationService,
    cacheService
  );
  
  // Connect the client detection service to the transformation service
  transformationService.setClientDetectionService(clientDetectionService);

  // Create the metadata service
  const metadataService: MetadataFetchingService = createMetadataService(
    config,
    metadataLogger,
    storageService,
    cacheService,
    configurationService
  );
  
  // Connect the metadata service to the transformation service
  transformationService.setMetadataService(metadataService);
  
  // Create configuration store service
  let configStore: KVNamespace | undefined;
  const configStoreLogger = loggingService.getLogger('KVConfigStore');
  
  // Check if we're in development mode
  if (env.ENVIRONMENT === 'development' && env.IMAGE_CONFIGURATION_STORE_DEV) {
    configStore = env.IMAGE_CONFIGURATION_STORE_DEV;
    configStoreLogger.debug('Using development configuration store binding: IMAGE_CONFIGURATION_STORE_DEV');
  }
  // Otherwise, use the production binding
  else if (env.IMAGE_CONFIGURATION_STORE) {
    configStore = env.IMAGE_CONFIGURATION_STORE;
    configStoreLogger.debug('Using production configuration store binding: IMAGE_CONFIGURATION_STORE');
  }
  // Legacy fallback for backward compatibility
  else if (env.CONFIG_STORE) {
    configStore = env.CONFIG_STORE;
    configStoreLogger.warn('Using deprecated CONFIG_STORE binding - please update to IMAGE_CONFIGURATION_STORE');
  }
  
  // Create the KV config store if binding is available
  let kvConfigStore: ConfigStoreInterface | undefined;
  let configApiService: ConfigurationApiService | undefined;
  
  if (configStore) {
    kvConfigStore = new KVConfigStore(configStore, configStoreLogger);
    
    // Create Configuration API service
    const configApiLogger = loggingService.getLogger('ConfigApiService');
    
    // Extract environment variables as a record for config value resolution
    const envVars: Record<string, string> = {};
    for (const key in env) {
      if (Object.prototype.hasOwnProperty.call(env, key)) {
        const value = env[key as keyof typeof env];
        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
          envVars[key] = String(value);
        }
      }
    }
    
    configApiService = new DefaultConfigurationApiService(kvConfigStore, envVars, configApiLogger);
  }

  // Create the service container
  const container: ServiceContainer = {
    storageService,
    transformationService,
    cacheService,
    debugService,
    clientDetectionService,
    configurationService,
    loggingService,
    authService,
    metadataService,
    logger: mainLogger,
    configStore: kvConfigStore,
    configApiService,
    pathService: pathServiceImpl,
    detectorService: detectorServiceImpl,
    
    // Add service resolution methods to satisfy interface
    resolve: <T>(serviceType: string): T => {
      throw new Error(`Service ${serviceType} resolution not implemented in legacy container`);
    },
    registerFactory: <T>(serviceType: string, _factory: () => T, _singleton?: boolean): void => {
      throw new Error(`Service ${serviceType} registration not implemented in legacy container`);
    },
    
    // Add lifecycle management methods (these will be overridden by the lifecycle manager)
    async initialize(): Promise<void> {
      // This implementation will be replaced by the LifecycleManager
      // but is provided for backward compatibility
      if (this.lifecycleManager) {
        await this.lifecycleManager.initialize();
      } else {
        mainLogger.debug('Initializing service container lifecycle (legacy method)');
        
        // Initialize services in dependency order
        await configurationService.initialize();
        
        // Initialize other services that support lifecycle
        if ('initialize' in loggingService && typeof loggingService.initialize === 'function') {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (loggingService as any).initialize();
        }
        
        if ('initialize' in authService && typeof authService.initialize === 'function') {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (authService as any).initialize();
        }
        
        if ('initialize' in storageService && typeof storageService.initialize === 'function') {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (storageService as any).initialize();
        }
        
        if ('initialize' in cacheService && typeof cacheService.initialize === 'function') {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (cacheService as any).initialize();
        }
        
        if ('initialize' in clientDetectionService && typeof clientDetectionService.initialize === 'function') {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (clientDetectionService as any).initialize();
        }
        
        if ('initialize' in debugService && typeof debugService.initialize === 'function') {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (debugService as any).initialize();
        }
        
        if ('initialize' in transformationService && typeof transformationService.initialize === 'function') {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (transformationService as any).initialize();
        }
        
        if ('initialize' in metadataService && typeof metadataService.initialize === 'function') {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (metadataService as any).initialize();
        }
        
        // Initialize configuration store if available
        if (kvConfigStore && 'initialize' in kvConfigStore) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (kvConfigStore as any).initialize();
            mainLogger.debug('ConfigStore initialized successfully');
          } catch (error) {
            mainLogger.error('Failed to initialize ConfigStore', {
              error: error instanceof Error ? error.message : String(error)
            });
          }
        }
        
        // Initialize configuration API service if available
        if (configApiService && 'initialize' in configApiService) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (configApiService as any).initialize();
            mainLogger.debug('ConfigApiService initialized successfully');
          } catch (error) {
            mainLogger.error('Failed to initialize ConfigApiService', {
              error: error instanceof Error ? error.message : String(error)
            });
          }
        }
        
        mainLogger.info('Service container lifecycle initialization complete (legacy method)');
      }
    },
    
    async shutdown(): Promise<void> {
      // This implementation will be replaced by the LifecycleManager
      // but is provided for backward compatibility
      if (this.lifecycleManager) {
        await this.lifecycleManager.shutdown();
      } else {
        mainLogger.debug('Shutting down service container lifecycle (legacy method)');
        
        // Shut down services in reverse dependency order
        if ('shutdown' in transformationService && typeof transformationService.shutdown === 'function') {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (transformationService as any).shutdown();
        }
        
        if ('shutdown' in metadataService && typeof metadataService.shutdown === 'function') {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (metadataService as any).shutdown();
        }
        
        if ('shutdown' in debugService && typeof debugService.shutdown === 'function') {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (debugService as any).shutdown();
        }
        
        if ('shutdown' in clientDetectionService && typeof clientDetectionService.shutdown === 'function') {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (clientDetectionService as any).shutdown();
        }
        
        if ('shutdown' in cacheService && typeof cacheService.shutdown === 'function') {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (cacheService as any).shutdown();
        }
        
        if ('shutdown' in storageService && typeof storageService.shutdown === 'function') {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (storageService as any).shutdown();
        }
        
        if ('shutdown' in authService && typeof authService.shutdown === 'function') {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (authService as any).shutdown();
        }
        
        if ('shutdown' in loggingService && typeof loggingService.shutdown === 'function') {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (loggingService as any).shutdown();
        }
        
        // Shut down configuration API services
        if (configApiService && 'shutdown' in configApiService) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (configApiService as any).shutdown();
            mainLogger.debug('ConfigApiService shutdown successfully');
          } catch (error) {
            mainLogger.error('Failed to shutdown ConfigApiService', {
              error: error instanceof Error ? error.message : String(error)
            });
          }
        }
        
        if (kvConfigStore && 'shutdown' in kvConfigStore) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (kvConfigStore as any).shutdown();
            mainLogger.debug('ConfigStore shutdown successfully');
          } catch (error) {
            mainLogger.error('Failed to shutdown ConfigStore', {
              error: error instanceof Error ? error.message : String(error)
            });
          }
        }
        
        // Shut down configuration service last
        await configurationService.shutdown();
        
        mainLogger.info('Service container lifecycle shutdown complete (legacy method)');
      }
    }
  };

  // Add the lifecycle manager if it doesn't exist
  if (!container.lifecycleManager) {
    // We need to use dynamic import to avoid circular dependency
    import('./lifecycleManager').then(({ createLifecycleManager }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (container as any).lifecycleManager = createLifecycleManager(container);
      mainLogger.debug('LifecycleManager added to ServiceContainer');
    }).catch(error => {
      mainLogger.warn('Failed to load LifecycleManager', { error: error.message });
    });
  }

  mainLogger.info('Service container initialized with all services', {
    serviceCount: kvConfigStore && configApiService ? 11 : (kvConfigStore ? 10 : 9),
    services: 'configuration, logging, storage, transformation, cache, debug, clientDetection, auth, metadata' + 
              (kvConfigStore ? ', configStore' : '') + 
              (configApiService ? ', configApiService' : ''),
    environment: config.environment
  });

  // Initialize service lifecycle if requested
  if (initializeLifecycle) {
    // Use void to ignore the promise - the caller can await the initialize method if needed
    setTimeout(() => {
      if (container.lifecycleManager) {
        void container.lifecycleManager.initialize();
      } else {
        void container.initialize();
      }
    }, 0);
  }

  return container;
}