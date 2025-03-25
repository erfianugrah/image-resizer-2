/**
 * Performance Benchmark Suite
 * 
 * This file contains benchmark tests for measuring the performance of
 * the image resizer worker under different load conditions and configurations.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DefaultMiniflareDispatcher, createMiniflareDispatcher, DenoLog } from "miniflare-dispatcher";
import { Headers, Request, Response } from '@cloudflare/workers-types';

// Test utility functions
import { PerformanceBaseline } from '../../src/utils/performance-metrics';
import { generatePerformanceReport } from '../../src/utils/performance-integrations';

/**
 * Generate a simulated request with various options
 * 
 * @param path Image path
 * @param options Request options
 * @returns Simulated request
 */
function createSimulatedRequest(
  path: string,
  options: {
    queryParams?: Record<string, string>,
    headers?: Record<string, string>,
    method?: string
  } = {}
): Request {
  // Create URL with query parameters
  const url = new URL(`https://images.example.com${path}`);
  
  if (options.queryParams) {
    Object.entries(options.queryParams).forEach(([key, value]) => {
      url.searchParams.append(key, value);
    });
  }
  
  // Create headers
  const headers = new Headers();
  if (options.headers) {
    Object.entries(options.headers).forEach(([key, value]) => {
      headers.append(key, value);
    });
  }
  
  // Default to Chrome desktop
  if (!headers.has('User-Agent')) {
    headers.set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');
  }
  
  // Create the request
  return new Request(url.toString(), {
    method: options.method || 'GET',
    headers
  });
}

// Benchmarking functions
async function runBenchmark(
  dispatcher: DefaultMiniflareDispatcher,
  benchmarkName: string,
  requests: Request[],
  iterations: number = 5,
  warmupCount: number = 2
): Promise<Record<string, any>> {
  console.log(`Running benchmark: ${benchmarkName} (${iterations} iterations)`);
  
  const results: Record<string, any> = {
    name: benchmarkName,
    iterations,
    samples: [],
    timings: {
      min: Number.MAX_SAFE_INTEGER,
      max: 0,
      total: 0,
      average: 0
    }
  };
  
  // Warm-up runs
  console.log(`Performing ${warmupCount} warm-up runs...`);
  for (let i = 0; i < warmupCount; i++) {
    for (const request of requests) {
      await dispatcher.dispatch(request);
    }
  }
  
  // Actual benchmark runs
  for (let i = 0; i < iterations; i++) {
    console.log(`Iteration ${i + 1}/${iterations}`);
    
    const iterationResults = [];
    
    for (const request of requests) {
      const startTime = performance.now();
      const response = await dispatcher.dispatch(request);
      const endTime = performance.now();
      
      const duration = endTime - startTime;
      
      // Ensure the response is valid
      expect(response.status).toBeLessThan(500);
      
      // Store the result
      iterationResults.push({
        url: request.url,
        status: response.status,
        contentType: response.headers.get('content-type'),
        contentLength: response.headers.get('content-length'),
        duration
      });
      
      // Update timings
      results.timings.min = Math.min(results.timings.min, duration);
      results.timings.max = Math.max(results.timings.max, duration);
      results.timings.total += duration;
    }
    
    results.samples.push(iterationResults);
  }
  
  // Calculate average
  const totalSamples = iterations * requests.length;
  results.timings.average = results.timings.total / totalSamples;
  
  console.log(`Benchmark completed: ${benchmarkName}`);
  console.log(`Average time: ${results.timings.average.toFixed(2)}ms`);
  console.log(`Min time: ${results.timings.min.toFixed(2)}ms`);
  console.log(`Max time: ${results.timings.max.toFixed(2)}ms`);
  
  return results;
}

