/**
 * Configuration System Registration
 * 
 * This module registers the Configuration API services with the dependency injection container,
 * and handles initialization of the configuration system.
 */

import { ServiceContainer } from '../serviceContainer';
import { ServiceTypes } from '../serviceTypes';
import { Env } from '../../types';
import { KVConfigStore } from './KVConfigStore';
import { DefaultConfigurationApiService } from './ConfigurationApiService';
import { ConfigStoreInterface, ConfigurationApiService } from './interfaces';
import { coreModuleRegistration } from './modules/core';
import { cacheModuleRegistration } from './modules/cache';
import { transformModuleRegistration } from './modules/transform';
import { storageModuleRegistration } from './modules/storage';
import { DefaultLoggingService } from '../loggingService';
import { Logger } from '../../utils/logging';

/**
 * Register the Configuration API services with the dependency injection container
 * 
 * @param container The service container
 * @param env Environment variables
 */
export async function registerConfigurationServices(
  container: ServiceContainer,
  env: Env
): Promise<void> {
  const loggingService = container.resolve<DefaultLoggingService>(ServiceTypes.LOGGING_SERVICE);
  const logger = loggingService.getLogger('ConfigurationSystem');
  
  logger.info('Registering Configuration API services');
  
  try {
    // Check if CONFIG_STORE is available
    if (!env.CONFIG_STORE) {
      logger.error('CONFIG_STORE binding is not available in the environment');
      throw new Error('CONFIG_STORE binding is required for the configuration API');
    }
    
    // Register ConfigStore
    container.registerFactory(ServiceTypes.CONFIG_STORE, () => {
      const loggingService = container.resolve<DefaultLoggingService>(ServiceTypes.LOGGING_SERVICE);
      const logger = loggingService.getLogger('KVConfigStore');
      
      // Handle the case where CONFIG_STORE could be undefined
      if (!env.CONFIG_STORE) {
        throw new Error('CONFIG_STORE binding is required for the configuration API');
      }
      return new KVConfigStore(env.CONFIG_STORE, logger);
    });
    
    // Register ConfigApiService
    container.registerFactory(ServiceTypes.CONFIG_API_SERVICE, () => {
      const configStore = container.resolve<ConfigStoreInterface>(ServiceTypes.CONFIG_STORE);
      const loggingService = container.resolve<DefaultLoggingService>(ServiceTypes.LOGGING_SERVICE);
      const logger = loggingService.getLogger('ConfigurationApiService');
      
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
    
    logger.info('Configuration API services registered');
    
    // Initialize the configuration system
    await initializeConfigurationSystem(container, logger);
  } catch (error) {
    logger.error('Error registering Configuration API services', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    
    // Re-throw to signal failure
    throw error;
  }
}

/**
 * Initialize the configuration system by registering core modules
 * 
 * @param container The service container
 * @param logger Logger instance
 */
async function initializeConfigurationSystem(
  container: ServiceContainer,
  logger: Logger
): Promise<void> {
  try {
    const configApiService = container.resolve<ConfigurationApiService>(ServiceTypes.CONFIG_API_SERVICE);
    
    // Check if configuration exists
    const config = await configApiService.getConfig();
    
    if (!config || !config.modules || Object.keys(config.modules).length === 0) {
      logger.warn('No configuration found in KV store. Please run load-initial-config.js to initialize');
      return;
    }
    
    // Register core modules if they don't exist in the configuration
    const modulesToRegister = [
      { name: 'core', registration: coreModuleRegistration },
      { name: 'cache', registration: cacheModuleRegistration },
      { name: 'transform', registration: transformModuleRegistration },
      { name: 'storage', registration: storageModuleRegistration },
    ];
    
    for (const module of modulesToRegister) {
      if (!config.modules[module.name]) {
        logger.info(`Registering module: ${module.name}`);
        await configApiService.registerModule(module.registration);
      }
    }
    
    logger.info('Configuration system initialized', {
      activeModules: config._meta.activeModules,
      moduleCount: Object.keys(config.modules).length
    });
  } catch (error) {
    logger.error('Error initializing configuration system', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    
    // Don't re-throw to allow the system to continue with defaults
  }
}