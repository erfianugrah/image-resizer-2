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
    
    this.logger.breadcrumb('StandardParser completed parsing', undefined, {
      parameterCount: parameters.length
    });
    
    return parameters;
  }
}