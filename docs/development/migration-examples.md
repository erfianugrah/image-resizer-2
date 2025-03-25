# Migration Examples

This document provides examples of migrating from utility-based code to service-oriented architecture. These examples show how to refactor existing code to use our new service implementations.

## Table of Contents

1. [AuthService Migration](#authservice-migration)
2. [DetectorService Migration](#detectorservice-migration)
3. [PathService Migration](#pathservice-migration)
4. [LoggingService Migration](#loggingservice-migration)

## AuthService Migration

### Before: Direct utility usage

```typescript
import { authenticate } from '../utils/auth';

async function handleRequest(request: Request, env: Env) {
  const url = new URL(request.url);
  const config = getConfig(env);
  
  // Direct call to utility function
  const authResult = await authenticate(url.pathname, config, env);
  
  if (!authResult.success) {
    return new Response('Unauthorized', { status: 401 });
  }
  
  // Continue with authenticated request
  // ...
}
```

### After: Service-based approach

```typescript
import { ServiceContainer } from '../services/interfaces';
import { createServiceContainer } from '../services/dependencyInjectionContainer';

async function handleRequest(request: Request, env: Env) {
  const url = new URL(request.url);
  
  // Get the service container
  const services: ServiceContainer = createServiceContainer(env);
  
  // Use the auth service
  const authResult = await services.authService.authenticateRequest(
    url.pathname,
    services.configurationService.getConfig(),
    env
  );
  
  if (!authResult.success) {
    return new Response('Unauthorized', { status: 401 });
  }
  
  // Continue with authenticated request
  // ...
}
```

## DetectorService Migration

### Before: Direct utility usage

```typescript
import { detectClient, detectFormatSupport } from '../utils/client-detection';

async function processImage(request: Request, config: ImageResizerConfig) {
  // Directly call utility functions
  const clientInfo = await detectClient(request);
  const supportsWebP = await detectFormatSupport(request, 'webp');
  
  // Use the detected information
  const options: TransformOptions = {
    format: supportsWebP ? 'webp' : 'jpeg',
    width: clientInfo.viewportWidth || 800,
    dpr: clientInfo.devicePixelRatio || 1
  };
  
  // Continue with transformation
  // ...
}
```

### After: Service-based approach

```typescript
import { ServiceContainer } from '../services/interfaces';
import { createServiceContainer } from '../services/dependencyInjectionContainer';

async function processImage(request: Request, env: Env) {
  // Get the service container
  const services: ServiceContainer = createServiceContainer(env);
  const config = services.configurationService.getConfig();
  
  // Use the detector service
  const clientInfo = await services.detectorService.detectClient(request);
  const supportsWebP = await services.detectorService.supportsFormat(request, 'webp');
  
  // Get optimized options directly
  const baseOptions: TransformOptions = { /* ... */ };
  const options = await services.detectorService.getOptimizedOptions(
    request, 
    baseOptions, 
    config
  );
  
  // Continue with transformation
  // ...
}
```

## PathService Migration

### Before: Direct utility usage

```typescript
import { normalizePath, parseImagePath, extractDerivative } from '../utils/path';

function handleImageRequest(request: Request, config: ImageResizerConfig) {
  const url = new URL(request.url);
  
  // Direct calls to utility functions
  const normalizedPath = normalizePath(url.pathname);
  const { imagePath, options } = parseImagePath(normalizedPath);
  const derivative = extractDerivative(normalizedPath, config.derivatives || []);
  
  // Use the parsed information
  // ...
}
```

### After: Service-based approach

```typescript
import { ServiceContainer } from '../services/interfaces';
import { createServiceContainer } from '../services/dependencyInjectionContainer';

function handleImageRequest(request: Request, env: Env) {
  const url = new URL(request.url);
  
  // Get the service container
  const services: ServiceContainer = createServiceContainer(env);
  const config = services.configurationService.getConfig();
  
  // Use the path service
  const normalizedPath = services.pathService.normalizePath(url.pathname);
  const { imagePath, options } = services.pathService.parseImagePath(normalizedPath);
  const derivative = services.pathService.extractDerivative(
    normalizedPath,
    config.derivatives || []
  );
  
  // Use the parsed information
  // ...
}
```

## LoggingService Migration

### Before: Direct utility usage

```typescript
import { createLogger } from '../utils/logging';
import { getConfig } from '../utils/config';

function processRequest(request: Request, env: Env) {
  const config = getConfig(env);
  
  // Direct creation of logger
  const logger = createLogger(config, 'RequestHandler');
  
  logger.info('Processing request', { 
    url: request.url,
    method: request.method
  });
  
  try {
    // Process the request...
    logger.debug('Request processing completed');
  } catch (error) {
    logger.error('Error processing request', { 
      error: error instanceof Error ? error.message : String(error)
    });
  }
}
```

### After: Service-based approach

```typescript
import { ServiceContainer } from '../services/interfaces';
import { createServiceContainer } from '../services/dependencyInjectionContainer';

function processRequest(request: Request, env: Env) {
  // Get the service container
  const services: ServiceContainer = createServiceContainer(env);
  
  // Get a logger from the logging service
  const logger = services.loggingService.getLogger('RequestHandler');
  
  logger.info('Processing request', { 
    url: request.url,
    method: request.method
  });
  
  try {
    // Process the request...
    logger.debug('Request processing completed');
  } catch (error) {
    logger.error('Error processing request', { 
      error: error instanceof Error ? error.message : String(error)
    });
  }
}
```

The LoggingService provides several advantages over direct utility usage:

1. **Centralized Configuration**: All loggers share the same configuration, which can be updated at runtime.
2. **Logger Caching**: The service maintains a cache of loggers to avoid recreating them for the same context.
3. **Consistent Usage**: All parts of the application use the same logging patterns.
4. **Performance Optimization**: The service can selectively create optimized loggers for high-traffic components.
5. **Extensibility**: The service can be extended with additional capabilities like log forwarding or aggregation.

When migrating to the LoggingService, consider these best practices:

- Always get loggers from the service rather than creating them directly
- Use meaningful context names that identify the component (e.g., 'StorageService', 'ImageHandler')
- Structure log data consistently to make logs easier to search and analyze
- Use appropriate log levels (DEBUG for development details, INFO for operational events, WARN for potential issues, ERROR for failures)
- Leverage breadcrumbs for tracking request flow