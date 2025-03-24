/**
 * Mock detector utility for tests
 */
import { vi } from 'vitest';
import { ClientInfo } from '../../src/services/interfaces';

/**
 * Mock implementation of detectClient function
 */
export const detectClient = vi.fn().mockImplementation(async (request: Request): Promise<ClientInfo> => {
  // Return client info based on request headers
  const userAgent = request.headers.get('User-Agent') || '';
  const acceptHeader = request.headers.get('Accept') || '';
  const isMobile = request.headers.get('Sec-CH-UA-Mobile') === '?1' ||
                  userAgent.includes('Mobile') || 
                  userAgent.includes('Android');
  const isTablet = userAgent.includes('iPad') || 
                  (userAgent.includes('Android') && !userAgent.includes('Mobile'));
  
  const acceptsWebp = acceptHeader.includes('image/webp');
  const acceptsAvif = acceptHeader.includes('image/avif');
  const saveData = request.headers.get('Save-Data') === 'on';
  const viewportWidth = parseInt(request.headers.get('Sec-CH-Viewport-Width') || 
                               request.headers.get('Viewport-Width') || 
                               '1024', 10);
  const devicePixelRatio = parseFloat(request.headers.get('Sec-CH-DPR') || 
                                    request.headers.get('DPR') || 
                                    '1');
  
  let deviceType: 'mobile' | 'tablet' | 'desktop' | 'unknown' = 'unknown';
  if (isMobile) {
    deviceType = 'mobile';
  } else if (isTablet) {
    deviceType = 'tablet';
  } else {
    deviceType = 'desktop';
  }
  
  return {
    deviceType,
    viewportWidth,
    devicePixelRatio,
    saveData,
    acceptsWebp,
    acceptsAvif
  };
});

/**
 * Mock implementation of setConfig function
 */
export const setConfig = vi.fn();

// Mock additional detector utilities as needed
export const getDeviceScore = vi.fn().mockReturnValue(50);
export const getNetworkCondition = vi.fn().mockReturnValue('fast');
export const getClientHashKey = vi.fn().mockReturnValue('test-hash-key');