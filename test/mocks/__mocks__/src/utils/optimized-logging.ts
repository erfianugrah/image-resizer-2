/**
 * Mock for the optimized logging module
 */
import { vi } from 'vitest';
import { Logger, LogLevel, LogData } from './logging';

// OptimizedLogger interface
export interface OptimizedLogger extends Logger {
  isLevelEnabled(level: keyof typeof LogLevel): boolean;
  getMinLevel(): LogLevel;
  trackedBreadcrumb(step: string, startTime?: number, data?: LogData): number;
}

// Create an optimized logger mock
export const createOptimizedLogger = vi.fn().mockImplementation((): OptimizedLogger => {
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