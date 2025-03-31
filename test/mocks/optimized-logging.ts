/**
 * Mock for optimized-logging.ts
 */
import { vi } from 'vitest';
import { LogLevel, Logger, LogData } from './logging';

// OptimizedLogger interface
export interface OptimizedLogger extends Logger {
  isLevelEnabled(level: keyof typeof LogLevel): boolean;
  getMinLevel(): LogLevel;
  trackedBreadcrumb(step: string, startTime?: number, data?: LogData): number;
}

// Mock the factory function
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

// Export the mocked LOG_LEVEL_MAP
export const LOG_LEVEL_MAP: Record<string, LogLevel> = {
  'DEBUG': LogLevel.DEBUG,
  'INFO': LogLevel.INFO,
  'WARN': LogLevel.WARN,
  'ERROR': LogLevel.ERROR
};