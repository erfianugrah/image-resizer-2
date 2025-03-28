/**
 * Image dimensions cache utility for the image resizer worker
 * 
 * This module provides caching functionality for image dimensions to avoid repeated format:json requests
 */

import { 
  // createLogger is imported for consistency with other modules
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  createLogger, 
  Logger, 
  defaultLogger 
} from './logging';

// Use default logger until a configured one is provided
let logger: Logger = defaultLogger;

/**
 * Set the logger for the dimension cache module
 * 
 * @param configuredLogger The logger to use
 */
export function setLogger(configuredLogger: Logger): void {
  logger = configuredLogger;
}

/**
 * Image dimensions information
 */
export interface ImageDimensions {
  width: number;
  height: number;
  aspectRatio: number;
  format?: string;
  lastFetched: number; // Timestamp
}

/**
 * Simple in-memory LRU cache for image dimensions
 * For production, consider using Cloudflare KV or other persistent storage
 */
class DimensionCache {
  private cache: Map<string, ImageDimensions>;
  private maxSize: number;
  private ttl: number; // TTL in milliseconds
  
  /**
   * Create a new dimension cache
   * 
   * @param maxSize Maximum number of entries to store in the cache
   * @param ttl TTL for cache entries in seconds (default: 1 day)
   */
  constructor(maxSize = 100, ttl = 86400) {
    this.cache = new Map();
    this.maxSize = maxSize;
    this.ttl = ttl * 1000; // Convert to milliseconds
    
    logger.debug('DimensionCache initialized', {
      maxSize,
      ttl: `${ttl} seconds`
    });
  }
  
  /**
   * Get image dimensions from the cache
   * 
   * @param key Cache key (typically the image URL or path)
   * @returns The cached dimensions or null if not found or expired
   */
  get(key: string): ImageDimensions | null {
    const normalizedKey = this.normalizeKey(key);
    const cached = this.cache.get(normalizedKey);
    
    if (!cached) {
      logger.debug('DimensionCache miss', { key: normalizedKey });
      return null;
    }
    
    // Check if the entry has expired
    const now = Date.now();
    if (now - cached.lastFetched > this.ttl) {
      logger.debug('DimensionCache entry expired', { 
        key: normalizedKey,
        age: Math.round((now - cached.lastFetched) / 1000) + 's'
      });
      this.cache.delete(normalizedKey);
      return null;
    }
    
    logger.debug('DimensionCache hit', { 
      key: normalizedKey,
      dimensions: `${cached.width}x${cached.height}`,
      aspectRatio: cached.aspectRatio.toFixed(3)
    });
    
    return cached;
  }
  
  /**
   * Set image dimensions in the cache
   * 
   * @param key Cache key (typically the image URL or path)
   * @param dimensions The image dimensions to cache
   */
  set(key: string, dimensions: ImageDimensions): void {
    const normalizedKey = this.normalizeKey(key);
    
    // Ensure the cache doesn't exceed the maximum size
    // If it does, remove the oldest entry (simple LRU implementation)
    if (this.cache.size >= this.maxSize) {
      const keysIterator = this.cache.keys();
      const firstEntry = keysIterator.next();
      if (!firstEntry.done && firstEntry.value) {
        const oldestKey = firstEntry.value;
        this.cache.delete(oldestKey);
        logger.debug('DimensionCache evicted oldest entry', { key: oldestKey });
      }
    }
    
    // Ensure lastFetched is set
    dimensions.lastFetched = dimensions.lastFetched || Date.now();
    
    this.cache.set(normalizedKey, dimensions);
    
    logger.debug('DimensionCache set', { 
      key: normalizedKey,
      dimensions: `${dimensions.width}x${dimensions.height}`,
      aspectRatio: dimensions.aspectRatio.toFixed(3)
    });
  }
  
  /**
   * Clear the entire cache
   */
  clear(): void {
    const size = this.cache.size;
    this.cache.clear();
    logger.debug('DimensionCache cleared', { entriesRemoved: size });
  }
  
  /**
   * Get the current size of the cache
   */
  size(): number {
    return this.cache.size;
  }
  
  /**
   * Normalize the cache key to ensure consistent access
   * 
   * @param key The original cache key
   * @returns A normalized version of the key
   */
  private normalizeKey(key: string): string {
    // Remove protocol and any query parameters to normalize URLs
    let normalizedKey = key;
    
    // If it's a URL, extract just the path
    try {
      if (key.startsWith('http')) {
        const url = new URL(key);
        // Use only the path as the key to avoid protocol/host differences
        normalizedKey = url.pathname;
      }
    } catch {
      // If URL parsing fails, just use the original key
      normalizedKey = key;
    }
    
    // Ensure the key doesn't start with multiple slashes
    while (normalizedKey.startsWith('//')) {
      normalizedKey = normalizedKey.substring(1);
    }
    
    // Ensure the key starts with a slash if it's a path
    if (!normalizedKey.startsWith('/') && !normalizedKey.startsWith('http')) {
      normalizedKey = '/' + normalizedKey;
    }
    
    return normalizedKey;
  }
}

// Export a singleton instance of the cache
export const dimensionCache = new DimensionCache();