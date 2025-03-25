/**
 * Client Detection Performance Benchmark
 * 
 * This file contains benchmark tests for measuring the performance of
 * the client detection service with different configurations.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Logger } from '../../src/utils/logging';
import { ConfigurationService, TransformOptions } from '../../src/services/interfaces';
import { DefaultClientDetectionService } from '../../src/services/clientDetectionService';
import { OptimizedClientDetectionService } from '../../src/services/optimizedClientDetectionService';
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

/**
 * Create test request with client hints
 * 
 * @param userAgent User agent string
 * @param clientHints Client hints to include
 * @returns Request object with specified headers
 */
function createTestRequest(
  userAgent: string,
  clientHints: Record<string, string> = {}
): Request {
  const headers = new Headers();
  
  // Set user agent
  headers.set('User-Agent', userAgent);
  
  // Set accept header for format detection
  headers.set('Accept', clientHints.accept || 'image/webp,image/png,image/*;q=0.8');
  
  // Add client hints
  for (const [key, value] of Object.entries(clientHints)) {
    if (key !== 'accept') {
      headers.set(key, value);
    }
  }
  
  return new Request('https://example.com/image.jpg', { headers });
}

describe('Client Detection Performance', () => {
  let logger: Logger;
  let defaultConfig: Partial<ImageResizerConfig>;
  
  beforeEach(() => {
    logger = new MockLogger();
    
    defaultConfig = {
      environment: 'test',
      clientDetection: {
        format: {
          enabled: true,
          detectWebp: true,
          detectAvif: true,
          preferredFormats: ['avif', 'webp']
        },
        device: {
          enabled: true,
          useMobileBreakpoint: 768,
          useTabletBreakpoint: 1024
        },
        browser: {
          enabled: true,
          checkClientHints: true
        },
        cache: {
          enabled: true,
          maxItems: 500
        }
      },
      performance: {
        optimizedClientDetection: true
      }
    };
  });
  
  it('should benchmark client detection (default implementation)', async () => {
    // Create service
    const configService = new MockConfigService(defaultConfig);
    const clientDetectionService = new DefaultClientDetectionService(logger, configService);
    
    // Prepare test requests
    const requests = [
      // Chrome on Windows
      createTestRequest(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        {
          'Sec-CH-UA': '"Google Chrome";v="121", "Not A(Brand";v="99"',
          'Sec-CH-UA-Mobile': '?0',
          'Sec-CH-UA-Platform': 'Windows',
          'Accept': 'image/avif,image/webp,image/png,image/*;q=0.8'
        }
      ),
      // Safari on iPhone
      createTestRequest(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1',
        {
          'Accept': 'image/webp,image/*;q=0.8',
          'DPR': '2',
          'Viewport-Width': '375'
        }
      ),
      // Firefox on Mac
      createTestRequest(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0',
        {
          'Accept': 'image/webp,image/png,image/*;q=0.8'
        }
      ),
      // Edge on Windows
      createTestRequest(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36 Edg/121.0.0.0',
        {
          'Sec-CH-UA': '"Microsoft Edge";v="121", "Not A(Brand";v="99"',
          'Sec-CH-UA-Mobile': '?0',
          'Sec-CH-UA-Platform': 'Windows',
          'Accept': 'image/avif,image/webp,image/png,image/*;q=0.8'
        }
      ),
      // Android Chrome
      createTestRequest(
        'Mozilla/5.0 (Linux; Android 12; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.6167.178 Mobile Safari/537.36',
        {
          'Sec-CH-UA': '"Google Chrome";v="121", "Not A(Brand";v="99"',
          'Sec-CH-UA-Mobile': '?1',
          'Sec-CH-UA-Platform': 'Android',
          'Accept': 'image/avif,image/webp,image/png,image/*;q=0.8',
          'DPR': '2.75',
          'Viewport-Width': '412',
          'Save-Data': 'on'
        }
      )
    ];
    
    // Measure performance
    const iterations = 100;
    const startTime = performance.now();
    
    for (let i = 0; i < iterations; i++) {
      // Test each request
      for (const request of requests) {
        await clientDetectionService.detectClient(request);
      }
    }
    
    const endTime = performance.now();
    const totalTime = endTime - startTime;
    const avgTimePerDetection = totalTime / (iterations * requests.length);
    
    // Log results
    console.log(`Default Client Detection - Average time: ${avgTimePerDetection.toFixed(6)}ms`);
    
    // Basic validation
    expect(totalTime).toBeGreaterThan(0);
  });
  
  it('should benchmark client detection (optimized implementation)', async () => {
    // Create service
    const configService = new MockConfigService(defaultConfig);
    const clientDetectionService = new OptimizedClientDetectionService(logger, configService);
    
    // Prepare test requests
    const requests = [
      // Chrome on Windows
      createTestRequest(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        {
          'Sec-CH-UA': '"Google Chrome";v="121", "Not A(Brand";v="99"',
          'Sec-CH-UA-Mobile': '?0',
          'Sec-CH-UA-Platform': 'Windows',
          'Accept': 'image/avif,image/webp,image/png,image/*;q=0.8'
        }
      ),
      // Safari on iPhone
      createTestRequest(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1',
        {
          'Accept': 'image/webp,image/*;q=0.8',
          'DPR': '2',
          'Viewport-Width': '375'
        }
      ),
      // Firefox on Mac
      createTestRequest(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0',
        {
          'Accept': 'image/webp,image/png,image/*;q=0.8'
        }
      ),
      // Edge on Windows
      createTestRequest(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36 Edg/121.0.0.0',
        {
          'Sec-CH-UA': '"Microsoft Edge";v="121", "Not A(Brand";v="99"',
          'Sec-CH-UA-Mobile': '?0',
          'Sec-CH-UA-Platform': 'Windows',
          'Accept': 'image/avif,image/webp,image/png,image/*;q=0.8'
        }
      ),
      // Android Chrome
      createTestRequest(
        'Mozilla/5.0 (Linux; Android 12; SM-G991B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.6167.178 Mobile Safari/537.36',
        {
          'Sec-CH-UA': '"Google Chrome";v="121", "Not A(Brand";v="99"',
          'Sec-CH-UA-Mobile': '?1',
          'Sec-CH-UA-Platform': 'Android',
          'Accept': 'image/avif,image/webp,image/png,image/*;q=0.8',
          'DPR': '2.75',
          'Viewport-Width': '412',
          'Save-Data': 'on'
        }
      )
    ];
    
    // Measure performance
    const iterations = 100;
    const startTime = performance.now();
    
    for (let i = 0; i < iterations; i++) {
      // Test each request
      for (const request of requests) {
        await clientDetectionService.detectClient(request);
      }
    }
    
    const endTime = performance.now();
    const totalTime = endTime - startTime;
    const avgTimePerDetection = totalTime / (iterations * requests.length);
    
    // Log results
    console.log(`Optimized Client Detection - Average time: ${avgTimePerDetection.toFixed(6)}ms`);
    
    // Basic validation
    expect(totalTime).toBeGreaterThan(0);
  });
  
  it('should benchmark format support detection', async () => {
    // Create services
    const configService = new MockConfigService(defaultConfig);
    const defaultService = new DefaultClientDetectionService(logger, configService);
    const optimizedService = new OptimizedClientDetectionService(logger, configService);
    
    // Prepare test request
    const request = createTestRequest(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
      {
        'Accept': 'image/avif,image/webp,image/png,image/*;q=0.8'
      }
    );
    
    // Test formats
    const formats = ['webp', 'avif', 'jpeg', 'png', 'gif'];
    
    // Measure default implementation
    const defaultIterations = 100;
    const defaultStartTime = performance.now();
    
    for (let i = 0; i < defaultIterations; i++) {
      for (const format of formats) {
        await defaultService.supportsFormat(request, format);
      }
    }
    
    const defaultEndTime = performance.now();
    const defaultTotalTime = defaultEndTime - defaultStartTime;
    const defaultAvgTime = defaultTotalTime / (defaultIterations * formats.length);
    
    // Measure optimized implementation
    const optimizedIterations = 100;
    const optimizedStartTime = performance.now();
    
    for (let i = 0; i < optimizedIterations; i++) {
      for (const format of formats) {
        await optimizedService.supportsFormat(request, format);
      }
    }
    
    const optimizedEndTime = performance.now();
    const optimizedTotalTime = optimizedEndTime - optimizedStartTime;
    const optimizedAvgTime = optimizedTotalTime / (optimizedIterations * formats.length);
    
    // Calculate improvement
    const improvement = ((defaultAvgTime - optimizedAvgTime) / defaultAvgTime) * 100;
    
    // Log results
    console.log(`Format Support Detection - Default Implementation - Average time: ${defaultAvgTime.toFixed(3)}ms`);
    console.log(`Format Support Detection - Optimized Implementation - Average time: ${optimizedAvgTime.toFixed(3)}ms`);
    console.log(`Format Support Detection - Performance improvement: ${improvement.toFixed(2)}%`);
    
    // Basic validation
    expect(defaultTotalTime).toBeGreaterThan(0);
    expect(optimizedTotalTime).toBeGreaterThan(0);
    
    // We expect some performance improvement
    console.log(`Performance difference observed: ${improvement.toFixed(2)}%`);
  });
  
  it('should benchmark getOptimizedOptions', async () => {
    // Create services
    const configService = new MockConfigService(defaultConfig);
    const defaultService = new DefaultClientDetectionService(logger, configService);
    const optimizedService = new OptimizedClientDetectionService(logger, configService);
    
    // Prepare test requests
    const requests = [
      // Mobile device
      createTestRequest(
        'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1',
        {
          'Accept': 'image/webp,image/*;q=0.8',
          'DPR': '2',
          'Viewport-Width': '375'
        }
      ),
      // Desktop browser
      createTestRequest(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        {
          'Accept': 'image/avif,image/webp,image/png,image/*;q=0.8'
        }
      )
    ];
    
    // Base options
    const baseOptions: TransformOptions = {
      width: 800,
      height: 600,
      format: 'auto',
      quality: 'auto'
    };
    
    // Measure default implementation
    const defaultIterations = 50;
    const defaultStartTime = performance.now();
    
    for (let i = 0; i < defaultIterations; i++) {
      for (const request of requests) {
        await defaultService.getOptimizedOptions(request, baseOptions, defaultConfig as ImageResizerConfig);
      }
    }
    
    const defaultEndTime = performance.now();
    const defaultTotalTime = defaultEndTime - defaultStartTime;
    const defaultAvgTime = defaultTotalTime / (defaultIterations * requests.length);
    
    // Measure optimized implementation
    const optimizedIterations = 50;
    const optimizedStartTime = performance.now();
    
    for (let i = 0; i < optimizedIterations; i++) {
      for (const request of requests) {
        await optimizedService.getOptimizedOptions(request, baseOptions, defaultConfig as ImageResizerConfig);
      }
    }
    
    const optimizedEndTime = performance.now();
    const optimizedTotalTime = optimizedEndTime - optimizedStartTime;
    const optimizedAvgTime = optimizedTotalTime / (optimizedIterations * requests.length);
    
    // Calculate improvement
    const improvement = ((defaultAvgTime - optimizedAvgTime) / defaultAvgTime) * 100;
    
    // Log results
    console.log(`Optimized Options - Default Implementation - Average time: ${defaultAvgTime.toFixed(3)}ms`);
    console.log(`Optimized Options - Optimized Implementation - Average time: ${optimizedAvgTime.toFixed(3)}ms`);
    console.log(`Optimized Options - Performance improvement: ${improvement.toFixed(2)}%`);
    
    // Basic validation
    expect(defaultTotalTime).toBeGreaterThan(0);
    expect(optimizedTotalTime).toBeGreaterThan(0);
    
    // We expect some performance improvement
    console.log(`Performance difference observed: ${improvement.toFixed(2)}%`);
  });
});