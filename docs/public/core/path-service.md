# Path Service

The PathService is a crucial component in the image-resizer architecture that handles all path-related operations. It provides a unified approach to parsing, transforming, and normalizing paths for image and derivative requests.

## Overview

The PathService is responsible for:

1. Normalizing URL paths 
2. Parsing image paths and extracting embedded options
3. Extracting derivative names from paths
4. Parsing query parameters for transformation options
5. Applying path transformations based on configuration

## Service Architecture

The PathService follows the service-oriented design and implements the `PathService` interface from `interfaces.ts`. It includes:

- A base implementation (`PathServiceImpl`)
- A factory function (`createPathService`) for easy instantiation

### Core Implementation

The `PathServiceImpl` provides comprehensive path handling capabilities:

```typescript
class PathServiceImpl implements PathService {
  // Core path handling methods
  normalizePath(path: string): string;
  parseImagePath(pathname: string): { imagePath: string; options: Record<string, string> };
  extractDerivative(pathname: string, derivatives: string[]): { derivative: string; modifiedPath: string } | null;
  parseQueryOptions(searchParams: URLSearchParams): Record<string, unknown>;
  applyTransformations(imagePath: string, config?: any): string;
  
  // Configuration method
  configure(config: ImageResizerConfig): void;
}
```

## Usage Examples

### Basic Path Normalization

```typescript
// Normalize a path
const normalizedPath = pathService.normalizePath('/images//product///image.jpg');
// Result: '/images/product/image.jpg'
```

### Parsing Image Paths with Embedded Options

```typescript
// Parse path with embedded options
const parsed = pathService.parseImagePath('/images/_width=800/_quality=80/product/image.jpg');

// Result:
// {
//   imagePath: '/images/product/image.jpg',
//   options: {
//     width: '800',
//     quality: '80'
//   }
// }
```

### Extracting Derivatives from Paths

```typescript
// Extract derivative from path
const derivatives = ['thumbnail', 'preview', 'large'];
const result = pathService.extractDerivative('/images/thumbnail/product/image.jpg', derivatives);

// Result:
// {
//   derivative: 'thumbnail',
//   modifiedPath: '/images/product/image.jpg'
// }
```

### Parsing Query Parameters

```typescript
// Parse URL search params for transformation options
const url = new URL('https://example.com/image.jpg?width=800&quality=80&format=webp&blur=5');
const options = pathService.parseQueryOptions(url.searchParams);

// Result:
// {
//   width: 800,
//   quality: 80,
//   format: 'webp',
//   blur: 5
// }
```

### Applying Path Transformations

```typescript
// Apply path transformations based on configuration
const imagePath = '/products/electronics/camera.jpg';
const transformedPath = pathService.applyTransformations(imagePath);

// With configuration like:
// {
//   pathTransforms: {
//     'products': {
//       prefix: 'store',
//       removePrefix: true
//     }
//   }
// }
// 
// Result: '/store/electronics/camera.jpg'
```

## Integration

The PathService is integrated with the dependency injection system:

```typescript
// Get service from the container
const container = createContainerBuilder(env);
const services = container.createServiceContainer();
const pathService = services.pathService;

// Or create directly with the factory
const logger = createLogger(config, 'PathService');
const pathService = createPathService(logger, config);
```

## Path Transformation Configuration

The service supports configurable path transformations through the configuration system:

```typescript
// Example configuration
const config = {
  pathTransforms: {
    'images': {
      prefix: 'cdn',
      removePrefix: true
    },
    'products': {
      prefix: 'store',
      removePrefix: true,
      // Storage-specific transformations
      r2: {
        prefix: 'r2-store',
        removePrefix: true
      }
    }
  }
};
```

## Benefits of Service-Oriented Approach

Converting the path utility functions to a service-oriented approach provides several benefits:

1. **Configurable Behavior**: The PathService can be configured with different transformation rules.
2. **Testability**: Service methods are easier to test in isolation.
3. **Dependency Injection**: The service can be injected where needed and mocked in tests.
4. **Centralized Logging**: All path operations use the service's logger for consistent logging.
5. **Consistent Error Handling**: Centralized handling of path-related errors.

## Migration Guide

To migrate from the previous utility-based approach:

1. Replace direct imports from `utils/path.ts` with service container usage
2. Update code that uses the path utility functions to use the service methods
3. For shared services, access the path service through the service container
4. For standalone usage, create an instance using the `createPathService` factory

```typescript
// Before
import { parseImagePath, extractDerivative } from '../utils/path';
const parsedPath = parseImagePath(pathname);

// After
const parsedPath = services.pathService.parseImagePath(pathname);
```

## Performance Considerations

The PathService is designed for performance with:

- Efficient path normalization using regular expressions
- Minimal string operations to reduce memory allocations
- Option categorization for systematic processing
- Focused logging with breadcrumbs for traceability