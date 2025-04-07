/**
 * Test for validating the comprehensive configuration with Zod schema validation
 * 
 * Replaces the old SchemaValidator with Zod, which is now used for configuration validation.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { z } from 'zod';
import { ConfigurationSystem } from '../../../src/services/config/interfaces';
// Import the configuration directly
import comprehensiveConfigData from '../../../docs/public/configuration/examples/comprehensive-config-runnable.json';

// Define a schema for validating configuration modules
const ConfigModuleSchema = z.object({
  _meta: z.object({
    name: z.string(),
    version: z.string(),
    description: z.string().optional(),
    schema: z.record(z.string(), z.any()).optional(),
    defaults: z.record(z.string(), z.any()).optional(),
    moduleDependencies: z.array(z.string()).optional()
  }),
  config: z.record(z.string(), z.any())
});

// Define a schema for the entire configuration system
const ConfigSystemSchema = z.object({
  _meta: z.object({
    version: z.string(),
    lastUpdated: z.string(),
    activeModules: z.array(z.string())
  }),
  modules: z.record(z.string(), ConfigModuleSchema)
});

describe('Comprehensive Configuration Validation', () => {
  let comprehensiveConfig: ConfigurationSystem;

  beforeEach(() => {
    // Use the directly imported configuration
    comprehensiveConfig = comprehensiveConfigData as ConfigurationSystem;
  });
  
  it('should validate the comprehensive configuration structure', () => {
    expect(() => ConfigSystemSchema.parse(comprehensiveConfig)).not.toThrow();
  });
  
  it('should validate each module in the comprehensive configuration', () => {
    for (const [moduleName, moduleConfig] of Object.entries(comprehensiveConfig.modules)) {
      expect(() => {
        ConfigModuleSchema.parse(moduleConfig);
      }).not.toThrow(`Module ${moduleName} failed validation`);
    }
  });
  
  it('should validate URL formats in the configuration', () => {
    // Create a copy of the config to modify
    const modifiedConfig = JSON.parse(JSON.stringify(comprehensiveConfig));
    
    // Extract the URL from the config
    const remoteUrl = modifiedConfig.modules.storage.config.remote.url;
    
    // Verify that the URL is properly formatted
    expect(remoteUrl).toMatch(/^https:\/\//);
  });
  
  it('should handle environment variables in the configuration', () => {
    // Extract configs with environment variables
    const apiKey = comprehensiveConfig.modules.storage.config.auth.origins.api.headers['X-API-Key'];
    const blogApiKey = comprehensiveConfig.modules.storage.config.pathBasedOrigins.blog.remoteAuth.headers['X-API-Key'];
    
    // Verify they have environment variable format
    expect(apiKey).toBe('${API_KEY}');
    expect(blogApiKey).toBe('${BLOG_API_KEY}');
  });
  
  it('should validate cross-module dependencies', () => {
    // Add explicit dependencies to modules for testing
    const modifiedConfig = JSON.parse(JSON.stringify(comprehensiveConfig));
    
    // Add dependencies
    modifiedConfig.modules.cache._meta.moduleDependencies = ['core'];
    modifiedConfig.modules.transform._meta.moduleDependencies = ['core'];
    modifiedConfig.modules.storage._meta.moduleDependencies = ['core'];
    
    // Create a validation function that checks module dependencies
    const validateDependencies = (config: ConfigurationSystem) => {
      // First, validate the basic structure
      ConfigSystemSchema.parse(config);
      
      // Then check module dependencies
      const activeModules = new Set(config._meta.activeModules);
      
      for (const [moduleName, moduleConfig] of Object.entries(config.modules)) {
        if (moduleConfig._meta.moduleDependencies) {
          for (const dependency of moduleConfig._meta.moduleDependencies) {
            if (!activeModules.has(dependency)) {
              throw new Error(`Module "${moduleName}" depends on "${dependency}" which is not in the active modules list`);
            }
          }
        }
      }
    };
    
    // Should validate successfully because all dependencies exist
    expect(() => validateDependencies(modifiedConfig)).not.toThrow();
    
    // Now add a dependency on a non-existent module
    modifiedConfig.modules.cache._meta.moduleDependencies = ['core', 'non-existent-module'];
    
    // Should throw an error
    expect(() => validateDependencies(modifiedConfig)).toThrow(/depends on "non-existent-module"/);
  });
});