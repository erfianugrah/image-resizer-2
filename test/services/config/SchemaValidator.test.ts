/**
 * Tests for the lightweight SchemaValidator for Cloudflare Workers
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SchemaValidator } from '../../../src/services/config/schemaValidator';
import { ConfigurationSystem } from '../../../src/services/config/interfaces';

describe('SchemaValidator', () => {
  // Mock Logger
  const mockLogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    breadcrumb: vi.fn()
  };
  
  let validator: SchemaValidator;
  
  beforeEach(() => {
    validator = new SchemaValidator(mockLogger);
    vi.clearAllMocks();
  });
  
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
      
      // Using the public method for testing
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
      
      // Using the public method for testing
      const validateWrapper = () => {
        validator.validateModuleConfig('test', invalidObject, schema);
      };
      
      expect(validateWrapper).toThrow();
      expect(mockLogger.error).toHaveBeenCalled();
    });
    
    it('should validate type constraints correctly', () => {
      const schema = {
        type: 'object',
        properties: {
          stringProp: { type: 'string' },
          numberProp: { type: 'number' },
          integerProp: { type: 'integer' },
          booleanProp: { type: 'boolean' },
          arrayProp: { type: 'array' },
          objectProp: { type: 'object' },
          nullProp: { type: 'null' }
        }
      };
      
      const validObject = {
        stringProp: 'test',
        numberProp: 10.5,
        integerProp: 10,
        booleanProp: true,
        arrayProp: [1, 2, 3],
        objectProp: { key: 'value' },
        nullProp: null
      };
      
      const validateWrapper = () => {
        validator.validateModuleConfig('test', validObject, schema);
      };
      
      expect(validateWrapper).not.toThrow();
    });
    
    it('should validate complex nested objects', () => {
      const schema = {
        type: 'object',
        properties: {
          user: {
            type: 'object',
            required: ['id', 'name'],
            properties: {
              id: { type: 'integer' },
              name: { type: 'string' },
              address: {
                type: 'object',
                properties: {
                  street: { type: 'string' },
                  city: { type: 'string' },
                  zip: { type: 'string', pattern: '^\\d{5}(-\\d{4})?$' }
                }
              }
            }
          },
          tags: {
            type: 'array',
            items: { type: 'string' }
          }
        }
      };
      
      const validObject = {
        user: {
          id: 1,
          name: 'Jane Smith',
          address: {
            street: '123 Main St',
            city: 'Anytown',
            zip: '12345'
          }
        },
        tags: ['tag1', 'tag2', 'tag3']
      };
      
      const validateWrapper = () => {
        validator.validateModuleConfig('test', validObject, schema);
      };
      
      expect(validateWrapper).not.toThrow();
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
              moduleDependencies: ['core'] // Added dependency
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
              moduleDependencies: ['core'] // Dependency on non-existing module
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
  
  describe('format validation', () => {
    it('should validate date-time format', () => {
      const schema = {
        type: 'object',
        properties: {
          dateTime: { type: 'string', format: 'date-time' }
        }
      };
      
      const validObject = {
        dateTime: '2023-01-01T12:00:00Z'
      };
      
      const invalidObject = {
        dateTime: '2023-01-01 12:00:00'
      };
      
      expect(() => validator.validateModuleConfig('test', validObject, schema)).not.toThrow();
      expect(() => validator.validateModuleConfig('test', invalidObject, schema)).toThrow();
    });
    
    it('should validate email format', () => {
      const schema = {
        type: 'object',
        properties: {
          email: { type: 'string', format: 'email' }
        }
      };
      
      const validObject = {
        email: 'user@example.com'
      };
      
      const invalidObject = {
        email: 'not-an-email'
      };
      
      expect(() => validator.validateModuleConfig('test', validObject, schema)).not.toThrow();
      expect(() => validator.validateModuleConfig('test', invalidObject, schema)).toThrow();
    });
    
    it('should validate uri format', () => {
      const schema = {
        type: 'object',
        properties: {
          uri: { type: 'string', format: 'uri' }
        }
      };
      
      const validObject = {
        uri: 'https://example.com/path'
      };
      
      const invalidObject = {
        uri: 'not-a-uri'
      };
      
      expect(() => validator.validateModuleConfig('test', validObject, schema)).not.toThrow();
      expect(() => validator.validateModuleConfig('test', invalidObject, schema)).toThrow();
    });
  });
  
  describe('oneOf, anyOf, allOf validation', () => {
    it('should validate oneOf schema', () => {
      const schema = {
        type: 'object',
        properties: {
          value: {
            oneOf: [
              { type: 'string' },
              { type: 'number' }
            ]
          }
        }
      };
      
      expect(() => validator.validateModuleConfig('test', { value: 'string' }, schema)).not.toThrow();
      expect(() => validator.validateModuleConfig('test', { value: 42 }, schema)).not.toThrow();
      expect(() => validator.validateModuleConfig('test', { value: true }, schema)).toThrow();
    });
    
    it('should validate anyOf schema', () => {
      const schema = {
        type: 'object',
        properties: {
          value: {
            anyOf: [
              { type: 'string', minLength: 5 },
              { type: 'string', pattern: '^[A-Z]+$' }
            ]
          }
        }
      };
      
      expect(() => validator.validateModuleConfig('test', { value: 'longstring' }, schema)).not.toThrow();
      expect(() => validator.validateModuleConfig('test', { value: 'ABC' }, schema)).not.toThrow();
      expect(() => validator.validateModuleConfig('test', { value: 'ab' }, schema)).toThrow();
    });
    
    it('should validate allOf schema', () => {
      const schema = {
        type: 'object',
        properties: {
          value: {
            allOf: [
              { type: 'string' },
              { minLength: 3 },
              { maxLength: 10 }
            ]
          }
        }
      };
      
      expect(() => validator.validateModuleConfig('test', { value: 'valid' }, schema)).not.toThrow();
      expect(() => validator.validateModuleConfig('test', { value: 'ab' }, schema)).toThrow();
      expect(() => validator.validateModuleConfig('test', { value: 'toolongstring' }, schema)).toThrow();
    });
  });
});