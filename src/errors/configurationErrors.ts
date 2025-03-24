/**
 * Configuration Service specific error types
 */

import { ServiceError, ErrorDetails } from './baseErrors';

/**
 * Base error class for configuration service errors
 */
export class ConfigurationServiceError extends ServiceError {
  constructor(
    message: string, 
    options: {
      code?: string,
      status?: number,
      details?: ErrorDetails,
      retryable?: boolean
    } = {}
  ) {
    super(message, 'ConfigurationService', {
      ...options,
      code: options.code || 'CONFIGURATION_SERVICE_ERROR'
    });
  }
}

/**
 * Error when a required configuration value is missing
 */
export class MissingConfigurationError extends ConfigurationServiceError {
  constructor(message: string, details?: ErrorDetails) {
    super(message, {
      code: 'MISSING_CONFIGURATION',
      status: 500,
      details,
      retryable: false
    });
  }
}

/**
 * Error when a configuration value is invalid
 */
export class InvalidConfigurationError extends ConfigurationServiceError {
  constructor(message: string, details?: ErrorDetails) {
    super(message, {
      code: 'INVALID_CONFIGURATION',
      status: 500,
      details,
      retryable: false
    });
  }
}

/**
 * Error when environment-specific configuration is invalid
 */
export class EnvironmentConfigurationError extends ConfigurationServiceError {
  constructor(message: string, details?: ErrorDetails) {
    super(message, {
      code: 'ENVIRONMENT_CONFIGURATION_ERROR',
      status: 500,
      details,
      retryable: false
    });
  }
}

/**
 * Error when configuration from environment variables is invalid
 */
export class EnvironmentVariableError extends ConfigurationServiceError {
  constructor(message: string, details?: ErrorDetails) {
    super(message, {
      code: 'ENVIRONMENT_VARIABLE_ERROR',
      status: 500,
      details,
      retryable: false
    });
  }
}