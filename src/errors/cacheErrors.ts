/**
 * Cache Service specific error types
 */

import { ServiceError, ErrorDetails } from './baseErrors';

/**
 * Base error class for cache service errors
 */
export class CacheServiceError extends ServiceError {
  constructor(
    message: string, 
    options: {
      code?: string,
      status?: number,
      details?: ErrorDetails,
      retryable?: boolean
    } = {}
  ) {
    super(message, 'CacheService', {
      ...options,
      code: options.code || 'CACHE_SERVICE_ERROR'
    });
  }
}

/**
 * Error when attempting to write to cache fails
 */
export class CacheWriteError extends CacheServiceError {
  constructor(message: string, details?: ErrorDetails) {
    super(message, {
      code: 'CACHE_WRITE_ERROR',
      status: 500,
      details,
      retryable: true
    });
  }
}

/**
 * Error when attempting to read from cache fails
 */
export class CacheReadError extends CacheServiceError {
  constructor(message: string, details?: ErrorDetails) {
    super(message, {
      code: 'CACHE_READ_ERROR',
      status: 500,
      details,
      retryable: true
    });
  }
}

/**
 * Error when cache API is not available
 */
export class CacheUnavailableError extends CacheServiceError {
  constructor(message: string, details?: ErrorDetails) {
    super(message, {
      code: 'CACHE_UNAVAILABLE',
      status: 503,
      details,
      retryable: false
    });
  }
}

/**
 * Error when generating cache tags fails
 */
export class CacheTagGenerationError extends CacheServiceError {
  constructor(message: string, details?: ErrorDetails) {
    super(message, {
      code: 'CACHE_TAG_GENERATION_ERROR',
      status: 500,
      details,
      retryable: false
    });
  }
}

/**
 * Error when cache quota is exceeded
 */
export class CacheQuotaExceededError extends CacheServiceError {
  constructor(message: string, details?: ErrorDetails) {
    super(message, {
      code: 'CACHE_QUOTA_EXCEEDED',
      status: 507, // Insufficient Storage
      details,
      retryable: false
    });
  }
}