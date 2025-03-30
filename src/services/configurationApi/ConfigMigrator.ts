/**
 * Configuration Migrator
 * 
 * This utility handles migration between different configuration formats,
 * specifically converting from the legacy format to the new simplified structure.
 */

import { ConfigurationSystem } from '../config/interfaces';
import { SimplifiedConfig } from './schema/simplified-schema';
import { Logger } from '../../utils/logging';

/**
 * Migrates a legacy configuration to the simplified format
 */
export class ConfigMigrator {
  private logger?: Logger;
  
  /**
   * Create a new configuration migrator
   * 
   * @param logger Optional logger
   */
  constructor(logger?: Logger) {
    this.logger = logger;
  }
  
  /**
   * Convert a legacy configuration to the simplified format
   * 
   * @param legacyConfig The legacy configuration object
   * @returns A configuration object in the simplified format
   */
  migrateToSimplified(legacyConfig: ConfigurationSystem): SimplifiedConfig {
    this.logInfo('Migrating legacy configuration to simplified format');
    
    try {
      // Extract core modules from legacy config
      const core = this.extractCoreModule(legacyConfig);
      const transform = this.extractTransformModule(legacyConfig);
      const cache = this.extractCacheModule(legacyConfig);
      const storage = this.extractStorageModule(legacyConfig);
      const client = this.extractClientModule(legacyConfig);
      const security = this.extractSecurityModule(legacyConfig);
      const monitoring = this.extractMonitoringModule(legacyConfig);
      
      // Build the simplified configuration
      const simplified: SimplifiedConfig = {
        core,
        transform,
        cache,
        storage,
        client,
        security,
        monitoring
      };
      
      this.logInfo('Successfully migrated configuration', {
        modules: Object.keys(simplified)
      });
      
      return simplified;
    } catch (error) {
      this.logError('Error migrating configuration', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      
      throw error;
    }
  }
  
  /**
   * Convert a simplified configuration back to the legacy format
   * 
   * @param simplifiedConfig The simplified configuration object
   * @returns A configuration object in the legacy format
   */
  migrateToLegacy(simplifiedConfig: SimplifiedConfig): ConfigurationSystem {
    this.logInfo('Migrating simplified configuration to legacy format');
    
    try {
      // Start with a basic legacy structure
      const legacyConfig: ConfigurationSystem = {
        _meta: {
          version: '1.0.0',
          lastUpdated: new Date().toISOString(),
          activeModules: []
        },
        modules: {}
      };
      
      // Convert each simplified module to its legacy equivalent
      if (simplifiedConfig.core) {
        legacyConfig.modules.core = this.convertCoreToLegacy(simplifiedConfig.core);
        legacyConfig._meta.activeModules.push('core');
      }
      
      if (simplifiedConfig.transform) {
        legacyConfig.modules.transform = this.convertTransformToLegacy(simplifiedConfig.transform);
        legacyConfig._meta.activeModules.push('transform');
      }
      
      if (simplifiedConfig.cache) {
        legacyConfig.modules.cache = this.convertCacheToLegacy(simplifiedConfig.cache);
        legacyConfig._meta.activeModules.push('cache');
      }
      
      if (simplifiedConfig.storage) {
        legacyConfig.modules.storage = this.convertStorageToLegacy(simplifiedConfig.storage);
        legacyConfig._meta.activeModules.push('storage');
      }
      
      if (simplifiedConfig.client) {
        legacyConfig.modules.client = this.convertClientToLegacy(simplifiedConfig.client);
        legacyConfig._meta.activeModules.push('client');
      }
      
      if (simplifiedConfig.security) {
        legacyConfig.modules.security = this.convertSecurityToLegacy(simplifiedConfig.security);
        legacyConfig._meta.activeModules.push('security');
      }
      
      if (simplifiedConfig.monitoring) {
        legacyConfig.modules.monitoring = this.convertMonitoringToLegacy(simplifiedConfig.monitoring);
        legacyConfig._meta.activeModules.push('monitoring');
      }
      
      this.logInfo('Successfully converted to legacy format', {
        modules: legacyConfig._meta.activeModules
      });
      
      return legacyConfig;
    } catch (error) {
      this.logError('Error converting to legacy format', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      
      throw error;
    }
  }
  
  /**
   * Detect the configuration format (legacy or simplified)
   * 
   * @param config The configuration object to detect
   * @returns Format type ('legacy' or 'simplified')
   */
  detectFormat(config: any): 'legacy' | 'simplified' {
    // Legacy format has _meta and modules at the root
    if (config._meta && config.modules) {
      return 'legacy';
    }
    
    // Simplified format has at least a core module at the root
    if (config.core) {
      return 'simplified';
    }
    
    throw new Error('Unknown configuration format: missing both _meta/modules and core properties');
  }
  
  /**
   * Extract core module from legacy config
   */
  private extractCoreModule(legacyConfig: ConfigurationSystem): SimplifiedConfig['core'] {
    const coreModule = legacyConfig.modules.core || { 
      _meta: { name: 'core', version: '1.0.0', description: '', schema: {}, defaults: {} },
      config: {}
    };
    
    return {
      environment: coreModule.config.environment || 'production',
      debug: {
        enabled: coreModule.config.debug?.enabled || false,
        headers: coreModule.config.debug?.headers || false,
        detailedErrors: coreModule.config.debug?.detailedErrors || false
      },
      logging: {
        level: coreModule.config.logging?.level || 'error',
        structured: coreModule.config.logging?.structured || true
      },
      features: {
        ...(coreModule.config.features || {}),
        responsiveImages: coreModule.config.features?.responsiveImages !== false,
        clientHints: coreModule.config.features?.clientHints !== false,
        smartCropping: coreModule.config.features?.smartCropping !== false,
        cacheTags: coreModule.config.features?.cacheTags !== false,
        watermarks: coreModule.config.features?.watermarks || false
      }
    };
  }
  
  /**
   * Extract transform module from legacy config
   */
  private extractTransformModule(legacyConfig: ConfigurationSystem): SimplifiedConfig['transform'] {
    const transformModule = legacyConfig.modules.transform || {
      _meta: { name: 'transform', version: '1.0.0', description: '', schema: {}, defaults: {} },
      config: {}
    };
    
    return {
      formats: {
        preferWebp: transformModule.config.formats?.preferWebp !== false,
        preferAvif: transformModule.config.formats?.preferAvif || false,
        allowOriginalFormat: transformModule.config.formats?.allowOriginalFormat !== false,
        jpegQuality: transformModule.config.formats?.jpegQuality || 85,
        webpQuality: transformModule.config.formats?.webpQuality || 80,
        avifQuality: transformModule.config.formats?.avifQuality || 75
      },
      sizes: {
        maxWidth: transformModule.config.sizes?.maxWidth || 2000,
        maxHeight: transformModule.config.sizes?.maxHeight || 2000,
        defaultFit: transformModule.config.sizes?.defaultFit || 'scale-down'
      },
      optimizations: {
        stripMetadata: transformModule.config.optimizations?.stripMetadata !== false,
        autoCompress: transformModule.config.optimizations?.autoCompress !== false,
        optimizeForWeb: transformModule.config.optimizations?.optimizeForWeb !== false
      },
      derivatives: transformModule.config.derivatives || {}
    };
  }
  
  /**
   * Extract cache module from legacy config
   */
  private extractCacheModule(legacyConfig: ConfigurationSystem): SimplifiedConfig['cache'] {
    const cacheModule = legacyConfig.modules.cache || {
      _meta: { name: 'cache', version: '1.0.0', description: '', schema: {}, defaults: {} },
      config: {}
    };
    
    return {
      method: cacheModule.config.method || 'cf',
      ttl: {
        default: cacheModule.config.ttl?.default || 86400,
        success: cacheModule.config.ttl?.success || 86400,
        redirects: cacheModule.config.ttl?.redirects || 3600,
        clientErrors: cacheModule.config.ttl?.clientErrors || 60,
        serverErrors: cacheModule.config.ttl?.serverErrors || 10
      },
      tags: {
        enabled: cacheModule.config.tags?.enabled !== false,
        prefix: cacheModule.config.tags?.prefix || 'img:',
        includeOrigin: cacheModule.config.tags?.includeOrigin !== false,
        includeFormat: cacheModule.config.tags?.includeFormat !== false
      },
      bypass: {
        debugMode: cacheModule.config.bypass?.debugMode !== false,
        noCache: cacheModule.config.bypass?.noCache !== false
      }
    };
  }
  
  /**
   * Extract storage module from legacy config
   */
  private extractStorageModule(legacyConfig: ConfigurationSystem): SimplifiedConfig['storage'] {
    const storageModule = legacyConfig.modules.storage || {
      _meta: { name: 'storage', version: '1.0.0', description: '', schema: {}, defaults: {} },
      config: {}
    };
    
    return {
      sources: storageModule.config.sources || ['r2', 'remote', 'fallback'],
      r2: {
        enabled: storageModule.config.r2?.enabled !== false,
        binding: storageModule.config.r2?.binding || 'IMAGES_BUCKET'
      },
      remote: {
        enabled: storageModule.config.remote?.enabled !== false,
        url: storageModule.config.remote?.url || '${REMOTE_URL}',
        auth: {
          type: storageModule.config.remote?.auth?.type || 'none'
        }
      },
      fallback: {
        enabled: storageModule.config.fallback?.enabled || false,
        url: storageModule.config.fallback?.url || '${FALLBACK_URL}'
      },
      pathTransforms: {
        enabled: storageModule.config.pathTransforms?.enabled || false,
        rules: storageModule.config.pathTransforms?.rules || {}
      }
    };
  }
  
  /**
   * Extract client module from legacy config
   */
  private extractClientModule(legacyConfig: ConfigurationSystem): SimplifiedConfig['client'] {
    const clientModule = legacyConfig.modules.client || {
      _meta: { name: 'client', version: '1.0.0', description: '', schema: {}, defaults: {} },
      config: {}
    };
    
    return {
      detection: {
        enabled: clientModule.config.detection?.enabled !== false,
        useClientHints: clientModule.config.detection?.useClientHints !== false,
        useAcceptHeader: clientModule.config.detection?.useAcceptHeader !== false,
        useUserAgent: clientModule.config.detection?.useUserAgent !== false,
        cacheDuration: clientModule.config.detection?.cacheDuration || 3600
      },
      responsive: {
        enabled: clientModule.config.responsive?.enabled !== false,
        defaultSizes: clientModule.config.responsive?.defaultSizes || [320, 640, 768, 1024, 1440, 1920],
        devicePixelRatio: clientModule.config.responsive?.devicePixelRatio !== false,
        qualityAdjustment: clientModule.config.responsive?.qualityAdjustment !== false
      }
    };
  }
  
  /**
   * Extract security module from legacy config
   */
  private extractSecurityModule(legacyConfig: ConfigurationSystem): SimplifiedConfig['security'] {
    const securityModule = legacyConfig.modules.security || {
      _meta: { name: 'security', version: '1.0.0', description: '', schema: {}, defaults: {} },
      config: {}
    };
    
    return {
      headers: {
        cacheControl: securityModule.config.headers?.cacheControl !== false,
        strictTransportSecurity: securityModule.config.headers?.strictTransportSecurity !== false,
        contentTypeNosniff: securityModule.config.headers?.contentTypeNosniff !== false,
        referrerPolicy: securityModule.config.headers?.referrerPolicy || 'strict-origin-when-cross-origin'
      },
      cors: {
        enabled: securityModule.config.cors?.enabled !== false,
        allowedOrigins: securityModule.config.cors?.allowedOrigins || ['*'],
        allowedMethods: securityModule.config.cors?.allowedMethods || ['GET', 'HEAD', 'OPTIONS']
      }
    };
  }
  
  /**
   * Extract monitoring module from legacy config
   */
  private extractMonitoringModule(legacyConfig: ConfigurationSystem): SimplifiedConfig['monitoring'] {
    const monitoringModule = legacyConfig.modules.monitoring || {
      _meta: { name: 'monitoring', version: '1.0.0', description: '', schema: {}, defaults: {} },
      config: {}
    };
    
    return {
      performance: {
        enabled: monitoringModule.config.performance?.enabled || false,
        sampleRate: monitoringModule.config.performance?.sampleRate || 0.1
      },
      errorTracking: {
        enabled: monitoringModule.config.errorTracking?.enabled || false,
        captureStackTraces: monitoringModule.config.errorTracking?.captureStackTraces !== false
      }
    };
  }
  
  /**
   * Convert core module to legacy format
   */
  private convertCoreToLegacy(core: SimplifiedConfig['core']): any {
    return {
      _meta: {
        name: 'core',
        version: '1.0.0',
        description: 'Core configuration module',
        schema: {
          // Schema would go here
        },
        defaults: {
          environment: 'production',
          debug: { enabled: false },
          logging: { level: 'error' },
          features: {}
        }
      },
      config: {
        environment: core.environment,
        debug: core.debug,
        logging: core.logging,
        features: core.features
      }
    };
  }
  
  /**
   * Convert transform module to legacy format
   */
  private convertTransformToLegacy(transform: SimplifiedConfig['transform']): any {
    return {
      _meta: {
        name: 'transform',
        version: '1.0.0',
        description: 'Image transformation configuration',
        schema: {},
        defaults: {}
      },
      config: {
        formats: transform.formats,
        sizes: transform.sizes,
        optimizations: transform.optimizations,
        derivatives: transform.derivatives
      }
    };
  }
  
  /**
   * Convert cache module to legacy format
   */
  private convertCacheToLegacy(cache: SimplifiedConfig['cache']): any {
    return {
      _meta: {
        name: 'cache',
        version: '1.0.0',
        description: 'Caching configuration',
        schema: {},
        defaults: {}
      },
      config: {
        method: cache.method,
        ttl: cache.ttl,
        tags: cache.tags,
        bypass: cache.bypass
      }
    };
  }
  
  /**
   * Convert storage module to legacy format
   */
  private convertStorageToLegacy(storage: SimplifiedConfig['storage']): any {
    return {
      _meta: {
        name: 'storage',
        version: '1.0.0',
        description: 'Storage configuration',
        schema: {},
        defaults: {}
      },
      config: {
        sources: storage.sources,
        r2: storage.r2,
        remote: storage.remote,
        fallback: storage.fallback,
        pathTransforms: storage.pathTransforms
      }
    };
  }
  
  /**
   * Convert client module to legacy format
   */
  private convertClientToLegacy(client: SimplifiedConfig['client']): any {
    return {
      _meta: {
        name: 'client',
        version: '1.0.0',
        description: 'Client detection configuration',
        schema: {},
        defaults: {}
      },
      config: {
        detection: client.detection,
        responsive: client.responsive
      }
    };
  }
  
  /**
   * Convert security module to legacy format
   */
  private convertSecurityToLegacy(security: SimplifiedConfig['security']): any {
    return {
      _meta: {
        name: 'security',
        version: '1.0.0',
        description: 'Security configuration',
        schema: {},
        defaults: {}
      },
      config: {
        headers: security.headers,
        cors: security.cors
      }
    };
  }
  
  /**
   * Convert monitoring module to legacy format
   */
  private convertMonitoringToLegacy(monitoring: SimplifiedConfig['monitoring']): any {
    return {
      _meta: {
        name: 'monitoring',
        version: '1.0.0',
        description: 'Monitoring configuration',
        schema: {},
        defaults: {}
      },
      config: {
        performance: monitoring.performance,
        errorTracking: monitoring.errorTracking
      }
    };
  }
  
  // Logging utility methods
  private logInfo(message: string, data?: Record<string, any>): void {
    if (this.logger) {
      this.logger.info(message, data);
    } else if (typeof console !== 'undefined') {
      console.info(message, data ? JSON.stringify(data) : '');
    }
  }
  
  private logWarn(message: string, data?: Record<string, any>): void {
    if (this.logger) {
      this.logger.warn(message, data);
    } else if (typeof console !== 'undefined') {
      console.warn(message, data ? JSON.stringify(data) : '');
    }
  }
  
  private logError(message: string, data?: Record<string, any>): void {
    if (this.logger) {
      this.logger.error(message, data);
    } else if (typeof console !== 'undefined') {
      console.error(message, data ? JSON.stringify(data) : '');
    }
  }
}