/**
 * Retry utilities for handling retryable operations
 * 
 * This module contains utilities for handling retries with exponential backoff,
 * circuit breaking, and other retry strategies.
 */

import { AppError } from '../errors/baseErrors';
import { Logger } from './logging';

/**
 * Configuration options for retry operations
 */
export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxAttempts?: number;
  /** Initial delay between retries in milliseconds (default: 200) */
  initialDelayMs?: number;
  /** Maximum delay between retries in milliseconds (default: 2000) */
  maxDelayMs?: number;
  /** Backoff factor for exponential backoff (default: 2) */
  backoffFactor?: number;
  /** Jitter factor to add randomness to retry delays (0-1, default: 0.1) */
  jitterFactor?: number;
  /** Function to determine if an error is retryable (default: check error.retryable) */
  isRetryable?: (error: unknown) => boolean;
  /** Logger for retry operations */
  logger?: Logger;
}

/**
 * Default retry options
 */
const DEFAULT_RETRY_OPTIONS: Required<Omit<RetryOptions, 'logger' | 'isRetryable'>> = {
  maxAttempts: 3,
  initialDelayMs: 200,
  maxDelayMs: 2000,
  backoffFactor: 2,
  jitterFactor: 0.1
};

/**
 * Default function to determine if an error is retryable
 */
export function isRetryableError(error: unknown): boolean {
  // If it's an AppError with a retryable flag, use that
  if (error instanceof AppError) {
    return error.retryable;
  }
  
  // By default, assume errors are not retryable
  return false;
}

/**
 * Calculate delay for the next retry attempt with exponential backoff and jitter
 */
export function calculateBackoff(
  attempt: number, 
  options: RetryOptions = {}
): number {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  
  // Calculate exponential backoff
  const exponentialDelay = opts.initialDelayMs * Math.pow(opts.backoffFactor, attempt);
  
  // Cap at maximum delay
  const cappedDelay = Math.min(exponentialDelay, opts.maxDelayMs);
  
  // Apply jitter to prevent thundering herd problem
  const jitter = opts.jitterFactor * cappedDelay * (Math.random() * 2 - 1);
  
  return Math.max(0, Math.floor(cappedDelay + jitter));
}

/**
 * Sleep for a specified number of milliseconds
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Execute a function with retry logic
 * 
 * @param operation The async function to retry
 * @param options Retry configuration options
 * @returns Promise that resolves with the operation result
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  const maxAttempts = opts.maxAttempts;
  const logger = opts.logger;
  const isRetryable = opts.isRetryable || isRetryableError;
  
  let attempt = 0;
  let lastError: unknown;
  
  while (attempt < maxAttempts) {
    try {
      // If this is a retry, log it
      if (attempt > 0 && logger) {
        logger.debug(`Retry attempt ${attempt} of ${maxAttempts}`, {
          attempt,
          maxAttempts,
          operation: operation.name || 'anonymous'
        });
      }
      
      // Attempt the operation
      return await operation();
    } catch (error) {
      lastError = error;
      
      // Check if we should retry
      if (!isRetryable(error)) {
        logger?.debug('Error is not retryable, aborting retry sequence', {
          error: error instanceof Error ? error.message : String(error),
          attempt,
          operation: operation.name || 'anonymous'
        });
        throw error;
      }
      
      // Increment attempt counter
      attempt++;
      
      // If we've reached max attempts, throw the last error
      if (attempt >= maxAttempts) {
        logger?.debug('Maximum retry attempts reached, aborting retry sequence', {
          attempts: attempt,
          maxAttempts,
          operation: operation.name || 'anonymous',
          error: error instanceof Error ? error.message : String(error)
        });
        throw error;
      }
      
      // Calculate and apply backoff delay
      const delayMs = calculateBackoff(attempt, opts);
      
      logger?.debug('Retryable error, delaying before next attempt', {
        attempt,
        maxAttempts,
        delayMs,
        operation: operation.name || 'anonymous',
        error: error instanceof Error ? error.message : String(error)
      });
      
      // Wait before next attempt
      await sleep(delayMs);
    }
  }
  
  // This should never be reached due to the throw in the loop,
  // but TypeScript needs this to ensure all code paths return a value
  throw lastError;
}

/**
 * Circuit breaker state
 */
export interface CircuitBreakerState {
  /** Whether the circuit is open (true) or closed (false) */
  isOpen: boolean;
  /** Timestamp when the circuit will be half-open (attempt a reset) */
  resetTimeMs: number;
  /** Number of consecutive failures */
  failureCount: number;
  /** Number of consecutive successes during half-open state */
  successCount: number;
}

/**
 * Circuit breaker options
 */
