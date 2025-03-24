/**
 * Transformation Service specific error types
 */

import { ServiceError, ErrorDetails } from './baseErrors';

/**
 * Base error class for transformation service errors
 */
export class TransformationServiceError extends ServiceError {
  constructor(
    message: string, 
    options: {
      code?: string,
      status?: number,
      details?: ErrorDetails,
      retryable?: boolean
    } = {}
  ) {
    super(message, 'TransformationService', {
      ...options,
      code: options.code || 'TRANSFORMATION_SERVICE_ERROR'
    });
  }
}

/**
 * Generic transformation error
 */
export class TransformationError extends TransformationServiceError {
  constructor(message: string, details?: ErrorDetails) {
    super(message, {
      code: 'TRANSFORMATION_ERROR',
      status: 500,
      details,
      retryable: true
    });
  }
}

/**
 * Error when image transformation times out
 */
export class TransformationTimeoutError extends TransformationServiceError {
  constructor(message: string, details?: ErrorDetails) {
    super(message, {
      code: 'TRANSFORMATION_TIMEOUT',
      status: 504,
      details,
      retryable: false
    });
  }
}

/**
 * Error when validation of transformation options fails
 */
export class ValidationError extends TransformationServiceError {
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
 * Error when image transformation fails
 */
export class TransformationFailedError extends TransformationServiceError {
  constructor(message: string, details?: ErrorDetails) {
    super(message, {
      code: 'TRANSFORMATION_FAILED',
      status: 500,
      details,
      retryable: false
    });
  }
}

/**
 * Error when image dimensions are invalid
 */
export class InvalidDimensionsError extends TransformationServiceError {
  constructor(message: string, details?: ErrorDetails) {
    super(message, {
      code: 'INVALID_DIMENSIONS',
      status: 400,
      details,
      retryable: false
    });
  }
}

/**
 * Error when Cloudflare image resizing API fails
 */
export class CloudflareResizingError extends TransformationServiceError {
  constructor(message: string, details?: ErrorDetails) {
    super(message, {
      code: 'CLOUDFLARE_RESIZING_ERROR',
      status: 502,
      details,
      retryable: true
    });
  }
}

/**
 * Error when transformation options are invalid
 */
export class InvalidOptionsError extends TransformationServiceError {
  constructor(message: string, details?: ErrorDetails) {
    super(message, {
      code: 'INVALID_OPTIONS',
      status: 400,
      details,
      retryable: false
    });
  }
}

/**
 * Error when image format is unsupported
 */
export class UnsupportedFormatError extends TransformationServiceError {
  constructor(message: string, details?: ErrorDetails) {
    super(message, {
      code: 'UNSUPPORTED_FORMAT',
      status: 415,
      details,
      retryable: false
    });
  }
}

/**
 * Error when transformation produces an image that is too large
 */
export class ImageTooLargeError extends TransformationServiceError {
  constructor(message: string, details?: ErrorDetails) {
    super(message, {
      code: 'IMAGE_TOO_LARGE',
      status: 413,
      details,
      retryable: false
    });
  }
}