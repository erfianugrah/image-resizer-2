# Migration to Pino Logger

This document outlines the strategy for migrating our custom logging system to Pino while maintaining full feature parity.

## Current Logging Features

Our existing logging system provides:

1. **Log Levels**: DEBUG, INFO, WARN, ERROR
2. **Structured Logging**: JSON-formatted logs
3. **Breadcrumbs**: Execution path tracking with performance measurements
4. **Context-based Logging**: Categorization by component
5. **Configurable Options**: Timestamps, structured format, etc.
6. **Optimized Implementation**: Performance-focused version
7. **Factory Pattern**: Configuration-based logger creation

## Why Pino?

- **Performance**: Significantly faster than custom implementations
- **Standards Compliance**: Industry-standard logging format
- **Active Maintenance**: Regular updates and security patches
- **Ecosystem**: Rich plugin system and transport options
- **Built-in Features**: Redaction, child loggers, serializers

## Migration Strategy

### 1. Create Adapter Layer

```typescript
// src/utils/pino-logging.ts
import pino from 'pino';
import { ImageResizerConfig } from '../config';
import { Logger, LogData, LogLevel } from './logging';

export function createPinoLogger(
  config: ImageResizerConfig,
  context?: string
): Logger {
  // Map our log levels to Pino levels
  const levelMap: Record<LogLevel, string> = {
    [LogLevel.DEBUG]: 'debug',
    [LogLevel.INFO]: 'info',
    [LogLevel.WARN]: 'warn',
    [LogLevel.ERROR]: 'error'
  };

  // Configure Pino options based on our config
  const pinoOptions: pino.LoggerOptions = {
    level: levelMap[LOG_LEVEL_MAP[config.logging?.level || 'INFO'] || LogLevel.INFO],
    timestamp: config.logging?.includeTimestamp !== false,
    messageKey: 'message',
    base: context ? { context } : {},
    browser: {
      asObject: true
    }
  };

  // Create base Pino logger
  const pinoLogger = pino(pinoOptions);

  // Return our adapter interface
  return {
    debug(message: string, data?: LogData): void {
      pinoLogger.debug(data || {}, message);
    },
    
    info(message: string, data?: LogData): void {
      pinoLogger.info(data || {}, message);
    },
    
    warn(message: string, data?: LogData): void {
      pinoLogger.warn(data || {}, message);
    },
    
    error(message: string, data?: LogData): void {
      pinoLogger.error(data || {}, message);
    },
    
    breadcrumb(step: string, duration?: number, data?: LogData): void {
      if (config.logging?.enableBreadcrumbs !== false) {
        const breadcrumbData = {
          type: 'breadcrumb',
          ...data,
          ...(duration !== undefined ? { durationMs: duration } : {})
        };
        
        pinoLogger.info(breadcrumbData, `BREADCRUMB: ${step}`);
      }
    }
  };
}
```

### 2. Enhanced Optimized Logger Implementation

```typescript
// src/utils/pino-optimized-logging.ts
import pino from 'pino';
import { ImageResizerConfig } from '../config';
import { Logger, LogData, LogLevel } from './logging';
import { OptimizedLogger } from './optimized-logging';

export function createOptimizedPinoLogger(
  config: ImageResizerConfig,
  context?: string
): OptimizedLogger {
  // Create base logger
  const baseLogger = createPinoLogger(config, context);
  const pinoInstance = getPinoInstance(baseLogger);
  
  // Get configured log level
  const minLevel = LOG_LEVEL_MAP[config.logging?.level || 'INFO'] || LogLevel.INFO;
  
  // Performance flags
  const enablePerformanceTracking = config.debug?.performanceTracking !== false;
  const enableBreadcrumbs = config.logging?.enableBreadcrumbs !== false;
  
  return {
    ...baseLogger,
    
    isLevelEnabled(level: keyof typeof LogLevel): boolean {
      return minLevel <= LogLevel[level];
    },
    
    getMinLevel(): LogLevel {
      return minLevel;
    },
    
    trackedBreadcrumb(step: string, startTime?: number, data?: LogData): number {
      const now = Date.now();
      
      if (enableBreadcrumbs && enablePerformanceTracking && startTime !== undefined) {
        const duration = now - startTime;
        this.breadcrumb(step, duration, data);
      } else if (enableBreadcrumbs) {
        this.breadcrumb(step, undefined, data);
      }
      
      return now;
    }
  };
}
```

