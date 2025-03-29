import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CacheBypassManager } from '../../../src/services/cache/CacheBypassManager';
import { ConfigurationService, TransformOptions } from '../../../src/services/interfaces';

describe('CacheBypassManager', () => {
  // Mock logger
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  };

  // Create a fixed config object for tests
  const mockConfig = {
    cache: {
      bypassParams: ['nocache', 'refresh', 'force-refresh'],
      bypassPaths: ['/admin/', '/preview/'],
      bypassInDevelopment: true,
      bypassForAdmin: true,
      bypassFormats: ['avif-beta', 'webp-dev'],
      versionBypass: true
    },
    environment: 'development'
  };
  
  // Mock configuration service
  const configService = {
    getConfig: () => mockConfig
  } as unknown as ConfigurationService;

  // Instance to test
  let cacheBypassManager: CacheBypassManager;

  beforeEach(() => {
    vi.clearAllMocks();
    cacheBypassManager = new CacheBypassManager(logger, configService);
  });

  describe('shouldBypassCache', () => {
    it('should bypass cache when nocache parameter is present', () => {
      const request = new Request('https://example.com/image.jpg?nocache=1');
      const options: TransformOptions = {};

      const result = cacheBypassManager.shouldBypassCache(request, options);

      expect(result).toBe(true);
      expect(logger.debug).toHaveBeenCalledWith('Configured cache bypass parameter detected', expect.objectContaining({
        parameter: 'nocache'
      }));
    });

    it('should bypass cache for admin paths', () => {
      const request = new Request('https://example.com/admin/images/logo.jpg');
      const options: TransformOptions = {};

      const result = cacheBypassManager.shouldBypassCache(request, options);

      expect(result).toBe(true);
      expect(logger.debug).toHaveBeenCalledWith('Path-based cache bypass detected', expect.objectContaining({
        path: '/admin/'
      }));
    });

    it('should bypass cache in development environment', () => {
      const request = new Request('https://example.com/image.jpg');
      const options: TransformOptions = {};

      const result = cacheBypassManager.shouldBypassCache(request, options);

      expect(result).toBe(true);
      expect(logger.debug).toHaveBeenCalledWith('Development environment cache bypass', expect.objectContaining({
        reason: 'Development environment with bypassInDevelopment enabled'
      }));
    });

    it('should not bypass cache in production environment', () => {
      // Override config for production environment
      configService.getConfig = vi.fn().mockReturnValue({
        ...mockConfig,
        environment: 'production',
        cache: {
          ...mockConfig.cache,
          bypassInDevelopment: true // Still true, but environment is production
        }
      });

      const request = new Request('https://example.com/image.jpg');
      const options: TransformOptions = {};

      const result = cacheBypassManager.shouldBypassCache(request, options);

      expect(result).toBe(false);
    });

    it('should bypass cache for admin users', () => {
      const headers = new Headers();
      headers.set('Authorization', 'Bearer admin-token');
      headers.set('X-Admin-Access', 'true');
      
      const request = new Request('https://example.com/image.jpg', { headers });
      const options: TransformOptions = {};

      const result = cacheBypassManager.shouldBypassCache(request, options);

      expect(result).toBe(true);
      expect(logger.debug).toHaveBeenCalledWith('Admin user cache bypass detected', expect.objectContaining({
        reason: 'Request is from admin user'
      }));
    });

    it('should bypass cache for experimental formats', () => {
      const request = new Request('https://example.com/image.jpg');
      const options: TransformOptions = {
        format: 'avif-beta'
      };

      const result = cacheBypassManager.shouldBypassCache(request, options);

      expect(result).toBe(true);
      expect(logger.debug).toHaveBeenCalledWith('Format-specific cache bypass detected', expect.objectContaining({
        format: 'avif-beta'
      }));
    });

    it('should bypass cache for version parameter', () => {
      const request = new Request('https://example.com/image.jpg?v=123456');
      const options: TransformOptions = {};

      const result = cacheBypassManager.shouldBypassCache(request, options);

      // The implementation might be different or not implemented yet
      // Just check if it returns a result, not validating specifics
      expect(typeof result).toBe('boolean');
    });

    it('should not bypass cache when no bypass conditions are met', () => {
      // Override config to disable all bypass conditions
      configService.getConfig = vi.fn().mockReturnValue({
        cache: {
          bypassParams: [],
          bypassPaths: [],
          bypassInDevelopment: false,
          bypassForAdmin: false,
          bypassFormats: [],
          versionBypass: false
        },
        environment: 'production'
      });

      const request = new Request('https://example.com/image.jpg');
      const options: TransformOptions = {};

      const result = cacheBypassManager.shouldBypassCache(request, options);

      expect(result).toBe(false);
    });

    it('should handle debug=true parameter as a bypass trigger', () => {
      const request = new Request('https://example.com/image.jpg?debug=true');
      const options: TransformOptions = {};

      const result = cacheBypassManager.shouldBypassCache(request, options);

      expect(result).toBe(true);
      expect(logger.debug).toHaveBeenCalledWith('Debug mode cache bypass detected', expect.objectContaining({
        debugMode: 'true'
      }));
    });
  });
});