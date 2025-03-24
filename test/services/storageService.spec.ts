/**
 * Storage Service Tests
 * 
 * Tests for the enhanced StorageService functionality with resilience patterns
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DefaultStorageService } from '../../src/services/storageService';
import { DefaultConfigurationService } from '../../src/services/configurationService';
import { Logger } from '../../src/utils/logging';
import { createMockLogger } from '../mocks/logging';
import { 
  StorageServiceError, 
  StorageNotFoundError, 
  AllStorageSourcesFailedError,
  RemoteStorageError,
  R2StorageError,
  FallbackStorageError,
  StorageTimeoutError
} from '../../src/errors/storageErrors';

// Mock the storage utility functions
vi.mock('../../src/storage', () => ({
  fetchImage: vi.fn(async (imagePath, config, env, request) => {
    // Default implementation returns a success response
    return {
      response: new Response('test image data', { 
        status: 200,
        headers: { 'Content-Type': 'image/jpeg' }
      }),
      sourceType: 'r2',
      contentType: 'image/jpeg',
      size: 1024,
      path: imagePath
    };
  }),
  setLogger: vi.fn()
}));

// Import the mocked utilities
import { fetchImage } from '../../src/storage';

describe('StorageService with Resilience Patterns', () => {
  let storageService: DefaultStorageService;
  let mockLogger: Logger;
  let mockConfigService: any;
  let mockEnv: any;
  let mockRequest: Request;
  
  beforeEach(() => {
    mockLogger = createMockLogger();
    mockRequest = new Request('https://example.com/image.jpg');
    
    // Create a mock environment
    mockEnv = {
      ENVIRONMENT: 'development',
      STORAGE_PRIORITY: 'r2,remote,fallback',
      REMOTE_URL: 'https://remote-images.example.com',
      FALLBACK_URL: 'https://fallback-images.example.com',
      IMAGES_BUCKET: {} // Mock R2 bucket
    };
    
    // Create a real ConfigurationService with mock environment
    const configService = new DefaultConfigurationService(mockLogger, mockEnv);
    
    // Create the StorageService with dependencies
    storageService = new DefaultStorageService(mockLogger, configService);
    
    // Reset the mocked functions
    vi.clearAllMocks();
  });
  
  afterEach(() => {
    vi.resetAllMocks();
  });
  
  describe('Basic Functionality', () => {
    it('should fetch an image successfully', async () => {
      const imagePath = '/images/test.jpg';
      const config = {
        storage: {
          priority: ['r2', 'remote', 'fallback'],
          r2: { enabled: true, bindingName: 'IMAGES_BUCKET' },
          remoteUrl: 'https://remote-images.example.com',
          fallbackUrl: 'https://fallback-images.example.com'
        }
      } as any;
      
      // Mock successful fetch from R2
      (fetchImage as any).mockResolvedValueOnce({
        response: new Response('test image data', { 
          status: 200,
          headers: { 'Content-Type': 'image/jpeg' }
        }),
        sourceType: 'r2',
        contentType: 'image/jpeg',
        size: 1024,
        path: imagePath
      });
      
      // Call the method
      const result = await storageService.fetchImage(imagePath, config, mockEnv, mockRequest);
      
      // Verify results
      expect(result).toBeDefined();
      expect(result.sourceType).toBe('r2');
      expect(result.contentType).toBe('image/jpeg');
      expect(result.size).toBe(1024);
      expect(result.response.status).toBe(200);
      
      // Verify the utility was called with the right parameters
      expect(fetchImage).toHaveBeenCalledWith(
        imagePath, 
        config, 
        mockEnv, 
        mockRequest
      );
    });
    
    it('should handle null contentType and size', async () => {
      const imagePath = '/images/test.jpg';
      const config = {
        storage: {
          priority: ['r2', 'remote', 'fallback'],
          r2: { enabled: true, bindingName: 'IMAGES_BUCKET' }
        }
      } as any;
      
      // Mock a result with null contentType and size
      (fetchImage as any).mockResolvedValueOnce({
        response: new Response('test image data'),
        sourceType: 'remote',
        contentType: null,
        size: null,
        path: imagePath
      });
      
      // Call the method
      const result = await storageService.fetchImage(imagePath, config, mockEnv, mockRequest);
      
      // Verify nulls were replaced with defaults
      expect(result.contentType).toBe('application/octet-stream');
      expect(result.size).toBe(0);
    });
  });
  
  describe('Error Handling', () => {
    it('should wrap unknown errors in StorageServiceError', async () => {
      const imagePath = '/images/test.jpg';
      const config = {
        storage: {
          priority: ['r2', 'remote', 'fallback'],
          r2: { enabled: true, bindingName: 'IMAGES_BUCKET' }
        }
      } as any;
      
      // Mock a generic error
      (fetchImage as any).mockRejectedValueOnce(new Error('Unknown storage error'));
      
      // Expect the error to be wrapped
      await expect(
        storageService.fetchImage(imagePath, config, mockEnv, mockRequest)
      ).rejects.toThrow(StorageServiceError);
      
      // Verify error properties
      try {
        await storageService.fetchImage(imagePath, config, mockEnv, mockRequest);
      } catch (error) {
        expect(error).toBeInstanceOf(StorageServiceError);
        expect(error.code).toBe('STORAGE_FETCH_ERROR');
        expect(error.status).toBe(500);
        expect(error.retryable).toBe(true);
        expect(error.details).toHaveProperty('imagePath', '/images/test.jpg');
      }
    });
    
    it('should propagate specific storage errors', async () => {
      const imagePath = '/images/test.jpg';
      const config = {
        storage: {
          priority: ['r2', 'remote', 'fallback'],
          r2: { enabled: true, bindingName: 'IMAGES_BUCKET' }
        }
      } as any;
      
      // Mock a specific storage error
      (fetchImage as any).mockRejectedValueOnce(
        new StorageNotFoundError('Image not found in storage')
      );
      
      // Expect the specific error to be thrown
      await expect(
        storageService.fetchImage(imagePath, config, mockEnv, mockRequest)
      ).rejects.toThrow(StorageNotFoundError);
    });
    
    it('should throw AllStorageSourcesFailedError when all sources fail', async () => {
      const imagePath = '/images/test.jpg';
      const config = {
        storage: {
          priority: ['r2', 'remote', 'fallback'],
          r2: { enabled: true, bindingName: 'IMAGES_BUCKET' },
          remoteUrl: 'https://remote-images.example.com',
          fallbackUrl: 'https://fallback-images.example.com'
        }
      } as any;
      
      // Override the fetchImage implementation for this test
      (fetchImage as any).mockImplementation((path, cfg, env, req) => {
        // Generate different errors based on source type in priority order
        const sourceType = cfg.storage.priority[0];
        if (sourceType === 'r2') {
          throw new R2StorageError('R2 error');
        } else if (sourceType === 'remote') {
          throw new RemoteStorageError('Remote error');
        } else {
          throw new FallbackStorageError('Fallback error');
        }
      });
      
      // Spying on getEffectiveStoragePriority to see what it returns
      const prioritySpy = vi.spyOn(storageService as any, 'getEffectiveStoragePriority');
      prioritySpy.mockReturnValue(['r2', 'remote', 'fallback']);
      
      // Expect the AllStorageSourcesFailedError to be thrown
      await expect(
        storageService.fetchImage(imagePath, config, mockEnv, mockRequest)
      ).rejects.toThrow(AllStorageSourcesFailedError);
      
      // Verify the error contains details about tried sources
      try {
        await storageService.fetchImage(imagePath, config, mockEnv, mockRequest);
      } catch (error) {
        expect(error).toBeInstanceOf(AllStorageSourcesFailedError);
        expect(error.details).toHaveProperty('triedSources');
        expect(error.details.triedSources).toContain('r2');
        expect(error.details.triedSources).toContain('remote');
        expect(error.details.triedSources).toContain('fallback');
        expect(error.details).toHaveProperty('errors');
      }
    });
  });
  
  describe('Resilience Patterns', () => {
    it('should retry failed operations based on configuration', async () => {
      const imagePath = '/images/test.jpg';
      const config = {
        storage: {
          priority: ['r2'],
          r2: { enabled: true, bindingName: 'IMAGES_BUCKET' },
          retry: {
            maxAttempts: 3,
            initialDelayMs: 10 // Short delay for tests
          }
        }
      } as any;
      
      // Mock setTimeout to execute immediately
      vi.spyOn(global, 'setTimeout').mockImplementation((cb) => {
        cb();
        return 0 as any;
      });
      
      // Mock fetchImage to fail twice then succeed
      (fetchImage as any)
        .mockRejectedValueOnce(new R2StorageError('First failure', { retryable: true }))
        .mockRejectedValueOnce(new R2StorageError('Second failure', { retryable: true }))
        .mockResolvedValueOnce({
          response: new Response('success after retry'),
          sourceType: 'r2',
          contentType: 'image/jpeg',
          size: 1024
        });
      
      // Should succeed after retries
      const result = await storageService.fetchImage(imagePath, config, mockEnv, mockRequest);
      
      // Verify result
      expect(result).toBeDefined();
      expect(result.sourceType).toBe('r2');
      
      // Should have called fetchImage multiple times
      expect(fetchImage).toHaveBeenCalledTimes(3);
    });
    
    it('should use circuit breaker for R2 storage', async () => {
      const imagePath = '/images/test.jpg';
      const config = {
        storage: {
          priority: ['r2', 'remote', 'fallback'],
          r2: { enabled: true, bindingName: 'IMAGES_BUCKET' },
          remoteUrl: 'https://remote-images.example.com',
          circuitBreaker: {
            failureThreshold: 1, // Set to 1 for testing
            resetTimeoutMs: 30000
          }
        }
      } as any;
      
      // Mock a retryable R2 error
      const r2Error = new R2StorageError('R2 failure', { retryable: true });
      
      // Mock fetchImage to always fail with R2 but succeed with remote
      (fetchImage as any).mockImplementation((path, cfg, env, req) => {
        if (cfg.storage.priority[0] === 'r2') {
          throw r2Error;
        } else {
          return {
            response: new Response('remote success'),
            sourceType: 'remote',
            contentType: 'image/jpeg',
            size: 1024
          };
        }
      });
      
      // First call should try R2, fail, then try remote and succeed
      let result = await storageService.fetchImage(imagePath, config, mockEnv, mockRequest);
      expect(result.sourceType).toBe('remote');
      
      // Force the circuit breaker to open
      (storageService as any).r2CircuitBreaker.isOpen = true;
      (storageService as any).r2CircuitBreaker.resetTimeMs = Date.now() + 30000;
      
      // Second call should skip R2 due to circuit breaker
      result = await storageService.fetchImage(imagePath, config, mockEnv, mockRequest);
      
      // Should still succeed with remote
      expect(result.sourceType).toBe('remote');
      
      // Should skip R2 in the second call
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Skipping R2 storage - circuit breaker open',
        expect.any(Object)
      );
    });
    
    it('should adapt storage priority based on failure patterns', async () => {
      const imagePath = '/images/test.jpg';
      const config = {
        storage: {
          priority: ['r2', 'remote', 'fallback'],
          r2: { enabled: true, bindingName: 'IMAGES_BUCKET' },
          remoteUrl: 'https://remote-images.example.com',
          fallbackUrl: 'https://fallback-images.example.com'
        }
      } as any;
      
      // Set up a high failure rate for 'remote' storage
      const storageService_private = storageService as any;
      
      // Record 5 recent failures for 'remote'
      const now = Date.now();
      for (let i = 0; i < 5; i++) {
        storageService_private.recentFailures.push({
          timestamp: now - i * 1000, // Recent failures
          errorCode: 'REMOTE_STORAGE_ERROR',
          source: 'remote'
        });
      }
      
      // Mock getEffectiveStoragePriority to verify it's called correctly
      const spy = vi.spyOn(storageService_private, 'getEffectiveStoragePriority');
      spy.mockImplementation((cfg) => {
        // Return the original implementation results
        const original = storageService_private.getEffectiveStoragePriority.bind(storageService_private);
        return original(cfg);
      });
      
      // Mock the shouldAvoidSource method to verify it filters out 'remote'
      const avoidSpy = vi.spyOn(storageService_private, 'shouldAvoidSource');
      avoidSpy.mockImplementation((source) => {
        return source === 'remote'; // Avoid remote source
      });
      
      // Call fetchImage - should skip remote due to recent failures
      await storageService.fetchImage(imagePath, config, mockEnv, mockRequest);
      
      // Should have called getEffectiveStoragePriority
      expect(spy).toHaveBeenCalledWith(config);
      
      // Should have checked shouldAvoidSource for each source
      expect(avoidSpy).toHaveBeenCalledWith('r2');
      expect(avoidSpy).toHaveBeenCalledWith('remote');
      expect(avoidSpy).toHaveBeenCalledWith('fallback');
    });
  });
});