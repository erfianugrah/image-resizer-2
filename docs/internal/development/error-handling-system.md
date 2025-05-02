# Error Handling System

The Image Resizer implements a comprehensive error handling system with domain-specific error hierarchies, standardized responses, and detailed contextual information.

## Overview

The error handling system is designed to provide:

1. **Consistent Error Structure**: All errors follow a standard format with common attributes
2. **Domain-Specific Classification**: Errors are organized by service domain
3. **Meaningful HTTP Statuses**: Each error type maps to an appropriate HTTP status code
4. **Detailed Context**: Errors include structured information about what went wrong
5. **Retryability Indicators**: Errors indicate whether the operation can be retried
6. **Service Identification**: Errors track which service generated them

This approach ensures that errors are properly categorized, easy to trace, and provide valuable debugging information.

## Error Hierarchy

The error system follows a hierarchical structure:

```
AppError (Base Error)
├── ServiceError (Base Service Error)
│   ├── StorageServiceError
│   │   ├── StorageNotFoundError
│   │   ├── AllStorageSourcesFailedError
│   │   ├── RemoteStorageError
│   │   ├── R2StorageError
│   │   └── ...
│   ├── TransformationServiceError
│   │   ├── TransformationError
│   │   ├── TransformationTimeoutError
│   │   ├── ValidationError
│   │   └── ...
│   ├── CacheServiceError
│   │   ├── CacheWriteError
│   │   ├── CacheReadError
│   │   └── ...
│   └── ...
├── ValidationError
├── NotFoundError
├── NetworkError
├── TimeoutError
├── AuthenticationError
├── DependencyError
└── ConfigurationError
```

## Core Error Types

### AppError

The `AppError` is the base class for all errors in the system:

```typescript
class AppError extends Error {
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
  } = {})
}
```

Key properties:
- `code`: A string identifier for the error type
- `status`: HTTP status code to return to the client
- `details`: Structured context information about the error
- `retryable`: Whether the operation can be retried
- `serviceId`: Identifier for the service that generated the error

### ServiceError

The `ServiceError` extends `AppError` for service-specific errors:

```typescript
class ServiceError extends AppError {
  constructor(
    message: string, 
    serviceId: string,
    options: {
      code?: string,
      status?: number,
      details?: ErrorDetails,
      retryable?: boolean
    } = {}
  )
}
```

Service errors are used to identify which specific service generated the error, enabling better tracking and debugging.

### Common Error Types

| Error Type | Default Status | Retryable | Purpose |
|------------|---------------|-----------|---------|
| ValidationError | 400 | No | Input validation failures |
| NotFoundError | 404 | No | Resource not found |
| NetworkError | 502 | Yes | Network-related failures |
| TimeoutError | 504 | Yes | Operation timeouts |
| AuthenticationError | 401 | No | Authentication failures |
| DependencyError | 503 | Yes | Dependency service failures |
| ConfigurationError | 500 | No | Configuration issues |

## Domain-Specific Errors

### Storage Service Errors

| Error Type | Status | Retryable | Description |
|------------|--------|-----------|-------------|
| StorageNotFoundError | 404 | No | Resource not found in storage |
| AllStorageSourcesFailedError | 502 | Yes | All storage sources failed |
| RemoteStorageError | 502 | Yes | Remote storage failure |
| R2StorageError | 502 | Yes | R2 storage failure |
| FallbackStorageError | 502 | Yes | Fallback storage failure |
| StorageAuthenticationError | 401 | No | Storage authentication failure |
| StorageTimeoutError | 504 | Yes | Storage operation timeout |
| UnsupportedContentTypeError | 415 | No | Unsupported content type |

### Transformation Service Errors

| Error Type | Status | Retryable | Description |
|------------|--------|-----------|-------------|
| TransformationError | 500 | Yes | Generic transformation error |
| TransformationTimeoutError | 504 | No | Transformation timeout |
| ValidationError | 400 | No | Invalid transformation parameters |
| TransformationFailedError | 500 | No | Transformation operation failed |
| InvalidDimensionsError | 400 | No | Invalid image dimensions |
| CloudflareResizingError | 502 | Yes | Cloudflare resizing API error |
| InvalidOptionsError | 400 | No | Invalid transformation options |
| UnsupportedFormatError | 415 | No | Unsupported image format |
| ImageTooLargeError | 413 | No | Image too large for transformation |

### Cache Service Errors

| Error Type | Status | Retryable | Description |
|------------|--------|-----------|-------------|
| CacheWriteError | 500 | Yes | Cache write operation failed |
| CacheReadError | 500 | Yes | Cache read operation failed |
| CachePurgeError | 500 | Yes | Cache purge operation failed |
| CacheKeyError | 400 | No | Invalid cache key |
| CacheTagError | 400 | No | Invalid cache tag |

### Client Detection Errors

| Error Type | Status | Retryable | Description |
|------------|--------|-----------|-------------|
| ClientDetectionError | 500 | Yes | Generic client detection error |
| UnsupportedClientError | 400 | No | Client not supported |
| ClientHintError | 400 | No | Invalid client hints |

### Configuration Errors

| Error Type | Status | Retryable | Description |
|------------|--------|-----------|-------------|
| ConfigSchemaError | 500 | No | Configuration schema validation failed |
| ConfigValueError | 500 | No | Invalid configuration value |
| ConfigLoadError | 500 | Yes | Failed to load configuration |
| ConfigStoreError | 500 | Yes | Configuration store error |

### Debug Errors

| Error Type | Status | Retryable | Description |
|------------|--------|-----------|-------------|
| DebugModeError | 500 | No | Debug mode error |
| DebugHeaderError | 400 | No | Invalid debug header |
| DebugRenderError | 500 | No | Error rendering debug information |

