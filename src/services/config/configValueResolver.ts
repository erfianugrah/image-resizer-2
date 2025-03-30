/**
 * Configuration Value Resolver
 * 
 * This utility handles the resolution of configuration values,
 * including environment variable interpolation.
 */

import { Logger } from '../../utils/logging';

/**
 * Resolver for configuration values with environment variable interpolation
 */
export class ConfigValueResolver {
  private logger?: Logger;
  private env?: Record<string, string>;
  
  /**
   * Create a new configuration value resolver
   * 
   * @param env Optional environment variables object
   * @param logger Optional logger
   */
  constructor(env?: Record<string, string>, logger?: Logger) {
    this.env = env;
    this.logger = logger;
  }
  
  /**
   * Resolve a configuration value, replacing environment variables
   * 
   * @param value The value to resolve
   * @returns The resolved value
   */
  resolveValue<T>(value: T): T {
    return this.processValue(value);
  }
  
  /**
   * Process a value, recursively handling objects and arrays
   * 
   * @param value The value to process
   * @returns The processed value
   */
  private processValue<T>(value: T): T {
    if (value === null || value === undefined) {
      return value;
    }
    
    // Handle string values with environment variables
    if (typeof value === 'string') {
      return this.resolveEnvVars(value) as unknown as T;
    }
    
    // Handle arrays
    if (Array.isArray(value)) {
      return value.map(item => this.processValue(item)) as unknown as T;
    }
    
    // Handle objects
    if (typeof value === 'object') {
      const result: Record<string, any> = {};
      
      for (const [key, val] of Object.entries(value as Record<string, any>)) {
        result[key] = this.processValue(val);
      }
      
      return result as unknown as T;
    }
    
    // Return primitive values as-is
    return value;
  }
  
  /**
   * Resolve environment variables in a string
   * 
   * Replaces ${ENV_VAR} patterns with their values from the environment
   * 
   * @param value String value that may contain environment variables
   * @returns String with environment variables replaced
   */
  private resolveEnvVars(value: string): string {
    if (typeof value !== 'string') {
      return value;
    }
    
    const envPattern = /\${([A-Za-z0-9_]+)}/g;
    
    return value.replace(envPattern, (match, envName) => {
      // If we don't have an environment object, log a warning and return placeholder
      if (!this.env) {
        this.logWarn(`No environment provided for resolving ${envName}`);
        return `[ENV:${envName}]`;
      }
      
      const envValue = this.env[envName];
      
      if (envValue === undefined) {
        // Check if this is a sensitive variable by its name pattern
        const isSensitiveVar = this.isSensitiveVariable(envName);
        
        this.logWarn(`Environment variable not found: ${envName}`);
        
        // For production environments, provide a more useful fallback for non-sensitive variables
        if (this.env.ENVIRONMENT === 'production') {
          if (isSensitiveVar) {
            // For sensitive data, we don't want to expose the name in production
            return '[MISSING_SECRET]';
          } else {
            // For non-sensitive config, prefer empty string over leaving placeholder text
            return '';
          }
        }
        
        // For non-production, return the descriptive placeholder
        return `[ENV:${envName}]`;
      }
      
      // Mask sensitive variable values in debug logs
      if (this.isSensitiveVariable(envName)) {
        this.logDebug(`Resolved sensitive environment variable: ${envName} (value masked)`);
      } else {
        this.logDebug(`Resolved environment variable: ${envName}`);
      }
      
      return envValue;
    });
  }
  
  /**
   * Check if a variable name appears to contain sensitive information
   * 
   * @param varName Variable name to check
   * @returns True if the variable might contain sensitive data
   */
  private isSensitiveVariable(varName: string): boolean {
    const sensitivePatterns = [
      /key/i,
      /secret/i,
      /token/i,
      /password/i,
      /credential/i,
      /auth/i,
      /api[-_]?key/i,
      /private/i
    ];
    
    return sensitivePatterns.some(pattern => pattern.test(varName));
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
   * Log a warning message
   * 
   * @param message Message to log
   * @param data Optional data to include
   */
  private logWarn(message: string, data?: Record<string, any>): void {
    if (this.logger) {
      this.logger.warn(message);
    } else if (typeof console !== 'undefined') {
      console.warn(message);
    }
  }
}