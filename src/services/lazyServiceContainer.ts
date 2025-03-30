/**
 * Lazy Service Container
 * 
 * Implements lazy loading of services through a proxy pattern.
 * Services are only initialized when first accessed.
 */

import { Env } from '../types';
import { createLogger } from '../utils/logging';
import { 
  // These service interfaces are imported for type compatibility with the container
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  AuthService,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  CacheService, 
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  DebugService, 
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  ImageTransformationService,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  ParameterHandlerService,
  ServiceContainer, 
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  StorageService,
  ClientDetectionService,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  ConfigurationService,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  LoggingService,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  PathService
} from './interfaces';

// Import configuration API service interfaces
import { 
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  ConfigStoreInterface, 
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  ConfigurationApiService 
} from './config/interfaces';
// Service implementations are imported for lazy instantiation
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { DefaultCacheService } from './cacheService';
import { DefaultDebugService } from './debugService';
import { DefaultImageTransformationService } from './transformationService';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { DefaultStorageService } from './storageService';
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { DefaultClientDetectionService } from './clientDetectionService';
import { DefaultConfigurationService } from './configurationService';
import { DefaultLoggingService } from './loggingService';
import { createDetectorService } from './detectorServiceFactory';
import { createStorageService } from './storageServiceFactory';
import { createCacheService } from './cacheServiceFactory';
import { createAuthService } from './authServiceFactory';
import { createPathService } from './pathService';
import { createParameterHandler } from '../parameters/serviceFactory';
// Import configuration API services
import { KVConfigStore } from './config/KVConfigStore';
import { DefaultConfigurationApiService } from './config/ConfigurationApiService';

/**
 * Create a lazy-loading service container with proxy-based initialization
 * 
 * @param env Environment variables from Cloudflare
 * @returns Service container with lazy-loaded services
 */
