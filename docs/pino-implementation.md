# Pino Implementation Guide

This document provides a detailed implementation guide for replacing our custom logging system with Pino while maintaining 100% feature parity.

## Implementation Files

### 1. Base Types and Interfaces

```typescript
// src/utils/log-types.ts

// Re-export existing types for compatibility
export { LogLevel, LogData } from './logging';

// Extended Pino-specific types
export interface PinoLoggerOptions {
  // Standard options
  usePino: boolean;
  level: string;
  includeTimestamp: boolean;
  enableStructuredLogs: boolean;
  enableBreadcrumbs: boolean;
  
  // Pino-specific options
  redactPaths?: string[];
  prettyPrint?: boolean;
  customLevels?: Record<string, number>;
  customSerializers?: Record<string, (value: any) => any>;
  transportTarget?: string;
  browserTargets?: string[];
}
```

### 2. Core Pino Implementation

```typescript
// src/utils/pino-core.ts
import pino, { Logger as PinoLogger } from 'pino';
import { ImageResizerConfig } from '../config';
import { LogLevel, LogData } from './logging';

// Map our log levels to Pino levels
const LOG_LEVEL_MAP: Record<LogLevel | string, string> = {
  [LogLevel.DEBUG]: 'debug',
  [LogLevel.INFO]: 'info',
  [LogLevel.WARN]: 'warn',
  [LogLevel.ERROR]: 'error',
  'DEBUG': 'debug',
  'INFO': 'info',
  'WARN': 'warn',
  'ERROR': 'error'
};

export function createPinoInstance(
  config: ImageResizerConfig,
  context?: string
): PinoLogger {
  // Extract logging config
  const loggingConfig = config.logging || {};
  
  // Determine log level
  const configuredLevel = loggingConfig.level || 'INFO';
  const pinoLevel = LOG_LEVEL_MAP[configuredLevel] || 'info';
  
  // Configure base options
  const pinoOptions: pino.LoggerOptions = {
    // Core options
    level: pinoLevel,
    timestamp: loggingConfig.includeTimestamp !== false,
    messageKey: 'message',
    base: context ? { context } : {},
    
    // Redaction if configured
    ...(loggingConfig.redactPaths ? {
      redact: {
        paths: loggingConfig.redactPaths,
        censor: '[REDACTED]'
      }
    } : {}),
    
    // Custom serializers
    serializers: {
      err: pino.stdSerializers.err,
      error: pino.stdSerializers.err,
      ...loggingConfig.customSerializers
    },
    
    // Format for different environments
    ...(process.env.NODE_ENV === 'development' && loggingConfig.prettyPrint ? {
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true
        }
      }
    } : {})
  };
  
  // Create the logger instance
  return pino(pinoOptions);
}

// Helper function to convert our LogData to Pino format
export function prepareLogData(data?: LogData): Record<string, any> {
  if (!data) return {};
  
  // Handle our specific data transformations
  return Object.entries(data).reduce((acc, [key, value]) => {
    // Handle arrays, nested objects, etc. as needed
    acc[key] = value;
    return acc;
  }, {} as Record<string, any>);
}
```

### 3. Compatibility Wrapper

```typescript
// src/utils/pino-compat.ts
import { Logger as PinoLogger } from 'pino';
import { ImageResizerConfig } from '../config';
import { Logger, LogData } from './logging';
import { createPinoInstance, prepareLogData } from './pino-core';

export function createCompatiblePinoLogger(
  config: ImageResizerConfig,
  context?: string
): Logger {
  // Create the underlying Pino instance
  const pinoLogger = createPinoInstance(config, context);
  
  // Determine if breadcrumbs are enabled
  const enableBreadcrumbs = config.logging?.enableBreadcrumbs !== false;
  
  // Return our compatibility interface
  return {
    debug(message: string, data?: LogData): void {
      pinoLogger.debug(prepareLogData(data), message);
    },
    
    info(message: string, data?: LogData): void {
      pinoLogger.info(prepareLogData(data), message);
    },
    
    warn(message: string, data?: LogData): void {
      pinoLogger.warn(prepareLogData(data), message);
    },
    
    error(message: string, data?: LogData): void {
      pinoLogger.error(prepareLogData(data), message);
    },
    
    breadcrumb(step: string, duration?: number, data?: LogData): void {
      if (enableBreadcrumbs) {
        const breadcrumbData = {
          type: 'breadcrumb',
          ...prepareLogData(data),
          ...(duration !== undefined ? { durationMs: duration } : {})
        };
        
        pinoLogger.info(breadcrumbData, `BREADCRUMB: ${step}`);
      }
    }
  };
}
```