export interface CircuitBreakerOptions {
  /** Threshold of failures before opening the circuit (default: 5) */
  failureThreshold?: number;
  /** Time in milliseconds to keep the circuit open before attempting to reset (default: 30000) */
  resetTimeoutMs?: number;
  /** Number of consecutive successes required to close the circuit (default: 2) */
  successThreshold?: number;
  /** Logger for circuit breaker operations */
  logger?: Logger;
}

/**
 * Default circuit breaker options
 */
const DEFAULT_CIRCUIT_BREAKER_OPTIONS: Required<Omit<CircuitBreakerOptions, 'logger'>> = {
  failureThreshold: 5,
  resetTimeoutMs: 30000, // 30 seconds
  successThreshold: 2
};

/**
 * Creates a new circuit breaker state
 */
export function createCircuitBreakerState(): CircuitBreakerState {
  return {
    isOpen: false,
    resetTimeMs: 0,
    failureCount: 0,
    successCount: 0
  };
}

/**
 * Execute a function with circuit breaker pattern
 * 
 * @param operation The async function to execute
 * @param state Circuit breaker state (will be modified)
 * @param options Circuit breaker configuration options
 * @returns Promise that resolves with the operation result
 * @throws Error if the circuit is open or the operation fails
 */
export async function withCircuitBreaker<T>(
  operation: () => Promise<T>,
  state: CircuitBreakerState,
  options: CircuitBreakerOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_CIRCUIT_BREAKER_OPTIONS, ...options };
  const logger = opts.logger;
  
  // Check if circuit is open
  if (state.isOpen) {
    // Check if reset timeout has passed
    const now = Date.now();
    if (now < state.resetTimeMs) {
      // Circuit is still open, fast fail
      logger?.debug('Circuit is open, failing fast', {
        resetTimeRemaining: Math.round((state.resetTimeMs - now) / 1000),
        operation: operation.name || 'anonymous'
      });
      
      throw new Error('Circuit breaker is open');
    }
    
    // Reset timeout has passed, circuit is now half-open
    logger?.debug('Circuit is half-open, allowing test request', {
      operation: operation.name || 'anonymous',
      failureCount: state.failureCount,
      successCount: state.successCount
    });
  }
  
  try {
    // Attempt the operation
    const result = await operation();
    
    // Operation succeeded
    if (state.isOpen) {
      // We're in half-open state, increment success counter
      state.successCount++;
      
      logger?.debug('Operation succeeded in half-open state', {
        successCount: state.successCount,
        successThreshold: opts.successThreshold,
        operation: operation.name || 'anonymous'
      });
      
      // Check if we've reached the success threshold to close the circuit
      if (state.successCount >= opts.successThreshold) {
        // Close the circuit
        state.isOpen = false;
        state.failureCount = 0;
        state.successCount = 0;
        
        logger?.debug('Circuit closed after successful recovery', {
          operation: operation.name || 'anonymous'
        });
      }
    } else {
      // Circuit was already closed, reset counters
      state.failureCount = 0;
      state.successCount = 0;
    }
    
    return result;
  } catch (error) {
    // Operation failed
    state.failureCount++;
    
    logger?.debug('Operation failed', {
      failureCount: state.failureCount,
      failureThreshold: opts.failureThreshold,
      isCircuitOpen: state.isOpen,
      operation: operation.name || 'anonymous',
      error: error instanceof Error ? error.message : String(error)
    });
    
    // Check if we should open the circuit
    if (!state.isOpen && state.failureCount >= opts.failureThreshold) {
      // Open the circuit
      state.isOpen = true;
      state.resetTimeMs = Date.now() + opts.resetTimeoutMs;
      state.successCount = 0;
      
      logger?.debug('Circuit opened due to consecutive failures', {
        failureCount: state.failureCount,
        resetTimeoutMs: opts.resetTimeoutMs,
        operation: operation.name || 'anonymous'
      });
    }
    
    // Re-throw the error
    throw error;
  }
}

/**
 * Combined retry and circuit breaker options
 */
export interface ResilienceOptions extends RetryOptions, CircuitBreakerOptions {}

/**
 * Execute a function with both retry and circuit breaker patterns
 * 
 * @param operation The async function to execute
 * @param state Circuit breaker state (will be modified)
 * @param options Combined retry and circuit breaker options
 * @returns Promise that resolves with the operation result
 */
export async function withResilience<T>(
  operation: () => Promise<T>,
  state: CircuitBreakerState,
  options: ResilienceOptions = {}
): Promise<T> {
  // Wrap the operation with retry logic inside the circuit breaker
  return withCircuitBreaker(
    () => withRetry(operation, options),
    state,
    options
  );
}