/**
 * Parameter Processor
 * 
 * Processes, validates, and formats parameters for Cloudflare Image Resizing
 */

import { ParameterProcessor, ProcessingContext } from './interfaces';
import { Logger } from '../utils/logging';
import { TransformParameter } from '../utils/path';
import { parameterRegistry, sizeCodeMap } from './registry';
import { defaultLogger } from '../utils/logging';

export class DefaultParameterProcessor implements ParameterProcessor {
  private logger: Logger;
  
  constructor(logger?: Logger) {
    this.logger = logger || defaultLogger;
  }
  
  /**
   * Process parameters from multiple sources
   */
  process(parameters: TransformParameter[]): Record<string, any> {
    this.logger.breadcrumb('Processing parameters', undefined, {
      parameterCount: parameters.length
    });
    
    // Group by parameter name
    const paramsByName = this.groupByName(parameters);
    
    // Select highest priority parameter for each name
    const mergedParams = this.mergeByPriority(paramsByName);
    
    // Validate all parameters
    const validatedParams = this.validate(mergedParams);
    
    // Handle special cases like size codes
    const processedParams = this.processSpecialCases(validatedParams);
    
    // Format parameters for Cloudflare
    return this.formatForCloudflare(processedParams);
  }
  
  /**
   * Group parameters by name
   */
  private groupByName(parameters: TransformParameter[]): Record<string, TransformParameter[]> {
    const grouped: Record<string, TransformParameter[]> = {};
    
    parameters.forEach(param => {
      const name = param.name;
      
      if (!grouped[name]) {
        grouped[name] = [];
      }
      
      grouped[name].push(param);
    });
    
    return grouped;
  }
  
  /**
   * Merge parameters by selecting highest priority for each name
   */
  private mergeByPriority(groupedParams: Record<string, TransformParameter[]>): Record<string, TransformParameter> {
    const merged: Record<string, TransformParameter> = {};
    
    Object.entries(groupedParams).forEach(([name, params]) => {
      // Sort by priority (highest first)
      params.sort((a, b) => b.priority - a.priority);
      
      // Select the highest priority parameter
      merged[name] = params[0];
      
      // Log if there were multiple competing parameters
      if (params.length > 1) {
        this.logger.debug('Multiple parameters for same name, selecting highest priority', {
          name,
          selected: {
            value: params[0].value,
            source: params[0].source,
            priority: params[0].priority
          },
          otherSourcesCount: params.length - 1
        });
      }
    });
    
    return merged;
  }
  
  /**
   * Validate parameters against their definitions
   */
  validate(parameters: Record<string, TransformParameter>): Record<string, TransformParameter> {
    const validated: Record<string, TransformParameter> = {};
    
    Object.entries(parameters).forEach(([name, param]) => {
      const paramDef = parameterRegistry[name];
      
      // If no definition exists, skip validation but keep the parameter
      if (!paramDef) {
        this.logger.debug(`No definition found for parameter ${name}, keeping as-is`);
        validated[name] = param;
        return;
      }
      
      // If parameter has a validator, use it
      if (paramDef.validator && !paramDef.validator(param.value)) {
        this.logger.debug(`Parameter ${name} failed validation, using default value`, {
          value: param.value,
          defaultValue: paramDef.defaultValue
        });
        
        // If there's a default value, use it; otherwise, skip this parameter
        if (paramDef.defaultValue !== undefined) {
          param.value = paramDef.defaultValue;
          validated[name] = param;
        }
        return;
      }
      
      // For enum types, validate against allowed values
      if (paramDef.type === 'enum' && paramDef.allowedValues) {
        if (!paramDef.allowedValues.includes(param.value)) {
          this.logger.debug(`Parameter ${name} has invalid enum value, using default value`, {
            value: param.value,
            allowedValues: paramDef.allowedValues,
            defaultValue: paramDef.defaultValue
          });
          
          // If there's a default value, use it; otherwise, skip this parameter
          if (paramDef.defaultValue !== undefined) {
            param.value = paramDef.defaultValue;
            validated[name] = param;
          }
          return;
        }
      }
      
      // Parameter passed validation
      validated[name] = param;
    });
    
    return validated;
  }
  
  /**
   * Process special cases using the processor registry
   */
  private processSpecialCases(parameters: Record<string, TransformParameter>): Record<string, TransformParameter> {
    // Import the ProcessorRegistry here to avoid circular dependencies
    // we can use a dynamic import in the future if needed
    const { ProcessorRegistry } = require('./ProcessorRegistry');
    
    const registry = new ProcessorRegistry(this.logger);
    const processed = { ...parameters };
    const processedValues: Record<string, unknown> = {};
    
    // Process each parameter with the registry
    Object.values(processed).forEach(param => {
      registry.processParameter(param, processedValues);
    });
    
    // Update or add parameters based on processor results
    Object.entries(processedValues).forEach(([key, value]) => {
      // If it's a new parameter not in the original parameters
      if (!processed[key]) {
        processed[key] = {
          name: key,
          value: value,
          source: 'derived',
          priority: 60
        } as TransformParameter;
      } 
      // If it's a modified existing parameter
      else if (processed[key].value !== value) {
        processed[key].value = value as string | number | boolean;
      }
    });
    
    // Remove the 'f' parameter if we created a 'width' parameter
    if (processedValues.width && processed.f) {
      delete processed.f;
    }
    
    return processed;
  }
  
  /**
   * Format parameters for Cloudflare Image Resizing
   */
  formatForCloudflare(parameters: Record<string, TransformParameter>): Record<string, any> {
    // Get the base values
    const baseOptions: Record<string, any> = {};
    
    // Extract just the values for Cloudflare
    Object.entries(parameters).forEach(([name, param]) => {
      // Apply formatters if defined in parameter definition
      const paramDef = parameterRegistry[name];
      
      if (paramDef && paramDef.formatter) {
        baseOptions[name] = paramDef.formatter(param.value);
      } else {
        baseOptions[name] = param.value;
      }
    });
    
    // Import the CloudflareOptionsBuilder here to avoid circular dependencies
    const { CloudflareOptionsBuilder } = require('./CloudflareOptionsBuilder');
    
    // Build the Cloudflare options
    const builder = new CloudflareOptionsBuilder(this.logger);
    const fetchOptions = builder.buildFetchOptions(baseOptions);
    
    // Extract the cf.image options
    const cfOptions = (fetchOptions.cf as any).image || {};
    
    this.logger.breadcrumb('Formatted parameters for Cloudflare', undefined, {
      optionCount: Object.keys(cfOptions).length
    });
    
    return cfOptions;
  }
}