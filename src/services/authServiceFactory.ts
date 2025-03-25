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
  
  // Log the configuration
  if (config.storage.auth?.enabled) {
    logger.info('Auth service initialized with authentication enabled', {
      securityLevel: config.storage.auth.securityLevel || 'strict',
      originCount: config.storage.auth.origins ? Object.keys(config.storage.auth.origins).length : 0
    });
  } else {
    logger.info('Auth service initialized with authentication disabled');
  }
  
  return authService;
}