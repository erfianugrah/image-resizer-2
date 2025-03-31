#!/usr/bin/env node

/**
 * Script to load the initial configuration into KV
 * 
 * This script loads a JSON configuration file into a Cloudflare KV namespace
 * using wrangler. It's useful for initializing or updating the configuration
 * when deploying the Image Resizer worker.
 * 
 * Usage:
 *   node load-initial-config.js <config-file> [--namespace=namespace-name] [--key=config-key]
 * 
 * Arguments:
 *   config-file: Path to the JSON configuration file
 *   --namespace: KV namespace ID or binding name (default: IMAGE_RESIZER_CONFIG)
 *   --key: Key to store the configuration under (default: config)
 *   --env: Environment to use (default: dev)
 */

const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

// Parse command line arguments
const args = process.argv.slice(2);
let configFile = null;
let namespace = 'IMAGE_RESIZER_CONFIG';
let configKey = 'config';
let env = 'dev';

for (const arg of args) {
  if (arg.startsWith('--namespace=')) {
    namespace = arg.split('=')[1];
  } else if (arg.startsWith('--key=')) {
    configKey = arg.split('=')[1];
  } else if (arg.startsWith('--env=')) {
    env = arg.split('=')[1];
  } else if (!arg.startsWith('--')) {
    configFile = arg;
  }
}

// Check if config file was provided
if (!configFile) {
  console.error('Error: No configuration file specified');
  console.log('Usage: node load-initial-config.js <config-file> [--namespace=namespace-name] [--key=config-key] [--env=environment]');
  process.exit(1);
}

// Check if config file exists
if (!fs.existsSync(configFile)) {
  console.error(`Error: Configuration file not found: ${configFile}`);
  process.exit(1);
}

// Read configuration file
let config;
try {
  const configData = fs.readFileSync(configFile, 'utf8');
  config = JSON.parse(configData);
  console.log(`Read configuration from ${configFile}`);
} catch (error) {
  console.error(`Error reading or parsing configuration file: ${error.message}`);
  process.exit(1);
}

// Create temporary file for the value
const tempFilePath = path.join(
  process.env.TMPDIR || process.env.TMP || '/tmp', 
  `config-${Date.now()}.json`
);

try {
  // Write config to temporary file
  fs.writeFileSync(tempFilePath, JSON.stringify(config, null, 2));
  console.log(`Wrote configuration to temporary file: ${tempFilePath}`);

  // Create KV put command
  const command = `wrangler kv:key put --binding=${namespace} ${configKey} --path=${tempFilePath} --env=${env}`;
  console.log(`Executing command: ${command}`);

  // Execute command
  const output = execSync(command, { encoding: 'utf8' });
  console.log(output);
  console.log(`Configuration successfully loaded into KV namespace '${namespace}' with key '${configKey}' for environment '${env}'`);
} catch (error) {
  console.error(`Error executing wrangler command: ${error.message}`);
  if (error.stderr) {
    console.error(error.stderr);
  }
  process.exit(1);
} finally {
  // Clean up temporary file
  try {
    fs.unlinkSync(tempFilePath);
    console.log(`Removed temporary file: ${tempFilePath}`);
  } catch (error) {
    console.warn(`Warning: Could not remove temporary file: ${error.message}`);
  }
}