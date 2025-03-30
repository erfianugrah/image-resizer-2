/**
 * Tests for the enhanced SchemaValidator using Ajv
 */

import { describe, it, expect, vi } from 'vitest';
import { SchemaValidator } from '../../../src/services/config/schemaValidator';
import { ConfigurationSystem, ConfigModule } from '../../../src/services/config/interfaces';

describe('SchemaValidator', () => {
  // Mock Logger
  const mockLogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  };
  
  const validator = new SchemaValidator(mockLogger);
  
  describe('validateObjectAgainstSchema', () => {
    it('should validate a simple object successfully', () => {
      const schema = {
        type: 'object',
        required: ['name', 'age'],
        properties: {
          name: { type: 'string' },
          age: { type: 'integer', minimum: 0 },
          email: { type: 'string', format: 'email' }
        }
      };
      
      const validObject = {
        name: 'John Doe',
        age: 30,
        email: 'john@example.com'
      };
      
      // Using the private method through a wrapper for testing
      const validateWrapper = () => {
        validator.validateModuleConfig('test', validObject, schema);
      };
      
      expect(validateWrapper).not.toThrow();
    });
    
    it('should throw error for invalid object', () => {
      const schema = {
        type: 'object',
        required: ['name', 'age'],
        properties: {
          name: { type: 'string' },
          age: { type: 'integer', minimum: 0 },
          email: { type: 'string', format: 'email' }
        }
      };
      
      const invalidObject = {
        name: 'John Doe',
        age: -5, // Invalid age (below minimum)
        email: 'not-an-email' // Invalid email format
      };
      
      // Using the private method through a wrapper for testing
      const validateWrapper = () => {
        validator.validateModuleConfig('test', invalidObject, schema);
      };
      
      expect(validateWrapper).toThrow();
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });
  
  describe('validateConfigSystem', () => {
    it('should validate a complete configuration system', () => {
      const validConfig: ConfigurationSystem = {
        _meta: {
          version: '1.0.0',
          lastUpdated: new Date().toISOString(),
          activeModules: ['core', 'cache']
        },
        modules: {
          core: {
            _meta: {
              name: 'core',
              version: '1.0.0',
              description: 'Core module',
              schema: {
                type: 'object',
                required: ['environment'],
                properties: {
                  environment: { 
                    type: 'string',
                    enum: ['development', 'staging', 'production']
                  }
                }
              },
              defaults: {
                environment: 'development'
              }
            },
            config: {
              environment: 'production'
            }
          },
          cache: {
            _meta: {
              name: 'cache',
              version: '1.0.0',
              description: 'Cache module',
              schema: {
                type: 'object',
                properties: {
                  ttl: { type: 'integer', minimum: 0 }
                }
              },
              defaults: {
                ttl: 3600
              },
              dependencies: ['core'] // Added dependency
            },
            config: {
              ttl: 7200
            }
          }
        }
      };
      
      const validateWrapper = () => {
        validator.validateConfigSystem(validConfig);
      };
      
      expect(validateWrapper).not.toThrow();
    });
    
    it('should detect cross-module dependency issues', () => {
      const invalidConfig: ConfigurationSystem = {
        _meta: {
          version: '1.0.0',
          lastUpdated: new Date().toISOString(),
          activeModules: ['cache'] // Missing core module
        },
        modules: {
          cache: {
            _meta: {
              name: 'cache',
              version: '1.0.0',
              description: 'Cache module',
              schema: {
                type: 'object',
                properties: {
                  ttl: { type: 'integer', minimum: 0 }
                }
              },
              defaults: {
                ttl: 3600
              },
              dependencies: ['core'] // Dependency on non-existing module
            },
            config: {
              ttl: 7200
            }
          }
        }
      };
      
      const validateWrapper = () => {
        validator.validateConfigSystem(invalidConfig);
      };
      
      expect(validateWrapper).toThrow(/Module "cache" depends on "core"/);
    });
  });
  
  describe('environment variable processing', () => {
    it('should process environment variables in configuration', () => {
      const schema = {
        type: 'object',
        properties: {
          apiKey: { type: 'string' },
          endpoint: { type: 'string' }
        }
      };
      
      const configWithEnvVars = {
        apiKey: '${API_KEY}',
        endpoint: 'https://${API_DOMAIN}/v1'
      };
      
      // Mock the processEnvironmentVariables method result
      const processedConfig = {
        apiKey: '[ENV:API_KEY]',
        endpoint: 'https://[ENV:API_DOMAIN]/v1'
      };
      
      // We're testing that the validator accepts this preprocessed config
      const validateWrapper = () => {
        // @ts-ignore - Access private method for testing
        validator['processEnvironmentVariables'] = vi.fn().mockReturnValue(processedConfig);
        validator.validateModuleConfig('test', configWithEnvVars, schema);
      };
      
      expect(validateWrapper).not.toThrow();
    });
  });
  
  describe('custom formats', () => {
    it('should validate env-var format', () => {
      const schema = {
        type: 'object',
        properties: {
          envVar: { type: 'string', format: 'env-var' }
        }
      };
      
      const validObject = {
        envVar: '${ENV_VAR_NAME}'
      };
      
      const invalidObject = {
        envVar: '{ENV_VAR_NAME}'
      };
      
      // Valid env var format should pass
      const validateValidWrapper = () => {
        validator.validateModuleConfig('test', validObject, schema);
      };
      
      // Invalid env var format should fail
      const validateInvalidWrapper = () => {
        validator.validateModuleConfig('test', invalidObject, schema);
      };
      
      expect(validateValidWrapper).not.toThrow();
      expect(validateInvalidWrapper).toThrow();
    });
  });
});