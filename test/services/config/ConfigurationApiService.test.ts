import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConfigurationApiService } from '../../../src/services/config/ConfigurationApiService';

// Mock KV namespace
const mockKVNamespace = {
  get: vi.fn(),
  put: vi.fn(),
  list: vi.fn()
};

// Mock logger
const mockLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn()
};

// Mock SchemaValidator
const mockSchemaValidator = {
  validate: vi.fn().mockReturnValue({ valid: true }),
  validateConfig: vi.fn().mockReturnValue({ valid: true })
};

describe('ConfigurationApiService', () => {
  let configService: ConfigurationApiService;

  beforeEach(() => {
    // Reset mocks
    vi.resetAllMocks();
    
    // Create service instance
    configService = new ConfigurationApiService(
      mockKVNamespace as any,
      mockSchemaValidator as any,
      mockLogger as any
    );
  });

  describe('registerModule', () => {
    it('should successfully register a module with moduleDependencies', async () => {
      // Setup mock responses
      mockKVNamespace.get.mockResolvedValue(null); // No existing module
      mockKVNamespace.put.mockResolvedValue(undefined);
      
      // Test module registration with dependencies renamed to moduleDependencies
      const result = await configService.registerModule({
        name: 'test-module',
        version: '1.0.0',
        description: 'Test Module',
        schema: { type: 'object', properties: { test: { type: 'string' } } },
        defaults: { test: 'default' },
        moduleDependencies: ['core']
      });
      
      // Verify the result
      expect(result).toEqual({ success: true });
      
      // Verify KV.put was called with correct data
      expect(mockKVNamespace.put).toHaveBeenCalledWith(
        'module:test-module',
        expect.stringContaining('"moduleDependencies":["core"]'),
        expect.any(Object)
      );
    });
  });
});