### 4. Optimized Logger Implementation

```typescript
// src/utils/pino-optimized.ts
import { Logger as PinoLogger } from 'pino';
import { ImageResizerConfig } from '../config';
import { LogLevel, LogData } from './logging';
import { OptimizedLogger } from './optimized-logging';
import { createCompatiblePinoLogger } from './pino-compat';
import { createPinoInstance } from './pino-core';

export function createOptimizedPinoLogger(
  config: ImageResizerConfig,
  context?: string
): OptimizedLogger {
  // Create the base logger
  const baseLogger = createCompatiblePinoLogger(config, context);
  
  // Get the underlying Pino instance for direct operations
  const pinoLogger = createPinoInstance(config, context);
  
  // Extract configuration values
  const configuredLevel = config.logging?.level || 'INFO';
  const minLevel = LogLevel[configuredLevel as keyof typeof LogLevel] || LogLevel.INFO;
  const enableBreadcrumbs = config.logging?.enableBreadcrumbs !== false;
  const enablePerformanceTracking = config.debug?.performanceTracking !== false;
  
  // Pre-compute level checks for performance
  const isDebugEnabled = pinoLogger.isLevelEnabled('debug');
  const isInfoEnabled = pinoLogger.isLevelEnabled('info');
  const isWarnEnabled = pinoLogger.isLevelEnabled('warn');
  const isErrorEnabled = pinoLogger.isLevelEnabled('error');
  
  // Return the optimized logger
  return {
    ...baseLogger,
    
    isLevelEnabled(level: keyof typeof LogLevel): boolean {
      const pinoLevel = level.toLowerCase();
      return pinoLogger.isLevelEnabled(pinoLevel as any);
    },
    
    getMinLevel(): LogLevel {
      return minLevel;
    },
    
    trackedBreadcrumb(step: string, startTime?: number, data?: LogData): number {
      const now = Date.now();
      
      if (enableBreadcrumbs && enablePerformanceTracking && startTime !== undefined) {
        const duration = now - startTime;
        baseLogger.breadcrumb(step, duration, data);
      } else if (enableBreadcrumbs) {
        baseLogger.breadcrumb(step, undefined, data);
      }
      
      return now;
    }
  };
}
```

### 5. Factory Function

```typescript
// src/utils/logger-factory.ts
import { ImageResizerConfig } from '../config';
import { Logger } from './logging';
import { OptimizedLogger } from './optimized-logging';
import { createCompatiblePinoLogger } from './pino-compat';
import { createOptimizedPinoLogger } from './pino-optimized';

export function createLogger(
  config: ImageResizerConfig,
  context?: string,
  useOptimized: boolean = false
): Logger | OptimizedLogger {
  // Check if Pino is enabled in config
  const usePino = config.logging?.usePino === true;
  
  if (usePino) {
    // Use Pino implementations
    return useOptimized
      ? createOptimizedPinoLogger(config, context)
      : createCompatiblePinoLogger(config, context);
  } else {
    // Use original implementations (from original files)
    // This code will be removed after migration is complete
    if (useOptimized) {
      return createOptimizedLogger(config, context);
    }
    return createLegacyLogger(config, context);
  }
}
```

## Configuration Updates

Add Pino-specific options to the configuration schema:

