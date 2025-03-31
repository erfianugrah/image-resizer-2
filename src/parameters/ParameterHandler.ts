/**
 * Parameter Handler
 * 
 * Facade for parameter parsing and processing that simplifies usage
 */

import { ParameterParserFactory } from './ParameterParserFactory';
import { DefaultParameterProcessor } from './ParameterProcessor';
import { Logger, defaultLogger } from '../utils/logging';
import { TransformParameter } from '../utils/path';

export class ParameterHandler {
  private parserFactory: ParameterParserFactory;
  private processor: DefaultParameterProcessor;
  private logger: Logger;
  
  constructor(logger?: Logger) {
    this.logger = logger || defaultLogger;
    this.parserFactory = new ParameterParserFactory(logger);
    this.processor = new DefaultParameterProcessor(logger);
  }
  
  /**
   * Parse and process parameters from a request
   */
  async handleRequest(request: Request): Promise<Record<string, any>> {
    const url = new URL(request.url);
    
    this.logger.breadcrumb('Handling parameters for request', undefined, {
      url: request.url,
      searchParams: url.search
    });
    
    // Debug log all URL parameters directly 
    const urlParams: Record<string, string> = {};
    for (const [key, value] of url.searchParams.entries()) {
      urlParams[key] = value;
    }
    
    // Log direct URL parameters for debugging
    this.logger.debug('Direct URL parameters from request', {
      params: JSON.stringify(urlParams),
      paramCount: Object.keys(urlParams).length,
      hasImwidth: url.searchParams.has('imwidth'),
      hasF: url.searchParams.has('f'),
      hasR: url.searchParams.has('r')
    });
    
    // Get parsers for this request
    const parsers = this.parserFactory.getParsers(request);
    
    // Parse parameters from all sources
    const allParameters: TransformParameter[] = [];
    for (const parser of parsers) {
      const parameters = parser.parse(request);
      allParameters.push(...parameters);
      
      this.logger.debug(`Parsed ${parameters.length} parameters with ${parser.constructor.name}`, {
        parserName: parser.constructor.name,
        parameters: parameters.map(p => `${p.name}=${p.value}`).join(', ')
      });
    }
    
    // Debug log specific parameters we care about
    const fParam = allParameters.find(p => p.name === 'f');
    const rParam = allParameters.find(p => p.name === 'r');
    const imwidthParam = allParameters.find(p => p.name === 'imwidth');
    
    this.logger.debug('Important parameters extracted', {
      hasF: !!fParam,
      fValue: fParam ? fParam.value : 'not_found',
      hasR: !!rParam,
      rValue: rParam ? rParam.value : 'not_found',
      hasImwidth: !!imwidthParam,
      imwidthValue: imwidthParam ? imwidthParam.value : 'not_found'
    });
    
    // Process parameters
    this.logger.breadcrumb('Processing parameters through processor');
    const processedParams = await this.processor.process(allParameters);
    
    // Log the processing results
    this.logger.debug('Parameter processing complete', {
      inputParamCount: allParameters.length,
      outputParamCount: Object.keys(processedParams).length,
      params: Object.keys(processedParams).join(','),
      hasWidth: processedParams.width !== undefined,
      width: processedParams.width,
      hasExplicitWidth: processedParams.__explicitWidth === true
    });
    
    return processedParams;
  }
}