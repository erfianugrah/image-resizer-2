/**
 * Test setup file to configure vitest
 */
import { vi } from 'vitest';

// Mock imports that are causing issues
vi.mock('../src/utils/logging', () => {
  return import('./mocks/logging');
});

// Mock aws4fetch if needed (used in auth.ts)
vi.mock('aws4fetch', () => {
  return {
    AwsClient: class MockAwsClient {
      constructor() {}
      async sign(request: Request) {
        // Return a request with mock AWS headers
        const headers = new Headers(request.headers);
        headers.set('x-amz-test', 'test-value');
        headers.set('authorization', 'AWS4-HMAC-SHA256 test');
        
        return new Request(request.url, {
          method: request.method,
          headers: headers
        });
      }
    }
  };
});