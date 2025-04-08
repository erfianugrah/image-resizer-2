/**
 * Dependency Injection Container Implementation
 * 
 * Provides a flexible, lightweight dependency injection container
 * to manage service instantiation and dependencies.
 */

import { DIContainer, ServiceContainer, ClientDetectionService, PathService, CacheService, ConfigurationService, ParameterHandlerService } from './interfaces';
import { CacheTagsManager } from './cache/CacheTagsManager';
import { Env } from '../types';
// Used for type definitions and future extensions
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { Logger } from '../utils/logging';

// Import service implementations
import { DefaultConfigurationService } from './configurationService';
import { DefaultLoggingService } from './loggingService';
// Used for type definitions in service registration factory patterns
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { DefaultStorageService } from './storageService';
import { DefaultCacheService } from './cacheService';
import { DefaultDebugService } from './debugService';
import { DefaultImageTransformationService } from './transformationService';
import { DefaultClientDetectionService } from './clientDetectionService';
import { AuthServiceImpl } from './authService';
import { createDetectorService } from './detectorServiceFactory';
import { createStorageService } from './storageServiceFactory';
import { createCacheService } from './cacheServiceFactory';
import { createAuthService } from './authServiceFactory';
import { createPathService } from './pathService';
import { createLogger } from '../utils/logger-factory';
import { createParameterHandler } from '../parameters/serviceFactory';
// Import configuration services
import { ConfigStoreInterface, ConfigurationApiService } from './config/interfaces';
import { KVConfigStore } from './config/KVConfigStore';
import { KVConfigurationService } from './config/KVConfigurationService';
import { CachedKVConfigurationService } from './config/CachedKVConfigurationService';
import { DefaultConfigurationApiService } from './config/ConfigurationApiService';

interface ServiceRegistration<T> {
  instance?: T;
  factory?: () => T;
  singleton: boolean;
}

/**
 * Default implementation of the DIContainer interface
 * Provides dependency injection capabilities for the application
 */
export class DefaultDIContainer implements DIContainer {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private registrations: Map<string, ServiceRegistration<any>> = new Map();
  private parent?: DIContainer;
  private env?: Env;
  
  /**
   * Create a new dependency injection container
   * 
   * @param env Optional environment variables
   * @param parent Optional parent container for hierarchical DI
   */
  constructor(env?: Env, parent?: DIContainer) {
    this.parent = parent;
    this.env = env;
  }
  
  /**
   * Register a service implementation for a given interface
   * 
   * @param serviceType The service type identifier
   * @param implementation The concrete implementation
   * @param singleton Whether this service should be treated as a singleton (default: true)
   */
  register<T>(serviceType: string, implementation: T, singleton: boolean = true): void {
    this.registrations.set(serviceType, {
      instance: implementation,
      singleton: singleton
    });
  }
  
  /**
   * Register a factory function for creating a service implementation
   * 
   * @param serviceType The service type identifier
   * @param factory Factory function that will create the implementation
   * @param singleton Whether this service should be treated as a singleton (default: true)
   */
  registerFactory<T>(serviceType: string, factory: () => T, singleton: boolean = true): void {
    this.registrations.set(serviceType, {
      factory: factory,
      singleton: singleton
    });
  }
  
  /**
   * Get an instance of a registered service by its type
   * 
   * @param serviceType The service type identifier
   * @returns An instance of the requested service
   * @throws Error if the service is not registered
   */
  resolve<T>(serviceType: string): T {
    // Check if we have this service registered
    const registration = this.registrations.get(serviceType);
    
    if (registration) {
      // If it's a singleton and we already have an instance, return it
      if (registration.singleton && registration.instance) {
        return registration.instance as T;
      }
      
      // If we have a factory, create an instance
      if (registration.factory) {
        const instance = registration.factory() as T;
        
        // Store the instance if it's a singleton
        if (registration.singleton) {
          registration.instance = instance;
        }
        
        return instance;
      }
      
      // Otherwise, return the instance (which should exist if there's no factory)
      if (registration.instance) {
        return registration.instance as T;
      }
    }
    
    // If not found locally, check parent container
    if (this.parent && this.parent.isRegistered(serviceType)) {
      return this.parent.resolve<T>(serviceType);
    }
    
    // If we get here, the service isn't registered
    throw new Error(`Service ${serviceType} is not registered in the container`);
  }
  
