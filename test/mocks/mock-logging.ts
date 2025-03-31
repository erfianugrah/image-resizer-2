/**
 * Mock implementation of logging utilities for tests
 */
import { vi } from 'vitest';

// Define log levels for clarity and control
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3
}

// Type for log data with flexible structure
export type LogData = Record<string, any>;

// Logger interface
export interface Logger {
  debug(message: string, data?: LogData): void;
  info(message: string, data?: LogData): void;
  warn(message: string, data?: LogData): void;
  error(message: string, data?: LogData): void;
  breadcrumb(step: string, duration?: number, data?: LogData): void;
}

// Default mock implementation
export const createMockLogger = (): Logger => {
  const mockFn = vi.fn();
  
  return {
    debug: mockFn,
    info: mockFn,
    warn: mockFn,
    error: mockFn,
    breadcrumb: mockFn
  };
};

// Factory function to create a logger
export function createLogger(): Logger {
  return createMockLogger();
}

// Default logger instance
export const defaultLogger: Logger = createMockLogger();

// OptimizedLogger interface for mocking
export interface OptimizedLogger extends Logger {
  isLevelEnabled(level: keyof typeof LogLevel): boolean;
  getMinLevel(): LogLevel;
  trackedBreadcrumb(step: string, startTime?: number, data?: LogData): number;
}

// Create an optimized logger
export function createOptimizedLogger(): OptimizedLogger {
  const mockFn = vi.fn();
  
  return {
    debug: mockFn,
    info: mockFn,
    warn: mockFn,
    error: mockFn,
    breadcrumb: mockFn,
    isLevelEnabled: () => true,
    getMinLevel: () => LogLevel.DEBUG,
    trackedBreadcrumb: () => Date.now()
  };
}