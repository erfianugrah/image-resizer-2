/**
 * Cloudflare Options Builder
 * 
 * Builds the Cloudflare fetch options with image transformation parameters
 */

import { Logger } from '../utils/logging';
import { defaultLogger } from '../utils/logging';

/**
 * Options for the builder
 */
export interface BuilderOptions {
  cacheOptions?: {
    cacheEverything?: boolean;
    cacheTtl?: number;
  };
  polishOptions?: {
    disablePolish?: boolean;
    disableMirage?: boolean;
  };
}

/**
 * Builder for Cloudflare fetch options
 */
export class CloudflareOptionsBuilder {
  private logger: Logger;
  
  constructor(logger?: Logger) {
    this.logger = logger || defaultLogger;
  }
  
  /**
   * Build Cloudflare fetch options from normalized parameters
   */
  buildFetchOptions(
    normalizedParams: Record<string, unknown>,
    options: BuilderOptions = {}
  ): RequestInit {
    this.logger.breadcrumb('Building Cloudflare fetch options', undefined, {
      paramCount: Object.keys(normalizedParams).length
    });
    
    // Start with base options
    const fetchOptions: RequestInit = {
      method: 'GET',
      cf: {
        // Disable features that could interfere with Image Resizing
        polish: options.polishOptions?.disablePolish === false ? undefined : 'off',
        mirage: options.polishOptions?.disableMirage === false,
        // Add image transform options
        image: this.buildImageOptions(normalizedParams)
      } as any
    };
    
    // Add caching options if provided
    if (options.cacheOptions) {
      (fetchOptions.cf as any).cacheEverything = options.cacheOptions.cacheEverything;
      
      if (options.cacheOptions.cacheTtl) {
        (fetchOptions.cf as any).cacheTtl = options.cacheOptions.cacheTtl;
      }
    }
    
    return fetchOptions;
  }
  
  /**
   * Build the cf.image object from normalized parameters
   */
  private buildImageOptions(params: Record<string, unknown>): Record<string, unknown> {
    const imageOptions: Record<string, unknown> = {};
    
    // Copy all the parameters to the image options
    Object.entries(params).forEach(([key, value]) => {
      // Skip internal options that start with _
      if (!key.startsWith('_')) {
        // Apply any constraints or validations for specific parameters
        switch (key) {
        case 'blur':
          // Ensure blur is within 1-250 range
          if (typeof value === 'number') {
            imageOptions[key] = Math.max(1, Math.min(250, value));
          } else {
            imageOptions[key] = value;
          }
          break;
            
        case 'rotate':
          // Ensure rotate is 0, 90, 180, or 270
          if (typeof value === 'number') {
            const normalizedRotate = Math.round(value / 90) * 90 % 360;
            imageOptions[key] = normalizedRotate;
          } else {
            imageOptions[key] = value;
          }
          break;
            
        case 'format':
          // Ensure format is supported
          if (typeof value === 'string' && 
                ['avif', 'webp', 'json', 'jpeg', 'png', 'gif', 'auto'].includes(value)) {
            imageOptions[key] = value;
          } else {
            imageOptions[key] = 'auto';
          }
          break;
            
        default:
          // Copy other parameters as-is
          imageOptions[key] = value;
        }
      }
    });
    
    return imageOptions;
  }
}