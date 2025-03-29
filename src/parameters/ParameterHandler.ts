/**
 * Parameter Handler
 * 
 * Facade for parameter parsing and processing that simplifies usage
 */

import { ParameterParserFactory } from './ParameterParserFactory';
import { DefaultParameterProcessor } from './ParameterProcessor';
import { Logger, defaultLogger } from '../utils/logging';

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
  handleRequest(request: Request): Record<string, any> {
    this.logger.breadcrumb('Handling parameters for request', undefined, {
      url: request.url
    });
    
    // Get parsers for this request
    const parsers = this.parserFactory.getParsers(request);
    
    // Parse parameters from all sources
    const allParameters = [];
    for (const parser of parsers) {
      const parameters = parser.parse(request);
      allParameters.push(...parameters);
      
      this.logger.debug(`Parsed ${parameters.length} parameters with ${parser.constructor.name}`);
    }
    
    // Process and return the parameters
    return this.processor.process(allParameters);
  }
}