## Error Details

The `ErrorDetails` type provides structured context about the error:

```typescript
type ErrorDetails = Record<string, string | number | boolean | null | undefined | string[] | Record<string, string | number | boolean | null | undefined>>;
```

Common error details include:
- `imagePath`: Path to the image being processed
- `triedSources`: Storage sources that were attempted
- `errors`: Nested errors from underlying operations
- `parameters`: Request parameters that caused the error
- `component`: Component where the error occurred
- `dependencyName`: Name of the failed dependency

## Error Handling Best Practices

### 1. Use Specific Error Types

Always use the most specific error type that applies to the situation:

```typescript
// Bad
throw new Error('Image not found');

// Good
throw new StorageNotFoundError('Image not found in R2 bucket', {
  imagePath: 'path/to/image.jpg'
});
```

### 2. Include Detailed Context

Always provide detailed context in the error details:

```typescript
throw new TransformationError('Failed to convert to WebP format', {
  sourceFormat: 'png',
  targetFormat: 'webp',
  width: 800,
  height: 600,
  imagePath: 'path/to/image.png'
});
```

### 3. Follow the Catch-Enhance-Rethrow Pattern

When catching errors from lower-level services, enhance them with context and rethrow:

```typescript
try {
  await storageService.fetchImage(path, config, env, request);
} catch (error) {
  // Add context and rethrow as a more specific error
  if (error instanceof StorageNotFoundError) {
    throw new TransformationError(`Cannot transform missing image: ${error.message}`, {
      originalError: error.message,
      ...error.details,
      transactionId: request.headers.get('X-Transaction-ID')
    });
  }
  throw error;
}
```

### 4. Set Retryable Flag Appropriately

Consider whether an operation can be meaningfully retried:

```typescript
// Network errors are typically retryable
throw new NetworkError('Failed to connect to remote storage', {
  retryable: true,
  details: {
    url: 'https://example.com/images/logo.png',
    statusCode: 503
  }
});

// Validation errors are not retryable
throw new ValidationError('Invalid width parameter', {
  retryable: false,
  details: {
    parameter: 'width',
    provided: -200,
    expected: 'positive integer'
  }
});
```

### 5. Use HTTP Status Codes Correctly

Map domain errors to appropriate HTTP status codes:

| Status Code | Usage |
|-------------|-------|
| 400 | Client errors (validation, bad parameters) |
| 401 | Authentication failures |
| 403 | Authorization failures |
| 404 | Resource not found |
| 413 | Payload too large |
| 415 | Unsupported media type |
| 429 | Rate limit exceeded |
| 500 | Server errors (unhandled issues) |
| 502 | Bad gateway (downstream service failure) |
| 503 | Service unavailable (temporary unavailability) |
| 504 | Gateway timeout (operation took too long) |

## Error Responses

Errors are serialized to a consistent JSON format:

```json
{
  "error": "Failed to convert to WebP format",
  "code": "TRANSFORMATION_ERROR",
  "status": 500,
  "details": {
    "sourceFormat": "png",
    "targetFormat": "webp",
    "width": 800,
    "height": 600,
    "imagePath": "path/to/image.png"
  },
  "retryable": true,
  "serviceId": "TransformationService"
}
```

In debug mode, additional information is included:
- Stack traces (if available)
- Debug identifiers
- Request context
- Breadcrumb trail

## Error Telemetry and Logging

Errors are automatically logged through the LoggingService with appropriate severity levels:
- 4xx errors are logged as warnings
- 5xx errors are logged as errors
- Retryable errors might be logged differently than non-retryable errors

Each error log includes:
- Error message and code
- Stack trace (in development/debug mode)
- Request context (URL, method, headers, etc.)
- Error details
- Correlation ID for request tracing

## Future Enhancements

1. **Error Correlation with Breadcrumbs**: Link errors to request breadcrumb trails for tracing
2. **Circuit Breaker Integration**: Use error patterns to trigger circuit breakers
3. **Structured Troubleshooting Links**: Add links to troubleshooting guides in errors
4. **Error Metrics**: Track error frequency and patterns for monitoring
5. **Internationalization**: Support for localized error messages

## Reference Implementation

### Creating a New Error Type

```typescript
// In a new file: errors/myServiceErrors.ts
import { ServiceError, ErrorDetails } from './baseErrors';

export class MyServiceError extends ServiceError {
  constructor(
    message: string, 
    options: {
      code?: string,
      status?: number,
      details?: ErrorDetails,
      retryable?: boolean
    } = {}
  ) {
    super(message, 'MyService', {
      ...options,
      code: options.code || 'MY_SERVICE_ERROR'
    });
  }
}

export class SpecificOperationError extends MyServiceError {
  constructor(message: string, details?: ErrorDetails) {
    super(message, {
      code: 'OPERATION_FAILED',
      status: 500,
      details,
      retryable: true
    });
  }
}
```

### Using Errors in Services

```typescript
import { SpecificOperationError } from '../errors/myServiceErrors';

class MyService {
  async performOperation(data: any): Promise<Result> {
    try {
      // Operation logic
      if (!this.isValid(data)) {
        throw new ValidationError('Invalid data format', {
          provided: data,
          expected: 'valid format description'
        });
      }
      
      // More operation logic
      return result;
    } catch (error) {
      if (error instanceof ValidationError) {
        // Rethrow validation errors
        throw error;
      }
      
      // Wrap other errors
      throw new SpecificOperationError(
        `Operation failed: ${error instanceof Error ? error.message : String(error)}`,
        {
          originalOperation: 'performOperation',
          originalError: error instanceof Error ? error.message : String(error),
          data: JSON.stringify(data)
        }
      );
    }
  }
}
```

---

*Last updated: 2025-05-02*