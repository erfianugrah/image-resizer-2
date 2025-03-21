import { describe, it, expect } from 'vitest';
import { parseQueryOptions } from '../../src/utils/path';

describe('parseQueryOptions', () => {
  it('parses basic parameters correctly', () => {
    const params = new URLSearchParams('width=800&height=600&quality=85');
    const options = parseQueryOptions(params);
    
    expect(options.width).toBe(800);
    expect(options.height).toBe(600);
    expect(options.quality).toBe(85);
  });

  it('handles "auto" values correctly', () => {
    const params = new URLSearchParams('width=auto&height=auto&quality=auto');
    const options = parseQueryOptions(params);
    
    expect(options.width).toBe('auto');
    expect(options.height).toBe('auto');
    expect(options.quality).toBe('auto');
  });

  it('parses string parameters correctly', () => {
    const params = new URLSearchParams('fit=cover&format=webp&gravity=center');
    const options = parseQueryOptions(params);
    
    expect(options.fit).toBe('cover');
    expect(options.format).toBe('webp');
    expect(options.gravity).toBe('center');
  });

  it('parses boolean parameters correctly', () => {
    const params = new URLSearchParams('flip=true&flop=false&anim=true');
    const options = parseQueryOptions(params);
    
    expect(options.flip).toBe(true);
    expect(options.flop).toBe(false);
    expect(options.anim).toBe(true);
  });

  it('parses numeric parameters correctly', () => {
    const params = new URLSearchParams('blur=20&brightness=1.2&contrast=1.5&dpr=2');
    const options = parseQueryOptions(params);
    
    expect(options.blur).toBe(20);
    expect(options.brightness).toBe(1.2);
    expect(options.contrast).toBe(1.5);
    expect(options.dpr).toBe(2);
  });

  it('parses boolean or numeric parameters correctly', () => {
    const params = new URLSearchParams('trim=true&sharpen=1.5');
    const options = parseQueryOptions(params);
    
    expect(options.trim).toBe(true);
    expect(options.sharpen).toBe(1.5);
    
    const params2 = new URLSearchParams('trim=30&sharpen=false');
    const options2 = parseQueryOptions(params2);
    
    expect(options2.trim).toBe(30);
    expect(options2.sharpen).toBe(false);
  });

  it('parses draw parameter as JSON', () => {
    const drawObj = { url: 'https://example.com/logo.png', bottom: 10, right: 10 };
    const drawJson = JSON.stringify([drawObj]);
    const params = new URLSearchParams(`draw=${encodeURIComponent(drawJson)}`);
    const options = parseQueryOptions(params);
    
    expect(options.draw).toEqual([drawObj]);
  });

  it('handles draw parameter with single object (not array)', () => {
    const drawObj = { url: 'https://example.com/logo.png', bottom: 10, right: 10 };
    const drawJson = JSON.stringify(drawObj);
    const params = new URLSearchParams(`draw=${encodeURIComponent(drawJson)}`);
    const options = parseQueryOptions(params);
    
    expect(options.draw).toEqual([drawObj]);
  });

  it('skips draw parameter with invalid JSON', () => {
    const params = new URLSearchParams('draw=invalid-json');
    const options = parseQueryOptions(params);
    
    expect(options.draw).toBeUndefined();
  });

  it('combines multiple parameters correctly', () => {
    const params = new URLSearchParams('width=800&height=600&fit=cover&format=webp&quality=85&blur=20&flip=true');
    const options = parseQueryOptions(params);
    
    expect(options.width).toBe(800);
    expect(options.height).toBe(600);
    expect(options.fit).toBe('cover');
    expect(options.format).toBe('webp');
    expect(options.quality).toBe(85);
    expect(options.blur).toBe(20);
    expect(options.flip).toBe(true);
  });
});