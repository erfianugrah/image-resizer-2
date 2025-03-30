/**
 * Tests for ConfigValueResolver
 */

import { describe, it, expect, vi } from 'vitest';
import { ConfigValueResolver } from '../../../src/services/config/configValueResolver';

describe('ConfigValueResolver', () => {
  // Mock Logger
  const mockLogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  };
  
  // Test environment variables
  const testEnv = {
    API_KEY: 'test-api-key-123',
    DOMAIN: 'example.com',
    PORT: '8080',
    DEBUG: 'true'
  };
  
  it('should resolve a string value with environment variables', () => {
    const resolver = new ConfigValueResolver(testEnv, mockLogger);
    const result = resolver.resolveValue('Connect to ${DOMAIN}:${PORT}');
    
    expect(result).toBe('Connect to example.com:8080');
  });
  
  it('should handle mixed content with environment variables', () => {
    const resolver = new ConfigValueResolver(testEnv, mockLogger);
    const result = resolver.resolveValue('API Key: ${API_KEY}, Debug: ${DEBUG}');
    
    expect(result).toBe('API Key: test-api-key-123, Debug: true');
  });
  
  it('should handle non-string values', () => {
    const resolver = new ConfigValueResolver(testEnv, mockLogger);
    const number = resolver.resolveValue(42);
    const boolean = resolver.resolveValue(true);
    const nullValue = resolver.resolveValue(null);
    
    expect(number).toBe(42);
    expect(boolean).toBe(true);
    expect(nullValue).toBe(null);
  });
  
  it('should recursively process objects', () => {
    const resolver = new ConfigValueResolver(testEnv, mockLogger);
    const input = {
      url: 'https://${DOMAIN}:${PORT}/api',
      auth: {
        key: '${API_KEY}',
        enabled: '${DEBUG}'
      },
      timeout: 5000
    };
    
    const result = resolver.resolveValue(input);
    
    expect(result).toEqual({
      url: 'https://example.com:8080/api',
      auth: {
        key: 'test-api-key-123',
        enabled: 'true'
      },
      timeout: 5000
    });
  });
  
  it('should recursively process arrays', () => {
    const resolver = new ConfigValueResolver(testEnv, mockLogger);
    const input = [
      'https://${DOMAIN}',
      { key: '${API_KEY}' },
      42,
      ['nested-${PORT}']
    ];
    
    const result = resolver.resolveValue(input);
    
    expect(result).toEqual([
      'https://example.com',
      { key: 'test-api-key-123' },
      42,
      ['nested-8080']
    ]);
  });
  
  it('should handle missing environment variables', () => {
    const resolver = new ConfigValueResolver(testEnv, mockLogger);
    const result = resolver.resolveValue('Missing: ${MISSING_VAR}');
    
    expect(result).toBe('Missing: [ENV:MISSING_VAR]');
    expect(mockLogger.warn).toHaveBeenCalledWith(
      'Environment variable not found: MISSING_VAR'
    );
  });
  
  it('should handle null environment', () => {
    const resolver = new ConfigValueResolver(undefined, mockLogger);
    const result = resolver.resolveValue('Value: ${ANY_VAR}');
    
    expect(result).toBe('Value: [ENV:ANY_VAR]');
    expect(mockLogger.warn).toHaveBeenCalledWith(
      'No environment provided for resolving ANY_VAR'
    );
  });
  
  it('should not modify values without environment variables', () => {
    const resolver = new ConfigValueResolver(testEnv, mockLogger);
    const result = resolver.resolveValue('Plain string without variables');
    
    expect(result).toBe('Plain string without variables');
  });
});