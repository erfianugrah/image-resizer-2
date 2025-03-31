/**
 * Mock logger for testing parameter handling
 */

// Create an enum to match the real LogLevel
export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3
}

// Export the enum as MockLogLevel for backward compatibility
export const MockLogLevel = LogLevel;

// Create a simple implementation of the Logger interface
export const mockLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  breadcrumb: () => {},
  setLevel: () => {},
  getLevel: () => 'INFO'
};

// Export the mock logger
export default mockLogger;