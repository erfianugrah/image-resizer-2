/**
 * Debug Service specific error types
 */

import { ServiceError, ErrorDetails } from './baseErrors';

/**
 * Base error class for debug service errors
 */
export class DebugServiceError extends ServiceError {
  constructor(
    message: string, 
    options: {
      code?: string,
      status?: number,
      details?: ErrorDetails,
      retryable?: boolean
    } = {}
  ) {
    super(message, 'DebugService', {
      ...options,
      code: options.code || 'DEBUG_SERVICE_ERROR'
    });
  }
}

/**
 * Error when debug report generation fails
 */
export class DebugReportGenerationError extends DebugServiceError {
  constructor(message: string, details?: ErrorDetails) {
    super(message, {
      code: 'DEBUG_REPORT_GENERATION_ERROR',
      status: 500,
      details,
      retryable: false
    });
  }
}

/**
 * Error when performance metrics collection fails
 */
export class PerformanceMetricsError extends DebugServiceError {
  constructor(message: string, details?: ErrorDetails) {
    super(message, {
      code: 'PERFORMANCE_METRICS_ERROR',
      status: 500,
      details,
      retryable: false
    });
  }
}

/**
 * Error when debug headers exceed size limits
 */
export class DebugHeadersOverflowError extends DebugServiceError {
  constructor(message: string, details?: ErrorDetails) {
    super(message, {
      code: 'DEBUG_HEADERS_OVERFLOW',
      status: 500,
      details,
      retryable: false
    });
  }
}

/**
 * Error when debug visualization fails
 */
export class VisualizationError extends DebugServiceError {
  constructor(message: string, details?: ErrorDetails) {
    super(message, {
      code: 'VISUALIZATION_ERROR',
      status: 500,
      details,
      retryable: false
    });
  }
}