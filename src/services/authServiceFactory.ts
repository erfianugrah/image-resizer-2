/**
 * Factory for creating AuthService instances
 * 
 * This factory creates properly configured auth service instances
 * based on configuration and environment settings.
 */

import { Logger } from '../utils/logging';
import { AuthService } from './interfaces';
import { AuthServiceImpl } from './authService';
import { ImageResizerConfig } from '../config';

/**
 * Create a properly configured auth service
 * 
 * @param config Application configuration
 * @param logger Logger instance for the service
 * @returns Configured auth service instance
 */
export function createAuthService(config: ImageResizerConfig, logger: Logger): AuthService {
  // Create the auth service
  const authService = new AuthServiceImpl();
  
  // Configure it with the provided logger
  authService.setLogger(logger);
  
  // Log the configuration - report on origins that require authentication
  const originConfig = config.storage.auth || {};
  const origins = originConfig.origins || {};
  const hasOrigins = Object.keys(origins).length > 0;
  const originCount = hasOrigins ? Object.keys(origins).length : 0;
  const enabledOrigins = hasOrigins ? 
    Object.entries(origins).filter(([_, origin]) => origin.enabled !== false).length : 0;
  
  if (enabledOrigins > 0) {
    logger.info('Auth service initialized with domain-specific authentication', {
      securityLevel: config.storage.auth?.securityLevel || 'strict',
      totalOrigins: originCount,
      enabledOrigins: enabledOrigins,
      remoteAuthEnabled: config.storage.remoteAuth?.enabled,
      fallbackAuthEnabled: config.storage.fallbackAuth?.enabled
    });
  } else {
    logger.info('Auth service initialized with no enabled authentication origins');
  }
  
  return authService;
}