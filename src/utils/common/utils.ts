/**
 * Common Utility Functions
 * 
 * This file contains utility functions that are used across the application.
 * Instead of duplicating these functions in multiple services, they're centralized here.
 */

import { isString, isObject } from './typeGuards';

/**
 * Sanitize log data by replacing sensitive fields with placeholder
 * 
 * @param data Data to sanitize
 * @param sensitiveFields Array of sensitive field names
 * @returns Sanitized data
 */
export function sanitizeLogData(data: unknown, sensitiveFields: string[] = ['secret', 'key', 'password', 'token', 'auth']): unknown {
  if (!data) return data;
  
  if (Array.isArray(data)) {
    return data.map(item => sanitizeLogData(item, sensitiveFields));
  }
  
  if (isObject(data)) {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
      // Check if key or any parent key contains a sensitive field name
      const isSensitive = sensitiveFields.some(field => 
        key.toLowerCase().includes(field.toLowerCase())
      );
      
      if (isSensitive) {
        result[key] = '[REDACTED]';
      } else if (isObject(value) || Array.isArray(value)) {
        result[key] = sanitizeLogData(value, sensitiveFields);
      } else {
        result[key] = value;
      }
    }
    return result;
  }
  
  return data;
}

/**
 * Formats milliseconds into a human-readable string
 * 
 * @param ms Milliseconds
 * @returns Formatted string (e.g., "1.2s", "300ms")
 */
