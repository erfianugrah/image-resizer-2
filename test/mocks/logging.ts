/**
 * Mock logging module for testing
 */

// Mock LogLevel enum
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3
}

// Mock log data type
export type LogData = Record<string, string | number | boolean | null | undefined | string[] | number[] | Record<string, string | number | boolean | null | undefined>>;

// Mock Logger interface
export interface Logger {
  debug(message: string, data?: LogData): void;
  info(message: string, data?: LogData): void;
  warn(message: string, data?: LogData): void;
  error(message: string, data?: LogData): void;
  breadcrumb(step: string, duration?: number, data?: LogData): void;
  setLevel(level: keyof typeof LogLevel | LogLevel): void;
  getLevel(): string;
}

// Create a mock logger implementation
export const createMockLogger = (): Logger => {
  return {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
    breadcrumb: () => {},
    setLevel: () => {},
    getLevel: () => 'INFO'
  };
};

// Default logger instance
export const mockLogger = createMockLogger();

// Export for testing
export default mockLogger;