  /**
   * Check if a service type is registered
   * 
   * @param serviceType The service type identifier
   * @returns True if the service is registered
   */
  isRegistered(serviceType: string): boolean {
    // Check local registrations first
    if (this.registrations.has(serviceType)) {
      return true;
    }
    
    // Then check parent, if it exists
    if (this.parent) {
      return this.parent.isRegistered(serviceType);
    }
    
    return false;
  }
  
  /**
   * Create the standard service container interface from the DI container
   * 
   * @returns A ServiceContainer instance with all standard services
   */
  createServiceContainer(): ServiceContainer {
    try {
      // Resolve all the standard services
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const storageService = this.resolve<any>(ServiceTypes.STORAGE_SERVICE);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const transformationService = this.resolve<any>(ServiceTypes.TRANSFORMATION_SERVICE);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cacheService = this.resolve<any>(ServiceTypes.CACHE_SERVICE);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const debugService = this.resolve<any>(ServiceTypes.DEBUG_SERVICE);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const clientDetectionService = this.resolve<any>(ServiceTypes.CLIENT_DETECTION_SERVICE);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const configurationService = this.resolve<any>(ServiceTypes.CONFIGURATION_SERVICE);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const loggingService = this.resolve<any>(ServiceTypes.LOGGING_SERVICE);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const authService = this.resolve<any>(ServiceTypes.AUTH_SERVICE);
      
      // Get a logger for the container
      const logger = loggingService.getLogger('ServiceContainer');
      
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
        logger,
        
        // Add service resolution methods
        resolve: <T>(serviceType: string): T => this.resolve<T>(serviceType),
        registerFactory: <T>(serviceType: string, factory: () => T, singleton?: boolean): void => {
          this.registerFactory(serviceType, factory, singleton);
        },
        
        // Add lifecycle management methods
        async initialize(): Promise<void> {
          logger.debug('Initializing service container lifecycle');
          
          // Initialize services in dependency order
          if ('initialize' in configurationService && typeof configurationService.initialize === 'function') {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (configurationService as any).initialize();
          }
          
          // Initialize other services that support lifecycle
          if ('initialize' in loggingService && typeof loggingService.initialize === 'function') {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (loggingService as any).initialize();
          }
          
          // Initialize configuration API services early in the lifecycle
          if (container.configStore && 'initialize' in container.configStore) {
            try {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              await (container.configStore as any).initialize();
              logger.debug('ConfigStore initialized successfully');
            } catch (error) {
              logger.error('Failed to initialize ConfigStore', {
                error: error instanceof Error ? error.message : String(error)
              });
            }
          }
          
          if (container.configApiService && 'initialize' in container.configApiService) {
            try {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              await (container.configApiService as any).initialize();
              logger.debug('ConfigApiService initialized successfully');
            } catch (error) {
              logger.error('Failed to initialize ConfigApiService', {
                error: error instanceof Error ? error.message : String(error)
              });
            }
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
          
          logger.info('Service container lifecycle initialization complete');
        },
        
        async shutdown(): Promise<void> {
          logger.debug('Shutting down service container lifecycle');
          
          // Shut down services in reverse dependency order
          if ('shutdown' in transformationService && typeof transformationService.shutdown === 'function') {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (transformationService as any).shutdown();
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
          
          // Shut down configuration API services before main configuration
          if (container.configApiService && 'shutdown' in container.configApiService) {
            try {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              await (container.configApiService as any).shutdown();
              logger.debug('ConfigApiService shutdown successfully');
            } catch (error) {
              logger.error('Failed to shutdown ConfigApiService', {
                error: error instanceof Error ? error.message : String(error)
              });
            }
          }
          
          if (container.configStore && 'shutdown' in container.configStore) {
            try {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              await (container.configStore as any).shutdown();
              logger.debug('ConfigStore shutdown successfully');
            } catch (error) {
              logger.error('Failed to shutdown ConfigStore', {
                error: error instanceof Error ? error.message : String(error)
              });
            }
          }
          
          // Shut down configuration service last
          if ('shutdown' in configurationService && typeof configurationService.shutdown === 'function') {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await (configurationService as any).shutdown();
          }
          
          logger.info('Service container lifecycle shutdown complete');
        }
      };
      
      // Add the detector service if it's registered
      if (this.isRegistered(ServiceTypes.DETECTOR_SERVICE)) {
        try {
          container.detectorService = this.resolve<ClientDetectionService>(ServiceTypes.DETECTOR_SERVICE);
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (e) {
          logger.warn('Failed to resolve DetectorService, continuing without it', {
            error: e instanceof Error ? e.message : String(e)
          });
        }
      }
      
      // Add the path service if it's registered
      if (this.isRegistered(ServiceTypes.PATH_SERVICE)) {
        try {
          container.pathService = this.resolve<PathService>(ServiceTypes.PATH_SERVICE);
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (e) {
          logger.warn('Failed to resolve PathService, continuing without it', {
            error: e instanceof Error ? e.message : String(e)
          });
        }
      }
      
      // Add the parameter handler service if it's registered
      if (this.isRegistered(ServiceTypes.PARAMETER_HANDLER_SERVICE)) {
        try {
          container.parameterHandler = this.resolve<ParameterHandlerService>(ServiceTypes.PARAMETER_HANDLER_SERVICE);
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (e) {
          logger.warn('Failed to resolve ParameterHandlerService, continuing without it', {
            error: e instanceof Error ? e.message : String(e)
          });
        }
      }
      
      // Add the config store service if it's registered
      if (this.isRegistered(ServiceTypes.CONFIG_STORE)) {
        try {
          container.configStore = this.resolve<ConfigStoreInterface>(ServiceTypes.CONFIG_STORE);
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (e) {
          logger.warn('Failed to resolve ConfigStore, continuing without it', {
            error: e instanceof Error ? e.message : String(e)
          });
        }
      }
      
      // Add the config API service if it's registered
      if (this.isRegistered(ServiceTypes.CONFIG_API_SERVICE)) {
        try {
          container.configApiService = this.resolve<ConfigurationApiService>(ServiceTypes.CONFIG_API_SERVICE);
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (e) {
          logger.warn('Failed to resolve ConfigApiService, continuing without it', {
            error: e instanceof Error ? e.message : String(e)
          });
        }
      }
      
      return container;
    } catch (error) {
      // If any service is missing, throw an error
      throw new Error(`Failed to create service container: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  /**
   * Create a child container that inherits registrations from the parent
   * 
   * @returns A new DIContainer instance
   */
  createChildContainer(): DIContainer {
    return new DefaultDIContainer(this.env, this);
  }
  
  /**
   * Get access to the Cloudflare environment
   * 
   * @returns The environment variables, if available
   */
  getEnvironment(): Env | undefined {
    return this.env;
  }
}

/**
 * Service registration constants for standard services
 */
export const ServiceTypes = {
  STORAGE_SERVICE: 'StorageService',
  TRANSFORMATION_SERVICE: 'TransformationService',
  CACHE_SERVICE: 'CacheService',
  DEBUG_SERVICE: 'DebugService',
  CLIENT_DETECTION_SERVICE: 'ClientDetectionService',
  CONFIGURATION_SERVICE: 'ConfigurationService',
  LOGGING_SERVICE: 'LoggingService',
  AUTH_SERVICE: 'AuthService',
  PATH_SERVICE: 'PathService',
  DETECTOR_SERVICE: 'DetectorService',
  PARAMETER_HANDLER_SERVICE: 'ParameterHandlerService',
  // Configuration API services
  CONFIG_STORE: 'ConfigStore',
  CONFIG_API_SERVICE: 'ConfigApiService'
};

/**
 * Create a container builder function that registers all standard services
 * 
 * @param env Cloudflare environment variables
 * @returns A configured DI container
 */
export function createContainerBuilder(
  env: Env, 
  options?: { 
    useKVConfig?: boolean 
  }
): DIContainer {
  // Create a new container
  const container = new DefaultDIContainer(env);
  
  // Define a bootstrap config for initial services
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const bootstrapConfig: any = { 
    environment: 'development',
    debug: { enabled: true },
    cache: {},
    responsive: {},
    storage: {},
    features: {},
    version: '1.0.0',
    logging: { 
      level: 'INFO',
      includeTimestamp: true,
      enableStructuredLogs: false,
      enableBreadcrumbs: true
    },
    performance: { 
      optimizedLogging: true,
      optimizedClientDetection: true
    },
    derivatives: {},
    pathTemplates: {}
  };
  
  // Temporary logger for bootstrapping
  const tempLogger = createLogger(bootstrapConfig, 'Bootstrap', true);
  
  // Register KV Config API service first (needed by the CachedKVConfigurationService)
  container.registerFactory(ServiceTypes.CONFIG_API_SERVICE, () => {
    // Check if KV config is available
    if (env.IMAGE_CONFIGURATION_STORE || env.IMAGE_CONFIGURATION_STORE_DEV) {
      const kvNamespace = env.IMAGE_CONFIGURATION_STORE || env.IMAGE_CONFIGURATION_STORE_DEV;
      if (!kvNamespace) {
        throw new Error('No KV namespace available for configuration');
      }
      
      const kvStore = new KVConfigStore(
        kvNamespace,
        tempLogger
      );
      
      return new DefaultConfigurationApiService(kvStore, env as unknown as Record<string, string>, tempLogger);
    } else {
      throw new Error('KV Config store not available');
    }
  });
  
  // Register configuration service
  container.registerFactory(ServiceTypes.CONFIGURATION_SERVICE, () => {
    // Check if we should use KV-based config
    const useKVConfig = options?.useKVConfig || (env as Record<string, any>)['USE_KV_CONFIG'] === 'true' || env.IMAGE_CONFIGURATION_STORE !== undefined;
    
    if (useKVConfig) {
      tempLogger.info('Using KV-based configuration service with caching');
      try {
        // Check if we can get the Config API service
        if (container.isRegistered(ServiceTypes.CONFIG_API_SERVICE)) {
          try {
            // Get the Config API service
            const configApiService = container.resolve<ConfigurationApiService>(ServiceTypes.CONFIG_API_SERVICE);
            
            // Create the cached KV configuration service
            return new CachedKVConfigurationService(
              configApiService,
              tempLogger,
              env,
              { refreshIntervalMs: 30000 } // Check for updates every 30 seconds
            );
          } catch (error) {
            tempLogger.error('Failed to create CachedKVConfigurationService', {
              error: error instanceof Error ? error.message : String(error)
            });
          }
        } else {
          tempLogger.warn('Config API service not registered, falling back to direct KV access');
          
          // Try to create config store directly
          if (env.IMAGE_CONFIGURATION_STORE || env.IMAGE_CONFIGURATION_STORE_DEV) {
            // Ensure KV namespace is defined
            const kvNamespace = env.IMAGE_CONFIGURATION_STORE || env.IMAGE_CONFIGURATION_STORE_DEV;
            if (!kvNamespace) {
              throw new Error('No KV namespace available for configuration');
            }
            
            const kvStore = new KVConfigStore(
              kvNamespace,
              tempLogger
            );
            return new KVConfigurationService(kvStore, tempLogger, env);
          }
        }
      } catch (error) {
        tempLogger.error('Failed to create KV configuration service, using default', {
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
    
    // Default configuration service
    return new DefaultConfigurationService(tempLogger, env);
  });
  
  // Register logging service with dependency on configuration
  container.registerFactory(ServiceTypes.LOGGING_SERVICE, () => {
    const configService = container.resolve<DefaultConfigurationService>(ServiceTypes.CONFIGURATION_SERVICE);
    const config = configService.getConfig();
    return new DefaultLoggingService(config);
  });
  
  // Register other services with dependencies
  container.registerFactory(ServiceTypes.CACHE_SERVICE, () => {
    const configService = container.resolve<DefaultConfigurationService>(ServiceTypes.CONFIGURATION_SERVICE);
    const loggingService = container.resolve<DefaultLoggingService>(ServiceTypes.LOGGING_SERVICE);
    const config = configService.getConfig();
    const logger = loggingService.getLogger('CacheService');
    return createCacheService(config, logger, configService);
  });
  
  container.registerFactory(ServiceTypes.DEBUG_SERVICE, () => {
    const loggingService = container.resolve<DefaultLoggingService>(ServiceTypes.LOGGING_SERVICE);
    // Resolve cacheService to ensure it's initialized properly
    container.resolve<CacheService>(ServiceTypes.CACHE_SERVICE);
    const logger = loggingService.getLogger('DebugService');
    
    // We need to create a CacheTagsManager instance directly
    // since we can't access the private tagsManager property from DefaultCacheService
    const configService = container.resolve<ConfigurationService>(ServiceTypes.CONFIGURATION_SERVICE);
    const cacheTagsManager = new CacheTagsManager(logger, configService);
    
    return new DefaultDebugService(logger, cacheTagsManager);
  });
  
  container.registerFactory(ServiceTypes.STORAGE_SERVICE, () => {
    const configService = container.resolve<DefaultConfigurationService>(ServiceTypes.CONFIGURATION_SERVICE);
    const loggingService = container.resolve<DefaultLoggingService>(ServiceTypes.LOGGING_SERVICE);
    const authService = container.resolve<AuthServiceImpl>(ServiceTypes.AUTH_SERVICE);
    const config = configService.getConfig();
    const logger = loggingService.getLogger('StorageService');
    return createStorageService(config, logger, configService, authService);
  });
  
  // Register CLIENT_DETECTION_SERVICE
  container.registerFactory(ServiceTypes.CLIENT_DETECTION_SERVICE, () => {
    const configService = container.resolve<DefaultConfigurationService>(ServiceTypes.CONFIGURATION_SERVICE);
    const loggingService = container.resolve<DefaultLoggingService>(ServiceTypes.LOGGING_SERVICE);
    const config = configService.getConfig();
    const logger = loggingService.getLogger('ClientDetectionService');
    
    try {
      // Try to create using the old factory
      // Import dynamically to avoid require statement
      import('./clientDetectionFactory').then(clientDetectionFactory => {
        if (clientDetectionFactory && clientDetectionFactory.createClientDetectionService) {
          return clientDetectionFactory.createClientDetectionService(config, logger);
        }
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      }).catch(() => null);
      
      // Continue with fallback in case the import fails
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e) {
      logger.debug('Old client detection factory not available, using detector service');
    }
    
    // Fall back to the new detector service
    return createDetectorService(config, logger);
  });
  
  // Register DETECTOR_SERVICE - this is the new service
  container.registerFactory(ServiceTypes.DETECTOR_SERVICE, () => {
    const configService = container.resolve<DefaultConfigurationService>(ServiceTypes.CONFIGURATION_SERVICE);
    const loggingService = container.resolve<DefaultLoggingService>(ServiceTypes.LOGGING_SERVICE);
    const config = configService.getConfig();
    const logger = loggingService.getLogger('DetectorService');
    return createDetectorService(config, logger);
  });
  
  // Register PATH_SERVICE
  container.registerFactory(ServiceTypes.PATH_SERVICE, () => {
    const configService = container.resolve<DefaultConfigurationService>(ServiceTypes.CONFIGURATION_SERVICE);
    const loggingService = container.resolve<DefaultLoggingService>(ServiceTypes.LOGGING_SERVICE);
    const config = configService.getConfig();
    const logger = loggingService.getLogger('PathService');
    return createPathService(logger, config);
  });
  
  container.registerFactory(ServiceTypes.TRANSFORMATION_SERVICE, () => {
    const configService = container.resolve<DefaultConfigurationService>(ServiceTypes.CONFIGURATION_SERVICE);
    const loggingService = container.resolve<DefaultLoggingService>(ServiceTypes.LOGGING_SERVICE);
    const cacheService = container.resolve<DefaultCacheService>(ServiceTypes.CACHE_SERVICE);
    const clientDetectionService = container.resolve<DefaultClientDetectionService>(ServiceTypes.CLIENT_DETECTION_SERVICE);
    
    const logger = loggingService.getLogger('TransformationService');
    
    // Create the transformation service
    const service = new DefaultImageTransformationService(
      logger,
      clientDetectionService,
      configService,
      cacheService
    );
    
    return service;
  });

  // Register AuthService
  container.registerFactory(ServiceTypes.AUTH_SERVICE, () => {
    const configService = container.resolve<DefaultConfigurationService>(ServiceTypes.CONFIGURATION_SERVICE);
    const loggingService = container.resolve<DefaultLoggingService>(ServiceTypes.LOGGING_SERVICE);
    const config = configService.getConfig();
    const logger = loggingService.getLogger('AuthService');
    
    return createAuthService(config, logger);
  });
  
  // Register ParameterHandlerService
  container.registerFactory(ServiceTypes.PARAMETER_HANDLER_SERVICE, () => {
    const loggingService = container.resolve<DefaultLoggingService>(ServiceTypes.LOGGING_SERVICE);
    const logger = loggingService.getLogger('ParameterHandler');
    
    return createParameterHandler(logger);
  });
  
  // Register ConfigStore
  container.registerFactory(ServiceTypes.CONFIG_STORE, () => {
    const loggingService = container.resolve<DefaultLoggingService>(ServiceTypes.LOGGING_SERVICE);
    const logger = loggingService.getLogger('KVConfigStore');
    
    // Check for the appropriate KV binding based on environment
    let configStore: KVNamespace | undefined;
    
    // Check if we're in development mode
    if (env.ENVIRONMENT === 'development' && env.IMAGE_CONFIGURATION_STORE_DEV) {
      configStore = env.IMAGE_CONFIGURATION_STORE_DEV;
      logger.debug('Using development configuration store binding: IMAGE_CONFIGURATION_STORE_DEV');
    }
    // Otherwise, use the production binding
    else if (env.IMAGE_CONFIGURATION_STORE) {
      configStore = env.IMAGE_CONFIGURATION_STORE;
      logger.debug('Using production configuration store binding: IMAGE_CONFIGURATION_STORE');
    }
    // Legacy fallback for backward compatibility
    else if (env.CONFIG_STORE) {
      configStore = env.CONFIG_STORE;
      logger.warn('Using deprecated CONFIG_STORE binding - please update to IMAGE_CONFIGURATION_STORE');
    }
    
    // If no store is available, create an in-memory fallback for local development
    if (!configStore) {
      if (env.ENVIRONMENT === 'development') {
        logger.warn('Configuration store KV binding is not available, using in-memory fallback for development');
        // Create a simple in-memory KV namespace implementation
        configStore = {
          get: async (key: string) => {
            logger.debug(`In-memory ConfigStore GET ${key}`);
            return null; // Always return null - this is just for testing the API endpoint
          },
          put: async (key: string, value: string) => {
            logger.debug(`In-memory ConfigStore PUT ${key}: ${value.substring(0, 50)}...`);
            return undefined;
          },
          list: async () => {
            logger.debug('In-memory ConfigStore LIST keys');
            return { keys: [] };
          }
        } as unknown as KVNamespace;
      } else {
        // Only throw error in production environments
        logger.error('Configuration store KV binding is not available in the environment');
        throw new Error('Configuration store KV binding (IMAGE_CONFIGURATION_STORE or IMAGE_CONFIGURATION_STORE_DEV) is required for the configuration API');
      }
    }
    
    return new KVConfigStore(configStore, logger);
  });
  
  // Register ConfigApiService
  container.registerFactory(ServiceTypes.CONFIG_API_SERVICE, () => {
    const loggingService = container.resolve<DefaultLoggingService>(ServiceTypes.LOGGING_SERVICE);
    const configStore = container.resolve<ConfigStoreInterface>(ServiceTypes.CONFIG_STORE);
    const logger = loggingService.getLogger('ConfigApiService');
    
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
    
    return new DefaultConfigurationApiService(configStore, envVars, logger);
  });
  
  return container;
}