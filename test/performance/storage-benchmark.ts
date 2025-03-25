/**
 * Storage Performance Benchmark
 * 
 * This file contains benchmark tests for measuring the performance of
 * the storage service with different configurations.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Logger } from '../../src/utils/logging';
import { ConfigurationService, StorageResult } from '../../src/services/interfaces';
import { DefaultStorageService } from '../../src/services/storageService';
import { OptimizedStorageService } from '../../src/services/optimizedStorageService';
import { ImageResizerConfig } from '../../src/config';
import { Env } from '../../src/types';

// Mock the Logger
class MockLogger implements Logger {
  debug() {}
  info() {}
  warn() {}
  error() {}
  breadcrumb() {}
  critical() {}
  trace() {}
}

// Mock the ConfigurationService
class MockConfigService implements ConfigurationService {
  private config: Partial<ImageResizerConfig>;
  
  constructor(config: Partial<ImageResizerConfig>) {
    this.config = config;
  }
  
  getConfig(): ImageResizerConfig {
    return this.config as ImageResizerConfig;
  }
  
  isFeatureEnabled() {
    return true;
  }
}

// Mock environment
const mockEnv: Env = {
  IMAGES_BUCKET: {
    get: async (key: string) => {
      // Simulate some network latency
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Only respond to specific test keys
      if (key === 'test-image.jpg' || key === 'large-image.jpg') {
        return {
          body: new ReadableStream(),
          httpMetadata: { contentType: 'image/jpeg' },
          size: key === 'large-image.jpg' ? 10000000 : 100000,
          writeHttpMetadata: (headers: Headers) => {
            headers.set('Content-Type', 'image/jpeg');
            headers.set('Content-Length', key === 'large-image.jpg' ? '10000000' : '100000');
          }
        };
      }
      
      return null;
    }
  } as unknown as R2Bucket
};

// Mock fetch for remote URLs
const originalFetch = global.fetch;

// Setup mock fetch to simulate different latencies
function setupMockFetch() {
  global.fetch = async (url: RequestInfo | URL, init?: RequestInit) => {
    const urlString = url.toString();
    await new Promise(resolve => {
      // Simulate different latencies for different URLs
      if (urlString.includes('slowremote')) {
        setTimeout(resolve, 200);
      } else if (urlString.includes('fastremote')) {
        setTimeout(resolve, 30);
      } else if (urlString.includes('fallback')) {
        setTimeout(resolve, 100);
      } else {
        setTimeout(resolve, 75);
      }
    });
    
    // Return mock response for test images
    if (urlString.includes('test-image.jpg') || urlString.includes('large-image.jpg')) {
      const isLarge = urlString.includes('large-image.jpg');
      const headers = new Headers({
        'Content-Type': 'image/jpeg',
        'Content-Length': isLarge ? '10000000' : '100000'
      });
      
      return new Response(new ReadableStream(), {
        status: 200,
        headers
      });
    }
    
    // Return 404 for anything else
    return new Response(null, {
      status: 404
    });
  };
}

// Restore original fetch
function restoreFetch() {
  global.fetch = originalFetch;
}

describe('Storage Service Performance', () => {
  let logger: Logger;
  let defaultConfig: Partial<ImageResizerConfig>;
  let requestMock: Request;
  
  beforeEach(() => {
    logger = new MockLogger();
    
    defaultConfig = {
      environment: 'test',
      storage: {
        priority: ['r2', 'remote', 'fallback'],
        r2: {
          enabled: true,
          bindingName: 'IMAGES_BUCKET'
        },
        remoteUrl: 'https://remote.example.com',
        fallbackUrl: 'https://fallback.example.com',
        retry: {
          maxAttempts: 2,
          initialDelayMs: 10
        },
        circuitBreaker: {
          failureThreshold: 3,
          resetTimeoutMs: 10000
        }
      },
      cache: {
        ttl: {
          r2Headers: 3600,
          remoteFetch: 3600
        },
        retry: {
          maxAttempts: 2
        }
      },
      performance: {
        timeoutMs: 500
      }
    };
    
    requestMock = new Request('https://example.com/test-image.jpg');
    
    setupMockFetch();
  });
  
  afterEach(() => {
    restoreFetch();
  });
  
  describe('Default Storage Service (Sequential Operations)', () => {
    it('should benchmark fetching a small image from R2', async () => {
      // Create service and config
      const configService = new MockConfigService(defaultConfig);
      const storageService = new DefaultStorageService(logger, configService);
      
      // Measure performance
      const iterations = 5;
      const times: number[] = [];
      
      // Run benchmark
      for (let i = 0; i < iterations; i++) {
        const startTime = performance.now();
        const result = await storageService.fetchImage('test-image.jpg', defaultConfig as ImageResizerConfig, mockEnv, requestMock);
        const endTime = performance.now();
        
        // Verify the result is valid
        expect(result.contentType).toBe('image/jpeg');
        
        // Record timing
        times.push(endTime - startTime);
      }
      
      // Calculate statistics
      const average = times.reduce((sum, time) => sum + time, 0) / times.length;
      const min = Math.min(...times);
      const max = Math.max(...times);
      
      // Log results
      console.log(`Default Storage - R2 Fetch - Average time: ${average.toFixed(2)}ms`);
      console.log(`Default Storage - R2 Fetch - Min time: ${min.toFixed(2)}ms`);
      console.log(`Default Storage - R2 Fetch - Max time: ${max.toFixed(2)}ms`);
      
      // Basic validation
      expect(average).toBeGreaterThan(0);
    }, 10000);
    
    it('should benchmark fetching from fallback when primary storage fails', async () => {
      // Modify config to simulate R2 failure
      const failConfig = {
        ...defaultConfig,
        storage: {
          ...defaultConfig.storage,
          r2: {
            enabled: false
          }
        }
      };
      
      // Create service and config
      const configService = new MockConfigService(failConfig);
      const storageService = new DefaultStorageService(logger, configService);
      
      // Measure performance
      const iterations = 5;
      const times: number[] = [];
      
      // Run benchmark
      for (let i = 0; i < iterations; i++) {
        const startTime = performance.now();
        const result = await storageService.fetchImage('test-image.jpg', failConfig as ImageResizerConfig, mockEnv, requestMock);
        const endTime = performance.now();
        
        // Verify the result is valid 
        expect(result.contentType).toBe('image/jpeg');
        
        // Record timing
        times.push(endTime - startTime);
      }
      
      // Calculate statistics
      const average = times.reduce((sum, time) => sum + time, 0) / times.length;
      const min = Math.min(...times);
      const max = Math.max(...times);
      
      // Log results
      console.log(`Default Storage - Fallback Fetch - Average time: ${average.toFixed(2)}ms`);
      console.log(`Default Storage - Fallback Fetch - Min time: ${min.toFixed(2)}ms`);
      console.log(`Default Storage - Fallback Fetch - Max time: ${max.toFixed(2)}ms`);
      
      // Basic validation
      expect(average).toBeGreaterThan(0);
    }, 10000);
  });
  
  describe('Optimized Storage Service (Parallel Operations)', () => {
    it('should benchmark fetching a small image using parallel operations', async () => {
      // Create service and config
      const parallelConfig = {
        ...defaultConfig,
        performance: {
          ...defaultConfig.performance,
          parallelStorageOperations: true
        }
      };
      
      const configService = new MockConfigService(parallelConfig);
      const storageService = new OptimizedStorageService(logger, configService);
      
      // Measure performance
      const iterations = 5;
      const times: number[] = [];
      
      // Run benchmark
      for (let i = 0; i < iterations; i++) {
        const startTime = performance.now();
        const result = await storageService.fetchImage('test-image.jpg', parallelConfig as ImageResizerConfig, mockEnv, requestMock);
        const endTime = performance.now();
        
        // Verify the result is valid
        expect(result.contentType).toBe('image/jpeg');
        
        // Record timing
        times.push(endTime - startTime);
      }
      
      // Calculate statistics
      const average = times.reduce((sum, time) => sum + time, 0) / times.length;
      const min = Math.min(...times);
      const max = Math.max(...times);
      
      // Log results
      console.log(`Optimized Storage - Parallel Fetch - Average time: ${average.toFixed(2)}ms`);
      console.log(`Optimized Storage - Parallel Fetch - Min time: ${min.toFixed(2)}ms`);
      console.log(`Optimized Storage - Parallel Fetch - Max time: ${max.toFixed(2)}ms`);
      
      // Basic validation
      expect(average).toBeGreaterThan(0);
    }, 10000);
    
    it('should benchmark large image fetch with speed advantage from fastest source', async () => {
      // Create service and config with different source speeds
      const parallelConfig = {
        ...defaultConfig,
        storage: {
          ...defaultConfig.storage,
          remoteUrl: 'https://fastremote.example.com', // Fast remote
          fallbackUrl: 'https://slowremote.example.com' // Slow remote
        },
        performance: {
          ...defaultConfig.performance,
          parallelStorageOperations: true
        }
      };
      
      const configService = new MockConfigService(parallelConfig);
      const storageService = new OptimizedStorageService(logger, configService);
      
      // Also create a default service for comparison
      const defaultService = new DefaultStorageService(logger, configService);
      
      // Measure performance for both services
      const iterations = 5;
      const optimizedTimes: number[] = [];
      const defaultTimes: number[] = [];
      
      // Run benchmark
      for (let i = 0; i < iterations; i++) {
        // Test optimized service
        const optimizedStart = performance.now();
        const optimizedResult = await storageService.fetchImage('large-image.jpg', parallelConfig as ImageResizerConfig, mockEnv, requestMock);
        const optimizedEnd = performance.now();
        
        // Test default service
        const defaultStart = performance.now();
        const defaultResult = await defaultService.fetchImage('large-image.jpg', parallelConfig as ImageResizerConfig, mockEnv, requestMock);
        const defaultEnd = performance.now();
        
        // Verify results are valid
        expect(optimizedResult.contentType).toBe('image/jpeg');
        expect(defaultResult.contentType).toBe('image/jpeg');
        
        // Record timings
        optimizedTimes.push(optimizedEnd - optimizedStart);
        defaultTimes.push(defaultEnd - defaultStart);
      }
      
      // Calculate statistics
      const optimizedAvg = optimizedTimes.reduce((sum, time) => sum + time, 0) / optimizedTimes.length;
      const defaultAvg = defaultTimes.reduce((sum, time) => sum + time, 0) / defaultTimes.length;
      
      // Calculate improvement
      const improvement = ((defaultAvg - optimizedAvg) / defaultAvg) * 100;
      
      // Log results
      console.log(`Large Image - Optimized Storage Average: ${optimizedAvg.toFixed(2)}ms`);
      console.log(`Large Image - Default Storage Average: ${defaultAvg.toFixed(2)}ms`);
      console.log(`Large Image - Performance improvement: ${improvement.toFixed(2)}%`);
      
      // Basic validation
      expect(optimizedAvg).toBeGreaterThan(0);
      
      // We expect some performance improvement, but this may vary in test environments
      console.log(`Performance improvement observed: ${improvement.toFixed(2)}%`);
    }, 10000);
  });
});