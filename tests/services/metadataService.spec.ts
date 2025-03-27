/**
 * Test suite for MetadataFetchingService
 * 
 * This test suite verifies that the MetadataFetchingService correctly fetches
 * and processes image metadata.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DefaultMetadataFetchingService } from '../../src/services/metadataService';
import { defaultConfig } from '../../src/config';
import { 
  ImageMetadata, 
  MetadataProcessingOptions
} from '../../src/services/interfaces';
import {
  createMockLogger,
  createMockStorageService,
  createMockCacheService,
  createMockConfigService
} from '../utils/test-helpers';

// Sample image metadata for testing
const sampleMetadata: ImageMetadata = {
  metadata: {
    width: 1200,
    height: 800,
    format: 'jpeg'
  }
};

// Create mock services
const mockStorageService = createMockStorageService({
  status: 200,
  headers: new Headers(),
  body: null,
  json: () => Promise.resolve(sampleMetadata)
});

const mockCacheService = createMockCacheService();

const mockConfigService = createMockConfigService(defaultConfig);

// Create a mock logger for testing
const logger = createMockLogger();

describe('MetadataFetchingService', () => {
  let metadataService: DefaultMetadataFetchingService;
  
  beforeEach(() => {
    // Create a fresh instance before each test
    metadataService = new DefaultMetadataFetchingService(
      logger,
      mockStorageService,
      mockCacheService,
      mockConfigService
    );
    
    // Reset mock call history
    vi.clearAllMocks();
  });
  
  afterEach(() => {
    vi.resetAllMocks();
  });
  
  describe('fetchMetadata', () => {
    it('should fetch metadata from storage service', async () => {
      const mockRequest = new Request('https://example.com/test.jpg');
      const mockEnv = {};
      
      const result = await metadataService.fetchMetadata(
        'test.jpg',
        defaultConfig,
        mockEnv,
        mockRequest
      );
      
      // Verify storage service was called
      expect(mockStorageService.fetchImage).toHaveBeenCalledWith(
        'test.jpg',
        defaultConfig,
        mockEnv,
        expect.any(Request)
      );
      
      // Verify the result contains valid metadata
      expect(result.metadata).toBeDefined();
      expect(typeof result.metadata.width).toBe('number');
      expect(typeof result.metadata.height).toBe('number');
    });
    
    it('should handle errors and throw them', async () => {
      // Setup mock to return an error
      mockStorageService.fetchImage = vi.fn().mockImplementation(() => {
        throw new Error('Storage service error');
      });
      
      const mockRequest = new Request('https://example.com/nonexistent.jpg');
      const mockEnv = {};
      
      // Now the service returns fallback data instead of throwing
      const result = await metadataService.fetchMetadata(
        'nonexistent.jpg',
        defaultConfig,
        mockEnv,
        mockRequest
      );
      
      // It should return fallback data with error information
      expect(result.metadata.estimationMethod).toBe('minimal-fallback');
      expect(result.messages).toBeDefined();
      expect(result.messages?.join('')).toContain('fallback');
    });
  });
  
  describe('processMetadata', () => {
    it('should process metadata with default options', () => {
      const result = metadataService.processMetadata(sampleMetadata);
      
      // Should return original metadata
      expect(result.originalMetadata).toEqual(sampleMetadata);
      
      // Should not set aspect crop if not needed
      expect(result.aspectCrop).toBeUndefined();
      
      // Should have a quality setting
      expect(result.quality).toBeDefined();
    });
    
    it('should apply target aspect ratio when specified', () => {
      const targetAspect = { width: 1, height: 1 };
      
      const result = metadataService.processMetadata(
        sampleMetadata,
        targetAspect
      );
      
      // Should now have aspect crop settings
      expect(result.aspectCrop).toBeDefined();
      expect(result.aspectCrop?.width).toBe(800);
      expect(result.aspectCrop?.height).toBe(800);
    });
    
    it('should use platform-specific presets', () => {
      const options: MetadataProcessingOptions = {
        targetPlatform: 'instagram'
      };
      
      const result = metadataService.processMetadata(
        sampleMetadata,
        undefined,
        options
      );
      
      // Should have aspect crop for instagram (1:1)
      expect(result.aspectCrop).toBeDefined();
      expect(result.aspectCrop?.width).toBe(800);
      expect(result.aspectCrop?.height).toBe(800);
    });
    
    it('should handle focal point specification', () => {
      const options: MetadataProcessingOptions = {
        focalPoint: { x: 0.75, y: 0.25 },
        targetPlatform: 'twitter'
      };
      
      const result = metadataService.processMetadata(
        sampleMetadata,
        undefined,
        options
      );
      
      // Should have aspect crop with specified focal point
      expect(result.aspectCrop).toBeDefined();
      expect(result.aspectCrop?.hoffset).toBe(0.75);
      expect(result.aspectCrop?.voffset).toBe(0.25);
    });
    
    it('should handle content type hints', () => {
      const options: MetadataProcessingOptions = {
        contentType: 'portrait',
        targetPlatform: 'twitter'
      };
      
      const result = metadataService.processMetadata(
        sampleMetadata,
        undefined,
        options
      );
      
      // Should use portrait focal point (higher on the image)
      expect(result.aspectCrop).toBeDefined();
      expect(result.aspectCrop?.voffset).toBe(0.33);
    });
  });
  
  describe('fetchAndProcessMetadata', () => {
    it('should fetch and process metadata in a single operation', async () => {
      // Create a custom implementation for testing this method specifically
      const testService = new DefaultMetadataFetchingService(
        logger,
        mockStorageService,
        mockCacheService,
        mockConfigService
      );
      
      // Create custom implementations just for this test
      testService.fetchMetadata = vi.fn().mockResolvedValue(sampleMetadata);
      testService.processMetadata = vi.fn().mockReturnValue({
        aspectCrop: {
          width: 16,
          height: 9,
          hoffset: 0.5,
          voffset: 0.33
        },
        originalMetadata: sampleMetadata
      });
      
      const mockRequest = new Request('https://example.com/test.jpg');
      const mockEnv = {};
      const targetAspect = { width: 16, height: 9 };
      
      const result = await testService.fetchAndProcessMetadata(
        'test.jpg',
        defaultConfig,
        mockEnv,
        mockRequest,
        targetAspect
      );
      
      // Verify both underlying methods were called
      expect(testService.fetchMetadata).toHaveBeenCalledWith(
        'test.jpg',
        defaultConfig,
        mockEnv,
        mockRequest
      );
      
      expect(testService.processMetadata).toHaveBeenCalledWith(
        sampleMetadata,
        targetAspect,
        undefined
      );
      
      // Verify we got a result
      expect(result).toBeDefined();
      expect(result.aspectCrop).toBeDefined();
    });
    
    it('should handle errors gracefully', async () => {
      // Setup fetch to throw an error
      vi.spyOn(metadataService, 'fetchMetadata').mockRejectedValue(new Error('Test error'));
      
      const mockRequest = new Request('https://example.com/test.jpg');
      const mockEnv = {};
      
      // Should return an empty result object without throwing
      const result = await metadataService.fetchAndProcessMetadata(
        'test.jpg',
        defaultConfig,
        mockEnv,
        mockRequest
      );
      
      expect(result).toEqual({});
    });
  });
});