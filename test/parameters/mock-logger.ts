/**
 * Mock logger for testing parameter handling
 */

import { LogLevel } from '../../src/utils/logging';

// Create an enum to match the real LogLevel
export const MockLogLevel = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
};

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