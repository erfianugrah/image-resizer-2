/**
 * Mock for the logging module
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

// Mock function for creating loggers
export const createLogger = vi.fn().mockImplementation((): Logger => {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    breadcrumb: vi.fn()
  };
});

// Default logger instance
export const defaultLogger: Logger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  breadcrumb: vi.fn()
};