export function formatDuration(ms: number): string {
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(1)}s`;
  } else {
    return `${Math.round(ms)}ms`;
  }
}

/**
 * Safely stringify an object, even if it contains circular references
 * 
 * @param obj Object to stringify
 * @param indent Optional number of spaces for indentation
 * @returns JSON string representation of the object
 */
export function safeStringify(obj: unknown, indent?: number): string {
  const cache = new Set();
  
  return JSON.stringify(obj, (key, value) => {
    if (typeof value === 'object' && value !== null) {
      if (cache.has(value)) {
        return '[Circular Reference]';
      }
      cache.add(value);
    }
    return value;
  }, indent);
}

/**
 * Convert a path to a canonical form
 * 
 * @param path Path to normalize
 * @returns Normalized path
 */
export function normalizePath(path: string): string {
  // Ensure path starts with a slash
  path = path.startsWith('/') ? path : `/${path}`;
  
  // Remove trailing slash unless path is just "/"
  if (path.length > 1 && path.endsWith('/')) {
    path = path.slice(0, -1);
  }
  
  // Remove duplicate slashes
  path = path.replace(/\/+/g, '/');
  
  return path;
}

/**
 * Extract base path (without query string or hash)
 * 
 * @param url URL to extract base path from
 * @returns Base path
 */
export function getBasePath(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.pathname;
  } catch (error) {
    // If not a valid URL, assume it's a path
    return url.split(/[?#]/)[0];
  }
}

/**
 * Helper for consistent retry handling with exponential backoff
 * 
 * @param operation Function to retry
 * @param options Retry options
 * @returns Promise with the operation result
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: {
    maxAttempts?: number;
    initialDelayMs?: number;
    maxDelayMs?: number;
    backoffFactor?: number;
    jitterFactor?: number;
    shouldRetry?: (error: Error, attempt: number) => boolean;
    onRetry?: (error: Error, attempt: number, delayMs: number) => void;
  } = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    initialDelayMs = 200,
    maxDelayMs = 2000,
    backoffFactor = 2,
    jitterFactor = 0.1,
    shouldRetry = () => true,
    onRetry
  } = options;
  
  let attempt = 0;
  let lastError: Error;
  
  while (attempt < maxAttempts) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      attempt++;
      
      // Stop if we've reached max attempts or shouldRetry returns false
      if (attempt >= maxAttempts || !shouldRetry(lastError, attempt)) {
        throw lastError;
      }
      
      // Calculate delay with exponential backoff and jitter
      const baseDelay = Math.min(
        initialDelayMs * Math.pow(backoffFactor, attempt - 1),
        maxDelayMs
      );
      
      const jitter = baseDelay * jitterFactor * (Math.random() * 2 - 1); // -jitterFactor to +jitterFactor
      const delayMs = Math.max(0, Math.floor(baseDelay + jitter));
      
      // Call onRetry callback if provided
      if (onRetry) {
        onRetry(lastError, attempt, delayMs);
      }
      
      // Wait for the calculated delay
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
  
  // This should never be reached due to the throw in the catch block
  throw lastError!;
}

/**
 * Try to parse JSON safely
 * 
 * @param text Text to parse
 * @param defaultValue Default value to return if parsing fails
 * @returns Parsed object or defaultValue
 */
export function parseJSON<T>(text: string, defaultValue: T): T {
  try {
    return JSON.parse(text) as T;
  } catch (error) {
    return defaultValue;
  }
}

/**
 * Creates a URL-safe base64 encoded hash of a string
 * 
 * @param input String to hash
 * @returns Base64 encoded hash
 */
export function createSimpleHash(input: string): string {
  // This is a simple implementation - for production use a more robust hashing algorithm
  let hash = 0;
  
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  
  // Convert to a base64-like string (URL-safe)
  const hashStr = Math.abs(hash).toString(36);
  return hashStr;
}

/**
 * Creates a debounced function that delays invoking func until after wait milliseconds
 * 
 * @param func Function to debounce
 * @param wait Wait time in milliseconds
 * @returns Debounced function
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  
  return function(this: any, ...args: Parameters<T>): void {
    const later = () => {
      timeout = null;
      func.apply(this, args);
    };
    
    if (timeout !== null) {
      clearTimeout(timeout);
    }
    
    timeout = setTimeout(later, wait);
  };
}

/**
 * Creates a throttled function that only invokes func at most once per every limit milliseconds
 * 
 * @param func Function to throttle
 * @param limit Limit in milliseconds
 * @returns Throttled function
 */
export function throttle<T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void {
  let lastCall = 0;
  let timeout: ReturnType<typeof setTimeout> | null = null;
  
  return function(this: any, ...args: Parameters<T>): void {
    const now = Date.now();
    
    // If enough time has elapsed since the last call
    if (now - lastCall >= limit) {
      lastCall = now;
      func.apply(this, args);
    } else {
      // Clear any existing timeout
      if (timeout !== null) {
        clearTimeout(timeout);
        timeout = null;
      }
      
      // Set a timeout for the remaining time
      const timeRemaining = limit - (now - lastCall);
      timeout = setTimeout(() => {
        lastCall = Date.now();
        func.apply(this, args);
        timeout = null;
      }, timeRemaining);
    }
  };
}

/**
 * Truncate a string to a maximum length, adding ellipsis if needed
 * 
 * @param str String to truncate
 * @param maxLength Maximum length
 * @param addEllipsis Whether to add ellipsis
 * @returns Truncated string
 */
export function truncateString(str: string, maxLength: number, addEllipsis = true): string {
  if (!isString(str)) return '';
  
  if (str.length <= maxLength) {
    return str;
  }
  
  return addEllipsis
    ? str.substring(0, maxLength - 3) + '...'
    : str.substring(0, maxLength);
}

/**
 * Generate a random string for use as a temporary identifier
 * 
 * @param length Length of the string
 * @returns Random string
 */
export function generateRandomId(length = 8): string {
  const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * charset.length);
    result += charset[randomIndex];
  }
  
  return result;
}

/**
 * Flatten a nested object into a single-level object with dot notation keys
 * 
 * @param obj Object to flatten
 * @param prefix Prefix for keys
 * @returns Flattened object
 */
export function flattenObject(obj: Record<string, any>, prefix = ''): Record<string, any> {
  return Object.keys(obj).reduce((acc, key) => {
    const prefixedKey = prefix ? `${prefix}.${key}` : key;
    
    if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
      Object.assign(acc, flattenObject(obj[key], prefixedKey));
    } else {
      acc[prefixedKey] = obj[key];
    }
    
    return acc;
  }, {} as Record<string, any>);
}