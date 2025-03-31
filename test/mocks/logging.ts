/**
 * Mock logging module for testing
 * This will be used to replace the real logging module during tests
 */

import { vi } from 'vitest';

// Mock LogLevel enum
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3
}

// Mock log data type
export type LogData = Record<string, any>;

// Mock Logger interface
export interface Logger {
  debug(message: string, data?: LogData): void;
  info(message: string, data?: LogData): void;
  warn(message: string, data?: LogData): void;
  error(message: string, data?: LogData): void;
  breadcrumb(step: string, duration?: number, data?: LogData): void;
  getLevel?(): string;
  setLevel?(level: string): void;
}

// Create a mock logger implementation
export const createMockLogger = vi.fn((): Logger => {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    breadcrumb: vi.fn(),
    getLevel: vi.fn().mockReturnValue('INFO'),
    setLevel: vi.fn()
  };
});

// Default logger instance for import
export const defaultLogger: Logger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  breadcrumb: vi.fn()
};

// For optimized logging
export interface OptimizedLogger extends Logger {
  isLevelEnabled(level: keyof typeof LogLevel): boolean;
  getMinLevel(): LogLevel;
  trackedBreadcrumb(step: string, startTime?: number, data?: LogData): number;
}

// Create a mock optimized logger
export const createOptimizedLogger = vi.fn((): OptimizedLogger => {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    breadcrumb: vi.fn(),
    isLevelEnabled: vi.fn().mockReturnValue(true),
    getMinLevel: vi.fn().mockReturnValue(LogLevel.DEBUG),
    trackedBreadcrumb: vi.fn().mockImplementation(() => Date.now())
  };
});

// Add utility functions that might be used
export const getLogLevelFromString = vi.fn().mockImplementation(
  (level: string): LogLevel => {
    switch (level?.toUpperCase()) {
      case 'DEBUG': return LogLevel.DEBUG;
      case 'INFO': return LogLevel.INFO;
      case 'WARN': return LogLevel.WARN;
      case 'ERROR': return LogLevel.ERROR;
      default: return LogLevel.INFO;
    }
  }
);