# Dependency Injection System

The Image Resizer project uses a lightweight dependency injection system to manage services and their dependencies. This document describes how to use the DI system and how it works.

## Overview

The dependency injection system provides:

1. A container that manages service registrations and instances
2. Support for singleton and transient service lifetimes
3. Factory functions for creating services
4. Hierarchical containers (parent/child relationships)
5. Automatic dependency resolution

## Key Interfaces

The DI system defines these key interfaces:

- `DIContainer`: The main container interface
- `ServiceContainer`: The standard service container that wraps all core services

## Using the DI System

### Creating a Container

```typescript
import { createContainerBuilder } from './services/dependencyInjectionContainer';

// Create a container with all standard services registered
const container = createContainerBuilder(env);

// Get the standard service container
const services = container.createServiceContainer();
```

### Registering Services

```typescript
// Register a singleton service implementation
container.register('MyService', new MyServiceImpl());

// Register a factory function for creating services
container.registerFactory('MyService', () => {
  const logger = container.resolve('LoggingService').getLogger('MyService');
  return new MyServiceImpl(logger);
});
```

### Resolving Services

```typescript
// Get an instance of a registered service
const myService = container.resolve<MyService>('MyService');
```

### Creating Child Containers

```typescript
// Create a child container that inherits registrations from the parent
const childContainer = container.createChildContainer();

// Override a service in the child container
childContainer.register('MyService', new SpecializedServiceImpl());
```

## Standard Services

The container builder registers these standard services:

- `StorageService`: For accessing images from different storage sources
- `TransformationService`: For image transformations
- `CacheService`: For caching operations
- `DebugService`: For debug information and visualization
- `ClientDetectionService`: For detecting client capabilities
- `ConfigurationService`: For managing configuration
- `LoggingService`: For centralized logging

## Configuration

To enable the DI system, set the `USE_DI_SYSTEM` environment variable to `true`.

```
USE_DI_SYSTEM=true npm run dev
```

## Lifecycle Management

Services can implement lifecycle hooks:

```typescript
interface ServiceWithLifecycle {
  initialize?(): Promise<void>;
  dispose?(): Promise<void>;
}
```

## Benefits

- Reduced coupling between components
- Easier testing through dependency substitution
- Centralized service management
- Better separation of concerns
- More maintainable codebase
- Support for different service lifetimes

## Example: Custom Service

```typescript
// Define a service interface
interface EmailService {
  sendEmail(to: string, subject: string, body: string): Promise<boolean>;
}

// Implement the service
class SmtpEmailService implements EmailService {
  private logger: Logger;
  
  constructor(logger: Logger) {
    this.logger = logger;
  }
  
  async sendEmail(to: string, subject: string, body: string): Promise<boolean> {
    this.logger.info(`Sending email to ${to}`);
    // Implementation...
    return true;
  }
}

// Register the service
container.registerFactory('EmailService', () => {
  const logger = container.resolve('LoggingService').getLogger('EmailService');
  return new SmtpEmailService(logger);
});

// Use the service
const emailService = container.resolve<EmailService>('EmailService');
await emailService.sendEmail('user@example.com', 'Hello', 'World');
```