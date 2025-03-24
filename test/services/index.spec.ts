/**
 * Index file for service tests
 * 
 * This file helps organize and group service tests for better test running
 */

import { describe, it, expect } from 'vitest';
import { createMockLogger } from '../mocks/logging';

// Verify test setup is working correctly
describe('Service Test Suite', () => {
  it('should be able to run tests', () => {
    expect(true).toBe(true);
  });
  
  it('should verify mock imports are working', () => {
    const logger = createMockLogger();
    
    expect(logger).toBeDefined();
    expect(typeof logger.debug).toBe('function');
    expect(typeof logger.error).toBe('function');
  });
});

// Import all service test files
import './configurationService.spec';
import './cacheService.spec';

// The tests will be run by Vitest automatically when imported