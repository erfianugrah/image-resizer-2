/**
 * Test setup file that configures mocks for the test environment
 * This will be run before the tests to set up the testing environment
 */
import { vi } from 'vitest';

// Mock the logging modules
vi.mock('../src/utils/logging', () => {
  return require('./mocks/logging');
});

vi.mock('../src/utils/optimized-logging', () => {
  return require('./mocks/optimized-logging');
});

// This sets up the test environment for all tests
console.log('Setting up test environment...');