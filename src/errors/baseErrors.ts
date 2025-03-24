/**
 * Base error types for the Image Resizer system
 * 
 * This module contains the base error classes that all service-specific
 * errors will extend from. This provides a consistent error handling
 * approach across the system.
 */

/**
 * Type for error details with structured information
 */
export type ErrorDetails = Record<string, string | number | boolean | null | undefined | string[] | Record<string, string | number | boolean | null | undefined>>;

/**
 * Base application error class
 */
export class AppError extends Error {
  code: string;
  status: number;
  details?: ErrorDetails;
  retryable: boolean;
  serviceId?: string;

  constructor(message: string, options: { 
    code?: string, 
    status?: number, 
    details?: ErrorDetails,
    retryable?: boolean,
    serviceId?: string
  } = {}) {
    super(message);
    this.name = this.constructor.name;
    this.code = options.code || 'INTERNAL_ERROR';
    this.status = options.status || 500;
    this.details = options.details;
    this.retryable = options.retryable || false;
    this.serviceId = options.serviceId;
  }
}

/**
 * Base error class for all service-related errors
 */
export class ServiceError extends AppError {
  constructor(
    message: string, 
    serviceId: string,
    options: {
      code?: string,
      status?: number,
      details?: ErrorDetails,
      retryable?: boolean
    } = {}
  ) {
    super(message, {
      ...options,
      serviceId,
      code: options.code || 'SERVICE_ERROR'
    });
  }
}

/**
 * Validation errors that represent invalid input or parameters
 */
export class ValidationError extends AppError {
  constructor(message: string, details?: ErrorDetails) {
    super(message, {
      code: 'VALIDATION_ERROR',
      status: 400,
      details,
      retryable: false
    });
  }
}

/**
 * NotFound errors that represent resources that could not be located
 */
export class NotFoundError extends AppError {
  constructor(message: string, details?: ErrorDetails) {
    super(message, {
      code: 'NOT_FOUND',
      status: 404,
      details,
      retryable: false
    });
  }
}

/**
 * Network-related errors that might be retryable
 */
export class NetworkError extends AppError {
  constructor(message: string, options: {
    retryable?: boolean,
    details?: ErrorDetails
  } = {}) {
    super(message, {
      code: 'NETWORK_ERROR',
      status: 502,
      retryable: options.retryable !== undefined ? options.retryable : true, // Network errors are retryable by default
      details: options.details
    });
  }
}

/**
 * Timeout errors that represent operations that took too long
 */
export class TimeoutError extends AppError {
  constructor(message: string, options: {
    retryable?: boolean,
    details?: ErrorDetails
  } = {}) {
    super(message, {
      code: 'TIMEOUT_ERROR',
      status: 504,
      retryable: options.retryable !== undefined ? options.retryable : true, // Timeout errors are retryable by default
      details: options.details
    });
  }
}

/**
 * Authentication errors
 */
export class AuthenticationError extends AppError {
  constructor(message: string, details?: ErrorDetails) {
    super(message, {
      code: 'AUTHENTICATION_ERROR',
      status: 401,
      details,
      retryable: false // Auth errors generally shouldn't be retried
    });
  }
}

/**
 * Dependency errors for when a required service or resource is unavailable
 */
export class DependencyError extends AppError {
  constructor(message: string, options: {
    dependencyName: string,
    retryable?: boolean,
    details?: ErrorDetails
  }) {
    super(message, {
      code: 'DEPENDENCY_ERROR',
      status: 503,
      retryable: options.retryable !== undefined ? options.retryable : true, // Dependency errors are retryable by default
      details: {
        ...options.details,
        dependencyName: options.dependencyName
      }
    });
  }
}

/**
 * Configuration errors
 */
export class ConfigurationError extends AppError {
  constructor(message: string, details?: ErrorDetails) {
    super(message, {
      code: 'CONFIGURATION_ERROR',
      status: 500,
      details,
      retryable: false // Config errors generally aren't retryable
    });
  }
}