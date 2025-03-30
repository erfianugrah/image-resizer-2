/**
 * JSON Schema Validator for Configuration
 * 
 * This module provides schema validation for configuration objects using
 * Ajv (Another JSON Schema Validator), the most popular JSON schema validator
 * for TypeScript and JavaScript.
 */

import Ajv from 'ajv';
import addFormats from 'ajv-formats';
import { ConfigurationSystem, ConfigModule } from './interfaces';
import { Logger } from '../../utils/logging';

/**
 * Validation error details
 */
export interface ValidationError {
  path: string;
  message: string;
  params?: Record<string, any>;
}

/**
 * Schema validator using Ajv for full JSON Schema validation
 */
export class SchemaValidator {
  private logger?: Logger;
  private ajv: Ajv;
  
  /**
   * Create a new schema validator
   * 
   * @param logger Optional logger
   */
  constructor(logger?: Logger) {
    this.logger = logger;
    
    try {
      // Initialize Ajv with all options we need
      this.ajv = new Ajv({
        allErrors: true,         // Report all errors (not just the first one)
        verbose: true,           // Include schema path in errors
        $data: true,             // Enable $data references
        strictSchema: false,     // Allow additional keywords that might be used for metadata
        validateFormats: true,   // Validate formats, e.g. date-time, email
        strictNumbers: true,     // No NaN or Infinity 
        strictRequired: true,    // Required by name, not required: true
        strictTypes: true,       // No implicit type conversion
        useDefaults: true,       // Apply default values from schema
        coerceTypes: false,      // Don't coerce types (strict validation)
        removeAdditional: false, // Don't manipulate data
        code: { 
          source: false,         // Disable code generation which can trigger eval() restrictions
          optimize: false        // Disable optimization that might use dynamic code generation
        }
      });
      
      // Add common formats like date-time, uri, email, etc.
      addFormats(this.ajv);
      
      // Add custom formats if needed
      this.ajv.addFormat('env-var', /^\${[A-Za-z0-9_]+}$/); // Environment variable format
      
      // Add custom keywords
      this.addCustomKeywords();
      
      this.logDebug('Schema validator initialized with Ajv');
    } catch (error) {
      this.logError('Failed to initialize Ajv schema validator', {
        error: error instanceof Error ? error.message : String(error)
      });
      
      // Create fallback implementation if initialization fails
      this.ajv = this.createFallbackValidator();
      this.logWarn('Using fallback schema validator with limited capabilities');
    }
  }
  
  /**
   * Create a simple fallback validator when Ajv fails to initialize
   * This is a simplified implementation that doesn't use code generation
   */
  private createFallbackValidator(): Ajv {
    // Create a minimal Ajv instance or a custom validator
    const fallbackAjv = {
      // Minimal implementation of validate method
      validate: (schema: any, data: any): boolean => {
        try {
          // Basic type validation
          if (schema.type === 'object' && typeof data !== 'object') {
            return false;
          }
          
          if (schema.type === 'array' && !Array.isArray(data)) {
            return false;
          }
          
          if (schema.type === 'string' && typeof data !== 'string') {
            return false;
          }
          
          if (schema.type === 'number' && typeof data !== 'number') {
            return false;
          }
          
          if (schema.type === 'boolean' && typeof data !== 'boolean') {
            return false;
          }
          
          // Required properties for objects
          if (schema.required && schema.type === 'object') {
            for (const prop of schema.required) {
              if (data[prop] === undefined) {
                return false;
              }
            }
          }
          
          // Simple property validation for objects
          if (schema.properties && schema.type === 'object') {
            for (const [propName, propSchema] of Object.entries(schema.properties)) {
              if (data[propName] !== undefined) {
                // Recursive validation for nested properties
                if (!this.ajv.validate(propSchema, data[propName])) {
                  return false;
                }
              }
            }
          }
          
          return true;
        } catch (error) {
          this.logError('Error in fallback validator', {
            error: error instanceof Error ? error.message : String(error)
          });
          return false;
        }
      },
      
      // Compile is just a wrapper around validate in our fallback
      compile: (schema: any) => {
        return (data: any) => this.ajv.validate(schema, data);
      },
      
      // Other required Ajv methods
      addFormat: () => {},
      addKeyword: () => {}
    } as unknown as Ajv;
    
    return fallbackAjv;
  }
  
