/**
 * Performance measurement utilities for the image resizer worker
 * 
 * This module provides tools for measuring and tracking performance metrics,
 * establishing baselines, and comparing performance across different code paths.
 */

import { Logger, LogLevel, LogData } from './logging';
import { OptimizedLogger } from './optimized-logging';
import { PerformanceMetrics } from '../services/interfaces';

/**
 * Measures the execution time of a function
 * 
 * @param fn The function to measure
 * @param logger Optional logger to record the result
 * @param operationName Name of the operation being measured
 * @returns The result of the function and the execution time in ms
 */
export async function measureExecutionTime<T>(
  fn: () => Promise<T> | T,
  logger?: Logger | OptimizedLogger,
  operationName = 'Operation'
): Promise<{ result: T, executionTime: number }> {
  const startTime = Date.now();
  
  try {
    // Execute the function (handles both sync and async)
    const result = await fn();
    const executionTime = Date.now() - startTime;
    
    // Log the result if a logger is provided
    if (logger) {
      // Check if we have an optimized logger with level checking
      const isOptimizedLogger = !!(logger as OptimizedLogger).isLevelEnabled;
      
      if (isOptimizedLogger) {
        // Use the proper enum value for DEBUG level
        if ((logger as OptimizedLogger).isLevelEnabled('DEBUG' as keyof typeof LogLevel)) {
          logger.debug(`${operationName} execution time: ${executionTime}ms`);
        }
      } else {
        logger.debug(`${operationName} execution time: ${executionTime}ms`);
      }
    }
    
    return { result, executionTime };
  } catch (error) {
    const executionTime = Date.now() - startTime;
    
    // Log the error if a logger is provided
    if (logger) {
      // Format error for logging
      const errorInfo: LogData = {
        executionTime,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorName: error instanceof Error ? error.name : 'UnknownError',
        errorStack: error instanceof Error ? error.stack : undefined
      };
      
      logger.error(`Error in ${operationName}: ${errorInfo.errorMessage}`, errorInfo);
    }
    
    // Re-throw the error to maintain the same behavior
    throw error;
  }
}

/**
 * Performance measurement interface with additional metadata
 */
export interface PerformanceMeasurement {
  name: string;
  startTime: number;
  endTime: number;
  duration: number;
  metadata?: Record<string, any>;
}

/**
 * Simple performance timer for tracking execution times
 */
export class PerformanceTimer {
  private measurements: Map<string, PerformanceMeasurement> = new Map();
  private startTimes: Map<string, number> = new Map();
  private logger?: Logger | OptimizedLogger;
  private isOptimizedLogger: boolean = false;
  
  /**
   * Create a new performance timer
   * 
   * @param logger Optional logger to use for recording measurements
   */
  constructor(logger?: Logger | OptimizedLogger) {
    this.logger = logger;
    
    // Check if we have an optimized logger
    if (logger) {
      this.isOptimizedLogger = !!(logger as OptimizedLogger).isLevelEnabled;
    }
    
    // Record initialization time for fallback purposes
    this.startTimes.set('__init', Date.now());
  }
  
  /**
   * Start measuring a named operation
   * 
   * @param name Operation name
   * @returns The current timestamp
   */
  start(name: string): number {
    const startTime = Date.now();
    this.startTimes.set(name, startTime);
    
    // Log start if debug level is enabled
    if (this.logger && this.shouldLog('DEBUG' as keyof typeof LogLevel)) {
      this.logger.debug(`Starting measurement: ${name}`);
    }
    
    return startTime;
  }
  
  /**
   * End measuring a named operation
   * 
   * @param name Operation name
   * @param metadata Optional metadata to associate with the measurement
   * @returns The duration in milliseconds
   */
  end(name: string, metadata?: Record<string, any>): number {
    const endTime = Date.now();
    const startTime = this.startTimes.get(name);
    
    // If no start time exists, either log a warning or use the current time as an approximation
    if (startTime === undefined) {
      if (this.logger && this.shouldLog('WARN' as keyof typeof LogLevel)) {
        this.logger.warn(`Attempting to end measurement that wasn't started: ${name}`);
      }
      
      // Use an estimated duration (current time - class instantiation time)
      // This is better than throwing an error in production
      const estimatedStartTime = this.startTimes.get('__init') || Date.now();
      const duration = endTime - estimatedStartTime;
      
      // Store the measurement anyway
      this.measurements.set(name, {
        name,
        startTime: estimatedStartTime,
        endTime,
        duration,
        metadata: { 
          ...metadata,
          estimated: true,
          error: 'Measurement not explicitly started'
        }
      });
      
      return duration;
    }
    
    const duration = endTime - startTime;
    
    // Store the measurement
    this.measurements.set(name, {
      name,
      startTime,
      endTime,
      duration,
      metadata
    });
    
    // Log completion if debug level is enabled
    if (this.logger && this.shouldLog('DEBUG' as keyof typeof LogLevel)) {
      this.logger.debug(`Completed measurement: ${name} - ${duration}ms`, metadata);
    }
    
    return duration;
  }
  
