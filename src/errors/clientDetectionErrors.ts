/**
 * Client Detection Service specific error types
 */

import { ServiceError, ErrorDetails } from './baseErrors';

/**
 * Base error class for client detection service errors
 */
export class ClientDetectionServiceError extends ServiceError {
  constructor(
    message: string, 
    options: {
      code?: string,
      status?: number,
      details?: ErrorDetails,
      retryable?: boolean
    } = {}
  ) {
    super(message, 'ClientDetectionService', {
      ...options,
      code: options.code || 'CLIENT_DETECTION_SERVICE_ERROR'
    });
  }
}

/**
 * Error when client detection fails
 */
export class ClientDetectionFailedError extends ClientDetectionServiceError {
  constructor(message: string, details?: ErrorDetails) {
    super(message, {
      code: 'CLIENT_DETECTION_FAILED',
      status: 500,
      details,
      retryable: true
    });
  }
}

/**
 * Error when client hints are unavailable
 */
export class ClientHintsUnavailableError extends ClientDetectionServiceError {
  constructor(message: string, details?: ErrorDetails) {
    super(message, {
      code: 'CLIENT_HINTS_UNAVAILABLE',
      status: 500,
      details,
      retryable: false
    });
  }
}

/**
 * Error when user agent parsing fails
 */
export class UserAgentParsingError extends ClientDetectionServiceError {
  constructor(message: string, details?: ErrorDetails) {
    super(message, {
      code: 'USER_AGENT_PARSING_ERROR',
      status: 500,
      details,
      retryable: false
    });
  }
}

/**
 * Error when cache for client detection is corrupted
 */
export class ClientDetectionCacheError extends ClientDetectionServiceError {
  constructor(message: string, details?: ErrorDetails) {
    super(message, {
      code: 'CLIENT_DETECTION_CACHE_ERROR',
      status: 500,
      details,
      retryable: true
    });
  }
}