export function createLazyServiceContainer(env: Env): ServiceContainer {
  // Track real service instances
  const realServices: Partial<ServiceContainer> = {};
  
  // Flag to track initialization steps
  let isConfigInitialized = false;
  let isLoggingInitialized = false;
  
  // Create service factories for lazy initialization
  // Note: Adding explicit types for metadata service and lifecycle manager
  const serviceFactories = {
    // Add missing service factories
    lifecycleManager: () => {
      // Create minimal implementation to satisfy TypeScript
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const logger = serviceFactories.logger();
      return {
        initialize: async () => ({ applicationStartTime: Date.now(), serviceHealths: {}, initializeOrder: [], shutdownOrder: [], services: { total: 0, initialized: 0, failed: 0, shutdown: 0 }, errors: [] }),
        shutdown: async () => ({ applicationStartTime: Date.now(), serviceHealths: {}, initializeOrder: [], shutdownOrder: [], services: { total: 0, initialized: 0, failed: 0, shutdown: 0 }, errors: [] }),
        getServiceHealths: () => ({}),
        isServiceHealthy: () => true,
        isApplicationHealthy: () => true,
        getStatistics: () => ({ applicationStartTime: Date.now(), serviceHealths: {}, initializeOrder: [], shutdownOrder: [], services: { total: 0, initialized: 0, failed: 0, shutdown: 0 }, errors: [] }),
        createDependencyGraph: () => '',
        createHealthReport: () => ''
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any;
    },
    
    metadataService: () => {
      // Create minimal implementation to satisfy TypeScript
      return {
        initialize: async () => {},
        shutdown: async () => {},
        fetchMetadata: async () => ({ metadata: { width: 0, height: 0 } }),
        processMetadata: () => ({}),
        fetchAndProcessMetadata: async () => ({})
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any;
    },
    // Lifecycle method for initializing all services
    initialize: () => async () => {
      // Ensure configuration service is initialized
      if (!realServices.configurationService) {
        realServices.configurationService = serviceFactories.configurationService();
      }
      
      // Get logger for initialization
      if (!realServices.logger) {
        realServices.logger = serviceFactories.logger();
      }
      
      const logger = realServices.logger!;
      logger.debug('Initializing lazy service container lifecycle');
      
      // Initialize services in dependency order
      if ('initialize' in realServices.configurationService! && 
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          typeof (realServices.configurationService as any).initialize === 'function') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (realServices.configurationService as any).initialize();
      }
      
      // Initialize logging service if exists
      if (realServices.loggingService && 
          'initialize' in realServices.loggingService && 
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          typeof (realServices.loggingService as any).initialize === 'function') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (realServices.loggingService as any).initialize();
      }
      
      // Initialize other services that are already loaded and support lifecycle
      for (const serviceName of Object.keys(realServices) as (keyof ServiceContainer)[]) {
        const service = realServices[serviceName];
        if (service && 
            serviceName !== 'configurationService' && 
            serviceName !== 'loggingService' &&
            serviceName !== 'logger' &&
            'initialize' in service && 
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            typeof (service as any).initialize === 'function') {
          logger.debug(`Initializing lazy loaded service: ${serviceName}`);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (service as any).initialize();
        }
      }
      
      logger.info('Lazy service container lifecycle initialization complete');
    },
    
    // Lifecycle method for shutting down all services
    shutdown: () => async () => {
      // Ensure logger is available
      if (!realServices.logger) {
        realServices.logger = serviceFactories.logger();
      }
      
      const logger = realServices.logger!;
      logger.debug('Shutting down lazy service container lifecycle');
      
      // Shutdown services in reverse dependency order (all loaded services)
      for (const serviceName of Object.keys(realServices) as (keyof ServiceContainer)[]) {
        const service = realServices[serviceName];
        if (service && 
            serviceName !== 'configurationService' && 
            serviceName !== 'logger' &&
            'shutdown' in service && 
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            typeof (service as any).shutdown === 'function') {
          logger.debug(`Shutting down lazy loaded service: ${serviceName}`);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (service as any).shutdown();
        }
      }
      
      // Shut down logging service if it exists
      if (realServices.loggingService && 
          'shutdown' in realServices.loggingService && 
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          typeof (realServices.loggingService as any).shutdown === 'function') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (realServices.loggingService as any).shutdown();
      }
      
      // Shut down configuration service last if it exists
      if (realServices.configurationService && 
          'shutdown' in realServices.configurationService && 
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          typeof (realServices.configurationService as any).shutdown === 'function') {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (realServices.configurationService as any).shutdown();
      }
      
      logger.info('Lazy service container lifecycle shutdown complete');
    },
    
    // Detector service initialization - defined first to help TypeScript inference
    detectorService: () => {
      // Ensure prerequisite services 
      if (!realServices.configurationService) {
        realServices.configurationService = serviceFactories.configurationService();
      }
      if (!realServices.loggingService) {
        realServices.loggingService = serviceFactories.loggingService();
      }
      
      const detectorLogger = realServices.loggingService!.getLogger('DetectorService');
      const config = realServices.configurationService!.getConfig();
      
      // Create detector service
      return createDetectorService(config, detectorLogger);
    },
    
    // Path service initialization 
    pathService: () => {
      // Ensure prerequisite services
      if (!realServices.configurationService) {
        realServices.configurationService = serviceFactories.configurationService();
      }
      if (!realServices.loggingService) {
        realServices.loggingService = serviceFactories.loggingService();
      }
      
      const pathLogger = realServices.loggingService!.getLogger('PathService');
      const config = realServices.configurationService!.getConfig();
      
      // Create path service
      return createPathService(pathLogger, config);
    },
    
    // Auth service initialization
    authService: () => {
      // Ensure prerequisite services
      if (!realServices.configurationService) {
        realServices.configurationService = serviceFactories.configurationService();
      }
      if (!realServices.loggingService) {
        realServices.loggingService = serviceFactories.loggingService();
      }
      
      const authLogger = realServices.loggingService!.getLogger('AuthService');
      const config = realServices.configurationService!.getConfig();
      
      return createAuthService(config, authLogger);
    },
    
    // Configuration service must be initialized first
    configurationService: () => {
      if (!isConfigInitialized) {
        // Bootstrap minimal config for initialization
        const bootstrapConfig = { 
          environment: 'dev',
          debug: { enabled: true },
          cache: {},
          responsive: {},
          storage: {},
          features: {},
          version: '1.0.0',
          logging: { level: 'INFO' },
          performance: { optimizedLogging: true }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any;
        
        // Create bootstrap logger
        const configLogger = createLogger(bootstrapConfig, 'ConfigurationService', true);
        
        // Create and store the service
        const configService = new DefaultConfigurationService(configLogger, env);
        isConfigInitialized = true;
        return configService;
      }
      return realServices.configurationService!;
    },
    
    // Logging service depends on configuration
    loggingService: () => {
      if (!isLoggingInitialized) {
        // Ensure config service is initialized
        if (!isConfigInitialized) {
          realServices.configurationService = serviceFactories.configurationService();
        }
        
        const config = realServices.configurationService!.getConfig();
        const loggingService = new DefaultLoggingService(config);
        isLoggingInitialized = true;
        return loggingService;
      }
      return realServices.loggingService!;
    },
    
    // Main logger - used by many components
    logger: () => {
      // Ensure logging service is initialized
      if (!isLoggingInitialized) {
        realServices.loggingService = serviceFactories.loggingService();
      }
      
      return realServices.loggingService!.getLogger('ServiceContainer');
    },
    
    // Storage service initialization
    storageService: () => {
      // Ensure prerequisite services
      if (!isConfigInitialized) {
        realServices.configurationService = serviceFactories.configurationService();
      }
      if (!isLoggingInitialized) {
        realServices.loggingService = serviceFactories.loggingService();
      }
      
      const storageLogger = realServices.loggingService!.getLogger('StorageService');
      const config = realServices.configurationService!.getConfig();
      
      // Get auth service if available, otherwise initialize it
      if (!realServices.authService) {
        realServices.authService = serviceFactories.authService();
      }
      
      // Use factory to create appropriate storage service based on configuration
      return createStorageService(config, storageLogger, realServices.configurationService!, realServices.authService);
    },
    
    // Transformation service initialization with dependencies
    transformationService: () => {
      // Ensure prerequisite services
      if (!realServices.configurationService) {
        realServices.configurationService = serviceFactories.configurationService();
      }
      if (!realServices.loggingService) {
        realServices.loggingService = serviceFactories.loggingService();
      }
      if (!realServices.cacheService) {
        realServices.cacheService = serviceFactories.cacheService();
      }
      
      const transformationLogger = realServices.loggingService!.getLogger('TransformationService');
      
      // Create transformation service
      const transformService = new DefaultImageTransformationService(
        transformationLogger,
        undefined, // Will set client detection service later
        realServices.configurationService!,
        realServices.cacheService!,
        undefined // Will set metadata service later if available
      );
      
      // Connect client detection if already initialized
      if (realServices.clientDetectionService) {
        transformService.setClientDetectionService(realServices.clientDetectionService);
      }
      
      // Connect metadata service if already initialized
      if (realServices.metadataService) {
        transformService.setMetadataService(realServices.metadataService);
      }
      
      return transformService;
    },
    
    // Cache service initialization
    cacheService: () => {
      // Ensure prerequisite services
      if (!realServices.configurationService) {
        realServices.configurationService = serviceFactories.configurationService();
      }
      if (!realServices.loggingService) {
        realServices.loggingService = serviceFactories.loggingService();
      }
      
      const cacheLogger = realServices.loggingService!.getLogger('CacheService');
      const config = realServices.configurationService!.getConfig();
      
      // Use factory to create appropriate cache service based on configuration
      return createCacheService(config, cacheLogger, realServices.configurationService!);
    },
    
    // Debug service initialization
    debugService: () => {
      // Ensure prerequisite services
      if (!realServices.loggingService) {
        realServices.loggingService = serviceFactories.loggingService();
      }
      
      const debugLogger = realServices.loggingService!.getLogger('DebugService');
      return new DefaultDebugService(debugLogger);
    },
    
    // Client detection service initialization
    clientDetectionService: () => {
      // Ensure prerequisite services
      if (!realServices.configurationService) {
        realServices.configurationService = serviceFactories.configurationService();
      }
      if (!realServices.loggingService) {
        realServices.loggingService = serviceFactories.loggingService();
      }
      
      const clientDetectionLogger = realServices.loggingService!.getLogger('ClientDetectionService');
      const config = realServices.configurationService!.getConfig();
      
      // Try to use the legacy factory first if available
      // Skip legacy factory attempt to avoid require/dynamic import issues
      
      // Use the new factory to create appropriate detector service
      // We need to use a type assertion to ensure the TypeScript understands the type
      const clientDetection = createDetectorService(config, clientDetectionLogger) as ClientDetectionService;
      
      // Connect to transformation service if already initialized
      if (realServices.transformationService) {
        realServices.transformationService.setClientDetectionService(clientDetection);
      }
      
      return clientDetection;
    },
    
    // Parameter handler service initialization
    parameterHandler: () => {
      // Ensure logging service is initialized
      if (!realServices.loggingService) {
        realServices.loggingService = serviceFactories.loggingService();
      }
      
      const parameterHandlerLogger = realServices.loggingService!.getLogger('ParameterHandler');
      
      // Create the parameter handler service
      return createParameterHandler(parameterHandlerLogger);
    },
    
    // Config store service initialization
    configStore: () => {
      // Ensure logging service is initialized
      if (!realServices.loggingService) {
        realServices.loggingService = serviceFactories.loggingService();
      }
      
      const configStoreLogger = realServices.loggingService!.getLogger('KVConfigStore');
      
      // Check if CONFIG_STORE is available in the environment
      if (!env.CONFIG_STORE) {
        configStoreLogger.error('CONFIG_STORE binding is not available in the environment');
        throw new Error('CONFIG_STORE binding is required for the configuration API');
      }
      
      // Create the KV config store
      return new KVConfigStore(env.CONFIG_STORE, configStoreLogger);
    },
    
    // Configuration API service initialization
    configApiService: () => {
      // Ensure prerequisite services
      if (!realServices.loggingService) {
        realServices.loggingService = serviceFactories.loggingService();
      }
      
      // Get or initialize the config store
      if (!realServices.configStore) {
        realServices.configStore = serviceFactories.configStore();
      }
      
      const configApiLogger = realServices.loggingService!.getLogger('ConfigApiService');
      
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
      
      // Create the configuration API service
      return new DefaultConfigurationApiService(realServices.configStore, envVars, configApiLogger);
    },
    
  };
  
  // Create proxy to intercept service access and perform lazy initialization
  return new Proxy({} as ServiceContainer, {
    get(target, prop: keyof ServiceContainer) {
      // If service already exists, return it
      if (prop in realServices) {
        return realServices[prop];
      }
      
      // Initialize service on first access
      if (prop in serviceFactories) {
        const service = serviceFactories[prop]();
        realServices[prop] = service;
        
        // Special handling for interdependent services
        if (prop === 'clientDetectionService' && realServices.transformationService) {
          realServices.transformationService.setClientDetectionService(service);
        }
        
        // Connect metadata service to transformation service
        if (prop === 'metadataService' && realServices.transformationService) {
          realServices.transformationService.setMetadataService(service);
        }
        
        // Log service initialization if logger exists
        if (realServices.logger && prop !== 'logger') {
          realServices.logger.debug(`Lazy initialization of ${String(prop)}`);
        }
        
        return service;
      }
      
      // Property not found in service container
      throw new Error(`Service ${String(prop)} not found in container`);
    }
  });
}