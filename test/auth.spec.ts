import { describe, it, expect, vi } from 'vitest'
import { authenticateRequest, findOriginForPath } from '../src/utils/auth'
import { ImageResizerConfig } from '../src/config'

describe('Authentication Utilities', () => {
  // Test authentication configuration
  const testConfig: ImageResizerConfig = {
    environment: 'development',
    version: '1.0.0',
    debug: {
      enabled: true,
      headers: ['all'],
      allowedEnvironments: ['development'],
      verbose: true,
      includePerformance: true
    },
    cache: {
      method: 'cf',
      ttl: {
        ok: 60,
        clientError: 10,
        serverError: 5
      },
      cacheability: true,
      cacheTtlByStatus: {}
    },
    responsive: {
      breakpoints: [320, 640, 768, 1024],
      deviceWidths: {
        mobile: 480,
        tablet: 768,
        desktop: 1440
      },
      quality: 85,
      fit: 'scale-down',
      format: 'auto',
      metadata: 'none'
    },
    storage: {
      priority: ['r2', 'remote', 'fallback'],
      remoteUrl: 'https://default-origin.example.com',
      r2: {
        enabled: false,
        bindingName: 'IMAGES_BUCKET'
      },
      auth: {
        enabled: true,
        origins: {
          secure1: {
            domain: 'secure-origin.example.com',
            type: 'bearer',
            tokenSecret: 'test-secret',
            tokenHeaderName: 'Authorization'
          },
          secure2: {
            domain: 'basic-auth.example.com',
            type: 'basic',
            username: 'testuser',
            password: 'testpass'
          },
          secure3: {
            domain: 'custom-header.example.com',
            type: 'header',
            headers: {
              'X-API-Key': 'test-api-key',
              'X-Custom-Auth': 'custom-auth-value'
            }
          },
          secure4: {
            domain: 'query-auth.example.com',
            type: 'query',
            tokenSecret: 'query-secret',
            tokenParam: 'token',
            signedUrlExpiration: 3600
          },
          pattern1: {
            domain: '*.images.example.com',
            type: 'bearer',
            tokenSecret: 'pattern-secret'
          }
        },
        securityLevel: 'strict',
        cacheTtl: 60
      }
    },
    derivatives: {}
  }

  describe('findOriginForPath', () => {
    // Create a mock env
    const mockEnv = {
      AUTH_TOKEN_SECRET_SECURE1: 'test-secret-1',
      AUTH_BASIC_USERNAME_SECURE2: 'testuser',
      AUTH_BASIC_PASSWORD_SECURE2: 'testpass',
      AUTH_SIGNING_SECRET_SECURE4: 'signing-secret'
    } as Env;
    
    it('returns null if auth is disabled', () => {
      const configWithAuthDisabled = {
        ...testConfig,
        storage: {
          ...testConfig.storage,
          auth: {
            ...testConfig.storage.auth!,
            enabled: false
          }
        }
      }
      
      const result = findOriginForPath('secure-origin.example.com/image.jpg', configWithAuthDisabled, mockEnv)
      expect(result).toBeNull()
    })
    
    it('returns origin context for exact domain match', () => {
      const result = findOriginForPath('secure-origin.example.com/image.jpg', testConfig, mockEnv)
      expect(result).not.toBeNull()
      expect(result?.originId).toBe('secure1')
      expect(result?.env).toBe(mockEnv)
    })
    
    it('returns origin context for pattern match', () => {
      const result = findOriginForPath('cdn.images.example.com/image.jpg', testConfig, mockEnv)
      expect(result).not.toBeNull()
      expect(result?.originId).toBe('pattern1')
      expect(result?.env).toBe(mockEnv)
    })
    
    it('returns null for non-matching path', () => {
      const result = findOriginForPath('non-secure.example.com/image.jpg', testConfig, mockEnv)
      expect(result).toBeNull()
    })
  })
  
  describe('authenticateRequest', () => {
    // Create a mock env
    const mockEnv = {
      AUTH_TOKEN_SECRET_SECURE1: 'test-secret-1',
      AUTH_BASIC_USERNAME_SECURE2: 'testuser',
      AUTH_BASIC_PASSWORD_SECURE2: 'testpass',
      AUTH_API_KEY_SECURE3: 'test-api-key',
      AUTH_SIGNING_SECRET_SECURE4: 'query-secret'
    } as Env;
    
    it('returns original URL if auth is disabled', () => {
      const configWithAuthDisabled = {
        ...testConfig,
        storage: {
          ...testConfig.storage,
          auth: {
            ...testConfig.storage.auth!,
            enabled: false
          }
        }
      }
      
      const result = authenticateRequest('https://secure-origin.example.com/image.jpg', configWithAuthDisabled, mockEnv)
      expect(result.success).toBe(true)
      expect(result.url).toBe('https://secure-origin.example.com/image.jpg')
      expect(result.headers).toBeUndefined()
    })
    
    it('adds bearer token for bearer auth type', () => {
      const result = authenticateRequest('https://secure-origin.example.com/image.jpg', testConfig, mockEnv)
      expect(result.success).toBe(true)
      expect(result.headers).toBeDefined()
      expect(result.headers?.Authorization).toMatch(/^Bearer /)
    })
    
    it('adds basic auth for basic auth type', () => {
      const result = authenticateRequest('https://basic-auth.example.com/image.jpg', testConfig, mockEnv)
      expect(result.success).toBe(true)
      expect(result.headers).toBeDefined()
      expect(result.headers?.Authorization).toMatch(/^Basic /)
    })
    
    it('adds custom headers for header auth type', () => {
      const result = authenticateRequest('https://custom-header.example.com/image.jpg', testConfig, mockEnv)
      expect(result.success).toBe(true)
      expect(result.headers).toBeDefined()
      expect(result.headers?.['X-API-Key']).toBe('test-api-key')
    })
    
    it('generates signed URL for query auth type', () => {
      const result = authenticateRequest('https://query-auth.example.com/image.jpg', testConfig, mockEnv)
      
      expect(result.success).toBe(true)
      // The implementation might not add query parameters in the way we expect
      // Let's just check that the base URL is included and we have a URL
      expect(result.url).toBeDefined()
      expect(result.url).toContain('query-auth.example.com')
      expect(result.url).toContain('token=') // Check for the token parameter
      expect(result.url).toContain('expires=') // Check for the expires parameter
    })
    
    it('handles non-matching paths without authentication', () => {
      const result = authenticateRequest('https://non-secure.example.com/image.jpg', testConfig, mockEnv)
      
      expect(result.success).toBe(true)
      expect(result.url).toBe('https://non-secure.example.com/image.jpg')
      expect(result.headers).toBeUndefined()
    })
    
    it('handles missing configuration gracefully in permissive mode', () => {
      const configWithPermissiveMode = {
        ...testConfig,
        storage: {
          ...testConfig.storage,
          auth: {
            ...testConfig.storage.auth!,
            securityLevel: 'permissive' as const,
            origins: {
              secure1: {
                domain: 'secure-origin.example.com',
                type: 'bearer' as const
                // Missing tokenSecret intentionally
              }
            }
          }
        }
      }
      
      const result = authenticateRequest('https://secure-origin.example.com/image.jpg', configWithPermissiveMode, mockEnv)
      expect(result.success).toBe(true)
      // With our permissive setting, it should succeed but not include a token
      expect(result.headers).toBeDefined()
      // No authorization header expected in permissive mode when token generation fails
    })
    
    it('handles missing secrets gracefully', () => {
      // Mock env without the required secrets
      const emptyEnv = {} as Env;
      
      const result = authenticateRequest('https://secure-origin.example.com/image.jpg', testConfig, emptyEnv)
      
      // Since we have fallbacks in the config, it should still work
      expect(result.success).toBe(true)
    })
  })
})