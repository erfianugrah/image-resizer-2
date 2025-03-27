/**
 * Storage Service specific error types
 */

import { ServiceError, ErrorDetails } from './baseErrors';

/**
 * Base error class for storage service errors
 */
export class StorageServiceError extends ServiceError {
  constructor(
    message: string, 
    options: {
      code?: string,
      status?: number,
      details?: ErrorDetails,
      retryable?: boolean
    } = {}
  ) {
    super(message, 'StorageService', {
      ...options,
      code: options.code || 'STORAGE_SERVICE_ERROR'
    });
  }
}

/**
 * Error when a resource cannot be found in storage
 */
export class StorageNotFoundError extends StorageServiceError {
  constructor(message: string, details?: ErrorDetails) {
    super(message, {
      code: 'STORAGE_NOT_FOUND',
      status: 404,
      details,
      retryable: false
    });
  }
}

/**
 * Error when all storage sources fail (R2, remote, fallback)
 */
export class AllStorageSourcesFailedError extends StorageServiceError {
  constructor(message: string, details?: ErrorDetails) {
    super(message, {
      code: 'ALL_STORAGE_SOURCES_FAILED',
      status: 502,
      details,
      retryable: true
    });
  }
}

/**
 * Error when remote storage fetch fails
 */
export class RemoteStorageError extends StorageServiceError {
  constructor(message: string, details?: ErrorDetails) {
    super(message, {
      code: 'REMOTE_STORAGE_ERROR',
      status: 502,
      details,
      retryable: true
    });
  }
}

/**
 * Error when R2 storage operations fail
 */
export class R2StorageError extends StorageServiceError {
  constructor(message: string, details?: ErrorDetails) {
    super(message, {
      code: 'R2_STORAGE_ERROR',
      status: 502,
      details,
      retryable: true
    });
  }
}

/**
 * Error when fallback storage operations fail
 */
export class FallbackStorageError extends StorageServiceError {
  constructor(message: string, details?: ErrorDetails) {
    super(message, {
      code: 'FALLBACK_STORAGE_ERROR',
      status: 502,
      details,
      retryable: true
    });
  }
}

/**
 * Error when authentication fails for storage source
 */
export class StorageAuthenticationError extends StorageServiceError {
  constructor(message: string, details?: ErrorDetails) {
    super(message, {
      code: 'STORAGE_AUTHENTICATION_ERROR',
      status: 401,
      details,
      retryable: false
    });
  }
}

/**
 * Error when storage operation times out
 */
export class StorageTimeoutError extends StorageServiceError {
  constructor(message: string, details?: ErrorDetails) {
    super(message, {
      code: 'STORAGE_TIMEOUT',
      status: 504,
      details,
      retryable: true
    });
  }
}

/**
 * Error when content type is invalid or unsupported
 */
export class UnsupportedContentTypeError extends StorageServiceError {
  constructor(message: string, details?: ErrorDetails) {
    super(message, {
      code: 'UNSUPPORTED_CONTENT_TYPE',
      status: 415,
      details,
      retryable: false
    });
  }
}