### 3. Factory Method for Drop-in Replacement

```typescript
// src/utils/logging-factory.ts
import { ImageResizerConfig } from '../config';
import { Logger } from './logging';
import { OptimizedLogger } from './optimized-logging';
import { createPinoLogger } from './pino-logging';
import { createOptimizedPinoLogger } from './pino-optimized-logging';

export function createLoggerWithPino(
  config: ImageResizerConfig, 
  context?: string, 
  useOptimized: boolean = false
): Logger | OptimizedLogger {
  if (useOptimized) {
    return createOptimizedPinoLogger(config, context);
  }
  return createPinoLogger(config, context);
}
```

## Implementation Plan

### Phase 1: Initial Setup

1. Add Pino as a dependency:
   ```bash
   npm install pino
   ```

2. Create adapter implementation files:
   - `src/utils/pino-logging.ts`
   - `src/utils/pino-optimized-logging.ts`

3. Create unit tests for the new implementation

### Phase 2: Dual Operation

1. Create a feature flag in configuration:
   ```typescript
   logging: {
     // ...existing options
     usePino: boolean;
   }
   ```

2. Update logger factory to conditionally use Pino:
   ```typescript
   export function createLogger(
     config: ImageResizerConfig, 
     context?: string, 
     useOptimized: boolean = false
   ): Logger | OptimizedLogger {
     if (config.logging?.usePino === true) {
       return createLoggerWithPino(config, context, useOptimized);
     }
     
     // Existing implementation
     // ...
   }
   ```

3. Deploy with feature flag disabled

### Phase 3: Gradual Rollout

1. Enable Pino in development environment
2. Monitor for issues and parity problems
3. Add any missing features
4. Update documentation

### Phase 4: Complete Migration

1. Enable Pino in all environments
2. Remove old implementation
3. Remove feature flag

## Extended Features with Pino

### 1. Redaction Capabilities

Pino offers built-in redaction for sensitive data:

```typescript
const pinoOptions: pino.LoggerOptions = {
  // ...other options
  redact: {
    paths: ['password', 'token', '*.key'],
    censor: '[REDACTED]'
  }
};
```

### 2. Custom Serializers

```typescript
const pinoOptions: pino.LoggerOptions = {
  serializers: {
    req: pino.stdSerializers.req,
    res: pino.stdSerializers.res,
    err: pino.stdSerializers.err,
    // Custom serializer for our domain objects
    imageOptions: (options) => ({
      width: options.width,
      height: options.height,
      format: options.format
    })
  }
};
```

### 3. Transport Integration

For environments that support it:

```typescript
import pino from 'pino';
import transport from 'pino-pretty';

const pinoLogger = pino({
  level: 'debug'
}, transport());
```

## Compatibility Considerations

### Cloudflare Workers Environment

1. **Bundle Size**: Pino is larger than our custom solution, but tree-shaking should help
2. **Browser Compatibility**: Use `pino-pretty` in development for readability
3. **Worker Limitations**: Some Pino features may not work in the Workers runtime
4. **Async Logging**: Ensure our usage is compatible with Workers' event-driven model

## Performance Testing

Before full deployment, conduct performance tests comparing:

1. Current logging system vs Pino
2. Memory usage
3. CPU overhead
4. Cold start impact
5. Bundle size differences

## Success Criteria

The migration will be considered successful when:

1. All existing logging capabilities are preserved
2. No performance regressions are detected
3. All team members are comfortable with the new system
4. Documentation is complete
5. Test coverage remains at or above current levels