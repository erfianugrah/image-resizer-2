#!/usr/bin/env node

/**
 * Configuration Loader Script
 * 
 * This script loads the initial configuration into the KV store
 * using the Cloudflare Workers API.
 */

const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const { execSync } = require('child_process');
const crypto = require('crypto');

// Command line arguments
const args = process.argv.slice(2);
const configFile = args[0] || path.join(__dirname, '../examples/configuration/initial-config.json');
const env = args[1] || 'development';

// Check if wrangler is installed
try {
  execSync('which wrangler', { stdio: 'ignore' });
} catch (error) {
  console.error('Error: wrangler CLI is not installed. Please install it with:');
  console.error('npm install -g wrangler');
  process.exit(1);
}

// Check if the user is logged in to wrangler
try {
  execSync('wrangler whoami', { stdio: 'ignore' });
} catch (error) {
  console.error('Error: You are not logged in to wrangler. Please run:');
  console.error('wrangler login');
  process.exit(1);
}

// Load the configuration file
let config;
try {
  console.log(`Loading configuration from ${configFile}...`);
  const configData = fs.readFileSync(configFile, 'utf8');
  config = JSON.parse(configData);
} catch (error) {
  console.error(`Error loading configuration file: ${error.message}`);
  process.exit(1);
}

// Convert the simplified config to legacy format if needed
async function convertToLegacyFormat(config) {
  // Check if it's already a legacy config
  if (config._meta && config.modules) {
    return config;
  }
  
  // It's a simplified config, convert it to legacy format
  console.log('Converting simplified config to legacy format...');
  
  // Create a basic legacy structure
  const legacyConfig = {
    _meta: {
      version: '1.0.0',
      lastUpdated: new Date().toISOString(),
      activeModules: []
    },
    modules: {}
  };
  
  // Helper to create module structure
  const createModule = (name, config, description) => {
    return {
      _meta: {
        name,
        version: '1.0.0',
        description: description || `${name} configuration`,
        schema: {},
        defaults: {}
      },
      config
    };
  };
  
  // Add each module from the simplified config
  if (config.core) {
    legacyConfig.modules.core = createModule('core', config.core, 'Core configuration');
    legacyConfig._meta.activeModules.push('core');
  }
  
  if (config.transform) {
    legacyConfig.modules.transform = createModule('transform', config.transform, 'Transform configuration');
    legacyConfig._meta.activeModules.push('transform');
  }
  
  if (config.cache) {
    legacyConfig.modules.cache = createModule('cache', config.cache, 'Cache configuration');
    legacyConfig._meta.activeModules.push('cache');
  }
  
  if (config.storage) {
    legacyConfig.modules.storage = createModule('storage', config.storage, 'Storage configuration');
    legacyConfig._meta.activeModules.push('storage');
  }
  
  if (config.client) {
    legacyConfig.modules.client = createModule('client', config.client, 'Client detection configuration');
    legacyConfig._meta.activeModules.push('client');
  }
  
  if (config.security) {
    legacyConfig.modules.security = createModule('security', config.security, 'Security configuration');
    legacyConfig._meta.activeModules.push('security');
  }
  
  if (config.monitoring) {
    legacyConfig.modules.monitoring = createModule('monitoring', config.monitoring, 'Monitoring configuration');
    legacyConfig._meta.activeModules.push('monitoring');
  }
  
  return legacyConfig;
}

// Main function to load configuration
async function loadConfiguration() {
  try {
    // Get account ID and KV namespace ID
    console.log('Fetching account information...');
    const accountId = await getAccountId();
    console.log(`Account ID: ${accountId}`);
    
    const kvNamespace = await getKVNamespace(accountId);
    console.log(`KV Namespace ID: ${kvNamespace.id}`);
    
    // Convert config to legacy format if needed
    const legacyConfig = await convertToLegacyFormat(config);
    
    // Create metadata for the new version
    const versionId = `v${Date.now()}`;
    const metadata = {
      id: versionId,
      timestamp: new Date().toISOString(),
      author: 'config-loader',
      comment: `Initial configuration for ${env} environment`,
      hash: crypto.createHash('sha256').update(JSON.stringify(legacyConfig)).digest('hex'),
      modules: legacyConfig._meta.activeModules,
      changes: [],
      tags: ['initial-config', env]
    };
    
    // Store the configuration and metadata
    console.log(`Storing configuration version ${versionId}...`);
    await storeKVValue(accountId, kvNamespace.id, `config_${versionId}`, legacyConfig);
    await storeKVValue(accountId, kvNamespace.id, `config_meta_${versionId}`, metadata);
    
    // Store current pointer
    console.log('Setting as current configuration...');
    await storeKVValue(accountId, kvNamespace.id, 'config_current', legacyConfig);
    
    // Update history
    console.log('Updating version history...');
    let history = [];
    try {
      const existingHistory = await getKVValue(accountId, kvNamespace.id, 'config_history');
      if (existingHistory) {
        history = JSON.parse(existingHistory);
      }
    } catch (error) {
      // Ignore errors, we'll create a new history
    }
    
    history.unshift(metadata);
    await storeKVValue(accountId, kvNamespace.id, 'config_history', history);
    
    console.log(`Configuration successfully loaded with version ${versionId}`);
  } catch (error) {
    console.error(`Error loading configuration: ${error.message}`);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

// Helper to get the account ID
async function getAccountId() {
  const result = execSync('wrangler whoami --json', { encoding: 'utf8' });
  const data = JSON.parse(result);
  return data.account.id;
}

// Helper to get the KV namespace ID
async function getKVNamespace(accountId) {
  try {
    // Try to get the namespace ID from wrangler.toml
    const result = execSync('wrangler kv:namespace list --json', { encoding: 'utf8' });
    const namespaces = JSON.parse(result);
    
    // Find the CONFIG_STORE namespace
    const configNamespace = namespaces.find(ns => ns.binding === 'CONFIG_STORE');
    
    if (configNamespace) {
      return configNamespace;
    }
    
    // If not found, create a new namespace
    console.log('CONFIG_STORE namespace not found, creating...');
    const createResult = execSync(`wrangler kv:namespace create CONFIG_STORE --env ${env}`, { encoding: 'utf8' });
    console.log(createResult);
    
    // Get the newly created namespace
    const updatedResult = execSync('wrangler kv:namespace list --json', { encoding: 'utf8' });
    const updatedNamespaces = JSON.parse(updatedResult);
    const newNamespace = updatedNamespaces.find(ns => ns.binding === 'CONFIG_STORE');
    
    if (!newNamespace) {
      throw new Error('Failed to create CONFIG_STORE namespace');
    }
    
    return newNamespace;
  } catch (error) {
    console.error(`Error getting KV namespace: ${error.message}`);
    throw error;
  }
}

// Helper to store a value in KV
async function storeKVValue(accountId, namespaceId, key, value) {
  const valueStr = typeof value === 'string' ? value : JSON.stringify(value);
  
  // Use wrangler to put the value
  execSync(`wrangler kv:key put --namespace-id=${namespaceId} "${key}" '${valueStr.replace(/'/g, "'\\''")}'`, { encoding: 'utf8' });
}

// Helper to get a value from KV
async function getKVValue(accountId, namespaceId, key) {
  try {
    const result = execSync(`wrangler kv:key get --namespace-id=${namespaceId} "${key}"`, { encoding: 'utf8' });
    return result;
  } catch (error) {
    return null;
  }
}

// Run the main function
loadConfiguration().catch(error => {
  console.error(`Unhandled error: ${error.message}`);
  process.exit(1);
});