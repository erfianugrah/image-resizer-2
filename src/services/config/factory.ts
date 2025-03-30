/**
 * Factory functions for creating configuration services
 */

import { ConfigStoreInterface, ConfigurationApiService } from './interfaces';
import { KVConfigStore } from './KVConfigStore';
import { DefaultConfigurationApiService } from './ConfigurationApiService';
import { Env } from '../../types';
import { Logger } from '../../utils/logging';

/**
 * Create a KV Config Store
 * 
 * @param env Environment variables
 * @param logger Logger instance
 * @returns A ConfigStoreInterface implementation
 */
export function createConfigStore(env: Env, logger?: Logger): ConfigStoreInterface {
  // Check for the appropriate KV binding based on environment
  let configStore: KVNamespace | undefined;
  
  // Check if we're in development mode
  if (env.ENVIRONMENT === 'development' && env.IMAGE_CONFIGURATION_STORE_DEV) {
    configStore = env.IMAGE_CONFIGURATION_STORE_DEV;
  }
  // Otherwise, use the production binding
  else if (env.IMAGE_CONFIGURATION_STORE) {
    configStore = env.IMAGE_CONFIGURATION_STORE;
  }
  
  // If no store is available, throw an error
  if (!configStore) {
    throw new Error('Configuration store KV binding is not available');
  }
  
  return new KVConfigStore(configStore, logger);
}

/**
 * Create a Configuration API Service
 * 
 * @param configStore ConfigStoreInterface implementation
 * @param env Environment variables
 * @param logger Logger instance
 * @returns A ConfigurationApiService implementation
 */
export function createConfigurationApiService(
  configStore: ConfigStoreInterface,
  env?: Record<string, string>,
  logger?: Logger
): ConfigurationApiService {
  return new DefaultConfigurationApiService(configStore, env, logger);
}

/**
 * Create a complete Configuration API System with appropriate dependencies
 * 
 * @param env Environment variables
 * @param logger Logger instance
 * @returns A ConfigurationApiService implementation
 */
export function createConfigurationApiSystem(env: Env, logger?: Logger): ConfigurationApiService {
  const configStore = createConfigStore(env, logger);
  
  // Extract environment variables as a simple record
  const envVars: Record<string, string> = {};
  
  // Add environment variables for resolution in configuration values
  // In a Cloudflare Worker environment, this would typically be
  // from env.ENV_VAR_NAME but we'll make it generic
  for (const key in env) {
    // Only include scalar values, not objects or functions
    // Use hasOwnProperty check to avoid issues with potentially undefined properties
    if (Object.prototype.hasOwnProperty.call(env, key)) {
      const value = env[key as keyof typeof env];
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        envVars[key] = String(value);
      }
    }
  }
  
  return createConfigurationApiService(configStore, envVars, logger);
}