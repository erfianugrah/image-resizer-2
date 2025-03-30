/**
 * Size Code Processor
 * 
 * Handles size code resolution (f=m => width=700)
 */

import { ParameterProcessor } from '../interfaces';
import { TransformParameter } from '../../utils/path';
import { Logger } from '../../utils/logging';

/**
 * Size code mapping for the 'f' parameter
 */
export const sizeCodeMap: Record<string, number> = {
  'xxu': 40,
  'xu': 80,
  'u': 160,
  'xxxs': 300,
  'xxs': 400,
  'xs': 500,
  's': 600,
  'm': 700,
  'l': 750,
  'xl': 900,
  'xxl': 1100,
  'xxxl': 1400,
  'sg': 1600,
  'g': 2000,
  'xg': 3000,
  'xxg': 4000
};

/**
 * Processor for size code parameters (f=m => width=700)
 */
export class SizeCodeProcessor {
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
   * Check if this parameter is a size code
   */
  canProcess(parameter: TransformParameter): boolean {
    return parameter.name === 'f' && typeof parameter.value === 'string';
  }
  
  /**
   * Process a size code parameter
   * 
   * @param parameter The size code parameter
   * @param result The result object to update
   */
  process(parameter: TransformParameter, result: Record<string, unknown>): void {
    const sizeCode = parameter.value as string;
    
    // Store the original size code in the result
    result.f = sizeCode;
    
    // Look up the width for this size code
    const width = sizeCodeMap[sizeCode.toLowerCase()];
    
    if (width) {
      this.logger.info('Converting size code to width', {
        sizeCode,
        width,
        original: parameter.value
      });
      
      // Add width parameter to result with explicit flag
      result.width = width;
      
      // Add the explicit flag to indicate this width should not be overridden
      result.__explicitWidth = true;
      
      this.logger.debug('Added explicit width flag for size code', {
        sizeCode,
        width,
        hasExplicitFlag: true
      });
    } else {
      this.logger.warn('Unknown size code encountered', {
        sizeCode,
        availableCodes: Object.keys(sizeCodeMap).join(',')
      });
    }
  }
}