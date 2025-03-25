/**
 * Mock implementation of Pino loggers for testing
 */

import { Logger, LogData, LogLevel } from '../../src/utils/logging';
import { OptimizedLogger } from '../../src/utils/optimized-logging';
import { vi } from 'vitest';

// Create a mock Pino-compatible logger
export function createMockPinoLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    breadcrumb: vi.fn()
  };
}

// Create a mock optimized Pino logger
export function createMockOptimizedPinoLogger(): OptimizedLogger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    breadcrumb: vi.fn(),
    isLevelEnabled: vi.fn((level) => level !== 'DEBUG'),
    getMinLevel: vi.fn(() => LogLevel.INFO),
    trackedBreadcrumb: vi.fn(() => Date.now())
  };
}

// Mock Pino logger factory function
export function mockPinoLoggerFactory(config: any): Logger {
  const logger = createMockPinoLogger();
  
  // Make the mocks behave according to the config
  const logLevel = config?.logging?.level || 'INFO';
  const isDebugEnabled = logLevel === 'DEBUG';
  
  // Debug should only log when level is DEBUG
  vi.mocked(logger.debug).mockImplementation((message) => {
    if (isDebugEnabled) {
      console.log(`[DEBUG MOCK] ${message}`);
    }
  });
  
  // Other levels always log
  vi.mocked(logger.info).mockImplementation((message) => {
    console.log(`[INFO MOCK] ${message}`);
  });
  
  vi.mocked(logger.warn).mockImplementation((message) => {
    console.log(`[WARN MOCK] ${message}`);
  });
  
  vi.mocked(logger.error).mockImplementation((message) => {
    console.log(`[ERROR MOCK] ${message}`);
  });
  
  return logger;
}