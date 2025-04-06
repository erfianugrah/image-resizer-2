/**
 * Standard parameter parser
 * 
 * Handles standard Cloudflare Image Resizing URL parameters like width=800
 */

import { ParameterParser } from '../interfaces';
import { Logger } from '../../utils/logging';
import { TransformParameter } from '../../utils/path';
import { parameterRegistry } from '../registry';
import { defaultLogger } from '../../utils/logging';

export class StandardParser implements ParameterParser {
  private logger: Logger;
  
  constructor(logger?: Logger) {
    this.logger = logger || defaultLogger;
  }
  
  /**
   * This parser can handle any URL search parameters
   */
  canParse(input: string | URLSearchParams | Request): boolean {
    if (input instanceof URLSearchParams) {
      return true;
    } else if (input instanceof Request) {
      return true;
    } else if (typeof input === 'string' && input.includes('=')) {
      return true;
    }
    return false;
  }
  
  /**
   * Parse standard URL parameters
   */
  parse(input: string | URLSearchParams | Request): TransformParameter[] {
    this.logger.breadcrumb('StandardParser parsing parameters');
    
    let searchParams: URLSearchParams;
    
    if (input instanceof Request) {
      const url = new URL(input.url);
      searchParams = url.searchParams;
    } else if (input instanceof URLSearchParams) {
      searchParams = input;
    } else if (typeof input === 'string') {
      // If string starts with ?, remove it
      const queryString = input.startsWith('?') ? input.substring(1) : input;
      searchParams = new URLSearchParams(queryString);
    } else {
      this.logger.error('Unsupported input type for StandardParser');
      return [];
    }
    
    const parameters: TransformParameter[] = [];
    
    // Process all search parameters
    for (const [key, value] of searchParams.entries()) {
      // Skip empty values
      if (!value) continue;
      
      // Special handling for imwidth/imheight parameters if not already in registry
      if (key === 'imwidth') {
        const numValue = parseInt(value, 10);
        if (!isNaN(numValue)) {
          this.logger.debug('StandardParser found imwidth parameter', {
            value: numValue
          });
          
          parameters.push({
            name: 'imwidth', 
            value: numValue,
            source: 'url',
            priority: 90
          });
          
          // Also add as regular width for more universal support
          parameters.push({
            name: 'width',
            value: numValue,
            source: 'url',
            priority: 85 // Slightly lower priority than direct
          });
          
          continue; // Skip rest of processing for this parameter
        }
      } else if (key === 'imheight') {
        const numValue = parseInt(value, 10);
        if (!isNaN(numValue)) {
          this.logger.debug('StandardParser found imheight parameter', {
            value: numValue
          });
          
          parameters.push({
            name: 'imheight', 
            value: numValue,
            source: 'url',
            priority: 90
          });
          
          // Also add as regular height for more universal support
          parameters.push({
            name: 'height',
            value: numValue,
            source: 'url',
            priority: 85 // Slightly lower priority than direct
          });
          
          continue; // Skip rest of processing for this parameter
        }
      }
      
      // Find parameter definition in registry
      const paramDef = parameterRegistry[key];
      
      if (paramDef) {
        // Convert the value to the appropriate type based on parameter definition
        let typedValue: string | number | boolean = value;
        
        switch (paramDef.type) {
          case 'number':
            const numValue = parseFloat(value);
            if (!isNaN(numValue)) {
              typedValue = numValue;
            }
            break;
          case 'auto-or-number':
            if (value.toLowerCase() === 'auto') {
              typedValue = 'auto';
            } else {
              const numValue = parseFloat(value);
              if (!isNaN(numValue)) {
                typedValue = numValue;
              }
            }
            break;
          case 'boolean':
            typedValue = value.toLowerCase() === 'true';
            break;
          case 'enum':
          case 'string':
          case 'coordinate':
          case 'size-code':
            // Keep as string
            break;
        }
        
        // Create parameter object
        parameters.push({
          name: key,
          value: typedValue,
          source: 'url',
          priority: paramDef.priority || 50
        });
        
        this.logger.debug('StandardParser parsed parameter', {
          name: key,
          value: typedValue,
          type: paramDef.type
        });
      } else {
        // Parameter not found in registry, but still include it
        parameters.push({
          name: key,
          value: value,
          source: 'url',
          priority: 30 // Lower priority for unknown parameters
        });
        
        this.logger.debug('StandardParser parsed unknown parameter', {
          name: key,
          value
        });
      }
    }
    
    // Process watermark/overlay parameters as a group before returning
    this.processOverlayParameters(parameters);
    
    this.logger.breadcrumb('StandardParser completed parsing', undefined, {
      parameterCount: parameters.length
    });
    
    return parameters;
  }
  
