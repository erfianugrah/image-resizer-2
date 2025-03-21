import { describe, it, expect } from 'vitest';
import { parseQueryOptions } from '../src/utils/path';

describe('parseQueryOptions', () => {
  it('should parse string parameters correctly', () => {
    const searchParams = new URLSearchParams('format=webp&fit=cover');
    const options = parseQueryOptions(searchParams);
    
    expect(options.format).toBe('webp');
    expect(options.fit).toBe('cover');
  });
  
  it('should parse numeric parameters correctly', () => {
    const searchParams = new URLSearchParams('width=500&height=300&quality=85');
    const options = parseQueryOptions(searchParams);
    
    expect(options.width).toBe(500);
    expect(options.height).toBe(300);
    expect(options.quality).toBe(85);
  });
  
  it('should parse boolean parameters correctly', () => {
    const searchParams = new URLSearchParams('anim=true&strip=false');
    const options = parseQueryOptions(searchParams);
    
    expect(options.anim).toBe(true);
    expect(options.strip).toBe(false);
  });
  
  it('should handle flip parameter as a string with valid values', () => {
    const searchParams = new URLSearchParams('flip=horizontal');
    const options = parseQueryOptions(searchParams);
    
    expect(options.flip).toBe('horizontal');
  });
  
  it('should handle flip parameter with h/v/hv values', () => {
    let searchParams = new URLSearchParams('flip=h');
    let options = parseQueryOptions(searchParams);
    expect(options.flip).toBe('h');
    
    searchParams = new URLSearchParams('flip=v');
    options = parseQueryOptions(searchParams);
    expect(options.flip).toBe('v');
    
    searchParams = new URLSearchParams('flip=hv');
    options = parseQueryOptions(searchParams);
    expect(options.flip).toBe('hv');
  });
  
  it('should convert invalid flip values to h (horizontal)', () => {
    const searchParams = new URLSearchParams('flip=invalid');
    const options = parseQueryOptions(searchParams);
    
    expect(options.flip).toBe('h');
  });
  
  it('should handle boolean values for flip parameter', () => {
    const searchParams = new URLSearchParams('flip=true');
    const options = parseQueryOptions(searchParams);
    
    expect(options.flip).toBe(true);
  });
  
  it('should parse multiple parameters together', () => {
    const searchParams = new URLSearchParams('width=500&height=300&format=webp&quality=85&flip=horizontal');
    const options = parseQueryOptions(searchParams);
    
    expect(options.width).toBe(500);
    expect(options.height).toBe(300);
    expect(options.format).toBe('webp');
    expect(options.quality).toBe(85);
    expect(options.flip).toBe('horizontal');
  });
});