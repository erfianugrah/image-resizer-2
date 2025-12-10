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
  private sizeCodeMap: Record<string, number>;
  
  constructor(logger?: Logger) {
    this.logger = logger || defaultLogger;
    
    // Import size code map directly to avoid circular dependencies
    this.sizeCodeMap = {
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
  }
  
  /**
   * Get the width value for a size code
   */
  private getSizeCodeWidth(sizeCode: string): number | null {
    const code = sizeCode.toLowerCase();
    return this.sizeCodeMap[code] || null;
  }
  
  /**
   * Process parameters from multiple sources
   */
  async process(parameters: TransformParameter[]): Promise<Record<string, any>> {
    // Log all incoming parameters in detail for debugging
    this.logger.debug('Processing parameters:', {
      parameters: parameters.map(p => 
        `${p.name}=${typeof p.value === 'object' ? JSON.stringify(p.value) : p.value}:${p.source}:${p.priority}`
      )
    });
    
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
    const processedParams = await this.processSpecialCases(validatedParams);
    
    // Format parameters for Cloudflare
    return await this.formatForCloudflare(processedParams);
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
  private async processSpecialCases(parameters: Record<string, TransformParameter>): Promise<Record<string, TransformParameter>> {
    // Import dynamically to avoid circular dependencies
    // Use import() instead of require() to follow ESM patterns
    const ProcessorRegistry = (await import('./ProcessorRegistry')).ProcessorRegistry;
    
    const registry = new ProcessorRegistry(this.logger);
    const processed = { ...parameters };
    const processedValues: Record<string, unknown> = {};
    
    // Define parameter mappings for explicit dimensions and other special cases
    interface ParameterMapping {
      target?: string;
      flag?: string;
      source?: string;
    }
    
    const parameterMappings: Record<string, ParameterMapping> = {
      // Explicit dimensions that should override automatic calculations
      'imwidth': { target: 'width', flag: '__explicitWidth', source: 'akamai' },
      'imheight': { target: 'height', flag: '__explicitHeight', source: 'akamai' },
      
      // Add any other special parameter mappings here
      'width': { flag: '__explicitWidth', source: 'direct' },  // Direct width should also be marked explicit
      'height': { flag: '__explicitHeight', source: 'direct' } // Direct height should also be marked explicit
    };
    
    // Process explicit dimension parameters from various sources
    Object.entries(parameterMappings).forEach(([paramName, mapping]) => {
      // Skip if the parameter is not present
      if (!processed[paramName]) return;
      
      // If this is a mapping parameter (like imwidth -> width)
      if (mapping.target && processed[paramName]) {
        const sourceParam = processed[paramName];
        const targetParam = mapping.target;
        const targetPriority = parameterRegistry[targetParam]?.priority || 100;
        
        this.logger.debug(`Mapping ${paramName} to ${targetParam} parameter`, {
          value: sourceParam.value,
          source: mapping.source || sourceParam.source,
          priority: targetPriority + 20 // Higher than default priority
        });
        
        // Create a new parameter object with the base properties
        const newParam: TransformParameter = {
          name: targetParam,
          value: sourceParam.value,
          source: (mapping.source || sourceParam.source) as 'url' | 'path' | 'akamai' | 'compact' | 'derivative' | 'derived',
          priority: targetPriority + 20, // Higher than default priority
        };
        
        // Add the explicit flag if defined
        if (mapping.flag) {
          // Use type assertion for adding dynamic properties
          (newParam as any)[mapping.flag] = true;
          processedValues[mapping.flag] = true; // Set in processedValues too
        }
        
        // Add the new parameter
        processed[targetParam] = newParam;
        
        // Remove the original parameter if it's a mapping (like imwidth)
        if (targetParam !== paramName) {
          delete processed[paramName];
        }
      } 
      // If this is a direct parameter that needs flagging (like width)
      else if (mapping.flag && !mapping.target) {
        const param = processed[paramName];
        
        // Add the flag to the parameter via type assertion
        (param as any)[mapping.flag] = true;
        
        // Add the flag to processedValues
        processedValues[mapping.flag] = true;
        
        this.logger.debug(`Marked ${paramName} parameter as explicit`, {
          value: param.value,
          flag: mapping.flag 
        });
      }
    });

    // Handle size codes after explicit widths are marked so we don't override path/query widths
    if (processed['f'] && typeof processed['f'].value === 'string') {
      const existingWidth = processed['width'];
      const hasExplicitWidth = !!(existingWidth && ((existingWidth as any).__explicitWidth || existingWidth.source === 'path'));
      
      if (!hasExplicitWidth) {
        const sizeCode = processed['f'].value as string;
        const sizeCodeWidth = this.getSizeCodeWidth(sizeCode);
        
        if (sizeCodeWidth) {
          this.logger.info(`Direct handling of 'f=${sizeCode}' size code, mapping to width=${sizeCodeWidth}`, {
            sizeCode,
            mappedWidth: sizeCodeWidth,
            priority: 'maximum'
          });
          
          processed['width'] = {
            name: 'width',
            value: sizeCodeWidth,
            source: 'derived',
            priority: 150, // Keep high when no explicit width exists
            __explicitWidth: true
          };
          
          processedValues.__explicitWidth = true;
        }
      } else {
        this.logger.debug('Skipping size-code width because an explicit width is already present', {
          explicitWidth: existingWidth?.value,
          explicitSource: existingWidth?.source
        });
      }
    }
    
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
    
    // IMPORTANT: Keep the 'f' parameter for cache key generation but make sure width is set correctly
    // Although we've mapped 'f' to width, we want to keep the 'f' parameter in the processed results 
    // to ensure it's included in the cache key generation
    if (processedValues.width && processed.f) {
      // Don't delete processed.f here - let it be included in the cache key
      // But make sure we have proper width propagation
      if (processed.width && typeof processed.width.value === 'number') {
        this.logger.debug('Ensured width is correctly set from f parameter', {
          fValue: processed.f.value,
          width: processed.width.value
        });
      }
    }

    // Final safeguard: if a path-provided width exists, make sure it wins over size codes
    const pathWidthParam = parameters['width'] && parameters['width'].source === 'path' ? parameters['width'] : null;
    if (pathWidthParam) {
      processed['width'] = {
        ...(processed['width'] || pathWidthParam),
        name: 'width',
        value: pathWidthParam.value,
        source: 'path',
        priority: Math.max(pathWidthParam.priority || 0, (processed['width']?.priority || 0) + 5),
        __explicitWidth: true
      } as TransformParameter;
      
      // Reflect the explicit width in processedValues for downstream formatters
      processedValues.__explicitWidth = true;
      
      // Drop size-code marker so cache keys reflect the real width source
      if (processed['f']) {
        delete processed['f'];
      }
    }
    
    return processed;
  }
  
  /**
   * Format parameters for Cloudflare Image Resizing
   */
  async formatForCloudflare(parameters: Record<string, TransformParameter>): Promise<Record<string, any>> {
    // Get the base values
    const baseOptions: Record<string, any> = {};
    
    // Check if we have explicit width or height flags to preserve
    const hasExplicitWidth = parameters['width'] && parameters['width'].__explicitWidth;
    const hasExplicitHeight = parameters['height'] && parameters['height'].__explicitHeight;
    
    // Extract just the values for Cloudflare
    Object.entries(parameters).forEach(([name, param]) => {
      // Apply formatters if defined in parameter definition
      const paramDef = parameterRegistry[name];
      
      if (paramDef && paramDef.formatter) {
        baseOptions[name] = paramDef.formatter(param.value);
      } else {
        baseOptions[name] = param.value;
      }
      
      // Copy explicit flags if they exist
      if (name === 'width' && param.__explicitWidth) {
        baseOptions.__explicitWidth = true;
      }
      
      if (name === 'height' && param.__explicitHeight) {
        baseOptions.__explicitHeight = true;
      }
    });
    
    // Log if we have explicit dimensions
    if (hasExplicitWidth || hasExplicitHeight) {
      this.logger.debug('Preserving explicit dimension flags in Cloudflare options', {
        hasExplicitWidth,
        hasExplicitHeight,
        width: parameters['width']?.value,
        height: parameters['height']?.value
      });
    }
    
    // Import dynamically to avoid circular dependencies
    // Use import() instead of require() to follow ESM patterns
    const CloudflareOptionsBuilder = (await import('./CloudflareOptionsBuilder')).CloudflareOptionsBuilder;
    
    // Build the Cloudflare options
    const builder = new CloudflareOptionsBuilder(this.logger);
    const fetchOptions = builder.buildFetchOptions(baseOptions);
    
    // Extract the cf.image options
    const cfOptions = (fetchOptions.cf as any).image || {};
    
    // Forward explicit flags to ensure they make it to transform.ts
    if (hasExplicitWidth) {
      cfOptions.__explicitWidth = true;
    }
    
    if (hasExplicitHeight) {
      cfOptions.__explicitHeight = true;
    }
    
    // Remove size code marker to align with expected options and avoid cache key skew
    if ('f' in cfOptions) {
      delete (cfOptions as Record<string, unknown>).f;
    }
    
    this.logger.breadcrumb('Formatted parameters for Cloudflare', undefined, {
      optionCount: Object.keys(cfOptions).length,
      hasWidth: cfOptions.width !== undefined,
      hasExplicitWidth: !!cfOptions.__explicitWidth,
      width: cfOptions.width
    });
    
    return cfOptions;
  }
}
