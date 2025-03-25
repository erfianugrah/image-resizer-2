/**
 * Cache Performance Benchmark
 * 
 * This file contains benchmark tests for measuring the performance of
 * the cache service with different configurations.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Logger } from '../../src/utils/logging';
import { ConfigurationService, TransformOptions } from '../../src/services/interfaces';
import { DefaultCacheService } from '../../src/services/cacheService';
import { OptimizedCacheService } from '../../src/services/optimizedCacheService';
import { ImageResizerConfig } from '../../src/config';

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

// Mock execution context
class MockExecutionContext implements ExecutionContext {
  passThroughOnException() {}
  
  waitUntil(promise: Promise<any>) {
    // Immediately resolve to simplify testing
    return promise;
  }
}

// Create test request with options
function createTestRequest(url: string, options: Record<string, any> = {}) {
  const urlWithParams = new URL(url);
  
  // Add options as query parameters
  Object.entries(options).forEach(([key, value]) => {
    if (value !== undefined) {
      urlWithParams.searchParams.set(key, String(value));
    }
  });
  
  // Create the request
  return new Request(urlWithParams.toString());
}

// Create test response
function createTestResponse(contentType: string, size: number, status: number = 200) {
  const headers = new Headers({
    'Content-Type': contentType,
    'Content-Length': size.toString()
  });
  
  return new Response('Test body', {
    status,
    headers
  });
}

describe('Cache Service Performance', () => {
  let logger: Logger;
  let defaultConfig: Partial<ImageResizerConfig>;
  let executionContext: ExecutionContext;
  
  beforeEach(() => {
    logger = new MockLogger();
    
    defaultConfig = {
      environment: 'test',
      cache: {
        ttl: {
          image: 86400, // 1 day
          css: 43200, // 12 hours
          js: 43200, // 12 hours
          html: 3600, // 1 hour
          default: 14400, // 4 hours
          r2Headers: 86400, // 1 day
          remoteFetch: 3600 // 1 hour
        },
        retry: {
          maxAttempts: 2
        },
        circuitBreaker: {
          failureThreshold: 3,
          resetTimeoutMs: 1000
        },
        tags: {
          enabled: true,
          includeImageDimensions: true,
          includeFormat: true
        },
        // Cache tiers for optimized service
        tiers: [
          {
            name: 'frequent',
            ttlMultiplier: 2.0,
            priority: 100,
            frequentlyAccessed: true
          },
          {
            name: 'images',
            ttlMultiplier: 1.0,
            priority: 80,
            contentTypes: ['image/']
          },
          {
            name: 'small',
            ttlMultiplier: 1.2,
            priority: 60,
            maxSize: 50000
          },
          {
            name: 'default',
            ttlMultiplier: 1.0,
            priority: 0
          }
        ],
        bypassThreshold: 70,
        maxAccessPatterns: 100
      },
      performance: {
        optimizedCaching: true
      }
    };
    
    executionContext = new MockExecutionContext();
  });
  
  describe('Cache Bypass Decision Performance', () => {
    it('should benchmark cache bypass decision (default implementation)', async () => {
      // Create services
      const configService = new MockConfigService(defaultConfig);
      const cacheService = new DefaultCacheService(logger, configService);
      
      // Prepare test requests
      const requests = [
        createTestRequest('https://example.com/image.jpg'),
        createTestRequest('https://example.com/image.jpg?width=400&height=300'),
        createTestRequest('https://example.com/image.jpg?debug=true'),
        createTestRequest('https://example.com/image.jpg?cacheBuster=12345'),
        createTestRequest('https://example.com/image.jpg?width=400&quality=auto&format=webp')
      ];
      
      // Create transform options
      const transformOptions: TransformOptions = {
        width: 400,
        height: 300,
        format: 'auto',
        quality: 'auto'
      };
      
      // Measure performance
      const iterations = 1000;
      const startTime = performance.now();
      
      for (let i = 0; i < iterations; i++) {
        // Test each request
        for (const request of requests) {
          cacheService.shouldBypassCache(request, transformOptions);
        }
      }
      
      const endTime = performance.now();
      const totalTime = endTime - startTime;
      const avgTimePerDecision = totalTime / (iterations * requests.length);
      
      // Log results
      console.log(`Default Cache Service - Bypass Decision - Average time: ${avgTimePerDecision.toFixed(6)}ms`);
      
      // Basic validation
      expect(totalTime).toBeGreaterThan(0);
    });
    
    it('should benchmark cache bypass decision (optimized implementation)', async () => {
      // Create services
      const configService = new MockConfigService(defaultConfig);
      const cacheService = new OptimizedCacheService(logger, configService);
      
      // Prepare test requests
      const requests = [
        createTestRequest('https://example.com/image.jpg'),
        createTestRequest('https://example.com/image.jpg?width=400&height=300'),
        createTestRequest('https://example.com/image.jpg?debug=true'),
        createTestRequest('https://example.com/image.jpg?cacheBuster=12345'),
        createTestRequest('https://example.com/image.jpg?width=400&quality=auto&format=webp')
      ];
      
      // Create transform options
      const transformOptions: TransformOptions = {
        width: 400,
        height: 300,
        format: 'auto',
        quality: 'auto'
      };
      
      // Measure performance
      const iterations = 1000;
      const startTime = performance.now();
      
      for (let i = 0; i < iterations; i++) {
        // Test each request
        for (const request of requests) {
          cacheService.shouldBypassCache(request, transformOptions);
        }
      }
      
      const endTime = performance.now();
      const totalTime = endTime - startTime;
      const avgTimePerDecision = totalTime / (iterations * requests.length);
      
      // Log results
      console.log(`Optimized Cache Service - Bypass Decision - Average time: ${avgTimePerDecision.toFixed(6)}ms`);
      
      // Basic validation
      expect(totalTime).toBeGreaterThan(0);
    });
  });
  
  describe('Cache Header Application Performance', () => {
    it('should benchmark applying cache headers (default implementation)', async () => {
      // Create services
      const configService = new MockConfigService(defaultConfig);
      const cacheService = new DefaultCacheService(logger, configService);
      
      // Prepare test responses
      const responses = [
        createTestResponse('image/jpeg', 50000),
        createTestResponse('image/webp', 30000),
        createTestResponse('image/png', 100000),
        createTestResponse('text/html', 10000),
        createTestResponse('application/javascript', 20000)
      ];
      
      // Create transform options
      const transformOptions: TransformOptions = {
        width: 400,
        height: 300,
        format: 'auto',
        quality: 'auto'
      };
      
      // Measure performance
      const iterations = 1000;
      const startTime = performance.now();
      
      for (let i = 0; i < iterations; i++) {
        // Test each response
        for (const response of responses) {
          cacheService.applyCacheHeaders(response, transformOptions);
        }
      }
      
      const endTime = performance.now();
      const totalTime = endTime - startTime;
      const avgTimePerHeader = totalTime / (iterations * responses.length);
      
      // Log results
      console.log(`Default Cache Service - Apply Headers - Average time: ${avgTimePerHeader.toFixed(6)}ms`);
      
      // Basic validation
      expect(totalTime).toBeGreaterThan(0);
    });
    
    it('should benchmark applying cache headers (optimized implementation)', async () => {
      // Create services
      const configService = new MockConfigService(defaultConfig);
      const cacheService = new OptimizedCacheService(logger, configService);
      
      // Prepare test responses
      const responses = [
        createTestResponse('image/jpeg', 50000),
        createTestResponse('image/webp', 30000),
        createTestResponse('image/png', 100000),
        createTestResponse('text/html', 10000),
        createTestResponse('application/javascript', 20000)
      ];
      
      // Create transform options
      const transformOptions: TransformOptions = {
        width: 400,
        height: 300,
        format: 'auto',
        quality: 'auto'
      };
      
      // Measure performance
      const iterations = 1000;
      const startTime = performance.now();
      
      for (let i = 0; i < iterations; i++) {
        // Test each response
        for (const response of responses) {
          cacheService.applyCacheHeaders(response, transformOptions);
        }
      }
      
      const endTime = performance.now();
      const totalTime = endTime - startTime;
      const avgTimePerHeader = totalTime / (iterations * responses.length);
      
      // Log results
      console.log(`Optimized Cache Service - Apply Headers - Average time: ${avgTimePerHeader.toFixed(6)}ms`);
      
      // Basic validation
      expect(totalTime).toBeGreaterThan(0);
    });
  });
  
  describe('End-to-End Cache Performance', () => {
    it('should compare end-to-end caching performance', async () => {
      // Create services
      const configService = new MockConfigService(defaultConfig);
      const defaultCacheService = new DefaultCacheService(logger, configService);
      const optimizedCacheService = new OptimizedCacheService(logger, configService);
      
      // Create test data
      const request = createTestRequest('https://example.com/image.jpg?width=800&height=600&format=webp');
      const response = createTestResponse('image/webp', 80000);
      const transformOptions: TransformOptions = {
        width: 800,
        height: 600,
        format: 'webp',
        quality: 'auto'
      };
      
      // Measure default implementation
      const defaultIterations = 100;
      const defaultStartTime = performance.now();
      
      for (let i = 0; i < defaultIterations; i++) {
        // Check bypass
        const shouldBypass = defaultCacheService.shouldBypassCache(request, transformOptions);
        
        if (!shouldBypass) {
          // Apply cache headers
          const cachedResponse = defaultCacheService.applyCacheHeaders(response, transformOptions);
          
          // Generate cache tags (common operation)
          const cacheTags = defaultCacheService.generateCacheTags(request, {
            response: cachedResponse,
            contentType: 'image/webp',
            size: 80000,
            sourceType: 'r2',
            path: 'image.jpg'
          }, transformOptions);
          
          // Simulate cache operation (no actual cache in test)
          await defaultCacheService.cacheWithCacheApi(request, cachedResponse, executionContext);
        }
      }
      
      const defaultEndTime = performance.now();
      const defaultTotalTime = defaultEndTime - defaultStartTime;
      const defaultAvgTime = defaultTotalTime / defaultIterations;
      
      // Measure optimized implementation
      const optimizedIterations = 100;
      const optimizedStartTime = performance.now();
      
      for (let i = 0; i < optimizedIterations; i++) {
        // Check bypass
        const shouldBypass = optimizedCacheService.shouldBypassCache(request, transformOptions);
        
        if (!shouldBypass) {
          // Apply cache headers
          const cachedResponse = optimizedCacheService.applyCacheHeaders(response, transformOptions, undefined, request);
          
          // Generate cache tags (common operation)
          const cacheTags = optimizedCacheService.generateCacheTags(request, {
            response: cachedResponse,
            contentType: 'image/webp',
            size: 80000,
            sourceType: 'r2',
            path: 'image.jpg'
          }, transformOptions);
          
          // Simulate cache operation (no actual cache in test)
          await optimizedCacheService.cacheWithCacheApi(request, cachedResponse, executionContext);
        }
      }
      
      const optimizedEndTime = performance.now();
      const optimizedTotalTime = optimizedEndTime - optimizedStartTime;
      const optimizedAvgTime = optimizedTotalTime / optimizedIterations;
      
      // Calculate improvement
      const improvement = ((defaultAvgTime - optimizedAvgTime) / defaultAvgTime) * 100;
      
      // Log results
      console.log(`End-to-End Default Cache Average: ${defaultAvgTime.toFixed(3)}ms`);
      console.log(`End-to-End Optimized Cache Average: ${optimizedAvgTime.toFixed(3)}ms`);
      console.log(`End-to-End Cache Performance improvement: ${improvement.toFixed(2)}%`);
      
      // Basic validation
      expect(defaultTotalTime).toBeGreaterThan(0);
      expect(optimizedTotalTime).toBeGreaterThan(0);
      
      // We expect some performance difference, but it could be positive or negative
      // depending on the testing environment
      console.log(`Performance difference observed: ${improvement.toFixed(2)}%`);
    });
  });
});