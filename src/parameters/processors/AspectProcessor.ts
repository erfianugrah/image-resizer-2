/**
 * Aspect Processor
 * 
 * Handles aspect ratio normalization and related operations
 */

import { TransformParameter } from '../../utils/path';
import { Logger } from '../../utils/logging';

/**
 * Processor for aspect ratio parameters
 */
export class AspectProcessor {
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
   * Check if this parameter is an aspect ratio
   */
  canProcess(parameter: TransformParameter): boolean {
    return parameter.name === 'aspect' && typeof parameter.value === 'string';
  }
  
  /**
   * Process an aspect ratio parameter
   * 
   * @param parameter The aspect ratio parameter
   * @param result The result object to update
   */
  process(parameter: TransformParameter, result: Record<string, unknown>): void {
    const aspectValue = parameter.value as string;
    
    // Normalize aspect ratio format (16-9 => 16:9)
    if (aspectValue.includes('-')) {
      const normalized = aspectValue.replace('-', ':');
      
      this.logger.debug('Normalizing aspect ratio format', {
        original: aspectValue,
        normalized
      });
      
      // Update the value
      result.aspect = normalized;
    } else {
      // Keep original value
      result.aspect = aspectValue;
    }
    
    // When aspect is present, set ctx=true if not explicitly set
    if (!result.ctx) {
      this.logger.debug('Setting ctx=true due to aspect ratio parameter');
      result.ctx = true;
    }
  }
}