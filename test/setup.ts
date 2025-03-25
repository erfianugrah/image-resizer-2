/**
 * Vitest setup file
 * 
 * This file is automatically loaded by Vitest before running tests
 * and provides global setup and configuration.
 */

// Configure mocks for Node.js and browser APIs
import { vi, afterAll } from 'vitest';

// Mock console methods
vi.stubGlobal('console', {
  ...console,
  log: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  info: vi.fn()
});

// Mock Date.now
const originalDateNow = Date.now;
vi.stubGlobal('Date', {
  ...Date,
  now: vi.fn(() => 1647248400000) // Fixed timestamp for consistent tests
});

// Restore original methods after all tests
afterAll(() => {
  Date.now = originalDateNow;
});