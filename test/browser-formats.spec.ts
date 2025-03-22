/**
 * Tests for browser-formats utility
 */

import { describe, it, expect } from 'vitest';
import { isFormatSupported, normalizeBrowserName } from '../src/utils/browser-formats';

describe('Browser Format Support', () => {
  describe('isFormatSupported', () => {
    it('correctly identifies WebP support for Chrome versions', () => {
      expect(isFormatSupported('webp', 'chrome', '8.0')).toBe(false);
      expect(isFormatSupported('webp', 'chrome', '9.0')).toBe(true);
      expect(isFormatSupported('webp', 'chrome', '96.0')).toBe(true);
    });
    
    it('correctly identifies AVIF support for Chrome versions', () => {
      expect(isFormatSupported('avif', 'chrome', '84.0')).toBe(false);
      expect(isFormatSupported('avif', 'chrome', '85.0')).toBe(true);
      expect(isFormatSupported('avif', 'chrome', '96.0')).toBe(true);
    });
    
    it('correctly identifies WebP support for Firefox versions', () => {
      expect(isFormatSupported('webp', 'firefox', '64.0')).toBe(false);
      expect(isFormatSupported('webp', 'firefox', '65.0')).toBe(true);
      expect(isFormatSupported('webp', 'firefox', '100.0')).toBe(true);
    });
    
    it('correctly identifies AVIF support for Firefox versions', () => {
      expect(isFormatSupported('avif', 'firefox', '92.0')).toBe(false);
      expect(isFormatSupported('avif', 'firefox', '93.0')).toBe(true);
      expect(isFormatSupported('avif', 'firefox', '100.0')).toBe(true);
    });
    
    it('correctly identifies Safari support for image formats', () => {
      expect(isFormatSupported('webp', 'safari', '13.1')).toBe(false);
      expect(isFormatSupported('webp', 'safari', '14.0')).toBe(true);
      expect(isFormatSupported('avif', 'safari', '16.0')).toBe(false);
      expect(isFormatSupported('avif', 'safari', '16.1')).toBe(true);
    });
    
    it('handles mobile browser versions correctly', () => {
      expect(isFormatSupported('webp', 'ios_saf', '13.7')).toBe(false);
      expect(isFormatSupported('webp', 'ios_saf', '14.0')).toBe(true);
      expect(isFormatSupported('webp', 'and_chr', '133.0')).toBe(true);
      expect(isFormatSupported('avif', 'and_chr', '132.0')).toBe(false);
      expect(isFormatSupported('avif', 'and_chr', '133.0')).toBe(true);
    });
    
    it('handles invalid inputs gracefully', () => {
      expect(isFormatSupported('webp', 'unknown', '1.0')).toBe(false);
      expect(isFormatSupported('avif', 'chrome', 'invalid')).toBe(false);
    });
  });
  
  describe('normalizeBrowserName', () => {
    it('correctly normalizes browser names', () => {
      expect(normalizeBrowserName('chrome')).toBe('chrome');
      expect(normalizeBrowserName('Chrome')).toBe('chrome');
      expect(normalizeBrowserName('CHROME')).toBe('chrome');
      expect(normalizeBrowserName('firefox')).toBe('firefox');
      expect(normalizeBrowserName('edge_chromium')).toBe('edge_chromium');
      expect(normalizeBrowserName('ios_saf')).toBe('ios_saf');
    });
    
    it('handles unknown browser names', () => {
      expect(normalizeBrowserName('unknown')).toBe('unknown');
    });
  });
});