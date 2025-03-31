/**
 * Lightweight JSON Schema Validator for Configuration
 * 
 * This module provides a simple, lightweight schema validation for configuration objects
 * designed specifically for Cloudflare Workers. It does not use code generation or eval,
 * making it compatible with security-restricted environments.
 */

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
 * Lightweight schema validator designed for Cloudflare Workers environment
 * 
 * This validator does not rely on code generation and is compatible with
 * environments that restrict dynamic code creation.
 */
export class SchemaValidator {
  private logger?: Logger;
  private errors: ValidationError[] = [];
  
  /**
   * Create a new schema validator
   * 
   * @param logger Optional logger
   */
  constructor(logger?: Logger) {
    this.logger = logger;
    
    if (this.logger) {
      this.logger.breadcrumb('Initializing lightweight schema validator');
    }
    
    this.logDebug('Schema validator initialized in lightweight mode - compatible with Cloudflare Workers');
  }
  
  /**
   * Validate a configuration system against registered schemas
   * 
   * @param config Configuration system to validate
   * @throws Error if validation fails
   */
  validateConfigSystem(config: ConfigurationSystem): void {
    this.errors = [];
    
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

    const valid = this.validateObject('', config, systemSchema);

    if (!valid) {
      const errorMessage = `Invalid configuration system:\n` +
        this.errors.map(err => `  ${err.path}: ${err.message}`).join('\n');
      
      this.logError('Configuration system validation failed', { errors: this.errors });
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
   * @param fallbackSchema Optional schema to use if the module doesn't have one
   * @throws Error if validation fails
   */
  validateConfigModule(moduleName: string, moduleConfig: ConfigModule, fallbackSchema?: Record<string, any>): void {
    this.errors = [];
    
    // Check for basic structure
    if (!moduleConfig._meta) {
      throw new Error(`Invalid module configuration for ${moduleName}: missing _meta section`);
    }
    
    if (!moduleConfig.config) {
      throw new Error(`Invalid module configuration for ${moduleName}: missing config section`);
    }
    
    // Get schema to validate against, with fallback options
    let schema = moduleConfig._meta.schema || fallbackSchema;
    
    // If no schema is available, perform basic type validation only
    if (!schema) {
      this.logDebug(`Module ${moduleName} doesn't have a schema, performing basic validation only`);
      
      // Basic schema that just ensures config is an object
      schema = {
        type: 'object',
        additionalProperties: true
      };
    }
    
    // Process any environment variables in the config
    const processedConfig = this.processEnvironmentVariables(moduleConfig.config);
    
    // Validate with our lightweight validator
    const valid = this.validateObject('', processedConfig, schema);
    
    if (!valid) {
      const errorMessage = `Configuration for module ${moduleName} fails validation:\n` +
        this.errors.map(err => `  ${err.path}: ${err.message}`).join('\n');
      
      this.logError(`Validation failed for module ${moduleName}`, { 
        errors: this.errors,
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
    this.errors = [];
    
    // If no schema, we can't validate
    if (!schema) {
      this.logWarn(`No schema provided for module ${moduleName}, skipping validation`);
      return;
    }
    
    // Process any environment variables in the config
    const processedConfig = this.processEnvironmentVariables(config);
    
    // Validate with our lightweight validator
    const valid = this.validateObject('', processedConfig, schema);
    
    if (!valid || this.errors.length > 0) {
      const errorMessage = `Configuration for module ${moduleName} fails validation:\n` +
        this.errors.map(err => `  ${err.path}: ${err.message}`).join('\n');
      
      this.logError(`Validation failed for module ${moduleName}`, { 
        errors: this.errors,
        moduleName
      });
      
      throw new Error(errorMessage);
    }
  }

  /**
   * Validate an object against a schema
   * 
   * @param path Current path in the object (for error reporting)
   * @param value Value to validate
   * @param schema Schema to validate against
   * @returns Whether the validation succeeded
   */
  private validateObject(path: string, value: any, schema: any): boolean {
    // Handle null values early
    if (value === null) {
      if (schema.type && schema.type !== 'null' && 
          (!Array.isArray(schema.type) || !schema.type.includes('null'))) {
        this.addError(path, `Expected type ${schema.type}, got null`);
        return false;
      }
      return true;
    }
    
    // Validate value is actually an object if schema expects an object
    if (schema.type === 'object' && (typeof value !== 'object' || Array.isArray(value))) {
      this.addError(path, `Expected object, got ${Array.isArray(value) ? 'array' : typeof value}`);
      return false;
    }
    
    // Check type constraints first
    if (schema.type && !this.validateType(path, value, schema.type)) {
      return false;
    }
    
    // Check required properties
    if (schema.required && Array.isArray(schema.required)) {
      for (const requiredProp of schema.required) {
        if (value[requiredProp] === undefined) {
          this.addError(path, `Missing required property: ${requiredProp}`);
          return false;
        }
      }
    }
    
    // Check enum values
    if (schema.enum && Array.isArray(schema.enum) && !schema.enum.includes(value)) {
      this.addError(path, `Value must be one of: ${schema.enum.join(', ')}`);
      return false;
    }
    
    // Check minimum/maximum for numbers
    if (typeof value === 'number') {
      if (schema.minimum !== undefined && value < schema.minimum) {
        this.addError(path, `Value must be >= ${schema.minimum}`);
        return false;
      }
      
      if (schema.maximum !== undefined && value > schema.maximum) {
        this.addError(path, `Value must be <= ${schema.maximum}`);
        return false;
      }
      
      // For integers, check that the value is actually an integer
      if (schema.type === 'integer' && !Number.isInteger(value)) {
        this.addError(path, `Value must be an integer`);
        return false;
      }
    }
    
    // Check string-specific constraints
    if (typeof value === 'string') {
      if (schema.minLength !== undefined && value.length < schema.minLength) {
        this.addError(path, `String length must be >= ${schema.minLength}`);
        return false;
      }
      
      if (schema.maxLength !== undefined && value.length > schema.maxLength) {
        this.addError(path, `String length must be <= ${schema.maxLength}`);
        return false;
      }
      
      // Check pattern
      if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
        this.addError(path, `String must match pattern: ${schema.pattern}`);
        return false;
      }
      
      // Check format
      if (schema.format && !this.validateFormat(path, value, schema.format)) {
        return false;
      }
    }
    
    // Check array-specific constraints
    if (Array.isArray(value)) {
      if (schema.minItems !== undefined && value.length < schema.minItems) {
        this.addError(path, `Array length must be >= ${schema.minItems}`);
        return false;
      }
      
      if (schema.maxItems !== undefined && value.length > schema.maxItems) {
        this.addError(path, `Array length must be <= ${schema.maxItems}`);
        return false;
      }
      
      // Validate array items if schema includes item definition
      if (schema.items) {
        for (let i = 0; i < value.length; i++) {
          const itemPath = path ? `${path}.${i}` : `${i}`;
          if (!this.validateValue(itemPath, value[i], schema.items)) {
            return false;
          }
        }
      }
    }
    
    // Object property validation for regular objects (not arrays, not null)
    if (typeof value === 'object' && value !== null && !Array.isArray(value) && schema.properties) {
      // Validate each defined property
      for (const [propName, propSchema] of Object.entries(schema.properties)) {
        // Skip properties that don't exist in the value (required properties are checked separately)
        if (value[propName] === undefined) {
          continue;
        }
        
        const propPath = path ? `${path}.${propName}` : propName;
        if (!this.validateValue(propPath, value[propName], propSchema)) {
          return false;
        }
      }
      
      // Check if additional properties are allowed
      if (schema.additionalProperties === false) {
        const schemaProps = Object.keys(schema.properties || {});
        const extraProps = Object.keys(value).filter(prop => !schemaProps.includes(prop));
        
        if (extraProps.length > 0) {
          this.addError(path, `Additional properties not allowed: ${extraProps.join(', ')}`);
          return false;
        }
      } else if (typeof schema.additionalProperties === 'object') {
        // Validate additional properties against additionalProperties schema
        const schemaProps = Object.keys(schema.properties || {});
        for (const [propName, propValue] of Object.entries(value)) {
          if (!schemaProps.includes(propName)) {
            const propPath = path ? `${path}.${propName}` : propName;
            if (!this.validateValue(propPath, propValue, schema.additionalProperties)) {
              return false;
            }
          }
        }
      }
    }
    
    return true;
  }
  
  /**
   * Validate a value against a schema
   * 
   * @param path Current path (for error reporting)
   * @param value Value to validate
   * @param schema Schema to validate against
   * @returns Whether the validation succeeded
   */
  private validateValue(path: string, value: any, schema: any): boolean {
    // If schema is empty, validation passes
    if (!schema || Object.keys(schema).length === 0) {
      return true;
    }
    
    // Handle anyOf, oneOf, allOf
    if (schema.anyOf && Array.isArray(schema.anyOf)) {
      return this.validateAnyOf(path, value, schema.anyOf);
    }
    
    if (schema.oneOf && Array.isArray(schema.oneOf)) {
      return this.validateOneOf(path, value, schema.oneOf);
    }
    
    if (schema.allOf && Array.isArray(schema.allOf)) {
      return this.validateAllOf(path, value, schema.allOf);
    }
    
    // Check constants
    if (schema.const !== undefined) {
      if (value !== schema.const) {
        this.addError(path, `Value must be exactly: ${JSON.stringify(schema.const)}`);
        return false;
      }
      return true;
    }
    
    // Check enum values
    if (schema.enum && Array.isArray(schema.enum)) {
      if (!schema.enum.some((enumValue: any) => this.areValuesEqual(value, enumValue))) {
        this.addError(path, `Value must be one of: ${schema.enum.map((e: any) => JSON.stringify(e)).join(', ')}`);
        return false;
      }
      return true;
    }
    
    // If this is a simple type definition, validate type
    if (schema.type) {
      if (!this.validateType(path, value, schema.type)) {
        return false;
      }
    }
    
    // Validate based on value type and constraints
    if (typeof value === 'number') {
      if (!this.validateNumberConstraints(path, value, schema)) {
        return false;
      }
    } else if (typeof value === 'string') {
      if (!this.validateStringConstraints(path, value, schema)) {
        return false;
      }
    } else if (Array.isArray(value)) {
      if (!this.validateArrayConstraints(path, value, schema)) {
        return false;
      }
    } else if (typeof value === 'object' && value !== null) {
      // If this is an object schema, validate object
      if (schema.properties || schema.required || schema.additionalProperties !== undefined) {
        if (!this.validateObject(path, value, schema)) {
          return false;
        }
      }
    }
    
    return true;
  }
  
  /**
   * Check if two values are equal (handling special cases like NaN)
   * 
   * @param a First value
   * @param b Second value
   * @returns Whether the values are equal
   */
  private areValuesEqual(a: any, b: any): boolean {
    if (a === b) {
      return true;
    }
    
    if (typeof a === 'number' && typeof b === 'number' && isNaN(a) && isNaN(b)) {
      return true;
    }
    
    return false;
  }
  
  /**
   * Validate number-specific constraints
   * 
   * @param path Current path
   * @param value Number value
   * @param schema Schema with constraints
   * @returns Whether validation succeeded
   */
  private validateNumberConstraints(path: string, value: number, schema: any): boolean {
    if (schema.multipleOf !== undefined && value % schema.multipleOf !== 0) {
      this.addError(path, `Value must be a multiple of ${schema.multipleOf}`);
      return false;
    }
    
    if (schema.maximum !== undefined) {
      if (schema.exclusiveMaximum === true && value >= schema.maximum) {
        this.addError(path, `Value must be < ${schema.maximum}`);
        return false;
      } else if (value > schema.maximum) {
        this.addError(path, `Value must be <= ${schema.maximum}`);
        return false;
      }
    }
    
    if (schema.exclusiveMaximum !== undefined && typeof schema.exclusiveMaximum === 'number' && value >= schema.exclusiveMaximum) {
      this.addError(path, `Value must be < ${schema.exclusiveMaximum}`);
      return false;
    }
    
    if (schema.minimum !== undefined) {
      if (schema.exclusiveMinimum === true && value <= schema.minimum) {
        this.addError(path, `Value must be > ${schema.minimum}`);
        return false;
      } else if (value < schema.minimum) {
        this.addError(path, `Value must be >= ${schema.minimum}`);
        return false;
      }
    }
    
    if (schema.exclusiveMinimum !== undefined && typeof schema.exclusiveMinimum === 'number' && value <= schema.exclusiveMinimum) {
      this.addError(path, `Value must be > ${schema.exclusiveMinimum}`);
      return false;
    }
    
    return true;
  }
  
  /**
   * Validate string-specific constraints
   * 
   * @param path Current path
   * @param value String value
   * @param schema Schema with constraints
   * @returns Whether validation succeeded
   */
  private validateStringConstraints(path: string, value: string, schema: any): boolean {
    if (schema.minLength !== undefined && value.length < schema.minLength) {
      this.addError(path, `String length must be >= ${schema.minLength}`);
      return false;
    }
    
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      this.addError(path, `String length must be <= ${schema.maxLength}`);
      return false;
    }
    
    if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
      this.addError(path, `String must match pattern: ${schema.pattern}`);
      return false;
    }
    
    if (schema.format && !this.validateFormat(path, value, schema.format)) {
      return false;
    }
    
    return true;
  }
  
  /**
   * Validate array-specific constraints
   * 
   * @param path Current path
   * @param value Array value
   * @param schema Schema with constraints
   * @returns Whether validation succeeded
   */
  private validateArrayConstraints(path: string, value: any[], schema: any): boolean {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      this.addError(path, `Array length must be >= ${schema.minItems}`);
      return false;
    }
    
    if (schema.maxItems !== undefined && value.length > schema.maxItems) {
      this.addError(path, `Array length must be <= ${schema.maxItems}`);
      return false;
    }
    
    if (schema.uniqueItems === true) {
      // Simple check for primitive values
      if (new Set(value).size !== value.length) {
        this.addError(path, 'Array items must be unique');
        return false;
      }
    }
    
    // Validate items based on schema
    if (schema.items) {
      if (Array.isArray(schema.items)) {
        // Tuple validation (positional items validation)
        for (let i = 0; i < Math.min(value.length, schema.items.length); i++) {
          const itemPath = path ? `${path}.${i}` : `${i}`;
          if (!this.validateValue(itemPath, value[i], schema.items[i])) {
            return false;
          }
        }
        
        // Check additional items if defined
        if (value.length > schema.items.length) {
          if (schema.additionalItems === false) {
            this.addError(path, `Array must not have more than ${schema.items.length} items`);
            return false;
          } else if (schema.additionalItems && typeof schema.additionalItems === 'object') {
            for (let i = schema.items.length; i < value.length; i++) {
              const itemPath = path ? `${path}.${i}` : `${i}`;
              if (!this.validateValue(itemPath, value[i], schema.additionalItems)) {
                return false;
              }
            }
          }
        }
      } else {
        // All items must validate against the same schema
        for (let i = 0; i < value.length; i++) {
          const itemPath = path ? `${path}.${i}` : `${i}`;
          if (!this.validateValue(itemPath, value[i], schema.items)) {
            return false;
          }
        }
      }
    }
    
    // Validate items against "contains" schema
    if (schema.contains && typeof schema.contains === 'object') {
      let containsValid = false;
      for (let i = 0; i < value.length; i++) {
        // Store errors temporarily since we need one item to validate successfully
        const tempErrors = [...this.errors];
        if (this.validateValue(`${path}[${i}]`, value[i], schema.contains)) {
          containsValid = true;
          this.errors = tempErrors;
          break;
        }
        this.errors = tempErrors;
      }
      
      if (!containsValid) {
        this.addError(path, 'Array must contain at least one item matching the schema');
        return false;
      }
    }
    
    return true;
  }
  
  /**
   * Validate a value against a type
   * 
   * @param path Current path (for error reporting)
   * @param value Value to validate
   * @param type Type to validate against
   * @returns Whether the validation succeeded
   */
  private validateType(path: string, value: any, type: string | string[]): boolean {
    const types = Array.isArray(type) ? type : [type];
    
    for (const t of types) {
      switch (t) {
        case 'string':
          if (typeof value === 'string') return true;
          break;
        case 'number':
          if (typeof value === 'number' && !isNaN(value)) return true;
          break;
        case 'integer':
          if (typeof value === 'number' && !isNaN(value) && Number.isInteger(value)) return true;
          break;
        case 'boolean':
          if (typeof value === 'boolean') return true;
          break;
        case 'array':
          if (Array.isArray(value)) return true;
          break;
        case 'object':
          if (typeof value === 'object' && value !== null && !Array.isArray(value)) return true;
          break;
        case 'null':
          if (value === null) return true;
          break;
      }
    }
    
    // Include the actual value in the error message to help debugging
    const valueType = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
    const valueStr = typeof value === 'object' ? JSON.stringify(value) : String(value);
    this.addError(path, `Expected type ${types.join(' or ')}, got ${valueType} (${valueStr})`);
    return false;
  }
  
  /**
   * Validate a value against an anyOf schema
   * 
   * @param path Current path (for error reporting)
   * @param value Value to validate
   * @param schemas Schemas to validate against
   * @returns Whether the validation succeeded
   */
  private validateAnyOf(path: string, value: any, schemas: any[]): boolean {
    // Remember original errors
    const originalErrors = [...this.errors];
    let allErrors: ValidationError[] = [];
    
    for (const schema of schemas) {
      // Reset errors for this schema validation
      this.errors = [];
      
      if (this.validateValue(path, value, schema)) {
        // Restore original errors and return true
        this.errors = originalErrors;
        return true;
      }
      
      // Collect errors from this failed validation
      allErrors = allErrors.concat(this.errors.map(err => ({
        ...err,
        message: `[anyOf option] ${err.message}`
      })));
    }
    
    // None of the schemas matched
    this.errors = originalErrors;
    this.addError(path, 'Value does not match any of the required schemas');
    
    // Add detailed errors from all failed validations
    this.errors = this.errors.concat(allErrors);
    return false;
  }
  
  /**
   * Validate a value against a oneOf schema
   * 
   * @param path Current path (for error reporting)
   * @param value Value to validate
   * @param schemas Schemas to validate against
   * @returns Whether the validation succeeded
   */
  private validateOneOf(path: string, value: any, schemas: any[]): boolean {
    const originalErrors = [...this.errors];
    let validCount = 0;
    let validIndex = -1;
    let allErrors: ValidationError[] = [];
    
    for (let i = 0; i < schemas.length; i++) {
      // Reset errors for this schema validation
      this.errors = [];
      
      if (this.validateValue(path, value, schemas[i])) {
        validCount++;
        validIndex = i;
      } else {
        // Collect errors from this failed validation
        allErrors = allErrors.concat(this.errors.map(err => ({
          ...err,
          message: `[oneOf option ${i}] ${err.message}`
        })));
      }
    }
    
    // Restore original errors
    this.errors = originalErrors;
    
    if (validCount === 1) {
      return true;
    }
    
    if (validCount === 0) {
      this.addError(path, 'Value does not match any of the required oneOf schemas');
      // Add detailed errors from all failed validations
      this.errors = this.errors.concat(allErrors);
    } else {
      this.addError(path, `Value matches ${validCount} schemas when it should match exactly 1`);
      
      // Add indices of matched schemas
      const matchedIndices = [];
      for (let i = 0; i < schemas.length; i++) {
        this.errors = [];
        if (this.validateValue(path, value, schemas[i])) {
          matchedIndices.push(i);
        }
      }
      
      this.errors = originalErrors;
      this.addError(path, `Value matched schemas at indices: ${matchedIndices.join(', ')}`);
    }
    
    return false;
  }
  
  /**
   * Validate a value against an allOf schema
   * 
   * @param path Current path (for error reporting)
   * @param value Value to validate
   * @param schemas Schemas to validate against
   * @returns Whether the validation succeeded
   */
  private validateAllOf(path: string, value: any, schemas: any[]): boolean {
    const originalErrors = [...this.errors];
    
    for (let i = 0; i < schemas.length; i++) {
      if (!this.validateValue(path, value, schemas[i])) {
        // Prefix errors with schema index for clarity
        this.errors = this.errors.map(err => ({
          ...err,
          message: `[allOf ${i}] ${err.message}`
        }));
        
        // Add a summary error
        this.errors.unshift({
          path,
          message: `Failed to validate against allOf schema at index ${i}`
        });
        
        return false;
      }
    }
    
    return true;
  }
  
  /**
   * Validate a string against a format
   * 
   * @param path Current path (for error reporting)
   * @param value Value to validate
   * @param format Format to validate against
   * @returns Whether the validation succeeded
   */
  private validateFormat(path: string, value: string, format: string): boolean {
    // Make sure we're working with a string
    if (typeof value !== 'string') {
      this.addError(path, `Format validation requires a string value, got ${typeof value}`);
      return false;
    }
    
    switch (format) {
      case 'date-time': {
        // ISO date-time validation
        const dateTimeRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;
        if (!dateTimeRegex.test(value)) {
          this.addError(path, 'Must be a valid ISO 8601 date-time (YYYY-MM-DDThh:mm:ssZ)');
          return false;
        }
        
        // Additional validation to ensure date parts are valid
        try {
          const date = new Date(value);
          if (isNaN(date.getTime())) {
            this.addError(path, 'Date-time string parses to invalid date');
            return false; 
          }
        } catch (e) {
          this.addError(path, 'Date-time string could not be parsed');
          return false;
        }
        break;
      }
      
      case 'date': {
        // ISO date validation
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(value)) {
          this.addError(path, 'Must be a valid ISO 8601 date (YYYY-MM-DD)');
          return false;
        }
        
        // Validate date parts
        const [year, month, day] = value.split('-').map(Number);
        if (month < 1 || month > 12 || day < 1 || day > 31) {
          this.addError(path, 'Date contains invalid month or day values');
          return false;
        }
        break;
      }
      
      case 'time': {
        // ISO time validation
        const timeRegex = /^\d{2}:\d{2}:\d{2}(\.\d+)?$/;
        if (!timeRegex.test(value)) {
          this.addError(path, 'Must be a valid ISO 8601 time (hh:mm:ss)');
          return false;
        }
        
        // Validate time parts
        const [hours, minutes, seconds] = value.split(':').map(v => parseInt(v, 10));
        if (hours > 23 || minutes > 59 || seconds > 59) {
          this.addError(path, 'Time contains invalid hour, minute, or second values');
          return false;
        }
        break;
      }
      
      case 'email': {
        // Email validation - stricter than just @ check
        // This is a simplified regex - RFC 5322 compliant regex would be much longer
        const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
        if (!emailRegex.test(value)) {
          this.addError(path, 'Must be a valid email address');
          return false;
        }
        break;
      }
      
      case 'ipv4': {
        // IPv4 validation with proper range checking
        const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
        const match = value.match(ipv4Regex);
        if (!match) {
          this.addError(path, 'Must be a valid IPv4 address (x.x.x.x)');
          return false;
        }
        
        // Check octet ranges (0-255)
        for (let i = 1; i <= 4; i++) {
          const octet = parseInt(match[i], 10);
          if (octet < 0 || octet > 255) {
            this.addError(path, 'IPv4 address contains octets outside valid range (0-255)');
            return false;
          }
        }
        break;
      }
      
      case 'uri': {
        // Special handling for environment variables in URIs
        if (value.includes('${') && value.includes('}')) {
          // Check for common protocol typos in URIs with environment variables
          if (value.match(/^h{2,}ttps?:\/\//)) {
            this.addError(path, `URI contains typo in protocol (${value.split('://')[0]}://)`);
            return false;
          }
          
          // Basic validation for URIs with environment variables
          const isValid = /^(https?|ftp|file):\/\/.*/.test(value) || 
                         /^\${[A-Za-z0-9_]+}.*/.test(value);
          
          if (!isValid) {
            this.addError(path, 'Must be a valid URI format even with environment variables');
            return false;
          }
          
          // Consider it valid if it has a proper structure with env vars
          return true;
        }
        
        // Standard URI validation using URL constructor
        try {
          new URL(value);
          
          // Additional check for common protocol typos
          if (value.match(/^h{2,}ttps?:\/\//)) {
            this.addError(path, `URI contains typo in protocol (${value.split('://')[0]}://)`);
            return false;
          }
        } catch (e) {
          this.addError(path, `Must be a valid URI (e.g., https://example.com): ${e instanceof Error ? e.message : String(e)}`);
          return false;
        }
        break;
      }
      
      case 'uuid': {
        // UUID validation
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(value)) {
          this.addError(path, 'Must be a valid UUID');
          return false;
        }
        break;
      }
      
      case 'hostname': {
        // Hostname validation
        const hostnameRegex = /^(([a-zA-Z0-9]|[a-zA-Z0-9][a-zA-Z0-9\-]*[a-zA-Z0-9])\.)*([A-Za-z0-9]|[A-Za-z0-9][A-Za-z0-9\-]*[A-Za-z0-9])$/;
        if (!hostnameRegex.test(value)) {
          this.addError(path, 'Must be a valid hostname');
          return false;
        }
        break;
      }
      
      case 'env-var': {
        // Environment variable reference format
        const envVarRegex = /^\${[A-Za-z0-9_]+}$/;
        if (!envVarRegex.test(value)) {
          this.addError(path, 'Must be a valid environment variable reference (e.g., ${ENV_NAME})');
          return false;
        }
        break;
      }
      
      default:
        // Log warning but don't fail validation for unknown formats
        this.logWarn(`Unknown format: ${format}, skipping validation for ${path}`);
    }
    
    return true;
  }
  
  /**
   * Add a validation error
   * 
   * @param path Path where the error occurred
   * @param message Error message
   * @param params Optional error parameters
   */
  private addError(path: string, message: string, params?: Record<string, any>): void {
    // Format the path for better readability
    const formattedPath = path.length > 0 ? path : 'root';
    
    // Add context to the message if params are provided
    let contextualMessage = message;
    if (params?.expectedType && params?.actualType) {
      contextualMessage += ` (expected ${params.expectedType}, got ${params.actualType})`;
    }
    if (params?.value !== undefined) {
      // Safely stringify the value
      let valueStr;
      try {
        valueStr = typeof params.value === 'object' 
          ? JSON.stringify(params.value) 
          : String(params.value);
        
        // Truncate long values
        if (valueStr.length > 100) {
          valueStr = valueStr.substring(0, 97) + '...';
        }
      } catch (e) {
        valueStr = '[Complex Value]';
      }
      
      contextualMessage += ` - Value: ${valueStr}`;
    }
    
    this.errors.push({
      path: formattedPath,
      message: contextualMessage,
      params
    });
    
    // Log the error for debugging
    this.logDebug(`Validation error at ${formattedPath}: ${contextualMessage}`);
  }

  /**
   * Validate cross-module dependencies
   * 
   * @param config Complete configuration system
   * @throws Error if validation fails
   */
  private validateCrossModuleDependencies(config: ConfigurationSystem): void {
    this.logDebug('Validating cross-module dependencies');
    const missingDependencies: Array<{module: string, dependency: string}> = [];
    const inactiveModules: Array<{module: string, dependency: string}> = [];
    
    // Check if all referenced modules in dependencies exist and are active
    for (const [moduleName, moduleData] of Object.entries(config.modules)) {
      if (moduleData._meta.moduleDependencies && Array.isArray(moduleData._meta.moduleDependencies)) {
        const dependencies = moduleData._meta.moduleDependencies as string[];
        
        for (const dependency of dependencies) {
          // Check if the dependency exists
          if (!config.modules[dependency]) {
            missingDependencies.push({module: moduleName, dependency});
            continue;
          }
          
          // Check if the dependency is active (listed in activeModules)
          if (!config._meta.activeModules.includes(dependency)) {
            inactiveModules.push({module: moduleName, dependency});
          }
        }
      }
    }
    
    // Report missing dependencies
    if (missingDependencies.length > 0) {
      const errorMessages = missingDependencies.map(
        ({module, dependency}) => `Module "${module}" depends on "${dependency}" which is not present in the configuration`
      );
      
      this.logError('Missing dependencies detected', { missingDependencies });
      throw new Error(`Cross-module dependency validation failed:\n${errorMessages.join('\n')}`);
    }
    
    // Warn about inactive dependencies
    if (inactiveModules.length > 0) {
      const warningMessages = inactiveModules.map(
        ({module, dependency}) => `Module "${module}" depends on "${dependency}" which is present but not active`
      );
      
      this.logWarn(`Some dependencies are inactive: ${warningMessages.join(', ')}`);
    }
    
    // Recommended module dependencies
    const recommendedDependencies: Record<string, string[]> = {
      'monitoring': ['security'],
      'cache': ['core'],
      'transform': ['core'],
      'storage': ['core']
    };
    
    // Check recommended dependencies
    for (const [module, dependencies] of Object.entries(recommendedDependencies)) {
      if (config.modules[module]) {
        for (const dependency of dependencies) {
          if (!config.modules[dependency]) {
            this.logWarn(`Module "${module}" typically depends on "${dependency}" module, but it is not present`);
          }
        }
      }
    }
    
    this.logDebug('Cross-module dependency validation completed');
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
    
    // Match both ${VAR_NAME} and $VAR_NAME patterns
    const envPattern = /\${([A-Za-z0-9_]+)}|\$([A-Za-z0-9_]+)/g;
    let envVarsFound = false;
    
    const result = value.replace(envPattern, (match, bracketEnvName, simpleName) => {
      const envName = bracketEnvName || simpleName;
      envVarsFound = true;
      
      // In a Cloudflare Worker environment, we would use env directly
      // For validation purposes, we just replace with a placeholder
      this.logDebug(`Environment variable usage detected: ${envName}`);
      return `[ENV:${envName}]`;
    });
    
    // If environment variables were found, add additional debug info
    if (envVarsFound) {
      this.logDebug(`String with environment variables: "${value}" → "${result}"`);
    }
    
    return result;
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