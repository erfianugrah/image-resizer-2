# Lifecycle Manager Implementation

This document outlines the implementation of the centralized LifecycleManager service which coordinates initialization and shutdown across all services in the Image Resizer application.

## Overview

The LifecycleManager provides a centralized service for managing lifecycle events across all services in the application. It implements dependency-based ordering for service initialization and reverse-order for shutdown, ensuring that services are properly started and stopped in the correct sequence.

## Key Features

1. **Dependency-Based Initialization**: Services are initialized based on their dependencies.
2. **Reverse-Order Shutdown**: Services are shut down in reverse dependency order.
3. **Health Monitoring**: Tracks health status of each service during lifecycle phases.
4. **Graceful Degradation**: Option to continue even if non-critical services fail.
5. **Timeout Management**: Configurable timeouts for initialization and shutdown operations.
6. **Detailed Statistics**: Comprehensive metrics for initialization and shutdown.
7. **Dependency Visualization**: Ability to visualize the service dependency graph.

## Implementation Details

### Service Health Tracking

Each service's health is tracked with the following information:

- **Status**: initializing, initialized, failed, shutting_down, shutdown, unknown
- **Timing**: Start time, end time, and duration for each phase
- **Error Information**: Details of any errors that occurred
- **Dependencies**: List of services this service depends on

### Lifecycle Statistics

The LifecycleManager maintains detailed statistics:

- **Application Timing**: Start and end times for initialization and shutdown
- **Service Statuses**: Status of all services
- **Initialization Order**: The actual sequence in which services were initialized
- **Shutdown Order**: The actual sequence in which services were shut down
- **Error Log**: Details of any errors that occurred during initialization or shutdown

### Dependency Graph

The LifecycleManager maintains a dependency graph of services which is used to determine initialization order. The current dependency structure is:

```
configurationService (no dependencies)
loggingService depends on: configurationService
authService depends on: configurationService, loggingService
storageService depends on: configurationService, loggingService, authService
cacheService depends on: configurationService, loggingService
clientDetectionService depends on: configurationService, loggingService
debugService depends on: loggingService
transformationService depends on: configurationService, loggingService, cacheService, clientDetectionService
pathService depends on: configurationService, loggingService
detectorService depends on: configurationService, loggingService
```

### Initialization Process

1. Services are sorted in topological order based on dependencies.
2. Each service is initialized in order, with timing metrics recorded.
3. If a service fails to initialize and `gracefulDegradation` is enabled, initialization continues with the next service.
4. If a critical service fails, initialization is aborted unless `gracefulDegradation` is enabled.

### Shutdown Process

1. Services are shut down in reverse dependency order.
2. Each service is given a chance to clean up resources and persist state.
3. If a service fails to shut down and `force` is enabled, shutdown continues with the next service.
4. Detailed statistics are collected throughout the process.

## Usage Examples

### Basic Initialization

```typescript
// Get the lifecycle manager from the service container
const { lifecycleManager } = services;

// Initialize services
await lifecycleManager.initialize();
```

### Initialization with Options

```typescript
// Initialize with graceful degradation and a timeout
await lifecycleManager.initialize({
  gracefulDegradation: true,
  timeout: 10000, // 10 seconds per service
  critical: ['configurationService', 'loggingService', 'cacheService']
});
```

### Shutdown

```typescript
// Controlled shutdown with a timeout
await lifecycleManager.shutdown({
  force: true,  // Continue shutting down services even if some fail
  timeout: 5000 // 5 seconds per service
});
```

### Health Reporting

```typescript
// Check overall application health
const isHealthy = lifecycleManager.isApplicationHealthy();

// Get detailed health report
const healthReport = lifecycleManager.createHealthReport();
console.log(healthReport);

// Get raw health statistics
const stats = lifecycleManager.getStatistics();
```

## Integration with Existing Services

The LifecycleManager has been seamlessly integrated with the existing service architecture:

1. **Service Container**: The LifecycleManager is added to the service container during creation.
2. **Initialization Hooks**: The service container's initialize method now uses the LifecycleManager.
3. **Shutdown Hooks**: The service container's shutdown method now uses the LifecycleManager.
4. **Scheduled Events**: A shutdown hook has been added to handle scheduled events.

## Benefits Over Previous Implementation

1. **Improved Reliability**: Services are initialized and shut down in the correct order.
2. **Better Error Handling**: Failures are handled gracefully with customizable behavior.
3. **Enhanced Monitoring**: Detailed statistics provide insights into the application's lifecycle.
4. **Health Checking**: The ability to check service health status for diagnostics.
5. **Configurable Behavior**: Options for graceful degradation, timeouts, and more.
6. **Centralized Management**: A single point of control for service lifecycle operations.

## Future Enhancements

1. **Dynamic Dependency Discovery**: Automatically discover dependencies between services.
2. **Enhanced Visualization**: Interactive visualization of the service dependency graph.
3. **Lifecycle Hooks**: Pre-initialization and post-shutdown hooks for services.
4. **Health Check API**: Expose health check information via an API endpoint.
5. **Service Recovery**: Automatic recovery attempts for failed services.
6. **Service Versioning**: Track service versions for compatibility checking.
7. **Resource Tracking**: Monitor resource usage of services over their lifecycle.