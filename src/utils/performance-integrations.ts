/**
 * Performance integrations for the image resizer
 * 
 * Connects performance measurement utilities with the main request flow
 * and provides consolidated reporting capabilities.
 */

import { PerformanceBaseline, PerformanceTimer } from './performance-metrics';
import { PerformanceMetrics } from '../services/interfaces';
import { Logger, LogLevel, LogData } from './logging';
import { OptimizedLogger } from './optimized-logging';
import { ImageResizerConfig } from '../config';

/**
 * Creates a performance monitor for a request-response cycle
 * 
 * @param metrics The metrics object to update
 * @param logger Optional logger for capturing performance data
 * @param performanceBaseline Optional baseline to record measurements to
 * @returns PerformanceMonitor instance
 */
export function createRequestPerformanceMonitor(
  metrics: PerformanceMetrics,
  logger?: Logger | OptimizedLogger,
  performanceBaseline?: PerformanceBaseline
): RequestPerformanceMonitor {
  return new RequestPerformanceMonitor(metrics, logger, performanceBaseline);
}

/**
 * Performance monitoring for a request-response cycle
 */
export class RequestPerformanceMonitor {
  private timer: PerformanceTimer;
  private metrics: PerformanceMetrics;
  private baseline?: PerformanceBaseline;
  private isOptimizedLogger: boolean = false;
  
  /**
   * Create a new request performance monitor
   * 
   * @param metrics The metrics object to update
   * @param logger Optional logger for recording measurements
   * @param performanceBaseline Optional baseline to record measurements to
   */
  constructor(
    metrics: PerformanceMetrics,
    private logger?: Logger | OptimizedLogger,
    performanceBaseline?: PerformanceBaseline
  ) {
    this.metrics = metrics;
    this.timer = new PerformanceTimer(logger);
    this.baseline = performanceBaseline;
    
    // Check if we have an optimized logger
    if (logger) {
      this.isOptimizedLogger = !!(logger as OptimizedLogger).isLevelEnabled;
    }
    
    // Start the overall timer
    this.timer.start('total');
    this.metrics.start = Date.now();
  }
  
  /**
   * Start timing a specific operation
   * 
   * @param operation The operation name
   * @param data Optional metadata to associate with the measurement
   * @returns This instance for chaining
   */
  startOperation(operation: string, data?: Record<string, any>): RequestPerformanceMonitor {
    this.timer.start(operation);
    
    // Update specific metrics fields
    if (operation === 'storage') {
      this.metrics.storageStart = Date.now();
    } else if (operation === 'transform') {
      this.metrics.transformStart = Date.now();
    } else if (operation === 'detection') {
      this.metrics.detectionStart = Date.now();
    }
    
    // Log operation start if debugging
    if (this.logger && this.shouldLog('DEBUG' as keyof typeof LogLevel)) {
      this.logger.debug(`Starting operation: ${operation}`, data);
    }
    
    return this;
  }
  
  /**
   * End timing a specific operation
   * 
   * @param operation The operation name
   * @param data Optional metadata to associate with the measurement
   * @returns The duration in milliseconds
   */
  endOperation(operation: string, data?: Record<string, any>): number {
    const duration = this.timer.end(operation, data);
    
    // Update specific metrics fields
    if (operation === 'storage') {
      this.metrics.storageEnd = Date.now();
    } else if (operation === 'transform') {
      this.metrics.transformEnd = Date.now();
    } else if (operation === 'detection') {
      this.metrics.detectionEnd = Date.now();
      if (data?.source) {
        this.metrics.detectionSource = data.source;
      }
    }
    
    // Record to baseline if available
    if (this.baseline) {
      // Determine category based on operation
      let category = 'core';
      if (operation.startsWith('storage')) {
        category = 'storage';
      } else if (operation.startsWith('transform')) {
        category = 'transform';
      } else if (operation.startsWith('detection')) {
        category = 'detection';
      } else if (operation.startsWith('cache')) {
        category = 'cache';
      }
      
      this.baseline.record(category, operation, duration, data);
    }
    
    return duration;
  }
  
  /**
   * End the overall request timing
   * 
   * @param data Optional metadata about the request outcome
   * @returns The total request duration in milliseconds
   */
  endRequest(data?: Record<string, any>): number {
    // Check if we started a 'total' timer (not 'total_end')
    const totalStarted = this.timer.getMeasurement('total');
    
    // End the timer that was started or use metrics directly
    let duration = 0;
    if (totalStarted) {
      // Use the 'total' timer that was started
      duration = this.timer.end('total', data);
    } else {
      // Calculate duration from metrics directly
      this.metrics.end = Date.now();
      duration = this.metrics.end - this.metrics.start;
    }
    
    this.metrics.end = Date.now();
    const totalTime = this.metrics.end - this.metrics.start;
    
    // Log overall performance if debug is enabled
    if (this.logger && this.shouldLog('DEBUG' as keyof typeof LogLevel)) {
      this.logger.debug(`Request completed in ${totalTime}ms`, {
        ...data,
        storage: this.getOperationTime('storage'),
        transform: this.getOperationTime('transform'),
        detection: this.getOperationTime('detection'),
        total: totalTime
      });
    }
    
    // Record to baseline if available
    if (this.baseline) {
      this.baseline.record('request', 'total', totalTime, data);
    }
    
    return totalTime;
  }
  
