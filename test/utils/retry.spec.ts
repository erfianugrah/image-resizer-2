/**
 * Test for the retry utilities
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { 
  calculateBackoff, 
  withRetry, 
  withCircuitBreaker, 
  withResilience,
  createCircuitBreakerState,
  isRetryableError
} from '../../src/utils/retry';
import { AppError } from '../../src/errors/baseErrors';
import { createMockLogger } from '../mocks/logging';

describe('Retry Utilities', () => {
  beforeEach(() => {
    // Reset all mocks before each test
    vi.resetAllMocks();
    
    // Mock setTimeout to make tests run instantly
    vi.useFakeTimers();
  });
  
  afterEach(() => {
    vi.restoreAllMocks();
  });
  
  describe('calculateBackoff', () => {
    it('should calculate exponential backoff', () => {
      // Given default options (initialDelay: 200, backoffFactor: 2)
      const backoff1 = calculateBackoff(1);
      const backoff2 = calculateBackoff(2);
      const backoff3 = calculateBackoff(3);
      
      // Then we should see exponential increases with some jitter
      expect(backoff1).toBeGreaterThanOrEqual(200 * 0.9); // Allow for negative jitter
      expect(backoff1).toBeLessThanOrEqual(200 * 1.1); // Allow for positive jitter
      
      expect(backoff2).toBeGreaterThanOrEqual(400 * 0.9);
      expect(backoff2).toBeLessThanOrEqual(400 * 1.1);
      
      expect(backoff3).toBeGreaterThanOrEqual(800 * 0.9);
      expect(backoff3).toBeLessThanOrEqual(800 * 1.1);
    });
    
    it('should respect maximum delay', () => {
      // Given a low max delay
      const backoff = calculateBackoff(5, { maxDelayMs: 1000 });
      
      // Then the backoff should be capped
      expect(backoff).toBeLessThanOrEqual(1000 * 1.1);
    });
    
    it('should apply configured jitter factor', () => {
      // Given a high jitter factor
      const backoff = calculateBackoff(1, { jitterFactor: 0.5 });
      
      // Then the jitter range should be wider
      expect(backoff).toBeGreaterThanOrEqual(200 * 0.5); // Allow for 50% negative jitter
      expect(backoff).toBeLessThanOrEqual(200 * 1.5); // Allow for 50% positive jitter
    });
  });
  
  describe('isRetryableError', () => {
    it('should use retryable flag from AppError', () => {
      // Given AppErrors with different retryable flags
      const retryableError = new AppError('Retryable error', { retryable: true });
      const nonRetryableError = new AppError('Non-retryable error', { retryable: false });
      
      // Then isRetryableError should respect these flags
      expect(isRetryableError(retryableError)).toBe(true);
      expect(isRetryableError(nonRetryableError)).toBe(false);
    });
    
    it('should return false for non-AppError errors', () => {
      // Given standard Error objects and other values
      const standardError = new Error('Standard error');
      const randomObject = { message: 'Not an error' };
      
      // Then isRetryableError should return false
      expect(isRetryableError(standardError)).toBe(false);
      expect(isRetryableError(randomObject)).toBe(false);
      expect(isRetryableError('string error')).toBe(false);
      expect(isRetryableError(null)).toBe(false);
    });
  });
  
  describe('withRetry', () => {
    it('should retry a failed operation up to maxAttempts', async () => {
      // Given an operation that always fails with a retryable error
      const operation = vi.fn().mockRejectedValue(new AppError('Test error', { retryable: true }));
      const logger = createMockLogger();
      
      // When executing with retry logic
      try {
        await withRetry(operation, { maxAttempts: 3, logger });
      } catch (error) {
        // Ignore error, we expect it to fail
      }
      
      // Then the operation should be called exactly maxAttempts times
      expect(operation).toHaveBeenCalledTimes(3);
      
      // And the logger should be called with retry attempts
      expect(logger.debug).toHaveBeenCalledWith(
        'Retry attempt 1 of 3',
        expect.objectContaining({ attempt: 1, maxAttempts: 3 })
      );
      expect(logger.debug).toHaveBeenCalledWith(
        'Retry attempt 2 of 3',
        expect.objectContaining({ attempt: 2, maxAttempts: 3 })
      );
    });
    
    it('should not retry non-retryable errors', async () => {
      // Given an operation that fails with a non-retryable error
      const operation = vi.fn().mockRejectedValue(new AppError('Test error', { retryable: false }));
      const logger = createMockLogger();
      
      // When executing with retry logic
      try {
        await withRetry(operation, { maxAttempts: 3, logger });
      } catch (error) {
        // Ignore error, we expect it to fail
      }
      
      // Then the operation should be called exactly once
      expect(operation).toHaveBeenCalledTimes(1);
      
      // And the logger should log that it's not retryable
      expect(logger.debug).toHaveBeenCalledWith(
        'Error is not retryable, aborting retry sequence',
        expect.objectContaining({ error: 'Test error' })
      );
    });
    
    it('should return result if operation eventually succeeds', async () => {
      // Given an operation that fails twice then succeeds
      const operation = vi.fn()
        .mockRejectedValueOnce(new AppError('Test error 1', { retryable: true }))
        .mockRejectedValueOnce(new AppError('Test error 2', { retryable: true }))
        .mockResolvedValueOnce('Success');
      
      // When executing with retry logic
      const result = await withRetry(operation, { maxAttempts: 5 });
      
      // Then the operation should be called 3 times
      expect(operation).toHaveBeenCalledTimes(3);
      
      // And the result should be the success value
      expect(result).toBe('Success');
    });
    
    it('should use custom isRetryable function if provided', async () => {
      // Given an operation that fails with a standard Error
      const operation = vi.fn().mockRejectedValue(new Error('Standard error'));
      
      // And a custom retryable function that considers all errors retryable
      const isRetryable = vi.fn().mockReturnValue(true);
      
      // When executing with retry logic and the custom function
      try {
        await withRetry(operation, { maxAttempts: 3, isRetryable });
      } catch (error) {
        // Ignore error, we expect it to fail
      }
      
      // Then the operation should be called maxAttempts times
      expect(operation).toHaveBeenCalledTimes(3);
      
      // And the isRetryable function should have been called
      expect(isRetryable).toHaveBeenCalledTimes(3);
    });
  });
  
  describe('withCircuitBreaker', () => {
    it('should keep circuit closed when operations succeed', async () => {
      // Given a circuit breaker state
      const state = createCircuitBreakerState();
      
      // And an operation that succeeds
      const operation = vi.fn().mockResolvedValue('Success');
      
      // When executing with circuit breaker
      await withCircuitBreaker(operation, state);
      
      // Then the operation should be called
      expect(operation).toHaveBeenCalledTimes(1);
      
      // And the circuit should remain closed
      expect(state.isOpen).toBe(false);
      expect(state.failureCount).toBe(0);
    });
    
    it('should open circuit after failureThreshold consecutive failures', async () => {
      // Given a circuit breaker state
      const state = createCircuitBreakerState();
      
      // And an operation that always fails
      const operation = vi.fn().mockRejectedValue(new Error('Test error'));
      const logger = createMockLogger();
      
      // When executing with circuit breaker multiple times
      for (let i = 0; i < 5; i++) {
        try {
          await withCircuitBreaker(operation, state, { 
            failureThreshold: 3,
            logger
          });
        } catch (error) {
          // Ignore errors, we expect them
        }
      }
      
      // Then the operation should be called only 3 times (failureThreshold)
      // The remaining calls should be fast-failed by the circuit breaker
      expect(operation).toHaveBeenCalledTimes(3);
      
      // And the circuit should be open
      expect(state.isOpen).toBe(true);
      expect(state.failureCount).toBe(3);
      
      // And the logger should have logged the circuit opening
      expect(logger.debug).toHaveBeenCalledWith(
        'Circuit opened due to consecutive failures',
        expect.objectContaining({ failureCount: 3 })
      );
    });
    
    it('should test circuit after resetTimeout', async () => {
      // Given a circuit breaker state that's already open
      const state = createCircuitBreakerState();
      state.isOpen = true;
      state.resetTimeMs = Date.now() - 1; // Reset time in the past
      
      // And an operation that succeeds
      const operation = vi.fn().mockResolvedValue('Success');
      const logger = createMockLogger();
      
      // When executing with circuit breaker
      await withCircuitBreaker(operation, state, { 
        successThreshold: 2,
        logger
      });
      
      // Then the operation should be called (half-open state test)
      expect(operation).toHaveBeenCalledTimes(1);
      
      // And the logger should have logged the half-open state
      expect(logger.debug).toHaveBeenCalledWith(
        'Circuit is half-open, allowing test request',
        expect.objectContaining({ 
          failureCount: expect.any(Number),
          successCount: expect.any(Number)
        })
      );
      
      // And the success count should be incremented
      expect(state.successCount).toBe(1);
      
      // But the circuit should still be open until successThreshold is reached
      expect(state.isOpen).toBe(true);
      
      // When executing again with success
      await withCircuitBreaker(operation, state, { 
        successThreshold: 2,
        logger
      });
      
      // Then the circuit should be closed
      expect(state.isOpen).toBe(false);
      expect(state.successCount).toBe(0); // Reset after closing
      expect(state.failureCount).toBe(0); // Reset after closing
      
      // And the logger should have logged the circuit closing
      expect(logger.debug).toHaveBeenCalledWith(
        'Circuit closed after successful recovery',
        expect.any(Object)
      );
    });
  });
  
  describe('withResilience', () => {
    it('should combine retry and circuit breaker patterns', async () => {
      // Given a circuit breaker state
      const state = createCircuitBreakerState();
      
      // And an operation that fails with retryable errors
      const operation = vi.fn()
        .mockRejectedValueOnce(new AppError('Test error 1', { retryable: true }))
        .mockRejectedValueOnce(new AppError('Test error 2', { retryable: true }))
        .mockResolvedValueOnce('Success');
      
      const logger = createMockLogger();
      
      // When executing with combined resilience
      const result = await withResilience(operation, state, {
        maxAttempts: 3,
        failureThreshold: 2,
        logger
      });
      
      // Then the operation should be called 3 times (2 retries + 1 success)
      expect(operation).toHaveBeenCalledTimes(3);
      
      // And the result should be the success value
      expect(result).toBe('Success');
      
      // And the circuit should remain closed because the operation eventually succeeded
      expect(state.isOpen).toBe(false);
    });
  });
});