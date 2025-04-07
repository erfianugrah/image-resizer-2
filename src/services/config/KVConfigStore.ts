/**
 * KV Configuration Store
 * 
 * This component provides storage and retrieval of configuration data in Cloudflare KV,
 * with support for versioning, metadata, and incremental updates.
 */

import { KVNamespace } from '@cloudflare/workers-types';
import { ConfigStoreInterface, ConfigurationSystem, ConfigVersionMetadata, ConfigVersionListResult } from './interfaces';
import { Logger } from '../../utils/logging';

/**
 * Key constants for KV storage
 */
const KV_KEYS = {
  CURRENT: 'current', // Changed from 'config_current' to match CLI conventions
  VERSION_PREFIX: 'config_v',
  HISTORY: 'config_history',
  SCHEMA: 'config_schema',
  MODULE_PREFIX: 'config_module_'
};

/**
 * Default configuration system structure
 */
const DEFAULT_CONFIG: ConfigurationSystem = {
  _meta: {
    version: '1.0.0',
    lastUpdated: new Date().toISOString(),
    activeModules: []
  },
  modules: {}
};

/**
 * Utility for generating SHA-256 hash
 */
async function generateHash(data: any): Promise<string> {
  const msgUint8 = new TextEncoder().encode(JSON.stringify(data));
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return `sha256:${hashArray.map(b => b.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * Flattens an object into paths with their values
 * Example: { a: { b: 1 } } becomes { 'a.b': 1 }
 */
function flattenObject(obj: Record<string, any>, prefix = ''): Record<string, any> {
  return Object.keys(obj).reduce((acc, key) => {
    const pre = prefix.length ? `${prefix}.` : '';
    if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
      Object.assign(acc, flattenObject(obj[key], `${pre}${key}`));
    } else {
      acc[`${pre}${key}`] = obj[key];
    }
    return acc;
  }, {} as Record<string, any>);
}

/**
 * Deep difference between two objects to find changed paths
 * Returns array of dot-notation paths that have changed
 */
function detectChanges(oldObj: Record<string, any>, newObj: Record<string, any>): string[] {
  const flattenedOld = flattenObject(oldObj);
  const flattenedNew = flattenObject(newObj);
  
  const changes: string[] = [];
  
  // Find changed and added keys
  Object.keys(flattenedNew).forEach(key => {
    if (!(key in flattenedOld) || 
        JSON.stringify(flattenedOld[key]) !== JSON.stringify(flattenedNew[key])) {
      changes.push(key);
    }
  });
  
  // Find removed keys
  Object.keys(flattenedOld).forEach(key => {
    if (!(key in flattenedNew)) {
      changes.push(key);
    }
  });
  
  return changes;
}

/**
 * Implementation of the KV Configuration Store
 */
export class KVConfigStore implements ConfigStoreInterface {
  private kvNamespace: KVNamespace;
  private logger?: Logger;
  private cachedConfig: ConfigurationSystem | null = null;
  private cachedConfigVersion: string | null = null;
  
  /**
   * Create a new KV Config Store
   */
  constructor(kvNamespace: KVNamespace, logger?: Logger) {
    this.kvNamespace = kvNamespace;
    this.logger = logger;
  }
  
  /**
   * Get the current active configuration
   */
  async getCurrentConfig(): Promise<ConfigurationSystem | null> {
    try {
      // Get the current active version ID
      const currentVersionId = await this.kvNamespace.get(KV_KEYS.CURRENT, { type: 'text' });
      
      if (!currentVersionId) {
        this.logWarn('No current config version found');
        return null;
      }
      
      // If we have a cached version and it matches the current version, return it
      if (this.cachedConfig && this.cachedConfigVersion === currentVersionId) {
        return this.cachedConfig;
      }
      
      // Fetch the configuration for this version
      let config: ConfigurationSystem | null = null;
      
      // Clean up version ID - if it starts with 'v' and VERSION_PREFIX ends with 'v', remove the duplicate
      let cleanVersionId = currentVersionId;
      if (KV_KEYS.VERSION_PREFIX.endsWith('v') && currentVersionId.startsWith('v')) {
        cleanVersionId = currentVersionId.substring(1); // Remove the 'v' prefix from the version ID
      }
      
      const configKey = `${KV_KEYS.VERSION_PREFIX}${cleanVersionId}`;
      
      try {
        // First try as JSON
        config = await this.kvNamespace.get(configKey, { type: 'json' }) as ConfigurationSystem;
      } catch (jsonError) {
        this.logError(`Error parsing JSON for ${configKey}`, {
          error: jsonError instanceof Error ? jsonError.message : String(jsonError)
        });
        
        try {
          // If JSON parsing fails, try to get as text and parse manually
          const rawText = await this.kvNamespace.get(configKey, { type: 'text' });
          if (rawText) {
            try {
              config = JSON.parse(rawText) as ConfigurationSystem;
            } catch (parseError) {
              this.logError(`Failed to manually parse config JSON for ${configKey}`, {
                error: parseError instanceof Error ? parseError.message : String(parseError),
                rawTextLength: rawText.length
              });
            }
          }
        } catch (textError) {
          this.logError(`Error getting text for ${configKey}`, {
            error: textError instanceof Error ? textError.message : String(textError)
          });
        }
      }
      
      if (!config) {
        this.logError(`Current config version ${currentVersionId} not found in KV (key: ${configKey})`);
        return null;
      }
      
      // Cache the result
      this.cachedConfig = config;
      this.cachedConfigVersion = currentVersionId;
      
      return config;
    } catch (error) {
      this.logError('Error getting current config', {
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }
  
  /**
   * Get a specific configuration version
   */
  async getConfigVersion(versionId: string): Promise<ConfigurationSystem | null> {
    try {
      // Clean up version ID - if it starts with 'v' and VERSION_PREFIX ends with 'v', remove the duplicate
      let cleanVersionId = versionId;
      if (KV_KEYS.VERSION_PREFIX.endsWith('v') && versionId.startsWith('v')) {
        cleanVersionId = versionId.substring(1); // Remove the 'v' prefix from the version ID
      }
      
      const configKey = `${KV_KEYS.VERSION_PREFIX}${cleanVersionId}`;
      this.logInfo(`Fetching configuration version: ${configKey}`);
      
      // Try first with JSON parsing
      let config: ConfigurationSystem | null = null;
      
      try {
        config = await this.kvNamespace.get(configKey, { type: 'json' }) as ConfigurationSystem;
      } catch (jsonError) {
        this.logError(`Error parsing JSON for config version ${versionId}`, {
          error: jsonError instanceof Error ? jsonError.message : String(jsonError)
        });
        
        // If JSON parsing fails, try as text and parse manually
        try {
          const rawText = await this.kvNamespace.get(configKey, { type: 'text' });
          if (rawText) {
            try {
              config = JSON.parse(rawText) as ConfigurationSystem;
            } catch (parseError) {
              this.logError(`Failed to manually parse JSON for config version ${versionId}`, {
                error: parseError instanceof Error ? parseError.message : String(parseError)
              });
            }
          }
        } catch (textError) {
          this.logError(`Error getting text for config version ${versionId}`, {
            error: textError instanceof Error ? textError.message : String(textError)
          });
        }
      }
      
      if (!config) {
        this.logWarn(`Config version ${versionId} not found at key ${configKey}`);
        return null;
      }
      
      this.logInfo(`Successfully retrieved configuration version ${versionId}`);
      return config;
    } catch (error) {
      this.logError(`Error getting config version ${versionId}`, {
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }
  
  /**
   * List available configuration versions
   */
  async listVersions(limit: number = 100, cursor?: string): Promise<ConfigVersionListResult> {
    try {
      // Get the history list from KV
      const history = await this.kvNamespace.get(KV_KEYS.HISTORY, { type: 'json' }) as ConfigVersionMetadata[] | null;
      
      if (!history || !Array.isArray(history)) {
        return {
          versions: [],
          complete: true
        };
      }
      
      // Sort history by timestamp (newest first)
      const sortedHistory = [...history].sort((a, b) => 
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
      
      // Apply pagination
      const startIndex = cursor ? parseInt(cursor, 10) : 0;
      const endIndex = Math.min(startIndex + limit, sortedHistory.length);
      const versions = sortedHistory.slice(startIndex, endIndex);
      
      const nextCursor = endIndex < sortedHistory.length ? String(endIndex) : undefined;
      
      return {
        versions,
        cursor: nextCursor,
        complete: !nextCursor
      };
    } catch (error) {
      this.logError('Error listing config versions', {
        error: error instanceof Error ? error.message : String(error)
      });
      return {
        versions: [],
        complete: true
      };
    }
  }
  
  /**
   * Store a new configuration version and make it active
   */
  async storeConfig(
    config: ConfigurationSystem,
    metadata: Omit<ConfigVersionMetadata, 'id' | 'timestamp' | 'hash'>
  ): Promise<ConfigVersionMetadata> {
    try {
      // Load current config for comparison
      const currentConfig = await this.getCurrentConfig() || DEFAULT_CONFIG;
      
      // Get the history list from KV
      const history = await this.kvNamespace.get(KV_KEYS.HISTORY, { type: 'json' }) as ConfigVersionMetadata[] | null || [];
      
      // Generate a new version ID
      const versionId = `v${history.length + 1}`;
      
      // Get the current version ID for parent reference
      const currentVersionId = await this.kvNamespace.get(KV_KEYS.CURRENT, { type: 'text' });
      
      // Create new version metadata
      const newVersionMetadata: ConfigVersionMetadata = {
        id: versionId,
        timestamp: new Date().toISOString(),
        hash: await generateHash(config),
        parent: currentVersionId || undefined,
        // Create a base object with extracted properties from metadata
        // but allow explicit modules and changes to be overridden by our calculations
        ...metadata,
        // These will override any values from metadata
        modules: Object.keys(config.modules),
        changes: detectChanges(currentConfig, config)
      };
      
      // Update the config's metadata to match
      const updatedConfig: ConfigurationSystem = {
        ...config,
        _meta: {
          ...config._meta,
          lastUpdated: newVersionMetadata.timestamp
        }
      };
      
      // Clean up version ID - if it starts with 'v' and VERSION_PREFIX ends with 'v', remove the duplicate
      let cleanVersionId = versionId;
      if (KV_KEYS.VERSION_PREFIX.endsWith('v') && versionId.startsWith('v')) {
        cleanVersionId = versionId.substring(1); // Remove the 'v' prefix from the version ID
      }
      
      // Store the new configuration version
      await this.kvNamespace.put(`${KV_KEYS.VERSION_PREFIX}${cleanVersionId}`, JSON.stringify(updatedConfig));
      
      // Update the history
      // Ensure changes property is defined
      if (!newVersionMetadata.changes) {
        newVersionMetadata.changes = [];
      }
      
      history.push(newVersionMetadata);
      await this.kvNamespace.put(KV_KEYS.HISTORY, JSON.stringify(history));
      
      // Update the current pointer
      await this.kvNamespace.put(KV_KEYS.CURRENT, versionId);
      
      // Update the cached configuration
      this.cachedConfig = updatedConfig;
      this.cachedConfigVersion = versionId;
      
      this.logInfo(`Stored new config version ${versionId}`, {
        author: newVersionMetadata.author,
        comment: newVersionMetadata.comment,
        modules: newVersionMetadata.modules,
        changeCount: newVersionMetadata.changes.length
      });
      
      return newVersionMetadata;
    } catch (error) {
      this.logError('Error storing new config version', {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }
  
  /**
   * Activate a specific configuration version
   */
  async activateVersion(versionId: string): Promise<boolean> {
    try {
      // Check if the version exists
      const exists = await this.kvNamespace.get(`${KV_KEYS.VERSION_PREFIX}${versionId}`, { type: 'json' });
      
      if (!exists) {
        this.logWarn(`Cannot activate version ${versionId} - not found`);
        return false;
      }
      
      // Update the current pointer
      await this.kvNamespace.put(KV_KEYS.CURRENT, versionId);
      
      // Invalidate cache
      this.cachedConfig = null;
      this.cachedConfigVersion = null;
      
      this.logInfo(`Activated config version ${versionId}`);
      
      return true;
    } catch (error) {
      this.logError(`Error activating config version ${versionId}`, {
        error: error instanceof Error ? error.message : String(error)
      });
      return false;
    }
  }
  
  /**
   * Get configuration metadata for a specific version
   */
  async getVersionMetadata(versionId: string): Promise<ConfigVersionMetadata | null> {
    try {
      const history = await this.kvNamespace.get(KV_KEYS.HISTORY, { type: 'json' }) as ConfigVersionMetadata[] | null;
      
      if (!history) {
        return null;
      }
      
      return history.find(meta => meta.id === versionId) || null;
    } catch (error) {
      this.logError(`Error getting metadata for version ${versionId}`, {
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }
  
  /**
   * Get configuration for a specific module
   */
  async getModuleConfig<T = Record<string, any>>(moduleName: string): Promise<T | null> {
    try {
      const currentConfig = await this.getCurrentConfig();
      
      if (!currentConfig) {
        return null;
      }
      
      if (!currentConfig.modules[moduleName]) {
        return null;
      }
      
      return currentConfig.modules[moduleName].config as unknown as T;
    } catch (error) {
      this.logError(`Error getting module config for ${moduleName}`, {
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }
  
  /**
   * Update configuration for a specific module
   */
  async updateModuleConfig(
    moduleName: string,
    config: Record<string, any>,
    metadata: Omit<ConfigVersionMetadata, 'id' | 'timestamp' | 'hash' | 'modules'>
  ): Promise<ConfigVersionMetadata> {
    try {
      // Get current config
      const currentConfig = await this.getCurrentConfig();
      
      if (!currentConfig) {
        throw new Error('No current configuration found');
      }
      
      // Create a deep copy of the current config
      const newConfig: ConfigurationSystem = JSON.parse(JSON.stringify(currentConfig));
      
      // Check if module exists
      if (!newConfig.modules[moduleName]) {
        throw new Error(`Module ${moduleName} not found in configuration`);
      }
      
      // Update the module config
      newConfig.modules[moduleName].config = config;
      
      // Store the new config
      return this.storeConfig(newConfig, {
        ...metadata,
        modules: [moduleName]
      });
    } catch (error) {
      this.logError(`Error updating module config for ${moduleName}`, {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }
  
  /**
   * Compare two configuration versions
   */
  async compareVersions(versionId1: string, versionId2: string): Promise<{
    added: string[];
    removed: string[];
    modified: string[];
    unchanged: string[];
  }> {
    try {
      // Fetch both configurations
      const config1 = await this.getConfigVersion(versionId1);
      const config2 = await this.getConfigVersion(versionId2);
      
      if (!config1 || !config2) {
        throw new Error('One or both configurations not found');
      }
      
      // Flatten both configs
      const flat1 = flattenObject(config1);
      const flat2 = flattenObject(config2);
      
      // Find paths that exist in both configs
      const allPaths = new Set([...Object.keys(flat1), ...Object.keys(flat2)]);
      
      // Compare paths
      const added: string[] = [];
      const removed: string[] = [];
      const modified: string[] = [];
      const unchanged: string[] = [];
      
      allPaths.forEach(path => {
        // Skip metadata paths
        if (path.startsWith('_meta.')) {
          return;
        }
        
        // Determine path status
        if (!(path in flat1)) {
          added.push(path);
        } else if (!(path in flat2)) {
          removed.push(path);
        } else if (JSON.stringify(flat1[path]) !== JSON.stringify(flat2[path])) {
          modified.push(path);
        } else {
          unchanged.push(path);
        }
      });
      
      return {
        added,
        removed,
        modified,
        unchanged
      };
    } catch (error) {
      this.logError(`Error comparing config versions ${versionId1} and ${versionId2}`, {
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }
  
  // Logging utility methods
  private logDebug(message: string, data?: Record<string, any>): void {
    if (this.logger) {
      this.logger.debug(message, data);
    } else if (typeof console !== 'undefined') {
      console.debug(message, data);
    }
  }
  
  private logInfo(message: string, data?: Record<string, any>): void {
    if (this.logger) {
      this.logger.info(message, data);
    } else if (typeof console !== 'undefined') {
      console.info(message, data);
    }
  }
  
  private logWarn(message: string, data?: Record<string, any>): void {
    if (this.logger) {
      this.logger.warn(message, data);
    } else if (typeof console !== 'undefined') {
      console.warn(message, data);
    }
  }
  
  private logError(message: string, data?: Record<string, any>): void {
    if (this.logger) {
      this.logger.error(message, data);
    } else if (typeof console !== 'undefined') {
      console.error(message, data);
    }
  }
}