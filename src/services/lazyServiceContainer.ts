/**
 * Lazy Service Container
 * 
 * Implements lazy loading of services through a proxy pattern.
 * Services are only initialized when first accessed.
 */

import { Env } from '../types';
import { createLogger } from '../utils/logging';
import { 
  CacheService, 
  DebugService, 
  ImageTransformationService, 
  ServiceContainer, 
  StorageService,
  ClientDetectionService,
  ConfigurationService,
  LoggingService
} from './interfaces';
import { DefaultCacheService } from './cacheService';
import { DefaultDebugService } from './debugService';
import { DefaultImageTransformationService } from './transformationService';
import { DefaultStorageService } from './storageService';
import { DefaultClientDetectionService } from './clientDetectionService';
import { DefaultConfigurationService } from './configurationService';
import { DefaultLoggingService } from './loggingService';
import { createClientDetectionService } from './clientDetectionFactory';
import { createStorageService } from './storageServiceFactory';
import { createCacheService } from './cacheServiceFactory';

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
  const serviceFactories: Record<keyof ServiceContainer, () => any> = {
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
      
      // Use factory to create appropriate storage service based on configuration
      return createStorageService(config, storageLogger, realServices.configurationService!);
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
        realServices.cacheService!
      );
      
      // Connect client detection if already initialized
      if (realServices.clientDetectionService) {
        transformService.setClientDetectionService(realServices.clientDetectionService);
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
      
      // Use the factory to create appropriate client detection service
      const clientDetection = createClientDetectionService(config, clientDetectionLogger);
      
      // Connect to transformation service if already initialized
      if (realServices.transformationService) {
        realServices.transformationService.setClientDetectionService(clientDetection);
      }
      
      return clientDetection;
    }
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