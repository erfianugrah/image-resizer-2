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
  // Check if the CONFIG_STORE binding exists
  if (!env.CONFIG_STORE) {
    throw new Error('CONFIG_STORE KV binding is not available');
  }
  
  return new KVConfigStore(env.CONFIG_STORE, logger);
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