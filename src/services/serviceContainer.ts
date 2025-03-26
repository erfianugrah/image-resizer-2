/**
 * Service container factory for creating and managing services
 */

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
import { createAuthService } from './authServiceFactory';

/**
 * Create a service container with all required services
 * 
 * @param env Environment variables from Cloudflare
 * @param initializeLifecycle Whether to initialize service lifecycle
 * @returns Service container with all services
 */
export function createServiceContainer(env: Env, initializeLifecycle = false): ServiceContainer {
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

  // Create the auth service
  const authService: AuthService = createAuthService(config, authLogger);

  // Create service instances
  const storageService: StorageService = new DefaultStorageService(storageLogger, configurationService, authService);
  const cacheService: CacheService = new DefaultCacheService(cacheLogger, configurationService);
  const debugService: DebugService = new DefaultDebugService(debugLogger);
  
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
    logger: mainLogger,
    
    // Add lifecycle management methods
    async initialize(): Promise<void> {
      mainLogger.debug('Initializing service container lifecycle');
      
      // Initialize services in dependency order
      await configurationService.initialize();
      
      // Initialize other services that support lifecycle
      if ('initialize' in loggingService && typeof loggingService.initialize === 'function') {
        await (loggingService as any).initialize();
      }
      
      if ('initialize' in authService && typeof authService.initialize === 'function') {
        await (authService as any).initialize();
      }
      
      if ('initialize' in storageService && typeof storageService.initialize === 'function') {
        await (storageService as any).initialize();
      }
      
      if ('initialize' in cacheService && typeof cacheService.initialize === 'function') {
        await (cacheService as any).initialize();
      }
      
      if ('initialize' in clientDetectionService && typeof clientDetectionService.initialize === 'function') {
        await (clientDetectionService as any).initialize();
      }
      
      if ('initialize' in debugService && typeof debugService.initialize === 'function') {
        await (debugService as any).initialize();
      }
      
      if ('initialize' in transformationService && typeof transformationService.initialize === 'function') {
        await (transformationService as any).initialize();
      }
      
      mainLogger.info('Service container lifecycle initialization complete');
    },
    
    async shutdown(): Promise<void> {
      mainLogger.debug('Shutting down service container lifecycle');
      
      // Shut down services in reverse dependency order
      if ('shutdown' in transformationService && typeof transformationService.shutdown === 'function') {
        await (transformationService as any).shutdown();
      }
      
      if ('shutdown' in debugService && typeof debugService.shutdown === 'function') {
        await (debugService as any).shutdown();
      }
      
      if ('shutdown' in clientDetectionService && typeof clientDetectionService.shutdown === 'function') {
        await (clientDetectionService as any).shutdown();
      }
      
      if ('shutdown' in cacheService && typeof cacheService.shutdown === 'function') {
        await (cacheService as any).shutdown();
      }
      
      if ('shutdown' in storageService && typeof storageService.shutdown === 'function') {
        await (storageService as any).shutdown();
      }
      
      if ('shutdown' in authService && typeof authService.shutdown === 'function') {
        await (authService as any).shutdown();
      }
      
      if ('shutdown' in loggingService && typeof loggingService.shutdown === 'function') {
        await (loggingService as any).shutdown();
      }
      
      // Shut down configuration service last
      await configurationService.shutdown();
      
      mainLogger.info('Service container lifecycle shutdown complete');
    }
  };

  mainLogger.info('Service container initialized with all services', {
    serviceCount: 8,
    services: 'configuration, logging, storage, transformation, cache, debug, clientDetection, auth',
    environment: config.environment
  });

  // Initialize service lifecycle if requested
  if (initializeLifecycle) {
    // Use void to ignore the promise - the caller can await the initialize method if needed
    void container.initialize();
  }

  return container;
}