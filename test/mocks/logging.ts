/**
 * Mock logging utilities for tests
 */
import { vi } from 'vitest';

// Create mock logger functions
export interface Logger {
  debug: (message: string, data?: Record<string, any>) => void;
  info: (message: string, data?: Record<string, any>) => void;
  warn: (message: string, data?: Record<string, any>) => void;
  error: (message: string, data?: Record<string, any>) => void;
  breadcrumb: (message: string, durationMs?: number, data?: Record<string, any>) => void;
}

/**
 * Create a new mock logger instance for testing
 * 
 * @returns Mock logger with all methods as jest functions
 */
export function createMockLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    breadcrumb: vi.fn()
  };
}

// Export default shared mock logger for backward compatibility
export const mockLogger: Logger = createMockLogger();
export const defaultLogger: Logger = mockLogger;

// Export standard createLogger that matches the signature in src/utils/logging
export function createLogger(config?: any, moduleName?: string): Logger {
  return createMockLogger();
}