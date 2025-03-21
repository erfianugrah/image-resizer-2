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

// Create mock logger
export const mockLogger: Logger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  breadcrumb: vi.fn()
};

// Export default logger (same as mock logger for tests)
export const defaultLogger: Logger = mockLogger;

// Export createLogger function
export function createLogger(): Logger {
  return mockLogger;
}