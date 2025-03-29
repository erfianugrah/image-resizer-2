/**
 * Path parameter parser
 * 
 * Handles parameters included in the URL path with underscore prefix, like:
 * /images/_width=300/_quality=80/example.jpg
 */

import { ParameterParser } from '../interfaces';
import { Logger } from '../../utils/logging';
import { TransformParameter } from '../../utils/path';
import { parameterRegistry } from '../registry';
import { defaultLogger } from '../../utils/logging';

export class PathParser implements ParameterParser {
  private logger: Logger;
  
  constructor(logger?: Logger) {
    this.logger = logger || defaultLogger;
  }
  
  /**
   * This parser can handle paths with underscore-prefixed segments
   */
  canParse(input: string | URLSearchParams | Request): boolean {
    if (input instanceof Request) {
      const url = new URL(input.url);
      return url.pathname.includes('_') && url.pathname.includes('=');
    } else if (typeof input === 'string') {
      return input.includes('_') && input.includes('=');
    }
    return false;
  }
  
  /**
   * Parse path parameters prefixed with underscore
   */
  parse(input: string | URLSearchParams | Request): TransformParameter[] {
    this.logger.breadcrumb('PathParser parsing parameters');
    
    let pathname: string;
    
    if (input instanceof Request) {
      pathname = new URL(input.url).pathname;
    } else if (typeof input === 'string') {
      pathname = input;
    } else {
      this.logger.error('Unsupported input type for PathParser');
      return [];
    }
    
    const parameters: TransformParameter[] = [];
    
    // Split pathname into segments
    const segments = pathname.split('/').filter(Boolean);
    
    // Process option segments (those starting with _)
    const optionSegments = segments.filter(segment => 
      segment.startsWith('_') && segment.includes('=')
    );
    
    for (const segment of optionSegments) {
      // Remove the leading underscore
      const optionText = segment.substring(1);
      
      // Split by the first equals sign
      const equalsIndex = optionText.indexOf('=');
      
      if (equalsIndex > 0) {
        const key = optionText.substring(0, equalsIndex);
        const value = optionText.substring(equalsIndex + 1);
        
        // Find parameter definition in registry
        const paramDef = parameterRegistry[key];
        
        if (paramDef) {
          // Convert the value to the appropriate type
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
            case 'size-code':
            case 'coordinate':
            case 'enum':
            case 'string':
              // Keep as string
              break;
          }
          
          // Create parameter object
          parameters.push({
            name: key,
            value: typedValue,
            source: 'path',
            priority: (paramDef.priority || 50) + 10 // Path parameters have slightly higher priority than query params
          });
          
          this.logger.debug('PathParser parsed parameter', {
            name: key,
            value: typedValue
          });
        } else {
          // Parameter not found in registry, but still include it
          parameters.push({
            name: key,
            value: value,
            source: 'path',
            priority: 40 // Lower priority for unknown parameters
          });
          
          this.logger.debug('PathParser parsed unknown parameter', {
            name: key,
            value
          });
        }
      }
    }
    
    this.logger.breadcrumb('PathParser completed parsing', undefined, {
      parameterCount: parameters.length
    });
    
    return parameters;
  }
}