  /**
   * Validate a configuration system against registered schemas
   * 
   * @param config Configuration system to validate
   * @throws Error if validation fails
   */
  validateConfigSystem(config: ConfigurationSystem): void {
    // Validate base structure
    if (!config._meta) {
      throw new Error('Invalid configuration: missing _meta section');
    }
    
    if (!config.modules) {
      throw new Error('Invalid configuration: missing modules section');
    }

    // Basic validation of system schema
    const systemSchema = {
      type: 'object',
      required: ['_meta', 'modules'],
      properties: {
        _meta: {
          type: 'object',
          required: ['version', 'lastUpdated', 'activeModules'],
          properties: {
            version: { type: 'string' },
            lastUpdated: { type: 'string', format: 'date-time' },
            activeModules: { type: 'array', items: { type: 'string' } }
          }
        },
        modules: { type: 'object' }
      }
    };

    const validate = this.ajv.compile(systemSchema);
    const valid = validate(config);

    if (!valid) {
      const errors = this.formatAjvErrors(validate.errors || []);
      const errorMessage = `Invalid configuration system:\n` +
        errors.map(err => `  ${err.path}: ${err.message}`).join('\n');
      
      this.logError('Configuration system validation failed', { errors });
      throw new Error(errorMessage);
    }
    
    // Validate each module against its own schema
    Object.keys(config.modules).forEach(moduleName => {
      this.validateConfigModule(moduleName, config.modules[moduleName]);
    });

    // Validate cross-module dependencies if any
    this.validateCrossModuleDependencies(config);
  }
  
  /**
   * Validate a single configuration module against its schema
   * 
   * @param moduleName Name of the module
   * @param moduleConfig Module configuration
   * @throws Error if validation fails
   */
  validateConfigModule(moduleName: string, moduleConfig: ConfigModule): void {
    // Check for basic structure
    if (!moduleConfig._meta) {
      throw new Error(`Invalid module configuration for ${moduleName}: missing _meta section`);
    }
    
    if (!moduleConfig.config) {
      throw new Error(`Invalid module configuration for ${moduleName}: missing config section`);
    }
    
    // If the module doesn't have a schema, we can't validate it
    if (!moduleConfig._meta.schema) {
      this.logWarn(`Module ${moduleName} doesn't have a schema, skipping validation`);
      return;
    }
    
    // Get the schema to validate against
    const schema = moduleConfig._meta.schema;
    
    // Process any environment variables in the config
    const processedConfig = this.processEnvironmentVariables(moduleConfig.config);
    
    // Validate with Ajv
    const validate = this.ajv.compile(schema);
    const valid = validate(processedConfig);
    
    if (!valid) {
      const errors = this.formatAjvErrors(validate.errors || []);
      const errorMessage = `Configuration for module ${moduleName} fails validation:\n` +
        errors.map(err => `  ${err.path}: ${err.message}`).join('\n');
      
      this.logError(`Validation failed for module ${moduleName}`, { 
        errors,
        moduleName
      });
      
      throw new Error(errorMessage);
    }
  }
  
  /**
   * Validate a module configuration value against a schema
   * 
   * @param moduleName Name of the module
   * @param config Configuration object
   * @param schema Schema to validate against
   * @throws Error if validation fails
   */
  validateModuleConfig(moduleName: string, config: Record<string, any>, schema: Record<string, any>): void {
    // If no schema, we can't validate
    if (!schema) {
      this.logWarn(`No schema provided for module ${moduleName}, skipping validation`);
      return;
    }
    
    // Process any environment variables in the config
    const processedConfig = this.processEnvironmentVariables(config);
    
    // Validate with Ajv
    const validate = this.ajv.compile(schema);
    const valid = validate(processedConfig);
    
    if (!valid) {
      const errors = this.formatAjvErrors(validate.errors || []);
      const errorMessage = `Configuration for module ${moduleName} fails validation:\n` +
        errors.map(err => `  ${err.path}: ${err.message}`).join('\n');
      
      this.logError(`Validation failed for module ${moduleName}`, { 
        errors,
        moduleName
      });
      
      throw new Error(errorMessage);
    }
  }

  /**
   * Validate cross-module dependencies
   * 
   * @param config Complete configuration system
   * @throws Error if validation fails
   */
  private validateCrossModuleDependencies(config: ConfigurationSystem): void {
    // This is a simple example. In a real implementation, you might have
    // specific dependency rules to check between modules.
    
    // Example: if monitoring module is present, it might require security module
    if (config.modules.monitoring && !config.modules.security) {
      this.logWarn('Module "monitoring" typically depends on "security" module, but it is not present');
    }
    
    // Example: check if all referenced modules in dependencies exist
    for (const [moduleName, moduleData] of Object.entries(config.modules)) {
      if (moduleData._meta.moduleDependencies) {
        const dependencies = moduleData._meta.moduleDependencies as string[];
        for (const dependency of dependencies) {
          if (!config.modules[dependency]) {
            throw new Error(`Module "${moduleName}" depends on "${dependency}" which is not present in the configuration`);
          }
        }
      }
    }
  }
  
