/**
 * Parameter Processor Registry
 * 
 * Manages parameter processors using the Strategy pattern
 */

import { Logger } from '../utils/logging';
import { defaultLogger } from '../utils/logging';
import { TransformParameter } from '../utils/path';
import { SizeCodeProcessor } from './processors/SizeCodeProcessor';
import { AspectProcessor } from './processors/AspectProcessor';
import { DrawProcessor } from './processors/DrawProcessor';

/**
 * Interface for parameter processors
 */
export interface ParameterProcessorStrategy {
  canProcess(parameter: TransformParameter): boolean;
  process(parameter: TransformParameter, result: Record<string, unknown>): void;
}

/**
 * Registry for parameter processors
 */
export class ProcessorRegistry {
  private processors: ParameterProcessorStrategy[] = [];
  private logger: Logger;
  
  constructor(logger?: Logger) {
    this.logger = logger || defaultLogger;
    this.registerDefaultProcessors();
  }
  
  /**
   * Register a parameter processor
   */
  register(processor: ParameterProcessorStrategy): void {
    this.processors.push(processor);
  }
  
  /**
   * Get a processor for a specific parameter
   */
  getProcessorFor(parameter: TransformParameter): ParameterProcessorStrategy | null {
    return this.processors.find(processor => processor.canProcess(parameter)) || null;
  }
  
  /**
   * Process a parameter using the appropriate processor
   */
  processParameter(parameter: TransformParameter, result: Record<string, unknown>): void {
    const processor = this.getProcessorFor(parameter);
    
    if (processor) {
      processor.process(parameter, result);
    } else {
      // For parameters without a specific processor, just copy the value
      result[parameter.name] = parameter.value;
    }
  }
  
  /**
   * Register the default set of processors
   */
  private registerDefaultProcessors(): void {
    // Size code processor (f=m => width=700)
    this.register(new SizeCodeProcessor(this.logger));
    
    // Aspect ratio processor (16-9 => 16:9 and sets ctx=true)
    this.register(new AspectProcessor(this.logger));
    
    // Draw parameter processor (handles JSON parsing and validation)
    this.register(new DrawProcessor(this.logger));
    
    this.logger.debug('Registered default parameter processors', {
      count: this.processors.length
    });
  }
}