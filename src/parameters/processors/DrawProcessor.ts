/**
 * Draw Processor
 * 
 * Handles the complex 'draw' parameter for watermarks and overlays
 */

import { TransformParameter } from '../../utils/path';
import { Logger } from '../../utils/logging';
import { parameterRegistry } from '../registry';

/**
 * Overlay configuration for the 'draw' parameter
 */
export interface DrawOverlay {
  url: string;
  width?: number;
  height?: number;
  fit?: string;
  gravity?: string | { x: number; y: number };
  opacity?: number;
  repeat?: boolean | 'x' | 'y';
  top?: number;
  left?: number;
  bottom?: number;
  right?: number;
  background?: string;
  rotate?: number;
}

/**
 * Processor for the 'draw' parameter
 */
export class DrawProcessor {
  private logger: Logger;
  
  constructor(logger?: Logger) {
    this.logger = logger || { 
      debug: () => {}, 
      breadcrumb: () => {},
      info: () => {},
      warn: () => {},
      error: () => {},
      setLevel: () => {},
      getLevel: () => 'INFO'
    } as Logger;
  }
  
  /**
   * Check if this parameter is a draw parameter
   */
  canProcess(parameter: TransformParameter): boolean {
    return parameter.name === 'draw';
  }
  
  /**
   * Process a draw parameter
   * 
   * @param parameter The draw parameter
   * @param result The result object to update
   */
  process(parameter: TransformParameter, result: Record<string, unknown>): void {
    try {
      let drawValue: any;
      
      // If the value is already parsed (e.g., from StandardParser)
      if (Array.isArray(parameter.value)) {
        drawValue = parameter.value;
      } 
      // If the value is a string, try to parse it as JSON
      else if (typeof parameter.value === 'string') {
        drawValue = JSON.parse(parameter.value);
      } else {
        // Invalid format
        this.logger.debug('Invalid draw parameter format', {
          value: parameter.value
        });
        return;
      }
      
      // Ensure it's an array
      const drawArray = Array.isArray(drawValue) ? drawValue : [drawValue];
      
      // Validate each overlay
      const validatedOverlays = drawArray
        .filter(overlay => this.validateOverlay(overlay))
        .map(overlay => this.normalizeOverlay(overlay));
      
      if (validatedOverlays.length > 0) {
        result.draw = validatedOverlays;
        this.logger.debug('Processed draw parameter', {
          overlayCount: validatedOverlays.length
        });
      }
    } catch (error) {
      this.logger.debug('Error processing draw parameter', {
        error: (error as Error).message
      });
    }
  }
  
  /**
   * Validate an overlay configuration
   */
  private validateOverlay(overlay: any): boolean {
    // Url is required
    if (!overlay || typeof overlay !== 'object' || !overlay.url) {
      return false;
    }
    
    // Basic validation for conflicting positions
    if (overlay.top !== undefined && overlay.bottom !== undefined) {
      return false;
    }
    
    if (overlay.left !== undefined && overlay.right !== undefined) {
      return false;
    }
    
    return true;
  }
  
  /**
   * Normalize an overlay configuration
   */
  private normalizeOverlay(overlay: any): DrawOverlay {
    const normalized: DrawOverlay = {
      url: overlay.url
    };
    
    // Copy valid properties
    if (overlay.width !== undefined && !isNaN(Number(overlay.width))) {
      normalized.width = Number(overlay.width);
    }
    
    if (overlay.height !== undefined && !isNaN(Number(overlay.height))) {
      normalized.height = Number(overlay.height);
    }
    
    if (overlay.fit !== undefined) {
      normalized.fit = String(overlay.fit);
    }
    
    if (overlay.gravity !== undefined) {
      if (typeof overlay.gravity === 'object' && 
          overlay.gravity.x !== undefined && overlay.gravity.y !== undefined) {
        normalized.gravity = {
          x: Number(overlay.gravity.x),
          y: Number(overlay.gravity.y)
        };
      } else {
        // Get the gravity parameter definition from registry to use its formatter if available
        const gravityDef = parameterRegistry['gravity'];
        if (gravityDef && gravityDef.formatter && typeof overlay.gravity === 'string') {
          // Apply the formatter to translate Akamai placement values
          normalized.gravity = gravityDef.formatter(overlay.gravity);
          
          if (normalized.gravity !== overlay.gravity) {
            this.logger.debug('Formatted gravity value via registry', { 
              original: overlay.gravity, 
              formatted: normalized.gravity 
            });
          }
        } else {
          normalized.gravity = String(overlay.gravity);
        }
      }
    }
    
    if (overlay.opacity !== undefined && !isNaN(Number(overlay.opacity))) {
      normalized.opacity = Number(overlay.opacity);
    }
    
    if (overlay.repeat !== undefined) {
      normalized.repeat = overlay.repeat;
    }
    
    if (overlay.top !== undefined && !isNaN(Number(overlay.top))) {
      normalized.top = Number(overlay.top);
    }
    
    if (overlay.left !== undefined && !isNaN(Number(overlay.left))) {
      normalized.left = Number(overlay.left);
    }
    
    if (overlay.bottom !== undefined && !isNaN(Number(overlay.bottom))) {
      normalized.bottom = Number(overlay.bottom);
    }
    
    if (overlay.right !== undefined && !isNaN(Number(overlay.right))) {
      normalized.right = Number(overlay.right);
    }
    
    if (overlay.background !== undefined) {
      normalized.background = String(overlay.background);
    }
    
    if (overlay.rotate !== undefined && !isNaN(Number(overlay.rotate))) {
      normalized.rotate = Number(overlay.rotate);
    }
    
    return normalized;
  }
}