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
 * @returns Service container with all services
 */
export function createServiceContainer(env: Env): ServiceContainer {
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

  mainLogger.info('Service container initialized with all services', {
    serviceCount: 8,
    services: 'configuration, logging, storage, transformation, cache, debug, clientDetection, auth',
    environment: config.environment
  });

  // Return the container with all services
  return {
    storageService,
    transformationService,
    cacheService,
    debugService,
    clientDetectionService,
    configurationService,
    loggingService,
    authService,
    logger: mainLogger
  };
}