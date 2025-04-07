/**
 * This test file has been updated to use Zod schema validation instead of
 * the removed ConfigValueResolver class.
 * 
 * The original ConfigValueResolver functionality has been integrated
 * directly into our KV configuration system.
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';

describe('Zod Schema Validation', () => {
  // Test environment variables
  const testEnv = {
    API_KEY: 'test-api-key-123',
    DOMAIN: 'example.com',
    PORT: '8080',
    DEBUG: 'true'
  };
  
  // Create a test schema
  const TestSchema = z.object({
    name: z.string(),
    age: z.number().min(0),
    email: z.string().email().optional(),
    settings: z.object({
      enabled: z.boolean(),
      timeout: z.number()
    }).optional()
  });
  
  it('should validate a simple object successfully', () => {
    const validObject = {
      name: 'John Doe',
      age: 30,
      email: 'john@example.com',
      settings: {
        enabled: true,
        timeout: 5000
      }
    };
    
    const result = TestSchema.parse(validObject);
    
    expect(result).toEqual(validObject);
  });
  
  it('should throw error for invalid object', () => {
    const invalidObject = {
      name: 'John Doe',
      age: -5, // Invalid age (below minimum)
      email: 'not-an-email', // Invalid email format
      settings: {
        enabled: true,
        timeout: 5000
      }
    };
    
    const validateWrapper = () => {
      TestSchema.parse(invalidObject);
    };
    
    expect(validateWrapper).toThrow();
  });
  
  it('should throw error for missing required fields', () => {
    const invalidObject = {
      name: 'John Doe',
      // Missing age field
      email: 'john@example.com',
      settings: {
        enabled: true,
        timeout: 5000
      }
    };
    
    const validateWrapper = () => {
      TestSchema.parse(invalidObject);
    };
    
    expect(validateWrapper).toThrow();
  });
  
  it('should handle optional fields correctly', () => {
    const validObject = {
      name: 'John Doe',
      age: 30,
      // Missing email field
      // Missing settings field
    };
    
    const result = TestSchema.parse(validObject);
    
    expect(result).toEqual(validObject);
  });
});