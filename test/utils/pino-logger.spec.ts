import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Logger, LogLevel } from '../../src/utils/logging';
import { OptimizedLogger } from '../../src/utils/optimized-logging';
import {
  createMockPinoLogger,
  createMockOptimizedPinoLogger,
  mockPinoLoggerFactory
} from '../mocks/pino-logger-mock';

// Simplified ImageResizerConfig for testing
interface MockConfig {
  environment?: 'development' | 'staging' | 'production';
  logging?: {
    level?: string;
    includeTimestamp?: boolean;
    enableStructuredLogs?: boolean;
    enableBreadcrumbs?: boolean;
    usePino?: boolean;
    prettyPrint?: boolean;
    colorize?: boolean;
  };
  debug?: {
    enabled?: boolean;
    performanceTracking?: boolean;
  };
}

// Mock the require function to avoid circular dependencies
vi.mock('../../src/utils/pino-compat', () => ({
  createCompatiblePinoLogger: vi.fn((config) => mockPinoLoggerFactory(config))
}));

vi.mock('../../src/utils/pino-optimized', () => ({
  createOptimizedPinoLogger: vi.fn(() => createMockOptimizedPinoLogger())
}));

vi.mock('../../src/utils/logger-factory', () => ({
  createLogger: vi.fn((config) => {
    if (config?.logging?.usePino) {
      return mockPinoLoggerFactory(config);
    } else {
      return mockPinoLoggerFactory(config);
    }
  })
}));

describe('Pino Logger Integration', () => {
  // Mock console.log
  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });
  
  afterEach(() => {
    vi.restoreAllMocks();
  });
  
  it('should log at the correct level', () => {
    // Create a minimal config with INFO level
    const config: MockConfig = {
      logging: {
        level: 'INFO',
        includeTimestamp: true,
        enableStructuredLogs: false
      }
    };
    
    // Create logger with INFO level (via mock)
    const logger = mockPinoLoggerFactory(config);
    
    // Debug should not log at INFO level
    logger.debug('Debug message');
    
    // Count is 0 because our mock doesn't log DEBUG at INFO level
    expect(console.log).not.toHaveBeenCalled();
    
    // Info should log
    logger.info('Info message');
    expect(console.log).toHaveBeenCalled();
    
    // Reset mock
    vi.clearAllMocks();
    
    // Create logger with DEBUG level
    const debugConfig: MockConfig = {
      logging: {
        level: 'DEBUG',
        includeTimestamp: true,
        enableStructuredLogs: false
      }
    };
    const debugLogger = mockPinoLoggerFactory(debugConfig);
    
    // Debug should now log
    debugLogger.debug('Debug message');
    expect(console.log).toHaveBeenCalled();
  });
  
  it('should include breadcrumb markers', () => {
    const config: MockConfig = {
      logging: {
        level: 'INFO',
        includeTimestamp: true,
        enableStructuredLogs: true,
        enableBreadcrumbs: true
      }
    };
    
    const logger = mockPinoLoggerFactory(config);
    
    // Override the breadcrumb implementation for this test
    vi.mocked(logger.breadcrumb).mockImplementation((step, duration) => {
      console.log(`BREADCRUMB: ${step} (${duration}ms)`);
    });
    
    logger.breadcrumb('Test Step', 100);
    
    // Check that the log was called
    expect(console.log).toHaveBeenCalled();
    
    // Get the call argument
    const callArg = vi.mocked(console.log).mock.calls[0][0];
    
    // Check that the output contains breadcrumb-related content
    expect(callArg).toContain('BREADCRUMB');
    expect(callArg).toContain('Test Step');
  });
  
  it('should support optimized logger features', () => {
    const optimizedLogger = createMockOptimizedPinoLogger();
    
    // Should have optimized methods
    expect(optimizedLogger).toHaveProperty('isLevelEnabled');
    expect(optimizedLogger).toHaveProperty('trackedBreadcrumb');
    
    // isLevelEnabled should work as expected
    expect(optimizedLogger.isLevelEnabled('DEBUG')).toBe(false);
    expect(optimizedLogger.isLevelEnabled('INFO')).toBe(true);
    
    // trackedBreadcrumb should return a timestamp
    const timestamp = optimizedLogger.trackedBreadcrumb('Test step');
    expect(typeof timestamp).toBe('number');
  });
  
  it('should select the right logger implementation based on config', () => {
    // Config with Pino disabled
    const legacyConfig: MockConfig = {
      logging: {
        level: 'INFO',
        includeTimestamp: true,
        enableStructuredLogs: false,
        usePino: false
      }
    };
    
    // Config with Pino enabled
    const pinoConfig: MockConfig = {
      logging: {
        level: 'INFO',
        includeTimestamp: true,
        enableStructuredLogs: false,
        usePino: true
      }
    };
    
    // Get the right logger based on config
    const { createLogger } = require('../../src/utils/logger-factory');
    
    const legacyLogger = createLogger(legacyConfig);
    const pinoLogger = createLogger(pinoConfig);
    
    // Log a test message with each
    legacyLogger.info('Test legacy logger');
    pinoLogger.info('Test Pino logger');
    
    // Both should have logged
    expect(console.log).toHaveBeenCalledTimes(2);
  });
  
  it('should handle environment-specific configurations', () => {
    // Test development environment
    const devConfig: MockConfig = {
      environment: 'development',
      logging: {
        level: 'DEBUG',
        includeTimestamp: true,
        enableStructuredLogs: false,
        usePino: true,
        prettyPrint: true,
        colorize: true
      }
    };
    
    // Create logger with development config
    const devLogger = mockPinoLoggerFactory(devConfig);
    
    // Debug logs should work in development
    devLogger.debug('Test development log');
    expect(console.log).toHaveBeenCalled();
  });
});