  /**
   * Process environment variables in configuration
   * 
   * Replaces ${ENV_VAR} patterns with their actual values from environment
   * 
   * @param config Configuration object
   * @returns Processed configuration with environment variables replaced
   */
  private processEnvironmentVariables(config: any): any {
    if (config === null || config === undefined) {
      return config;
    }
    
    // Handle primitive types
    if (typeof config !== 'object') {
      if (typeof config === 'string') {
        return this.replaceEnvVar(config);
      }
      return config;
    }
    
    // Handle arrays
    if (Array.isArray(config)) {
      return config.map(item => this.processEnvironmentVariables(item));
    }
    
    // Handle objects
    const result: Record<string, any> = {};
    for (const [key, value] of Object.entries(config)) {
      result[key] = this.processEnvironmentVariables(value);
    }
    
    return result;
  }
  
  /**
   * Replace environment variables in a string
   * 
   * @param value String value to process
   * @returns String with environment variables replaced
   */
  private replaceEnvVar(value: string): string {
    if (typeof value !== 'string') {
      return value;
    }
    
    const envPattern = /\${([A-Za-z0-9_]+)}/g;
    
    return value.replace(envPattern, (match, envName) => {
      // In a Cloudflare Worker environment, we would use env directly
      // This is just a placeholder - in a real implementation you would
      // need to access your actual environment variables
      
      // For the validation phase, we'll replace with a placeholder
      // and warn about usage of environment variables
      this.logDebug(`Environment variable usage detected: ${envName}`);
      return `[ENV:${envName}]`;
    });
  }
  
  /**
   * Format Ajv errors into our ValidationError format
   * 
   * @param errors Ajv error objects
   * @returns Formatted validation errors
   */
  private formatAjvErrors(errors: any[]): ValidationError[] {
    return errors.map(error => {
      const path = error.instancePath || '';
      const cleanPath = path.startsWith('/') ? path.substring(1).replace(/\//g, '.') : path;
      
      return {
        path: cleanPath,
        message: error.message || 'Unknown validation error',
        params: error.params || {}
      };
    });
  }
  
  /**
   * Add custom validation keywords to Ajv
   */
  private addCustomKeywords(): void {
    // Example: Add a custom keyword for module dependencies
    this.ajv.addKeyword({
      keyword: 'moduleDependencies',
      validate: function(schema: string[], data: any) {
        // This is just a metadata keyword, not used for validation directly
        return true;
      },
      metaSchema: {
        type: 'array',
        items: { type: 'string' }
      }
    });
    
    // Example: Add a custom keyword for feature flags
    this.ajv.addKeyword({
      keyword: 'featureFlag',
      validate: function(schema: string, data: any) {
        // This is just a metadata keyword, not used for validation directly
        return true;
      },
      metaSchema: { type: 'string' }
    });
  }
  
  /**
   * Log a debug message
   * 
   * @param message Message to log
   * @param data Optional data to include
   */
  private logDebug(message: string, data?: Record<string, any>): void {
    if (this.logger) {
      this.logger.debug(message, data);
    } else if (typeof console !== 'undefined') {
      console.debug(message, data);
    }
  }
  
  /**
   * Log an info message
   * 
   * @param message Message to log
   * @param data Optional data to include
   */
  private logInfo(message: string, data?: Record<string, any>): void {
    if (this.logger) {
      this.logger.info(message, data);
    } else if (typeof console !== 'undefined') {
      console.info(message, data);
    }
  }
  
  /**
   * Log a warning message
   * 
   * @param message Message to log
   * @param data Optional data to include
   */
  private logWarn(message: string, data?: Record<string, any>): void {
    if (this.logger) {
      this.logger.warn(message, data);
    } else if (typeof console !== 'undefined') {
      console.warn(message, data);
    }
  }
  
  /**
   * Log an error message
   * 
   * @param message Message to log
   * @param data Optional data to include
   */
  private logError(message: string, data?: Record<string, any>): void {
    if (this.logger) {
      this.logger.error(message, data);
    } else if (typeof console !== 'undefined') {
      console.error(message, data);
    }
  }
}