```typescript
// src/config.ts
export interface LoggingConfig {
  // Existing properties
  level?: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  includeTimestamp?: boolean;
  enableStructuredLogs?: boolean;
  enableBreadcrumbs?: boolean;
  
  // New Pino-specific properties
  usePino?: boolean;
  redactPaths?: string[];
  prettyPrint?: boolean;
  customLevels?: Record<string, number>;
  transportTarget?: string;
}
```

## Advanced Features

### 1. Child Loggers

We can enhance our implementation to support child loggers for subsystems:

```typescript
// src/utils/pino-compat.ts
export function createChildLogger(parentLogger: Logger, childContext: string): Logger {
  // Implementation depends on whether this is a Pino logger or legacy logger
  if ('isPino' in parentLogger) {
    // It's a Pino logger, use Pino's child method
    const pinoParent = (parentLogger as any).pinoInstance;
    const childPino = pinoParent.child({ context: childContext });
    
    return createLoggerFromPinoInstance(childPino, parentLogger.config);
  } else {
    // It's a legacy logger, create a new one with combined context
    const parentContext = (parentLogger as any).context || '';
    const combinedContext = parentContext 
      ? `${parentContext}.${childContext}` 
      : childContext;
      
    return createLogger(
      parentLogger.config, 
      combinedContext, 
      parentLogger.isOptimized || false
    );
  }
}
```

### 2. Request Context Binding

For HTTP requests, we can bind request information to logs:

```typescript
// src/utils/request-logger.ts
import { Request } from '@cloudflare/workers-types';
import { Logger } from './logging';
import { createChildLogger } from './pino-compat';

export function createRequestLogger(
  baseLogger: Logger, 
  request: Request, 
  requestId: string
): Logger {
  // Create a child logger with request context
  const requestLogger = createChildLogger(baseLogger, 'request');
  
  // Bind request information
  return {
    ...requestLogger,
    debug(message: string, data?: LogData): void {
      requestLogger.debug(message, { 
        ...data, 
        requestId, 
        url: request.url,
        method: request.method
      });
    },
    info(message: string, data?: LogData): void {
      requestLogger.info(message, { 
        ...data, 
        requestId, 
        url: request.url,
        method: request.method
      });
    },
    warn(message: string, data?: LogData): void {
      requestLogger.warn(message, { 
        ...data, 
        requestId, 
        url: request.url,
        method: request.method
      });
    },
    error(message: string, data?: LogData): void {
      requestLogger.error(message, { 
        ...data, 
        requestId, 
        url: request.url,
        method: request.method
      });
    },
    breadcrumb(step: string, duration?: number, data?: LogData): void {
      requestLogger.breadcrumb(step, duration, { 
        ...data, 
        requestId 
      });
    }
  };
}
```

## Testing Strategy

### 1. Unit Tests for Core Functionality

```typescript
// test/utils/pino-logging.spec.ts
import { describe, it, expect, vi } from 'vitest';
import { createCompatiblePinoLogger } from '../../src/utils/pino-compat';

describe('Pino Logger', () => {
  // Mock console.log
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  
  afterEach(() => {
    vi.restoreAllMocks();
  });
  
  it('should log at the correct level', () => {
    // Create logger with INFO level
    const logger = createCompatiblePinoLogger({ 
      logging: { level: 'INFO' } 
    }, 'TestContext');
    
    // Debug should not log
    logger.debug('Debug message');
    expect(console.log).not.toHaveBeenCalled();
    
    // Info should log
    logger.info('Info message');
    expect(console.log).toHaveBeenCalled();
    
    // Reset mock
    vi.clearAllMocks();
    
    // Create logger with DEBUG level
    const debugLogger = createCompatiblePinoLogger({ 
      logging: { level: 'DEBUG' } 
    }, 'TestContext');
    
    // Debug should now log
    debugLogger.debug('Debug message');
    expect(console.log).toHaveBeenCalled();
  });
  
  it('should include breadcrumb markers', () => {
    const logger = createCompatiblePinoLogger({ 
      logging: { enableBreadcrumbs: true } 
    });
    
    logger.breadcrumb('Test Step', 100);
    
    // Check that the log contains breadcrumb marker
    expect(console.log).toHaveBeenCalledWith(
      expect.stringContaining('BREADCRUMB'),
      expect.objectContaining({ 
        type: 'breadcrumb',
        durationMs: 100
      })
    );
  });
});
```