  /**
   * Get the time taken for a specific operation
   * 
   * @param operation The operation name
   * @returns Duration in milliseconds, or 0 if not measured
   */
  getOperationTime(operation: string): number {
    if (operation === 'storage') {
      return (this.metrics.storageEnd && this.metrics.storageStart) 
        ? this.metrics.storageEnd - this.metrics.storageStart 
        : 0;
    } else if (operation === 'transform') {
      return (this.metrics.transformEnd && this.metrics.transformStart) 
        ? this.metrics.transformEnd - this.metrics.transformStart 
        : 0;
    } else if (operation === 'detection') {
      return (this.metrics.detectionEnd && this.metrics.detectionStart) 
        ? this.metrics.detectionEnd - this.metrics.detectionStart 
        : 0;
    } else {
      // Try to get from timer
      const measurement = this.timer.getMeasurement(operation);
      return measurement ? measurement.duration : 0;
    }
  }
  
  /**
   * Get all measurements taken during this request
   * 
   * @returns Array of measurements
   */
  getAllMeasurements() {
    return this.timer.getAllMeasurements();
  }
  
  /**
   * Get the performance metrics object
   * 
   * @returns Current performance metrics
   */
  getMetrics(): PerformanceMetrics {
    return this.metrics;
  }
  
  /**
   * Check if a specific log level is enabled
   * 
   * @param level The log level to check
   * @returns True if the level is enabled
   */
  private shouldLog(level: keyof typeof LogLevel): boolean {
    if (!this.logger) return false;
    
    if (this.isOptimizedLogger) {
      return (this.logger as OptimizedLogger).isLevelEnabled(level);
    }
    
    return true; // Regular loggers handle level checking internally
  }
  
  /**
   * Update the metrics object with all timer measurements
   */
  updateMetrics(): void {
    this.timer.recordToMetrics(this.metrics);
  }
}

/**
 * Initialize the performance baseline system
 * 
 * @param config Application configuration
 * @param logger Logger for performance tracking
 * @returns PerformanceBaseline instance
 */
export function initializePerformanceBaseline(
  config: ImageResizerConfig, 
  logger: Logger | OptimizedLogger
): PerformanceBaseline {
  const isEnabled = config.performance?.baselineEnabled ?? false;
  
  if (!isEnabled) {
    // Just log and return a disabled baseline
    if ((logger as OptimizedLogger).isLevelEnabled?.(('INFO'))) {
      logger.info('Performance baseline tracking disabled');
    }
    return PerformanceBaseline.getInstance();
  }
  
  const baseline = PerformanceBaseline.getInstance(logger);
  
  // Log initialization
  if ((logger as OptimizedLogger).isLevelEnabled?.(('INFO'))) {
    logger.info('Performance baseline tracking initialized');
  }
  
  return baseline;
}

/**
 * Generate a performance report from the baseline data
 * 
 * @param baseline The performance baseline
 * @returns HTML report as string
 */
export function generatePerformanceReport(baseline: PerformanceBaseline): string {
  const stats = baseline.getAllStats();
  
  // Create HTML report
  const html = `
  <!DOCTYPE html>
  <html>
  <head>
    <title>Performance Baseline Report</title>
    <style>
      body { font-family: system-ui, sans-serif; margin: 20px; }
      table { border-collapse: collapse; width: 100%; }
      th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
      th { background-color: #f2f2f2; }
      .category { background-color: #e9f5f9; font-weight: bold; }
      .chart { height: 200px; margin: 20px 0; }
    </style>
  </head>
  <body>
    <h1>Performance Baseline Report</h1>
    <p>Generated on: ${new Date().toISOString()}</p>
    
    <h2>Summary</h2>
    <table>
      <tr>
        <th>Category</th>
        <th>Operation</th>
        <th>Count</th>
        <th>Avg (ms)</th>
        <th>Min (ms)</th>
        <th>Max (ms)</th>
      </tr>
      ${stats.map(stat => `
        <tr>
          <td>${stat.category}</td>
          <td>${stat.operation}</td>
          <td>${stat.count}</td>
          <td>${stat.average.toFixed(2)}</td>
          <td>${stat.minTime}</td>
          <td>${stat.maxTime}</td>
        </tr>
      `).join('')}
    </table>
    
    <h2>Category Breakdown</h2>
    ${Array.from(baseline.getStatsByCategory().entries()).map(([category, catStats]) => `
      <h3>${category}</h3>
      <table>
        <tr>
          <th>Operation</th>
          <th>Count</th>
          <th>Avg (ms)</th>
          <th>Min (ms)</th>
          <th>Max (ms)</th>
        </tr>
        ${catStats.map(stat => `
          <tr>
            <td>${stat.operation}</td>
            <td>${stat.count}</td>
            <td>${stat.average.toFixed(2)}</td>
            <td>${stat.minTime}</td>
            <td>${stat.maxTime}</td>
          </tr>
        `).join('')}
      </table>
    `).join('')}
  </body>
  </html>
  `;
  
  return html;
}