  /**
   * Process overlay and related parameters to create a proper draw parameter
   * for Cloudflare Image Resizing
   */
  private processOverlayParameters(parameters: TransformParameter[]): void {
    // Check if we have an overlay parameter
    const overlayParam = parameters.find(param => param.name === 'overlay');
    if (!overlayParam) {
      return; // No overlay to process
    }
    
    this.logger.info('Processing overlay parameters for watermarking', {
      overlayUrl: String(overlayParam.value)
    });
    
    // Find related parameters
    const gravityParam = parameters.find(param => param.name === 'gravity');
    const dxParam = parameters.find(param => param.name === 'dx');
    const dyParam = parameters.find(param => param.name === 'dy');
    const widthParam = parameters.find(param => param.name === 'width' && !param.source.includes('imwidth'));
    
    // Create a draw object with overlay URL
    const drawObj: Record<string, string | number | boolean> = {
      url: String(overlayParam.value)
    };
    
    // Add width if specified and is for the overlay
    if (widthParam && widthParam.value !== undefined) {
      const widthValue = typeof widthParam.value === 'string' ? 
        parseInt(widthParam.value, 10) : Number(widthParam.value);
        
      if (!isNaN(widthValue)) {
        drawObj.width = widthValue;
        
        // Remove the width parameter so it doesn't get used for the main image
        const widthIndex = parameters.findIndex(p => p === widthParam);
        if (widthIndex !== -1) {
          parameters.splice(widthIndex, 1);
        }
      }
    }
    
    // Handle positioning based on gravity
    if (gravityParam && typeof gravityParam.value === 'string') {
      const gravity = String(gravityParam.value).toLowerCase();
      
      // Map common gravity/placement values to Cloudflare's positioning properties
      const gravityMap: Record<string, [string | null, string | null]> = {
        'southeast': ['bottom', 'right'],
        'southwest': ['bottom', 'left'],
        'northeast': ['top', 'right'],
        'northwest': ['top', 'left'],
        'south': ['bottom', null],
        'north': ['top', null],
        'east': [null, 'right'],
        'west': [null, 'left'],
        'center': [null, null],
        'bottomright': ['bottom', 'right'],
        'bottomleft': ['bottom', 'left'],
        'topright': ['top', 'right'],
        'topleft': ['top', 'left']
      };
      
      // Get vertical and horizontal positioning
      const [verticalPos, horizontalPos] = gravityMap[gravity] || [null, null];
      
      // Get offsets from dx/dy parameters
      const dxValue = dxParam && dxParam.value ? 
        (typeof dxParam.value === 'string' ? parseInt(dxParam.value, 10) : Number(dxParam.value)) : 
        20; // Default offset
        
      const dyValue = dyParam && dyParam.value ? 
        (typeof dyParam.value === 'string' ? parseInt(dyParam.value, 10) : Number(dyParam.value)) : 
        20; // Default offset
      
      // Apply positioning to draw object
      if (verticalPos === 'bottom') {
        drawObj.bottom = dyValue;
      } else if (verticalPos === 'top') {
        drawObj.top = dyValue;
      }
      
      if (horizontalPos === 'right') {
        drawObj.right = dxValue;
      } else if (horizontalPos === 'left') {
        drawObj.left = dxValue;
      }
      
      this.logger.info('Mapped gravity to positioning', {
        gravity,
        verticalPos,
        horizontalPos,
        dxValue,
        dyValue,
        drawObj: JSON.stringify(drawObj)
      });
    } 
    // Default to bottom-right if no gravity specified
    else {
      const dxValue = dxParam && dxParam.value ? 
        (typeof dxParam.value === 'string' ? parseInt(dxParam.value, 10) : Number(dxParam.value)) : 
        20; // Default offset
        
      const dyValue = dyParam && dyParam.value ? 
        (typeof dyParam.value === 'string' ? parseInt(dyParam.value, 10) : Number(dyParam.value)) : 
        20; // Default offset
      
      drawObj.bottom = dyValue;
      drawObj.right = dxValue;
      
      this.logger.info('Using default bottom-right positioning', {
        bottom: dyValue,
        right: dxValue
      });
    }
    
    // Create the draw parameter with JSON array of one object
    parameters.push({
      name: 'draw',
      value: JSON.stringify([drawObj]),
      source: 'url',
      priority: 95
    });
    
    this.logger.info('Created draw parameter for overlay', {
      drawParam: JSON.stringify([drawObj])
    });
    
    // Remove parameters that we've handled
    const paramsToRemove = ['overlay', 'gravity', 'dx', 'dy'];
    for (const paramName of paramsToRemove) {
      const indicesToRemove = parameters
        .map((param, index) => param.name === paramName ? index : -1)
        .filter(index => index !== -1)
        .sort((a, b) => b - a); // Sort descending to remove from end to beginning
      
      indicesToRemove.forEach(index => {
        parameters.splice(index, 1);
      });
    }
  }
}