### 2. Integration Tests for Logger Factory

```typescript
// test/utils/logger-factory.spec.ts
import { describe, it, expect } from 'vitest';
import { createLogger } from '../../src/utils/logger-factory';

describe('Logger Factory', () => {
  it('should create legacy logger when Pino disabled', () => {
    const logger = createLogger({ 
      logging: { usePino: false } 
    });
    
    // Check type by checking for Pino-specific property
    expect((logger as any).isPino).toBeUndefined();
  });
  
  it('should create Pino logger when enabled', () => {
    const logger = createLogger({ 
      logging: { usePino: true } 
    });
    
    // Pino loggers have this property
    expect((logger as any).isPino).toBe(true);
  });
  
  it('should create optimized logger when requested', () => {
    const logger = createLogger({ 
      logging: { usePino: true } 
    }, 'context', true);
    
    // Should have optimized methods
    expect(logger).toHaveProperty('isLevelEnabled');
    expect(logger).toHaveProperty('trackedBreadcrumb');
  });
});
```

## Benchmarking

Benchmarking should verify that Pino meets or exceeds our current performance:

```typescript
// bench/logging-benchmark.ts
import { bench, describe } from 'vitest';
import { createLogger } from '../src/utils/logging';
import { createCompatiblePinoLogger } from '../src/utils/pino-compat';

describe('Logging Performance', () => {
  // Setup logging configs
  const config = { logging: { level: 'INFO' } };
  const configWithPino = { logging: { level: 'INFO', usePino: true } };
  
  // Create loggers
  const legacyLogger = createLogger(config);
  const pinoLogger = createCompatiblePinoLogger(configWithPino);
  
  // Benchmark simple logging
  bench('Legacy Logger - Simple Log', () => {
    legacyLogger.info('Test message');
  });
  
  bench('Pino Logger - Simple Log', () => {
    pinoLogger.info('Test message');
  });
  
  // Benchmark with data
  const testData = { 
    userId: 123, 
    action: 'test', 
    items: [1, 2, 3], 
    metadata: { source: 'benchmark' } 
  };
  
  bench('Legacy Logger - With Data', () => {
    legacyLogger.info('Test message with data', testData);
  });
  
  bench('Pino Logger - With Data', () => {
    pinoLogger.info('Test message with data', testData);
  });
  
  // Benchmark breadcrumbs
  bench('Legacy Logger - Breadcrumb', () => {
    legacyLogger.breadcrumb('Test step', 100, { step: 1 });
  });
  
  bench('Pino Logger - Breadcrumb', () => {
    pinoLogger.breadcrumb('Test step', 100, { step: 1 });
  });
});
```

## Rollout Plan

### Phase 1: Preparation (Week 1)

1. Add Pino dependency
2. Implement core files:
   - pino-core.ts
   - pino-compat.ts
   - pino-optimized.ts
3. Update configuration types
4. Create unit tests

### Phase 2: Testing (Week 2)

1. Add feature flag to configuration
2. Create integration tests
3. Run benchmarks and compare performance
4. Update logger-factory.ts to support both implementations

### Phase 3: Pilot Deployment (Week 3)

1. Enable Pino in development environment
2. Monitor for issues
3. Collect feedback from team
4. Make necessary adjustments

### Phase 4: Rollout (Week 4)

1. Enable Pino in staging environment
2. Run comprehensive tests
3. Analyze logs for correctness
4. Deploy to production with gradual rollout

### Phase 5: Cleanup (Week 5)

1. Remove legacy implementation
2. Remove feature flag
3. Update documentation
4. Finalize benchmark results