  /**
   * Check if a log level is enabled (for optimized loggers)
   */
  private shouldLog(level: keyof typeof LogLevel): boolean {
    if (!this.logger) return false;
    
    if (this.isOptimizedLogger) {
      return (this.logger as OptimizedLogger).isLevelEnabled(level);
    }
    
    return true; // Regular loggers will handle level checking internally
  }
  
  /**
   * Get a specific measurement
   * 
   * @param name Measurement name
   * @returns The measurement or undefined if not found
   */
  getMeasurement(name: string): PerformanceMeasurement | undefined {
    return this.measurements.get(name);
  }
  
  /**
   * Get all measurements
   * 
   * @returns Array of all measurements
   */
  getAllMeasurements(): PerformanceMeasurement[] {
    return Array.from(this.measurements.values());
  }
  
  /**
   * Record metrics to a PerformanceMetrics object
   * 
   * @param metrics The metrics object to update
   */
  recordToMetrics(metrics: PerformanceMetrics): void {
    // Map measurement names to metrics properties
    const mappings: Record<string, keyof PerformanceMetrics> = {
      'total': 'start',
      'storage': 'storageStart',
      'storage_end': 'storageEnd',
      'transform': 'transformStart',
      'transform_end': 'transformEnd',
      'detection': 'detectionStart',
      'detection_end': 'detectionEnd'
    };
    
    // Update the metrics object
    for (const [name, measurement] of this.measurements.entries()) {
      const metricKey = mappings[name];
      if (metricKey) {
        if (name.endsWith('_end')) {
          // For end timestamps, use the end time
          (metrics as any)[metricKey] = measurement.endTime;
        } else {
          // For start timestamps, use the start time
          (metrics as any)[metricKey] = measurement.startTime;
        }
      }
      
      // For detection source, check for metadata
      if (name === 'detection' && measurement.metadata?.source) {
        metrics.detectionSource = measurement.metadata.source;
      }
    }
    
    // Set end time if available
    if (!metrics.end && this.measurements.has('total_end')) {
      metrics.end = this.measurements.get('total_end')!.endTime;
    }
  }
  
  /**
   * Clear all measurements
   */
  clear(): void {
    this.measurements.clear();
    this.startTimes.clear();
  }
}

/**
 * Tracks performance of the application to allow baseline measurements
 * and identify performance regressions
 */
export class PerformanceBaseline {
  private static instance: PerformanceBaseline;
  private baselines: Map<string, PerformanceStats> = new Map();
  private logger?: Logger | OptimizedLogger;
  
  /**
   * Get the singleton instance
   */
  static getInstance(logger?: Logger | OptimizedLogger): PerformanceBaseline {
    if (!PerformanceBaseline.instance) {
      PerformanceBaseline.instance = new PerformanceBaseline(logger);
    }
    
    return PerformanceBaseline.instance;
  }
  
  private constructor(logger?: Logger | OptimizedLogger) {
    this.logger = logger;
  }
  