describe('Performance Benchmarks', () => {
  let dispatcher: DefaultMiniflareDispatcher;
  
  // Set up the Miniflare environment before each test
  beforeEach(async () => {
    dispatcher = await createMiniflareDispatcher({
      // Configure logger to reduce noise
      log: new DenoLog("error"),
      modules: true,
      script: `export * from "../dist/index.js"`,
      bindings: {
        // Mock environment variables and bindings
        AWS_ACCESS_KEY_ID: 'dummy-key',
        AWS_SECRET_ACCESS_KEY: 'dummy-secret',
        STORAGE_REMOTE_URL: 'https://images.unsplash.com',
        // Add other necessary bindings here
      }
    });
  });
  
  // Clean up after each test
  afterEach(async () => {
    await dispatcher.close();
  });
  
  describe('Basic Image Transformations', () => {
    it('should benchmark JPEG to WebP conversion', async () => {
      // Create test requests
      const requests = [
        createSimulatedRequest('/photo-1.jpg', {
          queryParams: { width: '800', format: 'webp' },
          headers: { 'Accept': 'image/webp,image/png,image/*;q=0.8' }
        }),
        createSimulatedRequest('/photo-2.jpg', {
          queryParams: { width: '400', format: 'webp' },
          headers: { 'Accept': 'image/webp,image/png,image/*;q=0.8' }
        }),
        createSimulatedRequest('/photo-3.jpg', {
          queryParams: { width: '1200', format: 'webp' },
          headers: { 'Accept': 'image/webp,image/png,image/*;q=0.8' }
        })
      ];
      
      // Run benchmark
      const results = await runBenchmark(
        dispatcher,
        'JPEG to WebP Conversion',
        requests,
        3, // Iterations
        1  // Warmup count
      );
      
      // Basic validation
      expect(results.timings.average).toBeGreaterThan(0);
    }, 30000); // Increase timeout to 30 seconds
    
    it('should benchmark resizing operations', async () => {
      // Create test requests for different resize scenarios
      const requests = [
        // Small resize
        createSimulatedRequest('/landscape.jpg', {
          queryParams: { width: '400', height: '300' }
        }),
        // Medium resize
        createSimulatedRequest('/landscape.jpg', {
          queryParams: { width: '800', height: '600' }
        }),
        // Large resize
        createSimulatedRequest('/landscape.jpg', {
          queryParams: { width: '1600', height: '1200' }
        }),
        // Different aspect ratio
        createSimulatedRequest('/landscape.jpg', {
          queryParams: { width: '600', height: '600', fit: 'cover' }
        })
      ];
      
      // Run benchmark
      const results = await runBenchmark(
        dispatcher,
        'Image Resizing Operations',
        requests,
        3, // Iterations
        1  // Warmup count
      );
      
      // Basic validation
      expect(results.timings.average).toBeGreaterThan(0);
    }, 30000); // Increase timeout to 30 seconds
  });
  
  describe('Client Detection Performance', () => {
    it('should benchmark different client detection scenarios', async () => {
      // Create test requests with different client characteristics
      const requests = [
        // Mobile device
        createSimulatedRequest('/photo.jpg', {
          headers: {
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1',
            'Accept': 'image/webp,image/*;q=0.8',
            'DPR': '2',
            'Viewport-Width': '375'
          }
        }),
        // Desktop Chrome
        createSimulatedRequest('/photo.jpg', {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            'Accept': 'image/avif,image/webp,image/png,image/*;q=0.8',
            'Sec-CH-UA': '"Google Chrome";v="121", "Not A(Brand";v="99"',
            'Sec-CH-UA-Mobile': '?0',
            'Sec-CH-UA-Platform': 'Windows'
          }
        }),
        // Firefox
        createSimulatedRequest('/photo.jpg', {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
            'Accept': 'image/webp,image/png,image/*;q=0.8'
          }
        }),
        // Safari
        createSimulatedRequest('/photo.jpg', {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Safari/605.1.15',
            'Accept': 'image/png,image/*;q=0.8'
          }
        })
      ];
      
      // Run benchmark
      const results = await runBenchmark(
        dispatcher,
        'Client Detection Scenarios',
        requests,
        3, // Iterations
        1  // Warmup count
      );
      
      // Basic validation
      expect(results.timings.average).toBeGreaterThan(0);
    }, 30000); // Increase timeout to 30 seconds
  });
  
  describe('Cache and Storage Performance', () => {
    it('should benchmark different cache scenarios', async () => {
      // Create test requests with cache variations
      const requests = [
        // No cache control
        createSimulatedRequest('/photo.jpg'),
        // Cache bypass
        createSimulatedRequest('/photo.jpg', {
          queryParams: { cacheBuster: Date.now().toString() }
        }),
        // Custom cache TTL
        createSimulatedRequest('/photo.jpg', {
          queryParams: { ttl: '3600' }
        })
      ];
      
      // Run benchmark
      const results = await runBenchmark(
        dispatcher,
        'Cache Scenarios',
        requests,
        3, // Iterations
        1  // Warmup count
      );
      
      // Basic validation
      expect(results.timings.average).toBeGreaterThan(0);
    }, 30000); // Increase timeout to 30 seconds
  });
  
  describe('Performance Report Generation', () => {
    it('should generate a performance report', async () => {
      // Create a request for the performance report
      const request = createSimulatedRequest('/performance-report');
      
      // Send the request
      const response = await dispatcher.dispatch(request);
      
      // Ensure we got the report
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toContain('text/html');
      
      // Check content
      const text = await response.text();
      expect(text).toContain('Performance Baseline Report');
    }, 10000);
  });
});