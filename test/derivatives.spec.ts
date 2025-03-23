import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseImagePath, extractDerivative } from '../src/utils/path';
import { ImageResizerConfig, defaultConfig } from '../src/config';

describe('Derivative Path Handling', () => {
  // Define test derivatives directly in the test
  const testDerivatives = [
    'thumbnail',
    'avatar',
    'banner',
    'product',
    'header'
  ];

  it('should extract derivative and modified path for banner/image.jpg', () => {
    const pathname = '/banner/Granna_1.JPG';
    
    // Make sure 'banner' is in the derivatives list
    expect(testDerivatives).toContain('banner');
    
    // Test extractDerivative function
    const result = extractDerivative(pathname, testDerivatives);
    
    // This should find 'banner' as the derivative and provide the modified path
    expect(result).not.toBeNull();
    expect(result?.derivative).toBe('banner');
    expect(result?.modifiedPath).toBe('/Granna_1.JPG');
  });
  
  it('should handle paths with derivatives at any level and return correct modified paths', () => {
    const testPaths = [
      { path: '/banner/image.jpg', expected: '/image.jpg' },
      { path: '/images/banner/image.jpg', expected: '/images/image.jpg' },
      { path: '/category/banner/image.jpg', expected: '/category/image.jpg' }
    ];
    
    for (const { path, expected } of testPaths) {
      const result = extractDerivative(path, testDerivatives);
      expect(result).not.toBeNull();
      expect(result?.derivative).toBe('banner');
      expect(result?.modifiedPath).toBe(expected);
    }
  });
});