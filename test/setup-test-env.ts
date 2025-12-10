/**
 * Test setup file that configures mocks for the test environment
 * This will be run before the tests to set up the testing environment
 */
import { vi } from 'vitest';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Resolve mocks explicitly for the worker/Vitest pool (no CommonJS require)
const loggingMockPath = path.resolve(__dirname, './mocks/logging.ts');
const optimizedLoggingMockPath = path.resolve(__dirname, './mocks/optimized-logging.ts');

vi.mock('../src/utils/logging', async () => {
  return await import(loggingMockPath);
});

vi.mock('../src/utils/optimized-logging', async () => {
  return await import(optimizedLoggingMockPath);
});

// This sets up the test environment for all tests
console.log('Setting up test environment...');
