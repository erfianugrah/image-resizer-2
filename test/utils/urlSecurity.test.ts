import { describe, it, expect } from 'vitest';
import { validateUrl, validateOverlayUrl, isPrivateHostname } from '../../src/utils/urlSecurity';

describe('urlSecurity', () => {
  describe('validateUrl', () => {
    it('should accept valid HTTP URLs', () => {
      const result = validateUrl('http://example.com/image.png');
      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should accept valid HTTPS URLs', () => {
      const result = validateUrl('https://cdn.example.com/images/photo.jpg');
      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should reject file:// protocol', () => {
      const result = validateUrl('file:///etc/passwd');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Protocol');
    });

    it('should reject ftp:// protocol', () => {
      const result = validateUrl('ftp://example.com/file.jpg');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Protocol');
    });

    it('should reject data:// protocol', () => {
      const result = validateUrl('data:text/plain,hello');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Protocol');
    });

    it('should reject localhost', () => {
      const result = validateUrl('http://localhost/api');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Loopback');
    });

    it('should reject 127.0.0.1', () => {
      const result = validateUrl('http://127.0.0.1/api');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Loopback');
    });

    it('should reject AWS metadata endpoint', () => {
      const result = validateUrl('http://169.254.169.254/latest/meta-data/');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Cloud metadata');
    });

    it('should reject private IP 10.x.x.x', () => {
      const result = validateUrl('http://10.0.0.1/api');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Private IP');
    });

    it('should reject private IP 172.16.x.x', () => {
      const result = validateUrl('http://172.16.0.1/api');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Private IP');
    });

    it('should reject private IP 192.168.x.x', () => {
      const result = validateUrl('http://192.168.1.1/api');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Private IP');
    });

    it('should reject link-local 169.254.x.x', () => {
      const result = validateUrl('http://169.254.1.1/api');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Private IP');
    });

    it('should reject invalid URL format', () => {
      const result = validateUrl('not-a-url');
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('Invalid URL');
    });

    it('should reject URLs exceeding max length', () => {
      const longUrl = 'http://example.com/' + 'a'.repeat(3000);
      const result = validateUrl(longUrl, { maxLength: 2048 });
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('maximum length');
    });

    it('should respect allowed domains whitelist', () => {
      const result = validateUrl('http://example.com/image.png', {
        allowedDomains: ['cdn.mysite.com', 'images.mysite.com']
      });
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('not in the allowed list');
    });

    it('should allow URLs in allowed domains', () => {
      const result = validateUrl('http://cdn.mysite.com/image.png', {
        allowedDomains: ['cdn.mysite.com', 'images.mysite.com']
      });
      expect(result.isValid).toBe(true);
    });

    it('should respect blocked domains', () => {
      const result = validateUrl('http://evil.com/malware.exe', {
        blockedDomains: ['evil.com', 'malicious.org']
      });
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('blocked');
    });

    it('should allow private networks when opted in', () => {
      const result = validateUrl('http://192.168.1.1/api', {
        allowPrivateNetworks: true
      });
      expect(result.isValid).toBe(true);
    });

    it('should allow loopback when opted in', () => {
      const result = validateUrl('http://localhost/api', {
        allowLoopback: true
      });
      expect(result.isValid).toBe(true);
    });

    it('should return sanitized URL', () => {
      const result = validateUrl('https://example.com/path/../image.png');
      expect(result.isValid).toBe(true);
      expect(result.sanitizedUrl).toBe('https://example.com/image.png');
    });
  });

  describe('validateOverlayUrl', () => {
    it('should accept valid overlay URLs', () => {
      const result = validateOverlayUrl('https://cdn.example.com/watermark.png');
      expect(result.isValid).toBe(true);
    });

    it('should reject SSRF attempts', () => {
      const ssrfUrls = [
        'http://127.0.0.1/admin',
        'http://localhost/api',
        'http://169.254.169.254/latest/meta-data/',
        'http://10.0.0.1/internal',
        'file:///etc/passwd',
        'http://metadata.google.internal/'
      ];

      ssrfUrls.forEach(url => {
        const result = validateOverlayUrl(url);
        expect(result.isValid).toBe(false);
        expect(result.error).toBeDefined();
      });
    });

    it('should reject URLs with private IPs', () => {
      const privateUrls = [
        'http://192.168.1.100/image.png',
        'http://172.16.0.50/logo.png',
        'http://10.1.1.1/watermark.png'
      ];

      privateUrls.forEach(url => {
        const result = validateOverlayUrl(url);
        expect(result.isValid).toBe(false);
      });
    });
  });

  describe('isPrivateHostname', () => {
    it('should detect localhost', () => {
      expect(isPrivateHostname('localhost')).toBe(true);
      expect(isPrivateHostname('127.0.0.1')).toBe(true);
      expect(isPrivateHostname('::1')).toBe(true);
    });

    it('should detect cloud metadata endpoints', () => {
      expect(isPrivateHostname('169.254.169.254')).toBe(true);
      expect(isPrivateHostname('metadata.google.internal')).toBe(true);
      expect(isPrivateHostname('metadata')).toBe(true);
    });

    it('should detect private IP ranges', () => {
      expect(isPrivateHostname('192.168.1.1')).toBe(true);
      expect(isPrivateHostname('10.0.0.1')).toBe(true);
      expect(isPrivateHostname('172.16.0.1')).toBe(true);
      expect(isPrivateHostname('169.254.1.1')).toBe(true);
    });

    it('should detect internal domain suffixes', () => {
      expect(isPrivateHostname('server.internal')).toBe(true);
      expect(isPrivateHostname('host.local')).toBe(true);
      expect(isPrivateHostname('device.lan')).toBe(true);
      expect(isPrivateHostname('app.corp')).toBe(true);
    });

    it('should not flag public hostnames', () => {
      expect(isPrivateHostname('example.com')).toBe(false);
      expect(isPrivateHostname('cdn.cloudflare.com')).toBe(false);
      expect(isPrivateHostname('8.8.8.8')).toBe(false);
    });
  });
});
