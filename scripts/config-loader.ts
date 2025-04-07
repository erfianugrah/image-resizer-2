#!/usr/bin/env node

/**
 * Configuration Loader CLI
 * 
 * A robust TypeScript CLI tool for loading and managing configurations
 * for the image-resizer-2 project. Features:
 * 
 * - Uses environment variables, .env files, and CLI flags
 * - No hardcoded values
 * - Environment name normalization (dev/development → DEV)
 * - Supports multiple environments with environment-specific config
 * - Comprehensive error handling and user feedback
 * 
 * See README.md for usage details.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { execSync } from 'node:child_process';
import { Command } from 'commander';
import chalk from 'chalk';
import fetch from 'node-fetch';
import * as dotenv from 'dotenv';

// Load environment variables from .env files
dotenv.config();

// Define interfaces
interface ConfigApiResponse {
  message?: string;
  _meta?: {
    version: string;
    activeModules: string[];
    lastUpdated: string;
  };
  [key: string]: any;
}

interface ConfigRequestBody {
  config: Record<string, any>;
  comment: string;
  author: string;
}

// Setup the CLI program
const program = new Command();
program
  .name('config-loader')
  .description('TypeScript Configuration management CLI for image-resizer-2')
  .version('1.0.0');

// Helper function to read a config file
function readConfigFile(filePath: string): Record<string, any> {
  try {
    const fullPath = path.resolve(process.cwd(), filePath);
    if (!fs.existsSync(fullPath)) {
      console.error(chalk.red(`Error: File not found: ${fullPath}`));
      process.exit(1);
    }
    
    const fileContent = fs.readFileSync(fullPath, 'utf8');
    return JSON.parse(fileContent);
  } catch (error) {
    console.error(chalk.red(`Error reading config file: ${error instanceof Error ? error.message : String(error)}`));
    process.exit(1);
  }
}

// Normalize environment name (dev/development, prod/production, etc.)
function normalizeEnvironment(environment: string): string {
  // Convert to lowercase
  const env = environment.toLowerCase();
  
  // Handle common abbreviations
  if (env === 'prod' || env === 'production') return 'PROD';
  if (env === 'dev' || env === 'development') return 'DEV';
  if (env === 'staging' || env === 'stage') return 'STAGING';
  
  // Default: uppercase the original value
  return environment.toUpperCase();
}

// Get the API URL for the specified environment
function getApiUrl(environment: string): string {
  // Normalize the environment name
  const normalizedEnv = normalizeEnvironment(environment);
  
  // Look for environment-specific URL in env vars
  const envSpecificVar = `CONFIG_API_URL_${normalizedEnv}`;
  if (process.env[envSpecificVar]) {
    console.log(chalk.blue(`Using ${envSpecificVar}: ${process.env[envSpecificVar]}`));
    return process.env[envSpecificVar] as string;
  }
  
  // Fall back to default URL if available
  if (process.env.CONFIG_API_URL) {
    console.log(chalk.blue(`Using default CONFIG_API_URL: ${process.env.CONFIG_API_URL}`));
    return process.env.CONFIG_API_URL;
  }
  
  // Error if no URL is configured
  console.error(chalk.red(`No API URL configured for environment '${environment}'`));
  console.error(chalk.yellow(`Please set ${envSpecificVar} or CONFIG_API_URL in your environment or .env file`));
  process.exit(1);
}

// Get the API key for the specified environment
function getApiKey(environment: string): string | undefined {
  // Normalize the environment name
  const normalizedEnv = normalizeEnvironment(environment);
  
  // Look for environment-specific key in env vars first
  const envSpecificVar = `CONFIG_API_KEY_${normalizedEnv}`;
  if (process.env[envSpecificVar]) {
    console.log(chalk.blue(`Using API key from ${envSpecificVar}`));
    return process.env[envSpecificVar];
  }
  
  // Fall back to default key if available
  if (process.env.CONFIG_API_KEY) {
    console.log(chalk.blue(`Using default CONFIG_API_KEY`));
    return process.env.CONFIG_API_KEY;
  }
  
  return undefined;
}

// Command to post config to the API
program
  .command('post')
  .description('Post configuration to the API')
  .argument('<config-file>', 'Path to configuration file')
  .requiredOption('-e, --environment <env>', 'Environment (dev, staging, prod)')
  .option('-a, --author <name>', 'Author name', process.env.USER || 'developer')
  .option('-c, --comment <text>', 'Comment for this configuration update', 'Configuration update')
  .option('-k, --api-key <key>', 'API key to use')
  .option('-u, --api-url <url>', 'Override the API URL for this command')
  .action(async (configFile: string, options: { 
    environment: string; 
    author: string; 
    comment: string; 
    apiKey?: string;
    apiUrl?: string;
  }) => {
    try {
      // Get API URL and API key
      const apiUrl = options.apiUrl || getApiUrl(options.environment);
      const apiKey = options.apiKey || getApiKey(options.environment);
      
      // Check for required API key
      if (!apiKey) {
        console.error(chalk.red('No API key provided'));
        console.error(chalk.yellow(`Please provide an API key via --api-key flag or set CONFIG_API_KEY_${options.environment.toUpperCase()} or CONFIG_API_KEY in your environment or .env file`));
        process.exit(1);
      }
      
      console.log(chalk.blue('Reading configuration file...'));
      const config = readConfigFile(configFile);
      
      // Prepare request data
      const requestData: ConfigRequestBody = {
        config,
        comment: options.comment,
        author: options.author
      };
      
      console.log(chalk.blue(`Posting configuration to ${chalk.cyan(apiUrl)}...`));
      
      // Send the request
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Config-API-Key': apiKey
        },
        body: JSON.stringify(requestData)
      });
      
      const responseData = await response.text();
      
      if (!response.ok) {
        console.error(chalk.red(`API request failed with status ${response.status}:`));
        console.error(chalk.red(responseData));
        process.exit(1);
      }
      
      console.log(chalk.green('Configuration posted successfully!'));
      console.log(chalk.gray(responseData));
    } catch (error) {
      console.error(chalk.red(`Failed to post configuration: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }
  });

// Helper function to get namespace ID from binding name
async function getNamespaceIdFromBinding(bindingName: string, environment: string): Promise<string> {
  try {
    // Get the list of namespaces
    const output = execSync('wrangler kv namespace list', { encoding: 'utf8' });
    const namespaces = JSON.parse(output);
    
    // Find the namespace with the matching title (binding name)
    // For dev/staging/prod environments, the binding might have a suffix
    const normalizedEnv = normalizeEnvironment(environment);
    let targetName = bindingName;
    
    // Adjust binding name based on environment, if not already included
    if (normalizedEnv === 'DEV' && !bindingName.endsWith('_DEV')) {
      targetName = `${bindingName}_DEV`;
    } else if (normalizedEnv === 'STAGING' && !bindingName.endsWith('_STAGING')) {
      targetName = `${bindingName}_STAGING`;
    }
    
    // Find matching namespace
    const matchingNamespace = namespaces.find((ns: any) => ns.title === targetName || ns.title === bindingName);
    
    if (matchingNamespace) {
      console.log(chalk.blue(`Found namespace ID ${chalk.cyan(matchingNamespace.id)} for binding ${chalk.cyan(targetName)}`));
      return matchingNamespace.id;
    } else {
      console.error(chalk.red(`Could not find namespace ID for binding ${targetName}`));
      throw new Error(`Namespace with binding name ${targetName} not found`);
    }
  } catch (error) {
    console.error(chalk.red(`Error getting namespace ID: ${error instanceof Error ? error.message : String(error)}`));
    throw error;
  }
}

// Command to load config to KV
program
  .command('load-kv')
  .description('Load configuration into Cloudflare KV')
  .argument('<config-file>', 'Path to configuration file')
  .option('-n, --namespace <name>', 'KV namespace ID or binding name', 
    process.env.KV_NAMESPACE || 'IMAGE_RESIZER_CONFIG')
  .option('-k, --key <name>', 'Key to store the configuration under', 
    process.env.KV_KEY || 'config')
  .requiredOption('-e, --env <environment>', 'Environment to use (dev, staging, prod)')
  .option('--use-binding', 'Use binding name instead of namespace ID', false)
  .option('--initialize', 'Initialize KV storage with necessary metadata for a new config', false)
  .action(async (configFile: string, options: {
    namespace: string;
    key: string;
    env: string;
    useBinding?: boolean;
    initialize?: boolean;
  }) => {
    try {
      console.log(chalk.blue('Reading configuration file...'));
      const config = readConfigFile(configFile);
      
      // Create temporary file for the value
      const tempFilePath = path.join(
        process.env.TMPDIR || process.env.TMP || '/tmp', 
        `config-${Date.now()}.json`
      );
      
      // Write config to temporary file
      fs.writeFileSync(tempFilePath, JSON.stringify(config, null, 2));
      console.log(chalk.blue(`Wrote configuration to temporary file: ${chalk.cyan(tempFilePath)}`));
      
      // Determine if input is already a namespace ID (starts with hex characters)
      const looksLikeNamespaceId = /^[0-9a-f]{32}$/.test(options.namespace);
      const namespaceId = looksLikeNamespaceId ? options.namespace : await getNamespaceIdFromBinding(options.namespace, options.env);
      
      // Extra setup for configuration system
      if (options.initialize) {
        console.log(chalk.blue('Initializing KV configuration system...'));
        
        // Create version ID
        const versionId = 'v1';
        
        // Create config version file
        const versionFilePath = path.join(
          process.env.TMPDIR || process.env.TMP || '/tmp', 
          `config_v1-${Date.now()}.json`
        );
        fs.writeFileSync(versionFilePath, JSON.stringify(config, null, 2));
        
        // Create history file
        const historyFilePath = path.join(
          process.env.TMPDIR || process.env.TMP || '/tmp', 
          `history-${Date.now()}.json`
        );
        fs.writeFileSync(historyFilePath, JSON.stringify([{
          id: versionId,
          timestamp: new Date().toISOString(),
          hash: 'initial',
          modules: Object.keys(config.modules || {}),
          changes: [],
          author: process.env.USER || 'config-loader',
          comment: 'Initial configuration loaded via CLI'
        }]));
        
        // We'll set the current version directly rather than using a file
        
        // Execute commands to set up the KV store
        const versionCommand = `wrangler kv key put config_v1 --path=${versionFilePath} --namespace-id=${namespaceId} --remote`;
        const historyCommand = `wrangler kv key put config_history --path=${historyFilePath} --namespace-id=${namespaceId} --remote`;
        const currentCommand = `wrangler kv key put current ${versionId} --namespace-id=${namespaceId} --remote`;
        
        console.log(chalk.blue(`Executing version command: ${chalk.cyan(versionCommand)}`));
        execSync(versionCommand, { encoding: 'utf8' });
        
        console.log(chalk.blue(`Executing history command: ${chalk.cyan(historyCommand)}`));
        execSync(historyCommand, { encoding: 'utf8' });
        
        console.log(chalk.blue(`Executing current version command: ${chalk.cyan(currentCommand)}`));
        execSync(currentCommand, { encoding: 'utf8' });
        
        fs.unlinkSync(versionFilePath);
        fs.unlinkSync(historyFilePath);
        
        console.log(chalk.green('KV configuration system initialized successfully'));
      } else {
        // Standard KV key put
        let command: string;
        if (looksLikeNamespaceId || options.useBinding === false) {
          command = `wrangler kv key put ${options.key} --path=${tempFilePath} --namespace-id=${namespaceId} --remote`;
          if (options.env) {
            command += ` --env=${options.env}`;
          }
        } else {
          command = `wrangler kv key put ${options.key} --path=${tempFilePath} --binding=${options.namespace} --env=${options.env} --remote`;
        }
        
        console.log(chalk.blue(`Executing command: ${chalk.cyan(command)}`));
        const output = execSync(command, { encoding: 'utf8' });
        console.log(output);
      }
      
      console.log(chalk.green(
        `Configuration successfully loaded into KV namespace '${chalk.cyan(options.namespace)}' with key '${chalk.cyan(options.key)}' for environment '${chalk.cyan(options.env)}'`
      ));
      
      // Clean up temporary file
      fs.unlinkSync(tempFilePath);
      console.log(chalk.blue(`Removed temporary file: ${chalk.cyan(tempFilePath)}`));
    } catch (error) {
      console.error(chalk.red(`Error loading configuration to KV: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }
  });

// Command to fetch and display current config
program
  .command('get')
  .description('Fetch and display current configuration')
  .requiredOption('-e, --environment <env>', 'Environment (dev, staging, prod)')
  .option('-k, --api-key <key>', 'API key to use')
  .option('-u, --api-url <url>', 'Override the API URL for this command')
  .action(async (options: {
    environment: string;
    apiKey?: string;
    apiUrl?: string;
  }) => {
    try {
      // Get API URL and API key
      const apiUrl = options.apiUrl || getApiUrl(options.environment);
      const apiKey = options.apiKey || getApiKey(options.environment);
      
      // Check for required API key
      if (!apiKey) {
        console.error(chalk.red('No API key provided'));
        console.error(chalk.yellow(`Please provide an API key via --api-key flag or set CONFIG_API_KEY_${options.environment.toUpperCase()} or CONFIG_API_KEY in your environment or .env file`));
        process.exit(1);
      }
      
      console.log(chalk.blue(`Fetching configuration from ${chalk.cyan(apiUrl)}...`));
      
      // Send the request
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: {
          'X-Config-API-Key': apiKey
        }
      });
      
      if (!response.ok) {
        const responseText = await response.text();
        console.error(chalk.red(`API request failed with status ${response.status}:`));
        console.error(chalk.red(responseText));
        process.exit(1);
      }
      
      const config = await response.json() as ConfigApiResponse;
      console.log(chalk.green('Configuration fetched successfully:'));
      
      // Show meta information
      if (config._meta) {
        console.log(chalk.cyan('\nMeta Information:'));
        console.log(`Version: ${chalk.yellow(config._meta.version)}`);
        console.log(`Active Modules: ${chalk.yellow(config._meta.activeModules.join(', '))}`);
        console.log(`Last Updated: ${chalk.yellow(config._meta.lastUpdated)}`);
      }
      
      // Show full config
      console.log(chalk.cyan('\nFull Configuration:'));
      console.log(JSON.stringify(config, null, 2));
    } catch (error) {
      console.error(chalk.red(`Failed to fetch configuration: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }
  });

// Command to load the default comprehensive configuration
program
  .command('load-default')
  .description('Load the default comprehensive configuration into KV')
  .requiredOption('-e, --env <environment>', 'Environment to use (dev, staging, prod)')
  .option('-n, --namespace <n>', 'KV namespace ID or binding name', 
    process.env.KV_NAMESPACE || 'IMAGE_CONFIGURATION_STORE')
  .option('-k, --key <n>', 'Key to store the configuration under', 'current')
  .option('--use-binding', 'Use binding name instead of namespace ID', false)
  .action(async (options: {
    namespace: string;
    key: string;
    env: string;
    useBinding?: boolean;
  }) => {
    try {
      const defaultConfigPath = path.resolve(
        process.cwd(), 
        'docs/public/configuration/examples/comprehensive-config-runnable.json'
      );
      
      console.log(chalk.blue(`Loading default configuration from ${chalk.cyan(defaultConfigPath)}...`));
      
      if (!fs.existsSync(defaultConfigPath)) {
        console.error(chalk.red(`Default configuration file not found at ${defaultConfigPath}`));
        process.exit(1);
      }
      
      // Read and parse the default config
      const config = readConfigFile(defaultConfigPath);
      
      // Create temporary file for the value
      const tempFilePath = path.join(
        process.env.TMPDIR || process.env.TMP || '/tmp', 
        `config-${Date.now()}.json`
      );
      
      // Write config to temporary file
      fs.writeFileSync(tempFilePath, JSON.stringify(config, null, 2));
      console.log(chalk.blue(`Wrote configuration to temporary file: ${chalk.cyan(tempFilePath)}`));
      
      let command: string;
      
      // Determine if input is already a namespace ID (starts with hex characters)
      const looksLikeNamespaceId = /^[0-9a-f]{32}$/.test(options.namespace);
      
      if (looksLikeNamespaceId || options.useBinding === false) {
        // Use the namespace directly if it looks like an ID already
        const namespaceId = looksLikeNamespaceId ? options.namespace : await getNamespaceIdFromBinding(options.namespace, options.env);
        command = `wrangler kv key put ${options.key} --path=${tempFilePath} --namespace-id=${namespaceId} --remote`;
        if (options.env) {
          command += ` --env=${options.env}`;
        }
      } else {
        // Use binding
        command = `wrangler kv key put ${options.key} --path=${tempFilePath} --binding=${options.namespace} --env=${options.env} --remote`;
      }
      
      console.log(chalk.blue(`Executing command: ${chalk.cyan(command)}`));
      
      // Execute command
      const output = execSync(command, { encoding: 'utf8' });
      console.log(output);
      
      console.log(chalk.green(
        `Default configuration successfully loaded into KV namespace '${chalk.cyan(options.namespace)}' with key '${chalk.cyan(options.key)}' for environment '${chalk.cyan(options.env)}'`
      ));
      
      // Clean up temporary file
      fs.unlinkSync(tempFilePath);
      console.log(chalk.blue(`Removed temporary file: ${chalk.cyan(tempFilePath)}`));
    } catch (error) {
      console.error(chalk.red(`Error loading default configuration to KV: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }
  });

// Add template for .env file command
program
  .command('init-env')
  .description('Create a template .env file with required configuration variables')
  .action(() => {
    const envTemplate = `# Configuration Loader Environment Variables
# API URLs for different environments
CONFIG_API_URL=https://default-api-url.example.com/api/config
CONFIG_API_URL_DEV=https://dev-api-url.example.com/api/config
CONFIG_API_URL_STAGING=https://staging-api-url.example.com/api/config
CONFIG_API_URL_PROD=https://prod-api-url.example.com/api/config

# API Keys for authentication
CONFIG_API_KEY=your-default-api-key
CONFIG_API_KEY_DEV=your-dev-api-key
CONFIG_API_KEY_STAGING=your-staging-api-key
CONFIG_API_KEY_PROD=your-prod-api-key

# KV configuration
KV_NAMESPACE=IMAGE_RESIZER_CONFIG
KV_KEY=config
`;

    // Write to .env.example file
    fs.writeFileSync(path.join(process.cwd(), '.env.example'), envTemplate);
    console.log(chalk.green('Created .env.example template file'));
    console.log(chalk.yellow('Rename to .env and update with your values'));
  });

// Command to activate a configuration version
program
  .command('activate')
  .description('Activate a specific configuration version')
  .argument('<version-id>', 'Version ID to activate (e.g. v6)')
  .requiredOption('-e, --environment <env>', 'Environment (dev, staging, prod)')
  .option('-k, --api-key <key>', 'API key to use')
  .option('-u, --api-url <url>', 'Override the API URL for this command')
  .action(async (versionId: string, options: {
    environment: string;
    apiKey?: string;
    apiUrl?: string;
  }) => {
    try {
      // Get API URL and API key
      const apiUrl = options.apiUrl || getApiUrl(options.environment);
      const apiKey = options.apiKey || getApiKey(options.environment);
      
      // Check for required API key
      if (!apiKey) {
        console.error(chalk.red('No API key provided'));
        console.error(chalk.yellow(`Please provide an API key via --api-key flag or set CONFIG_API_KEY_${options.environment.toUpperCase()} or CONFIG_API_KEY in your environment or .env file`));
        process.exit(1);
      }
      
      console.log(chalk.blue(`Activating configuration version ${chalk.cyan(versionId)} on ${chalk.cyan(apiUrl)}...`));
      
      // Send the request
      const response = await fetch(`${apiUrl}/activate/${versionId}`, {
        method: 'PUT',
        headers: {
          'X-Config-API-Key': apiKey
        }
      });
      
      if (!response.ok) {
        const responseText = await response.text();
        console.error(chalk.red(`API request failed with status ${response.status}:`));
        console.error(chalk.red(responseText));
        process.exit(1);
      }
      
      const result = await response.json();
      console.log(chalk.green('Configuration activated successfully!'));
      console.log(JSON.stringify(result, null, 2));
    } catch (error) {
      console.error(chalk.red(`Failed to activate configuration: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }
  });

// Parse command line arguments
program.parse();

// If no arguments, show help
if (process.argv.length <= 2) {
  program.help();
}