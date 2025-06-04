import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getConfigWithFallback } from '../../../src/services/config/configBridge';
import { ConfigurationApiService } from '../../../src/services/config/interfaces';
import { Logger } from '../../../src/utils/logging';
import { Env } from '../../../src/types';

// Mock the legacy config module
vi.mock('../../../src/config', () => ({
  getConfig: vi.fn(() => ({
    environment: 'development',
    storage: {
      priority: ['r2', 'remote', 'fallback'],
      r2: {
        enabled: true,
        bindingName: 'IMAGES_BUCKET'
      }
    }
  })),
  deepMerge: (target: any, source: any) => {
    // Recursive deep merge implementation for testing
    const result = { ...target };
    
    const merge = (dst: any, src: any) => {
      for (const key in src) {
        if (src[key] && typeof src[key] === 'object' && !Array.isArray(src[key])) {
          if (!dst[key] || typeof dst[key] !== 'object') {
            dst[key] = {};
          }
          merge(dst[key], src[key]);
        } else {
          dst[key] = src[key];
        }
      }
    };
    
    merge(result, source);
    return result;
  }
}));

describe('configBridge', () => {
  let mockConfigApi: ConfigurationApiService;
  let mockLogger: Logger;
  let mockEnv: Env;

  beforeEach(() => {
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    } as any;

    mockEnv = {} as Env;

    mockConfigApi = {
      getModule: vi.fn()
    } as any;
  });

  describe('getConfigWithFallback', () => {
    it('should map nested storage URLs to flat structure', async () => {
      // Mock the storage module response
      vi.mocked(mockConfigApi.getModule).mockImplementation(async (moduleName: string) => {
        if (moduleName === 'core') {
          return {
            environment: 'development',
            debug: { enabled: false }
          };
        }
        if (moduleName === 'storage') {
          return {
            priority: ['r2', 'remote', 'fallback'],
            remote: {
              url: 'https://cdn.example.com/images/',
              auth: {
                enabled: true,
                type: 'aws-s3'
              }
            },
            fallback: {
              url: 'https://fallback.example.com/images/',
              auth: {
                enabled: false,
                type: 'bearer'
              }
            }
          };
        }
        return null;
      });

      const config = await getConfigWithFallback(mockConfigApi, mockEnv, mockLogger);

      // Verify that nested URLs are mapped to flat structure
      expect(config.storage.remoteUrl).toBe('https://cdn.example.com/images/');
      expect(config.storage.fallbackUrl).toBe('https://fallback.example.com/images/');
      
      // Verify that auth configs are also mapped
      expect(config.storage.remoteAuth).toEqual({
        enabled: true,
        type: 'aws-s3'
      });
      expect(config.storage.fallbackAuth).toEqual({
        enabled: false,
        type: 'bearer'
      });
    });

    it('should handle missing remote and fallback configs gracefully', async () => {
      // Mock the storage module response without remote/fallback
      vi.mocked(mockConfigApi.getModule).mockImplementation(async (moduleName: string) => {
        if (moduleName === 'storage') {
          return {
            priority: ['r2'],
            r2: {
              enabled: true,
              bindingName: 'IMAGES_BUCKET'
            }
          };
        }
        return null;
      });

      const config = await getConfigWithFallback(mockConfigApi, mockEnv, mockLogger);

      // Verify that remoteUrl and fallbackUrl are not set
      expect(config.storage.remoteUrl).toBeUndefined();
      expect(config.storage.fallbackUrl).toBeUndefined();
    });
  });
});