/**
 * Test setup file that configures mocks for the test environment
 * This will be run before the tests to set up the testing environment
 */
import { vi } from 'vitest';

// Mock the logging modules
vi.mock('../src/utils/logging', () => {
  return {
    defaultLogger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      breadcrumb: vi.fn()
    },
    LogLevel: {
      DEBUG: 0,
      INFO: 1,
      WARN: 2,
      ERROR: 3
    },
    createLogger: vi.fn().mockImplementation(() => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      breadcrumb: vi.fn()
    }))
  };
});

vi.mock('../src/utils/optimized-logging', () => {
  return {
    defaultLogger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      breadcrumb: vi.fn(),
      isLevelEnabled: vi.fn().mockReturnValue(true),
      getMinLevel: vi.fn().mockReturnValue(0),
      trackedBreadcrumb: vi.fn().mockImplementation(() => Date.now())
    },
    createOptimizedLogger: vi.fn().mockImplementation(() => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      breadcrumb: vi.fn(),
      isLevelEnabled: vi.fn().mockReturnValue(true),
      getMinLevel: vi.fn().mockReturnValue(0),
      trackedBreadcrumb: vi.fn().mockImplementation(() => Date.now())
    })),
    getLogLevelFromString: vi.fn().mockImplementation((level) => {
      switch (level?.toUpperCase()) {
        case 'DEBUG': return 0;
        case 'INFO': return 1;
        case 'WARN': return 2;
        case 'ERROR': return 3;
        default: return 1;
      }
    })
  };
});

// This sets up the test environment for all tests
console.log('Setting up test environment...');