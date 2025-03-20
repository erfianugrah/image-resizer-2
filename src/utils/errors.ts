/**
 * Error handling utilities for the image resizer worker
 * 
 * This module provides standardized error classes and error response creation utilities.
 */

/**
 * Type for error details with structured information
 */
export type ErrorDetails = Record<string, string | number | boolean | null | undefined | string[] | Record<string, string | number | boolean | null | undefined>>;

export class AppError extends Error {
  code: string;
  status: number;
  details?: ErrorDetails;

  constructor(message: string, options: { 
    code?: string, 
    status?: number, 
    details?: ErrorDetails
  } = {}) {
    super(message);
    this.name = this.constructor.name;
    this.code = options.code || 'INTERNAL_ERROR';
    this.status = options.status || 500;
    this.details = options.details;
  }
}

export class NotFoundError extends AppError {
  constructor(message: string, details?: ErrorDetails) {
    super(message, {
      code: 'NOT_FOUND',
      status: 404,
      details
    });
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: ErrorDetails) {
    super(message, {
      code: 'VALIDATION_ERROR',
      status: 400,
      details
    });
  }
}

export class StorageError extends AppError {
  constructor(message: string, details?: ErrorDetails) {
    super(message, {
      code: 'STORAGE_ERROR',
      status: 502,
      details
    });
  }
}

export class TransformError extends AppError {
  constructor(message: string, details?: ErrorDetails) {
    super(message, {
      code: 'TRANSFORM_ERROR',
      status: 500,
      details
    });
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string, details?: ErrorDetails) {
    super(message, {
      code: 'AUTHENTICATION_ERROR',
      status: 401,
      details
    });
  }
}

/**
 * Create a standardized error response from an AppError
 * 
 * @param error The error to convert to a response
 * @returns A Response object with appropriate status and JSON error details
 */
export function createErrorResponse(error: AppError): Response {
  // Use default console log until we can dynamically import the logger
  // This avoids circular dependencies during initialization
  const logger = {
    breadcrumb: (step: string, duration?: number, data?: ErrorDetails) => {
      console.log(`[INFO] 🔶 BREADCRUMB: ${step}`, data || '');
    },
    debug: (message: string, data?: ErrorDetails) => {
      console.log(`[DEBUG] ${message}`, data || '');
    }
  };

  logger.breadcrumb('Creating error response', undefined, {
    errorType: error.constructor.name,
    errorCode: error.code,
    status: error.status
  });
  
  // Create JSON error body
  const errorBody = {
    error: {
      code: error.code,
      message: error.message,
      status: error.status
    }
  };
  
  // In development or with debug details, include error details
  if (error.details) {
    (errorBody.error as Record<string, unknown>).details = error.details;
    logger.breadcrumb('Including error details', undefined, {
      details: typeof error.details === 'object' ? Object.keys(error.details).join(',') : 'simple value'
    });
  }
  
  // Log error response creation
  logger.debug('Created error response', {
    status: error.status,
    code: error.code,
    hasDetails: !!error.details
  });
  
  return new Response(JSON.stringify(errorBody), {
    status: error.status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    }
  });
}