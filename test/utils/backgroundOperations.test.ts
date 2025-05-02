/**
 * Background Operations Utility Tests
 */

import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { runInBackground, getExecutionContext, isWaitUntilAvailable, executeOperationWithBackgroundFallback } from '../../src/utils/backgroundOperations';

// Mock logger
const mockLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn()
} as any;

// Mock RequestContext module
vi.mock('../../src/utils/requestContext', () => {
  return {
    getCurrentContext: vi.fn(() => null),
    addBreadcrumb: vi.fn()
  };
});

describe('Background Operations Utility', () => {
  let mockExecutionContext: any;
  
  beforeEach(() => {
    // Reset all mocks before each test
    vi.resetAllMocks();
    
    // Create a mock execution context with waitUntil
    mockExecutionContext = {
      waitUntil: vi.fn((promise) => promise)
    };
  });
  
  afterEach(() => {
    vi.resetAllMocks();
  });
  
  test('runInBackground uses waitUntil when available', async () => {
    // Setup
    const operation = vi.fn(() => Promise.resolve('success'));
    
    // Execute
    const result = runInBackground(
      operation,
      'TestOperation',
      mockLogger,
      mockExecutionContext
    );
    
    // Verify
    expect(result).toBe(true);
    expect(mockExecutionContext.waitUntil).toHaveBeenCalled();
    expect(operation).not.toHaveBeenCalled(); // Should be called inside waitUntil
    expect(mockLogger.debug).toHaveBeenCalled();
  });
  
  test('runInBackground falls back to synchronous execution when waitUntil is not available', () => {
    // Setup
    const operation = vi.fn(() => Promise.resolve('success'));
    const mockContextWithoutWaitUntil = {};
    
    // Execute
    const result = runInBackground(
      operation,
      'TestOperation',
      mockLogger,
      mockContextWithoutWaitUntil
    );
    
    // Verify
    expect(result).toBe(false);
    expect(mockLogger.debug).toHaveBeenCalled();
  });
  
  test('getExecutionContext finds context from different sources', () => {
    // Setup - direct context
    const direct = getExecutionContext(mockExecutionContext);
    expect(direct).toBe(mockExecutionContext);
    
    // Setup - from request
    const mockRequest = {
      ctx: mockExecutionContext
    } as any;
    const fromRequest = getExecutionContext(undefined, mockRequest);
    expect(fromRequest).toBe(mockExecutionContext);
    
    // Setup - from current context (needs mock to return something)
    const requestContextModule = require('../../src/utils/requestContext');
    requestContextModule.getCurrentContext.mockReturnValue({
      executionContext: mockExecutionContext
    });
    
    const fromCurrentContext = getExecutionContext();
    expect(fromCurrentContext).toBe(mockExecutionContext);
  });
  
  test('isWaitUntilAvailable detects availability correctly', () => {
    // Available
    expect(isWaitUntilAvailable(mockExecutionContext)).toBe(true);
    
    // Not available
    expect(isWaitUntilAvailable({})).toBe(false);
    expect(isWaitUntilAvailable()).toBe(false);
  });
  
  test('executeOperationWithBackgroundFallback runs operation directly by default', async () => {
    // Setup
    const operation = vi.fn(() => Promise.resolve('success'));
    
    // Execute
    const result = await executeOperationWithBackgroundFallback(
      operation,
      'TestOperation',
      mockLogger
    );
    
    // Verify
    expect(result).toBe('success');
    expect(operation).toHaveBeenCalled();
  });
  
  test('executeOperationWithBackgroundFallback uses background when forced', async () => {
    // Setup
    const operation = vi.fn(() => Promise.resolve('success'));
    
    // Execute with force=true and context
    const result = await executeOperationWithBackgroundFallback(
      operation,
      'TestOperation',
      mockLogger,
      mockExecutionContext,
      true // force
    );
    
    // Verify
    expect(result).toBe(undefined); // Background operations return undefined
    expect(mockExecutionContext.waitUntil).toHaveBeenCalled();
  });
  
  test('executeOperationWithBackgroundFallback handles operation errors', async () => {
    // Setup
    const error = new Error('Test error');
    const failingOperation = vi.fn(() => Promise.reject(error));
    
    // Execute and expect error
    await expect(
      executeOperationWithBackgroundFallback(
        failingOperation,
        'FailingOperation',
        mockLogger
      )
    ).rejects.toThrow('Test error');
    
    // Verify error was logged
    expect(mockLogger.error).toHaveBeenCalled();
  });
});