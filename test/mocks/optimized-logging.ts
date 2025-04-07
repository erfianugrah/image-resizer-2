/**
 * Mock optimized logging module for testing
 */

import { vi } from 'vitest';
import { LogLevel, LogData, OptimizedLogger } from './logging';

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

// Default logger instance for import
export const defaultLogger: OptimizedLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  breadcrumb: vi.fn(),
  isLevelEnabled: vi.fn().mockReturnValue(true),
  getMinLevel: vi.fn().mockReturnValue(LogLevel.DEBUG),
  trackedBreadcrumb: vi.fn().mockImplementation(() => Date.now())
};

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