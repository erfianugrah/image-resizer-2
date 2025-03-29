/**
 * Dependency Injection Container Implementation
 * 
 * Provides a flexible, lightweight dependency injection container
 * to manage service instantiation and dependencies.
 */

import { DIContainer, ServiceContainer, ClientDetectionService, PathService, CacheService, ConfigurationService } from './interfaces';
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
  DETECTOR_SERVICE: 'DetectorService'
};

/**
 * Create a container builder function that registers all standard services
 * 
 * @param env Cloudflare environment variables
 * @returns A configured DI container
 */
export function createContainerBuilder(env: Env): DIContainer {
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
  
  // Register configuration service
  container.registerFactory(ServiceTypes.CONFIGURATION_SERVICE, () => {
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
  
  return container;
}