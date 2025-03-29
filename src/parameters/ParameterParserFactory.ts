/**
 * Parameter parser factory
 * 
 * Creates and manages parameter parsers based on the input
 */

import { ParameterParser } from './interfaces';
import { Logger } from '../utils/logging';
import { StandardParser } from './parsers/StandardParser';
import { CompactParser } from './parsers/CompactParser';
import { PathParser } from './parsers/PathParser';
import { AkamaiParser } from './parsers/AkamaiParser';
import { defaultLogger } from '../utils/logging';

export class ParameterParserFactory {
  private logger: Logger;
  
  constructor(logger?: Logger) {
    this.logger = logger || defaultLogger;
  }
  
  /**
   * Get appropriate parsers for the given request
   */
  getParsers(request: Request): ParameterParser[] {
    const parsers: ParameterParser[] = [];
    const url = new URL(request.url);
    
    this.logger.breadcrumb('Getting parameter parsers for request', undefined, {
      pathname: url.pathname,
      searchParamsCount: Array.from(url.searchParams.keys()).length
    });
    
    // Always include the standard parser
    parsers.push(new StandardParser(this.logger));
    
    // Check for path parameters
    if (url.pathname.includes('_') && url.pathname.includes('=')) {
      this.logger.debug('Including PathParser for path parameters');
      parsers.push(new PathParser(this.logger));
    }
    
    // Check for Akamai parameters
    const akamaiSpecificParams = [
      'imwidth', 'imheight', 'impolicy', 'imcolor', 'imquality',
      'imformat', 'imbypass', 'imcrop', 'imrotate', 'imdensity'
    ];
    
    if (url.searchParams.has('im') || 
        Array.from(url.searchParams.keys()).some(k => k.startsWith('im.')) ||
        akamaiSpecificParams.some(param => url.searchParams.has(param))) {
      this.logger.debug('Including AkamaiParser for Akamai parameters');
      parsers.push(new AkamaiParser(this.logger));
    }
    
    // Check for compact parameters
    if (
      url.searchParams.has('r') || 
      url.searchParams.has('p') || 
      url.searchParams.has('f') ||
      url.searchParams.has('w') ||
      url.searchParams.has('h') ||
      url.searchParams.has('s')
    ) {
      this.logger.debug('Including CompactParser for compact parameters');
      parsers.push(new CompactParser(this.logger));
    }
    
    this.logger.breadcrumb('Selected parsers for request', undefined, {
      parserCount: parsers.length,
      parserTypes: parsers.map(p => p.constructor.name).join(', ')
    });
    
    return parsers;
  }
  
  /**
   * Parse parameters from a request using all appropriate parsers
   */
  parseRequest(request: Request): Record<string, any> {
    const parsers = this.getParsers(request);
    const allParameters = [];
    
    // Run all parsers and collect parameters
    for (const parser of parsers) {
      const parameters = parser.parse(request);
      allParameters.push(...parameters);
    }
    
    // Process parameters to remove duplicates and reconcile conflicts
    return this.processParameters(allParameters);
  }
  
  /**
   * Process parameters from all parsers
   */
  private processParameters(parameters: any[]): Record<string, any> {
    // Group parameters by name, keeping the highest priority one
    const groupedParams: Record<string, any> = {};
    
    parameters.forEach(param => {
      const name = param.name;
      
      if (!groupedParams[name] || param.priority > groupedParams[name].priority) {
        groupedParams[name] = param.value;
      }
    });
    
    return groupedParams;
  }
}