// Test setup file
import { vi } from 'vitest';

// Mock global objects not available in the test environment
globalThis.ExecutionContext = class ExecutionContext {
  waitUntil(promise: Promise<any>) {
    return promise;
  }
};

// Mock cache API if not available
if (!globalThis.caches) {
  globalThis.caches = {
    default: {
      match: vi.fn().mockResolvedValue(null),
      put: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(false)
    },
    open: vi.fn().mockResolvedValue({
      match: vi.fn().mockResolvedValue(null),
      put: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(false)
    })
  };
}

// Mock process.env for Node.js environment
if (!globalThis.process) {
  globalThis.process = {
    env: {
      NODE_ENV: 'test'
    }
  } as any;
}

console.log('Setting up test environment...');