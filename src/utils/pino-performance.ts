/**
 * Performance metrics integration for Pino loggers
 * 
 * This module provides functionality to automatically include performance metrics
 * in Pino log messages, helping to track performance across different operations.
 */

import { Logger as PinoLogger } from 'pino';
import { PerformanceBaseline, PerformanceTimer, PerformanceMeasurement } from './performance-metrics';
import { PerformanceMetrics } from '../services/interfaces';
import { Logger, LogData } from './logging';
import { OptimizedLogger } from './optimized-logging';
import { ImageResizerConfig } from '../config';
import { createPinoInstance, prepareLogData } from './pino-core';

// Metrics that should be added to logs when available
const TRACKED_METRICS = [
  'duration',
  'responseTime',
  'storageTime',
  'transformTime',
  'cacheLatency',
  'memoryUsage',
  'cpuTime',
  'waitTime'
];

/**
 * Creates a performance-enhanced Pino logger
 * 
 * @param config The image resizer configuration
 * @param context Optional context name for the logger
 * @param performanceBaseline Optional performance baseline instance
 * @returns A logger enhanced with performance tracking
 */
export function createPerformancePinoLogger(
  config: ImageResizerConfig,
  context?: string,
  performanceBaseline?: PerformanceBaseline
): Logger & { 
  withPerformance: (metrics: Record<string, number>) => Logger;
  startTimer: (operationName: string) => PerformanceTimer;
  recordOperation: (category: string, operation: string, duration: number, data?: Record<string, unknown>) => void;
} {
  // Create the underlying Pino instance
  const pinoLogger = createPinoInstance(config, context);
  
  // Extract config with defaults
  const loggingConfig = config.logging || {
    level: 'INFO',
    includeTimestamp: true,
    enableStructuredLogs: false,
    enableBreadcrumbs: true
  };
  
  const debugConfig = config.debug || {
    enabled: false,
    includePerformance: true
  };
  
  // Determine if structured logs are enabled (default to false)
  const useStructuredLogs = loggingConfig.enableStructuredLogs === true;
  
  // Determine if breadcrumbs are enabled (default to true)
  const enableBreadcrumbs = loggingConfig.enableBreadcrumbs !== false;
  
  // Determine if performance tracking is enabled (default to true)
  const enablePerformanceTracking = debugConfig.includePerformance !== false;
  
  // Get or create a performance baseline instance
  const baseline = performanceBaseline || 
    (enablePerformanceTracking ? PerformanceBaseline.getInstance() : undefined);
  
  /**
   * Create a child logger with performance metrics attached to every log entry
   * 
   * @param metrics Performance metrics to attach
   * @returns A logger with performance metrics attached
   */
  function withPerformance(metrics: Record<string, number>): Logger {
    // Only include performance metrics if tracking is enabled
    if (!enablePerformanceTracking) {
      return createBasicLogger();
    }
    
    const childLogger = pinoLogger.child({ performance: metrics });
    
    return {
      debug: (message: string, data?: LogData) => 
        childLogger.debug(prepareLogData(data), message),
      info: (message: string, data?: LogData) => 
        childLogger.info(prepareLogData(data), message),
      warn: (message: string, data?: LogData) => 
        childLogger.warn(prepareLogData(data), message),
      error: (message: string, data?: LogData) => 
        childLogger.error(prepareLogData(data), message),
      breadcrumb: (step: string, duration?: number, data?: LogData) => {
        if (enableBreadcrumbs) {
          // Create the breadcrumb data object
          const breadcrumbData = {
            type: 'breadcrumb',
            breadcrumb: true, // Flag for pretty printing
            ...(useStructuredLogs ? prepareLogData(data) : {}),
            ...(duration !== undefined ? { durationMs: duration } : {})
          };
          
          // If not using structured logs, add data directly to the message
          let message = `BREADCRUMB: ${step}`;
          if (!useStructuredLogs && data) {
            try {
              const dataStr = typeof data === 'object' 
                ? JSON.stringify(data)
                : String(data);
              message += ` ${dataStr}`;
            } catch (e) {
              message += ` ${data}`;
            }
          }
          
          childLogger.info(breadcrumbData, message);
        }
      }
    };
  }
  
  /**
   * Start a performance timer for an operation
   * 
   * @param operationName Name of the operation to time
   * @returns A performance timer instance
   */
  function startTimer(operationName: string): PerformanceTimer {
    if (!enablePerformanceTracking) {
      return new PerformanceTimer();
    }
    
    const timer = new PerformanceTimer(createBasicLogger());
    timer.start(operationName);
    return timer;
  }
  
  /**
   * Record an operation's performance to the baseline
   * 
   * @param category The operation category
   * @param operation The specific operation
   * @param duration The duration in milliseconds
   * @param data Optional metadata
   */
  function recordOperation(
    category: string, 
    operation: string, 
    duration: number, 
    data?: Record<string, unknown>
  ): void {
    if (enablePerformanceTracking && baseline) {
      baseline.record(category, operation, duration, data);
      
      if (pinoLogger.isLevelEnabled('debug' as any)) {
        pinoLogger.debug({
          performance: {
            category,
            operation,
            duration,
            ...data
          }
        }, `Performance: ${category}:${operation} - ${duration}ms`);
      }
    }
  }
  
  /**
   * Create a basic logger without performance enhancements
   * 
   * @returns A basic logger
   */
  function createBasicLogger(): Logger {
    return {
      debug: (message: string, data?: LogData) => 
        pinoLogger.debug(prepareLogData(data), message),
      info: (message: string, data?: LogData) => 
        pinoLogger.info(prepareLogData(data), message),
      warn: (message: string, data?: LogData) => 
        pinoLogger.warn(prepareLogData(data), message),
      error: (message: string, data?: LogData) => 
        pinoLogger.error(prepareLogData(data), message),
      breadcrumb: (step: string, duration?: number, data?: LogData) => {
        if (enableBreadcrumbs) {
          const breadcrumbData = {
            type: 'breadcrumb',
            breadcrumb: true,
            ...(useStructuredLogs ? prepareLogData(data) : {}),
            ...(duration !== undefined ? { durationMs: duration } : {})
          };
          
          let message = `BREADCRUMB: ${step}`;
          if (!useStructuredLogs && data) {
            try {
              const dataStr = typeof data === 'object' 
                ? JSON.stringify(data)
                : String(data);
              message += ` ${dataStr}`;
            } catch (e) {
              message += ` ${data}`;
            }
          }
          
          pinoLogger.info(breadcrumbData, message);
        }
      }
    };
  }
  
  // Create the basic logger
  const basicLogger = createBasicLogger();
  
  // Return the enhanced logger with performance methods
  return {
    ...basicLogger,
    withPerformance,
    startTimer,
    recordOperation
  };
}

