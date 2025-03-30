/**
 * Compact parameter parser
 * 
 * Handles compact parameters like r=16:9, p=0.5,0.6, f=m
 */

import { ParameterParser } from '../interfaces';
import { Logger } from '../../utils/logging';
import { TransformParameter } from '../../utils/path';
import { parameterRegistry, sizeCodeMap } from '../registry';
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
    const result = Object.keys(this.compactMappings).some(compact => searchParams.has(compact));
    
    if (result) {
      this.logger.debug('CompactParser can parse this input', {
        params: Array.from(searchParams.entries()).map(([k, v]) => `${k}=${v}`).join(', '),
        hasF: searchParams.has('f'),
        hasR: searchParams.has('r'),
        hasW: searchParams.has('w'),
        hasP: searchParams.has('p')
      });
    }
    
    return result;
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
    
    // Log all parameters we'll be parsing
    this.logger.debug('CompactParser examining parameters', {
      allParams: Array.from(searchParams.entries()).map(([k, v]) => `${k}=${v}`).join(', '),
      compactKeys: Object.keys(this.compactMappings).filter(k => searchParams.has(k)).join(',')
    });
    
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
            // Validate the size code for 'f' parameter
            if (compact === 'f' && fullName === 'f') {
              const sizeCode = value.toLowerCase();
              if (!sizeCodeMap[sizeCode]) {
                this.logger.warn(`Unknown size code: ${value}`, {
                  validCodes: Object.keys(sizeCodeMap).join(',')
                });
              } else {
                this.logger.info(`Valid size code found: ${value} => width=${sizeCodeMap[sizeCode]}`, {
                  sizeCode: value,
                  mappedWidth: sizeCodeMap[sizeCode]
                });
              }
            }
            // Keep as string
            break;
          case 'coordinate':
          case 'enum':
          case 'string':
            // Keep as string
            break;
        }
        
        // Special handling for 'f' parameter - higher priority to ensure it overrides auto-width
        let paramPriority = paramDef.priority || 50;
        if (compact === 'f' && fullName === 'f') {
          paramPriority = 110; // Higher priority to ensure it takes precedence
          
          // Also add a direct width parameter for backward compatibility
          const sizeCode = value.toLowerCase();
          if (sizeCodeMap[sizeCode]) {
            const width = sizeCodeMap[sizeCode];
            
            this.logger.info(`Adding width parameter from size code ${value} (${width}px)`, {
              sizeCode: value,
              width
            });
            
            // Add an explicit width parameter with high priority
            parameters.push({
              name: 'width',
              value: width,
              source: 'derived',
              priority: 120, // Even higher priority than the size code
              __explicitWidth: true // Mark as explicit
            });
          }
        }
        
        // Create parameter object with aliasFor to show the relationship
        parameters.push({
          name: fullName,
          aliasFor: compact !== fullName ? compact : undefined,
          value: typedValue,
          source: 'compact',
          priority: paramPriority
        });
        
        this.logger.debug('CompactParser parsed parameter', {
          compact,
          fullName,
          value: typedValue,
          priority: paramPriority,
          type: paramDef.type
        });
      }
    }
    
    this.logger.breadcrumb('CompactParser completed parsing', undefined, {
      parameterCount: parameters.length,
      paramNames: parameters.map(p => p.name).join(',')
    });
    
    return parameters;
  }
}