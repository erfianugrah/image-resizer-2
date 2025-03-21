import { describe, it, expect, vi, beforeEach } from 'vitest';
import { translateAkamaiParams } from '../src/utils/akamai-compatibility';

// Mock the logger module
vi.mock('../src/utils/logging', () => ({
  defaultLogger: {
    debug: vi.fn(),
    breadcrumb: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  },
  Logger: vi.fn()
}));

// Import the mocked module after mocking
import { defaultLogger } from '../src/utils/logging';
const mockLogger = defaultLogger;

describe('Akamai Mirror Parameter (Flip)', () => {
  // Reset mocks before each test
  beforeEach(() => {
    vi.clearAllMocks();
  });
  
  it('should translate mirror=horizontal to flip=h correctly', () => {
    const url = new URL('https://example.com/image.jpg?im.mirror=horizontal');
    const config = { features: { enableAkamaiAdvancedFeatures: true } };
    
    const result = translateAkamaiParams(url, config);
    
    expect(result.flip).toBe('h');
  });
  
  it('should translate mirror=vertical to flip=v correctly', () => {
    const url = new URL('https://example.com/image.jpg?im.mirror=vertical');
    const config = { features: { enableAkamaiAdvancedFeatures: true } };
    
    const result = translateAkamaiParams(url, config);
    
    expect(result.flip).toBe('v');
  });
  
  it('should translate mirror=both to flip=hv correctly', () => {
    const url = new URL('https://example.com/image.jpg?im.mirror=both');
    const config = { features: { enableAkamaiAdvancedFeatures: true } };
    
    const result = translateAkamaiParams(url, config);
    
    expect(result.flip).toBe('hv');
  });
  
  it('should not translate mirror parameter when advanced features are disabled', () => {
    const url = new URL('https://example.com/image.jpg?im.mirror=horizontal');
    const config = { features: { enableAkamaiAdvancedFeatures: false } };
    
    const result = translateAkamaiParams(url, config);
    
    expect(result.flip).toBeUndefined();
    expect(mockLogger.debug).toHaveBeenCalledWith(
      expect.stringContaining('Skipping mirror effect because advanced features are disabled'),
      expect.any(Object)
    );
  });
  
  it('should handle shorthand values h/v/hv correctly', () => {
    const testCases = [
      { input: 'h', expected: 'h' },
      { input: 'v', expected: 'v' },
      { input: 'hv', expected: 'hv' },
      { input: 'vh', expected: 'hv' }
    ];
    
    const config = { features: { enableAkamaiAdvancedFeatures: true } };
    
    for (const test of testCases) {
      const url = new URL(`https://example.com/image.jpg?im.mirror=${test.input}`);
      const result = translateAkamaiParams(url, config);
      expect(result.flip).toBe(test.expected);
    }
  });
  
  it('should work correctly with other parameters', () => {
    const url = new URL('https://example.com/image.jpg?im.mirror=horizontal&im.resize=width:500,height:300&im.format=webp');
    const config = { features: { enableAkamaiAdvancedFeatures: true } };
    
    const result = translateAkamaiParams(url, config);
    
    expect(result.flip).toBe('h');
    expect(result.width).toBe(500);
    expect(result.height).toBe(300);
    expect(result.format).toBe('webp');
  });
});