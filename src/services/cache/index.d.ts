/**
 * Cache module type declarations
 * This ensures all cache components are properly typed
 */

// Import and re-export all cache component types
import { PathPatternTTLCalculator, PathPattern } from './PathPatternTTLCalculator';
import { CacheHeadersManager } from './CacheHeadersManager';
import { CacheTagsManager } from './CacheTagsManager';
import { CacheBypassManager } from './CacheBypassManager';
import { CacheFallbackManager } from './CacheFallbackManager';
import { CloudflareCacheManager } from './CloudflareCacheManager';
import { TTLCalculator } from './TTLCalculator';
import { CacheResilienceManager } from './CacheResilienceManager';
import { CachePerformanceManager } from './CachePerformanceManager';
import { SimpleKVTransformCacheManager } from './kv/SimpleKVTransformCacheManager';
import { createKVTransformCacheManager } from './kv/KVTransformCacheManagerFactory';
import {
  KVTransformCacheInterface,
  KVCacheConfig,
  CacheMetadata,
  TransformCacheResult 
} from './kv/KVTransformCacheInterface';

// Re-export all types
export {
  PathPatternTTLCalculator,
  PathPattern,
  CacheHeadersManager,
  CacheTagsManager,
  CacheBypassManager,
  CacheFallbackManager,
  CloudflareCacheManager,
  TTLCalculator,
  CacheResilienceManager,
  CachePerformanceManager,
  SimpleKVTransformCacheManager,
  createKVTransformCacheManager,
  KVTransformCacheInterface,
  KVCacheConfig,
  CacheMetadata,
  TransformCacheResult
};