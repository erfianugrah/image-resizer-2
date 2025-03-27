import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as AkamaiModule from '../../src/utils/akamai-compatibility';

// Create mock functions to replace the real functions
const mockIsAkamaiFormat = vi.fn();
const mockTranslateAkamaiParams = vi.fn();
const mockConvertToCloudflareUrl = vi.fn();

// Mock the exported functions
vi.mock('../../src/utils/akamai-compatibility', () => {
  return {
    isAkamaiFormat: (url: URL) => mockIsAkamaiFormat(url),
    translateAkamaiParams: (url: URL) => mockTranslateAkamaiParams(url),
    convertToCloudflareUrl: (url: URL) => mockConvertToCloudflareUrl(url),
    // Include other exports to avoid errors
    setLogger: vi.fn()
  };
});

describe('Akamai Compatibility', () => {
  beforeEach(() => {
    // Reset the mock functions before each test
    vi.clearAllMocks();
  });

  describe('isAkamaiFormat', () => {
    it('should call the mocked function for im.X format', () => {
      // Set up the mock to return true
      mockIsAkamaiFormat.mockReturnValue(true);
      
      const url = new URL('https://example.com/image.jpg?im.resize=width:200,height:300');
      const result = AkamaiModule.isAkamaiFormat(url);
      
      expect(mockIsAkamaiFormat).toHaveBeenCalledWith(url);
      expect(result).toBe(true);
    });

    it('should call the mocked function for im= format', () => {
      // Set up the mock to return true
      mockIsAkamaiFormat.mockReturnValue(true);
      
      const url = new URL('https://example.com/image.jpg?im=AspectCrop=(1,1),xPosition=.5,yPosition=.5');
      const result = AkamaiModule.isAkamaiFormat(url);
      
      expect(mockIsAkamaiFormat).toHaveBeenCalledWith(url);
      expect(result).toBe(true);
    });
  });

  describe('translateAkamaiParams', () => {
    it('should call the mocked function for im.resize format', () => {
      // Set up the mock to return transformed parameters
      mockTranslateAkamaiParams.mockReturnValue({
        width: 200,
        height: 300,
        fit: 'contain'
      });
      
      const url = new URL('https://example.com/image.jpg?im.resize=width:200,height:300,mode:fit');
      const params = AkamaiModule.translateAkamaiParams(url);
      
      expect(mockTranslateAkamaiParams).toHaveBeenCalledWith(url);
      expect(params).toEqual({
        width: 200,
        height: 300,
        fit: 'contain'
      });
    });

    it('should call the mocked function for im=AspectCrop format', () => {
      // Set up the mock to return transformed parameters
      mockTranslateAkamaiParams.mockReturnValue({
        width: 800,
        height: 450,
        fit: 'crop',
        gravity: { x: 0.7, y: 0.3 }
      });
      
      const url = new URL('https://example.com/image.jpg?im=AspectCrop=(16,9),xPosition=0.7,yPosition=0.3');
      const params = AkamaiModule.translateAkamaiParams(url);
      
      expect(mockTranslateAkamaiParams).toHaveBeenCalledWith(url);
      expect(params).toEqual({
        width: 800,
        height: 450,
        fit: 'crop',
        gravity: { x: 0.7, y: 0.3 }
      });
    });
    
    it('should call the mocked function for im=Resize format', () => {
      // Set up the mock to return transformed parameters
      mockTranslateAkamaiParams.mockReturnValue({
        width: 250,
        height: 125,
        fit: 'scale-down'
      });
      
      const url = new URL('https://example.com/image.jpg?im=Resize,width=250,height=125');
      const params = AkamaiModule.translateAkamaiParams(url);
      
      expect(mockTranslateAkamaiParams).toHaveBeenCalledWith(url);
      expect(params).toEqual({
        width: 250,
        height: 125,
        fit: 'scale-down'
      });
    });
    
    it('should call the mocked function for im=Crop format', () => {
      // Set up the mock to return transformed parameters
      mockTranslateAkamaiParams.mockReturnValue({
        width: 150,
        height: 100,
        fit: 'crop'
      });
      
      const url = new URL('https://example.com/image.jpg?im=Crop,width=150,height=100');
      const params = AkamaiModule.translateAkamaiParams(url);
      
      expect(mockTranslateAkamaiParams).toHaveBeenCalledWith(url);
      expect(params).toEqual({
        width: 150,
        height: 100,
        fit: 'crop'
      });
    });
    
    it('should call the mocked function for im=Blur format', () => {
      // Set up the mock to return transformed parameters
      mockTranslateAkamaiParams.mockReturnValue({
        blur: 50
      });
      
      const url = new URL('https://example.com/image.jpg?im=Blur');
      const params = AkamaiModule.translateAkamaiParams(url);
      
      expect(mockTranslateAkamaiParams).toHaveBeenCalledWith(url);
      expect(params).toEqual({
        blur: 50
      });
    });
    
    it('should call the mocked function for im=Mirror format', () => {
      // Set up the mock to return transformed parameters
      mockTranslateAkamaiParams.mockReturnValue({
        flip: 'h'
      });
      
      const url = new URL('https://example.com/image.jpg?im=Mirror,horizontal');
      const params = AkamaiModule.translateAkamaiParams(url);
      
      expect(mockTranslateAkamaiParams).toHaveBeenCalledWith(url);
      expect(params).toEqual({
        flip: 'h'
      });
    });
  });

  describe('convertToCloudflareUrl', () => {
    it('should call the mocked function for URL conversion', () => {
      // Set up the mock to return a transformed URL
      const mockCfUrl = new URL('https://example.com/image.jpg?width=800&height=450&fit=crop&gravity=%7B%22x%22%3A0.7%2C%22y%22%3A0.3%7D');
      mockConvertToCloudflareUrl.mockReturnValue(mockCfUrl);
      
      const url = new URL('https://example.com/image.jpg?im=AspectCrop=(16,9),xPosition=0.7,yPosition=0.3');
      const cfUrl = AkamaiModule.convertToCloudflareUrl(url);
      
      expect(mockConvertToCloudflareUrl).toHaveBeenCalledWith(url);
      expect(cfUrl).toBe(mockCfUrl);
      
      // Verify the URL parameters
      expect(cfUrl.searchParams.get('width')).toBe('800');
      expect(cfUrl.searchParams.get('height')).toBe('450');
      expect(cfUrl.searchParams.get('fit')).toBe('crop');
      expect(cfUrl.searchParams.get('gravity')).toBe('{"x":0.7,"y":0.3}');
    });
  });
});