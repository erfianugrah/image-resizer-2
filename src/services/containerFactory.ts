/**
 * Service Container Factory
 * 
 * Creates service containers using the dependency injection system
 */

import { Env } from '../types';
import { ServiceContainer } from './interfaces';
import { createContainerBuilder } from './dependencyInjectionContainer';
import { createServiceContainer } from './serviceContainer';
import { createLazyServiceContainer } from './lazyServiceContainer';

/**
 * Create a service container using the dependency injection system
 * 
 * @param env Environment variables
 * @param useLazyLoading Whether to use lazy loading for services
 * @returns A service container with all required services
 */
export function createContainerFromDI(env: Env, useLazyLoading: boolean = false): ServiceContainer {
  // Create a container builder and register all services
  const container = createContainerBuilder(env);
  
  // Create a service container from the DI container
  const serviceContainer = container.createServiceContainer();
  
  // Log the container creation (using the container's logger)
  serviceContainer.logger.info('Created service container using dependency injection', {
    useLazyLoading,
    environment: serviceContainer.configurationService.getConfig().environment
  });
  
  return serviceContainer;
}

/**
 * Create a service container with the specified environment
 * 
 * This function determines the appropriate container factory to use
 * based on the configuration.
 * 
 * @param env Environment variables
 * @returns A service container with all required services
 */
export function createContainer(env: Env): ServiceContainer {
  // Use a simple heuristic to decide whether to use the new DI system
  // For now, default to the legacy system to ensure compatibility
  const useDISystem = env.USE_DI_SYSTEM === 'true';
  
  if (useDISystem) {
    return createContainerFromDI(env);
  }
  
  // Use the legacy system - check if lazy loading is enabled
  // We need to peek at the env vars directly since we don't have access to config yet
  const useLazyLoading = env.ENABLE_LAZY_LOADING === 'true';
  
  // Create the appropriate container
  return useLazyLoading
    ? createLazyServiceContainer(env)
    : createServiceContainer(env);
}