  /**
   * Record a measurement to the baseline
   * 
   * @param category The measurement category (e.g., 'storage', 'transformation')
   * @param operation The specific operation (e.g., 'fetchImage', 'transformImage')
   * @param duration The measured duration in milliseconds
   * @param metadata Optional additional metadata
   */
  record(
    category: string,
    operation: string,
    duration: number,
    metadata?: Record<string, any>
  ): void {
    const key = `${category}:${operation}`;
    
    // Get or create stats for this operation
    let stats = this.baselines.get(key);
    if (!stats) {
      stats = {
        count: 0,
        totalTime: 0,
        minTime: Number.MAX_SAFE_INTEGER,
        maxTime: 0,
        average: 0,
        category,
        operation,
        samples: []
      };
      this.baselines.set(key, stats);
    }
    
    // Update stats
    stats.count++;
    stats.totalTime += duration;
    stats.minTime = Math.min(stats.minTime, duration);
    stats.maxTime = Math.max(stats.maxTime, duration);
    stats.average = stats.totalTime / stats.count;
    
    // Add sample (up to 100 samples)
    if (stats.samples.length < 100) {
      stats.samples.push({
        timestamp: Date.now(),
        duration,
        metadata
      });
    } else {
      // Replace oldest sample
      stats.samples.shift();
      stats.samples.push({
        timestamp: Date.now(),
        duration,
        metadata
      });
    }
    
    // Log if we have a logger
    if (this.logger) {
      const isOptimizedLogger = !!(this.logger as OptimizedLogger).isLevelEnabled;
      
      if (isOptimizedLogger) {
        if ((this.logger as OptimizedLogger).isLevelEnabled('DEBUG')) {
          this.logger.debug(`Performance: ${category}:${operation} - ${duration}ms (avg: ${stats.average.toFixed(2)}ms)`, metadata);
        }
      } else {
        this.logger.debug(`Performance: ${category}:${operation} - ${duration}ms (avg: ${stats.average.toFixed(2)}ms)`, metadata);
      }
    }
  }
  
  /**
   * Get performance stats for a specific operation
   * 
   * @param category The measurement category
   * @param operation The specific operation
   * @returns The performance stats or undefined if not found
   */
  getStats(category: string, operation: string): PerformanceStats | undefined {
    const key = `${category}:${operation}`;
    return this.baselines.get(key);
  }
  
  /**
   * Get all performance stats
   * 
   * @returns Array of all performance stats
   */
  getAllStats(): PerformanceStats[] {
    return Array.from(this.baselines.values());
  }
  
  /**
   * Get stats grouped by category
   * 
   * @returns Map of categories to stat arrays
   */
  getStatsByCategory(): Map<string, PerformanceStats[]> {
    const result = new Map<string, PerformanceStats[]>();
    
    for (const stats of this.baselines.values()) {
      if (!result.has(stats.category)) {
        result.set(stats.category, []);
      }
      
      result.get(stats.category)!.push(stats);
    }
    
    return result;
  }
  
  /**
   * Export baselines to a JSON string
   * 
   * @returns JSON string containing all baseline data
   */
  exportBaselines(): string {
    const data = Array.from(this.baselines.values());
    return JSON.stringify(data, null, 2);
  }
  
  /**
   * Import baselines from a JSON string
   * 
   * @param json JSON string containing baseline data
   */
  importBaselines(json: string): void {
    try {
      const data = JSON.parse(json) as PerformanceStats[];
      
      // Clear existing baselines
      this.baselines.clear();
      
      // Import new baselines
      for (const stats of data) {
        const key = `${stats.category}:${stats.operation}`;
        this.baselines.set(key, stats);
      }
      
      if (this.logger) {
        this.logger.info(`Imported performance baselines: ${data.length} entries`);
      }
    } catch (error) {
      if (this.logger) {
        this.logger.error(`Error importing performance baselines: ${error instanceof Error ? error.message : String(error)}`);
      }
      throw error;
    }
  }
  
  /**
   * Clear all baseline data
   */
  clear(): void {
    this.baselines.clear();
  }
  
  /**
   * Initialize a baseline category with empty data
   * 
   * @param category The measurement category to initialize
   * @param maxSamples Maximum number of samples to keep (default: 100)
   */
  initializeBaseline(category: string, maxSamples: number = 100): void {
    if (this.logger) {
      this.logger.debug(`Initializing performance baseline for category: ${category}`);
    }
    
    // Set up empty stats for common operations in this category
    const defaultOperations = ['read', 'write', 'process', 'transform', 'fetch', 'general'];
    
    for (const operation of defaultOperations) {
      const key = `${category}:${operation}`;
      
      // Only initialize if not already present
      if (!this.baselines.has(key)) {
        this.baselines.set(key, {
          count: 0,
          totalTime: 0,
          minTime: Number.MAX_SAFE_INTEGER,
          maxTime: 0,
          average: 0,
          category,
          operation,
          samples: []
        });
      }
    }
    
    if (this.logger) {
      this.logger.debug(`Initialized performance baseline for ${category} with ${defaultOperations.length} default operations`);
    }
  }
}

// Sample data type for performance statistics
export interface PerformanceSample {
  timestamp: number;
  duration: number;
  metadata?: Record<string, any>;
}

// Type definition for performance statistics
export interface PerformanceStats {
  count: number;
  totalTime: number;
  minTime: number;
  maxTime: number;
  average: number;
  category: string;
  operation: string;
  samples: PerformanceSample[];
}