/**
 * Creates an optimized performance-enhanced Pino logger
 * 
 * @param config The image resizer configuration
 * @param context Optional context name for the logger
 * @param performanceBaseline Optional performance baseline instance
 * @returns An optimized logger enhanced with performance tracking
 */
export function createOptimizedPerformancePinoLogger(
  config: ImageResizerConfig,
  context?: string,
  performanceBaseline?: PerformanceBaseline
): OptimizedLogger & {
  withPerformance: (metrics: Record<string, number>) => OptimizedLogger;
  startTimer: (operationName: string) => PerformanceTimer;
  recordOperation: (category: string, operation: string, duration: number, data?: Record<string, unknown>) => void;
  trackMetrics: (metrics: PerformanceMetrics) => void;
} {
  // Create the underlying Pino instance
  const pinoLogger = createPinoInstance(config, context);
  
  // Extract configuration with defaults
  const loggingConfig = config.logging || {
    level: 'INFO',
    includeTimestamp: true,
    enableStructuredLogs: false,
    enableBreadcrumbs: true
  };
  
  const debugConfig = config.debug || {
    enabled: false,
    includePerformance: true
  };
  
  // Configure feature flags
  const useStructuredLogs = loggingConfig.enableStructuredLogs === true;
  const enableBreadcrumbs = loggingConfig.enableBreadcrumbs !== false;
  const enablePerformanceTracking = debugConfig.includePerformance !== false;
  
  // Get configured log level with default
  const configuredLevel = loggingConfig.level || 'INFO';
  
  // Get or create a performance baseline instance
  const baseline = performanceBaseline || 
    (enablePerformanceTracking ? PerformanceBaseline.getInstance() : undefined);
  
  // Mapping to Pino level numbers
  const PINO_LEVEL_VALUES: Record<string, number> = {
    'debug': 20,
    'info': 30,
    'warn': 40,
    'error': 50,
    'fatal': 60,
    'trace': 10,
    'silent': Infinity
  };
  
  /**
   * Checks if a specific log level is enabled
   * 
   * @param level The log level to check
   * @returns True if the level is enabled, false otherwise
   */
  function isLevelEnabled(level: string): boolean {
    // Map our level to Pino level name (lowercase)
    const requestedLevelStr = String(level).toLowerCase();
    const requestedLevelValue = PINO_LEVEL_VALUES[requestedLevelStr] || PINO_LEVEL_VALUES.info;
    
    // Get the current Pino level
    const currentLevelName = typeof pinoLogger.level === 'string' ? pinoLogger.level : 'info';
    const currentLevelValue = PINO_LEVEL_VALUES[currentLevelName] || PINO_LEVEL_VALUES.info;
    
    // In Pino, a level is enabled if its value is >= the current level value
    return requestedLevelValue >= currentLevelValue;
  }
  
  /**
   * Create a child logger with performance metrics attached to every log entry
   * 
   * @param metrics Performance metrics to attach
   * @returns An optimized logger with performance metrics attached
   */
  function withPerformance(metrics: Record<string, number>): OptimizedLogger {
    // Only include performance metrics if tracking is enabled
    if (!enablePerformanceTracking) {
      return createBasicOptimizedLogger();
    }
    
    const childLogger = pinoLogger.child({ performance: metrics });
    
    return {
      debug: (message: string, data?: LogData) => {
        if (isLevelEnabled('DEBUG')) {
          childLogger.debug(prepareLogData(data), message);
        }
      },
      info: (message: string, data?: LogData) => {
        if (isLevelEnabled('INFO')) {
          childLogger.info(prepareLogData(data), message);
        }
      },
      warn: (message: string, data?: LogData) => {
        if (isLevelEnabled('WARN')) {
          childLogger.warn(prepareLogData(data), message);
        }
      },
      error: (message: string, data?: LogData) => {
        if (isLevelEnabled('ERROR')) {
          childLogger.error(prepareLogData(data), message);
        }
      },
      breadcrumb: (step: string, duration?: number, data?: LogData) => {
        if (enableBreadcrumbs && isLevelEnabled('INFO')) {
          // Create the breadcrumb data object
          const breadcrumbData = {
            type: 'breadcrumb',
            breadcrumb: true,
            ...(useStructuredLogs ? prepareLogData(data) : {}),
            ...(duration !== undefined ? { durationMs: duration } : {})
          };
          
          // If not using structured logs, add data directly to the message
          let message = `BREADCRUMB: ${step}`;
          if (!useStructuredLogs && data) {
            try {
              const dataStr = typeof data === 'object' 
                ? JSON.stringify(data)
                : String(data);
              message += ` ${dataStr}`;
            } catch (e) {
              message += ` ${data}`;
            }
          }
          
          childLogger.info(breadcrumbData, message);
        }
      },
      isLevelEnabled: (level) => isLevelEnabled(level),
      getMinLevel: () => configuredLevel as any,
      trackedBreadcrumb: (step: string, startTime?: number, data?: LogData) => {
        const now = Date.now();
        
        if (enableBreadcrumbs && enablePerformanceTracking && startTime !== undefined) {
          const duration = now - startTime;
          if (isLevelEnabled('INFO')) {
            // Create the breadcrumb data object
            const breadcrumbData = {
              type: 'breadcrumb',
              breadcrumb: true,
              durationMs: duration,
              ...(useStructuredLogs ? prepareLogData(data) : {})
            };
            
            // If not using structured logs, add data directly to the message
            let message = `BREADCRUMB: ${step}`;
            if (!useStructuredLogs && data) {
              try {
                const dataStr = typeof data === 'object' 
                  ? JSON.stringify(data)
                  : String(data);
                message += ` ${dataStr}`;
              } catch (e) {
                message += ` ${data}`;
              }
            }
            
            childLogger.info(breadcrumbData, message);
          }
        } else if (enableBreadcrumbs && isLevelEnabled('INFO')) {
          const breadcrumbData = {
            type: 'breadcrumb',
            breadcrumb: true,
            ...(useStructuredLogs ? prepareLogData(data) : {})
          };
          
          let message = `BREADCRUMB: ${step}`;
          if (!useStructuredLogs && data) {
            try {
              const dataStr = typeof data === 'object' 
                ? JSON.stringify(data)
                : String(data);
              message += ` ${dataStr}`;
            } catch (e) {
              message += ` ${data}`;
            }
          }
          
          childLogger.info(breadcrumbData, message);
        }
        
        return now;
      }
    };
  }
  
  /**
   * Start a performance timer for an operation
   * 
   * @param operationName Name of the operation to time
   * @returns A performance timer instance
   */
  function startTimer(operationName: string): PerformanceTimer {
    if (!enablePerformanceTracking) {
      return new PerformanceTimer();
    }
    
    const timer = new PerformanceTimer(createBasicOptimizedLogger());
    timer.start(operationName);
    return timer;
  }
  
  /**
   * Record an operation's performance to the baseline
   * 
   * @param category The operation category
   * @param operation The specific operation
   * @param duration The duration in milliseconds
   * @param data Optional metadata
   */
  function recordOperation(
    category: string, 
    operation: string, 
    duration: number, 
    data?: Record<string, unknown>
  ): void {
    if (enablePerformanceTracking && baseline) {
      baseline.record(category, operation, duration, data);
      
      if (isLevelEnabled('DEBUG')) {
        pinoLogger.debug({
          performance: {
            category,
            operation,
            duration,
            ...data
          }
        }, `Performance: ${category}:${operation} - ${duration}ms`);
      }
    }
  }
  
  /**
   * Track a complete set of performance metrics
   * 
   * This will extract timing information and log a structured performance event
   * 
   * @param metrics The performance metrics to track
   */
  function trackMetrics(metrics: PerformanceMetrics): void {
    if (!enablePerformanceTracking || !isLevelEnabled('DEBUG')) {
      return;
    }
    
    // Extract timing information
    const totalTime = metrics.end && metrics.start ? metrics.end - metrics.start : undefined;
    const storageTime = metrics.storageEnd && metrics.storageStart ? 
      metrics.storageEnd - metrics.storageStart : undefined;
    const transformTime = metrics.transformEnd && metrics.transformStart ? 
      metrics.transformEnd - metrics.transformStart : undefined;
    const detectionTime = metrics.detectionEnd && metrics.detectionStart ? 
      metrics.detectionEnd - metrics.detectionStart : undefined;
    const kvCacheLookupTime = metrics.kvCacheLookupEnd && metrics.kvCacheLookupStart ? 
      metrics.kvCacheLookupEnd - metrics.kvCacheLookupStart : undefined;
    
    // Create performance data structure
    const performanceData = {
      totalTime,
      storageTime,
      transformTime,
      detectionTime,
      kvCacheLookupTime,
      detectionSource: metrics.detectionSource,
      kvCacheHit: metrics.kvCacheHit,
      kvCacheError: metrics.kvCacheError
    };
    
    // Log the performance data
    pinoLogger.debug({
      performance: performanceData,
      metrics: metrics
    }, `Performance metrics: total=${totalTime}ms, storage=${storageTime}ms, transform=${transformTime}ms, detection=${detectionTime}ms`);
    
    // Record to baseline if total time is available
    if (totalTime !== undefined && baseline) {
      baseline.record('request', 'total', totalTime, { metrics });
      
      // Record individual operations
      if (storageTime !== undefined) {
        baseline.record('storage', 'fetch', storageTime, { 
          detectionSource: metrics.detectionSource
        });
      }
      if (transformTime !== undefined) {
        baseline.record('transform', 'process', transformTime, { 
          kvCacheHit: metrics.kvCacheHit
        });
      }
      if (detectionTime !== undefined) {
        baseline.record('detection', 'analyze', detectionTime, { 
          source: metrics.detectionSource
        });
      }
      if (kvCacheLookupTime !== undefined) {
        baseline.record('cache', 'lookup', kvCacheLookupTime, { 
          hit: metrics.kvCacheHit,
          error: metrics.kvCacheError
        });
      }
    }
  }
  
  /**
   * Create a basic optimized logger without performance enhancements
   * 
   * @returns A basic optimized logger
   */
  function createBasicOptimizedLogger(): OptimizedLogger {
    return {
      debug: (message: string, data?: LogData) => {
        if (isLevelEnabled('DEBUG')) {
          pinoLogger.debug(prepareLogData(data), message);
        }
      },
      info: (message: string, data?: LogData) => {
        if (isLevelEnabled('INFO')) {
          pinoLogger.info(prepareLogData(data), message);
        }
      },
      warn: (message: string, data?: LogData) => {
        if (isLevelEnabled('WARN')) {
          pinoLogger.warn(prepareLogData(data), message);
        }
      },
      error: (message: string, data?: LogData) => {
        if (isLevelEnabled('ERROR')) {
          pinoLogger.error(prepareLogData(data), message);
        }
      },
      breadcrumb: (step: string, duration?: number, data?: LogData) => {
        if (enableBreadcrumbs && isLevelEnabled('INFO')) {
          const breadcrumbData = {
            type: 'breadcrumb',
            breadcrumb: true,
            ...(useStructuredLogs ? prepareLogData(data) : {}),
            ...(duration !== undefined ? { durationMs: duration } : {})
          };
          
          let message = `BREADCRUMB: ${step}`;
          if (!useStructuredLogs && data) {
            try {
              const dataStr = typeof data === 'object' 
                ? JSON.stringify(data)
                : String(data);
              message += ` ${dataStr}`;
            } catch (e) {
              message += ` ${data}`;
            }
          }
          
          pinoLogger.info(breadcrumbData, message);
        }
      },
      isLevelEnabled: (level) => isLevelEnabled(level),
      getMinLevel: () => configuredLevel as any,
      trackedBreadcrumb: (step: string, startTime?: number, data?: LogData) => {
        const now = Date.now();
        
        if (enableBreadcrumbs && enablePerformanceTracking && startTime !== undefined) {
          const duration = now - startTime;
          if (isLevelEnabled('INFO')) {
            const breadcrumbData = {
              type: 'breadcrumb',
              breadcrumb: true,
              durationMs: duration,
              ...(useStructuredLogs ? prepareLogData(data) : {})
            };
            
            let message = `BREADCRUMB: ${step}`;
            if (!useStructuredLogs && data) {
              try {
                const dataStr = typeof data === 'object' 
                  ? JSON.stringify(data)
                  : String(data);
                message += ` ${dataStr}`;
              } catch (e) {
                message += ` ${data}`;
              }
            }
            
            pinoLogger.info(breadcrumbData, message);
          }
        } else if (enableBreadcrumbs && isLevelEnabled('INFO')) {
          const breadcrumbData = {
            type: 'breadcrumb',
            breadcrumb: true,
            ...(useStructuredLogs ? prepareLogData(data) : {})
          };
          
          let message = `BREADCRUMB: ${step}`;
          if (!useStructuredLogs && data) {
            try {
              const dataStr = typeof data === 'object' 
                ? JSON.stringify(data)
                : String(data);
              message += ` ${dataStr}`;
            } catch (e) {
              message += ` ${data}`;
            }
          }
          
          pinoLogger.info(breadcrumbData, message);
        }
        
        return now;
      }
    };
  }
  
  // Create the basic optimized logger
  const basicOptimizedLogger = createBasicOptimizedLogger();
  
  // Return the enhanced logger with performance methods
  return {
    ...basicOptimizedLogger,
    withPerformance,
    startTimer,
    recordOperation,
    trackMetrics
  };
}