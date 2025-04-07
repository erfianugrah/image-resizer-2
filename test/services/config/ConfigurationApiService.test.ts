import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DefaultConfigurationApiService } from '../../../src/services/config/ConfigurationApiService';
import { ConfigurationSystem, ConfigVersionMetadata, ModuleRegistration } from '../../../src/services/config/interfaces';

// No need to mock the removed classes
// We now use Zod directly for validation

// Mock the logging module
vi.mock('../../../src/utils/logging', () => {
  return {
    defaultLogger: {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      breadcrumb: vi.fn(),
    },
    LogLevel: {
      DEBUG: 0,
      INFO: 1,
      WARN: 2,
      ERROR: 3,
    },
  };
});

// Create a mock ConfigStore
const createMockConfigStore = () => ({
  getCurrentConfig: vi.fn(),
  getConfigVersion: vi.fn(),
  listVersions: vi.fn(),
  storeConfig: vi.fn(),
  activateVersion: vi.fn(),
  getVersionMetadata: vi.fn(),
  getModuleConfig: vi.fn(),
  updateModuleConfig: vi.fn(),
  compareVersions: vi.fn(),
  get: vi.fn(),
  put: vi.fn(),
  list: vi.fn()
});

// Create a mock logger
const createMockLogger = () => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  breadcrumb: vi.fn()
});

describe('ConfigurationApiService', () => {
  let configService: DefaultConfigurationApiService;
  let mockConfigStore: ReturnType<typeof createMockConfigStore>;
  let mockLogger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    // Reset mocks and recreate them for each test
    vi.clearAllMocks();
    
    mockConfigStore = createMockConfigStore();
    mockLogger = createMockLogger();
    
    // Use prototype patching to override the validateConfig method
    const originalValidateConfig = DefaultConfigurationApiService.prototype.validateConfig;
    DefaultConfigurationApiService.prototype.validateConfig = vi.fn();
    
    // Create service instance
    configService = new DefaultConfigurationApiService(
      mockConfigStore as any,
      undefined,
      mockLogger as any
    );
    
    // Restore original method after instance creation
    DefaultConfigurationApiService.prototype.validateConfig = originalValidateConfig;
  });

  describe('registerModule', () => {
    it('should successfully register a module with moduleDependencies', async () => {
      // Setup mock responses
      const mockConfig: ConfigurationSystem = {
        _meta: {
          version: '1.0.0',
          lastUpdated: new Date().toISOString(),
          activeModules: []
        },
        modules: {}
      };
      
      const mockVersionMetadata: ConfigVersionMetadata = {
        id: 'v1',
        timestamp: new Date().toISOString(),
        hash: 'abc123',
        author: 'test',
        comment: 'test',
        modules: ['test-module'],
        changes: []
      };
      
      mockConfigStore.getCurrentConfig.mockResolvedValue(mockConfig);
      mockConfigStore.storeConfig.mockResolvedValue(mockVersionMetadata);
      
      // Test module registration with moduleDependencies 
      const moduleRegistration: ModuleRegistration = {
        name: 'test-module',
        version: '1.0.0',
        description: 'Test Module',
        schema: { type: 'object', properties: { test: { type: 'string' } } },
        defaults: { test: 'default' },
        moduleDependencies: ['core']
      };
      
      await configService.registerModule(moduleRegistration);
      
      // Verify that storeConfig was called
      expect(mockConfigStore.storeConfig).toHaveBeenCalled();
      
      // Get the first call arguments
      const storeConfigCallArg = mockConfigStore.storeConfig.mock.calls[0][0];
      
      // Verify moduleDependencies are properly stored in the module metadata
      expect(storeConfigCallArg.modules['test-module']._meta.moduleDependencies).toEqual(['core']);
    });
  });
});