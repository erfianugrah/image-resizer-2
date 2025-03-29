/**
 * Compact parameter parser
 * 
 * Handles compact parameters like r=16:9, p=0.5,0.6, f=m
 */

import { ParameterParser } from '../interfaces';
import { Logger } from '../../utils/logging';
import { TransformParameter } from '../../utils/path';
import { parameterRegistry } from '../registry';
import { defaultLogger } from '../../utils/logging';

export class CompactParser implements ParameterParser {
  private logger: Logger;
  
  constructor(logger?: Logger) {
    this.logger = logger || defaultLogger;
  }
  
  // Define mappings for compact parameters
  private compactMappings: Record<string, string> = {
    'w': 'width',
    'h': 'height',
    'r': 'aspect',
    'p': 'focal',
    'f': 'f', // Size code - handled specially
    's': 'ctx'  // Context-aware processing (replaces 'smart')
  };
  
  /**
   * This parser can handle any request that contains compact parameters
   */
  canParse(input: string | URLSearchParams | Request): boolean {
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
      return false;
    }
    
    // Check if any compact parameter is present
    return Object.keys(this.compactMappings).some(compact => searchParams.has(compact));
  }
  
  /**
   * Parse compact parameters
   */
  parse(input: string | URLSearchParams | Request): TransformParameter[] {
    this.logger.breadcrumb('CompactParser parsing parameters');
    
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
      this.logger.error('Unsupported input type for CompactParser');
      return [];
    }
    
    const parameters: TransformParameter[] = [];
    
    // Process all compact parameters
    for (const [compact, fullName] of Object.entries(this.compactMappings)) {
      if (searchParams.has(compact)) {
        const value = searchParams.get(compact) || '';
        const paramDef = parameterRegistry[fullName];
        
        if (!paramDef) {
          this.logger.warn(`No parameter definition found for ${fullName}`);
          continue;
        }
        
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
        
        // Create parameter object with aliasFor to show the relationship
        parameters.push({
          name: fullName,
          aliasFor: compact !== fullName ? compact : undefined,
          value: typedValue,
          source: 'compact',
          priority: paramDef.priority || 50
        });
        
        this.logger.debug('CompactParser parsed parameter', {
          compact,
          fullName,
          value: typedValue
        });
      }
    }
    
    this.logger.breadcrumb('CompactParser completed parsing', undefined, {
      parameterCount: parameters.length
    });
    
    return parameters;
  }
}