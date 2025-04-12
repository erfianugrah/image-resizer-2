/**
 * Configuration Loader CLI Tool
 * 
 * This CLI tool provides utilities for managing configuration in Cloudflare KV.
 * It supports modular and comprehensive configuration approaches, with versioning.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { execSync } from 'child_process';
import fetch from 'node-fetch';

// Load environment variables from .env file
dotenv.config();

// Directory paths
const configDir = path.join(process.cwd(), 'config');
const modulesDir = path.join(configDir, 'modules');
const comprehensiveDir = path.join(configDir, 'comprehensive');

// Create the program
const program = new Command();

// Set program metadata
program
  .name('config-loader')
  .description('Configuration management tool for Image Resizer')
  .version('1.0.0');

// Helper function to get API URL for environment
function getApiUrl(environment: string): string {
  const envKey = `CONFIG_API_URL_${environment.toUpperCase()}`;
  return process.env[envKey] || process.env.CONFIG_API_URL || `https://${environment}-config.example.com/api/config`;
}

// Helper function to get API key for environment
function getApiKey(environment: string): string | undefined {
  const envKey = `CONFIG_API_KEY_${environment.toUpperCase()}`;
  return process.env[envKey] || process.env.CONFIG_API_KEY;
}

// Helper functions to read and validate configuration files
function readConfigFile(filePath: string): any {
  try {
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const config = JSON.parse(fileContent);
    
    // Basic validation
    if (!config) {
      throw new Error('Empty or invalid configuration');
    }
    
    return config;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Failed to read or parse configuration file: ${error.message}`);
    }
    throw error;
  }
}

// Interface for API response
interface ConfigApiResponse {
  _meta: {
    version: string;
    lastUpdated: string;
    activeModules: string[];
  };
  modules: Record<string, any>;
}

// Command to post config to API
program
  .command('post')
  .description('Post configuration to API')
  .argument('<config-file>', 'Path to configuration file')
  .requiredOption('-e, --environment <env>', 'Environment (dev, staging, prod)')
  .option('-k, --api-key <key>', 'API key to use')
  .option('-u, --api-url <url>', 'Override the API URL for this command')
  .action(async (configFile: string, options: {
    environment: string;
    apiKey?: string;
    apiUrl?: string;
  }) => {
    try {
      console.log(chalk.blue('Reading configuration file...'));
      const config = readConfigFile(configFile);
      
      // Get API URL and API key
      const apiUrl = options.apiUrl || getApiUrl(options.environment);
      const apiKey = options.apiKey || getApiKey(options.environment);
      
      // Check for required API key
      if (!apiKey) {
        console.error(chalk.red('No API key provided'));
        console.error(chalk.yellow(`Please provide an API key via --api-key flag or set CONFIG_API_KEY_${options.environment.toUpperCase()} or CONFIG_API_KEY in your environment or .env file`));
        process.exit(1);
      }
      
      console.log(chalk.blue(`Posting configuration to ${chalk.cyan(apiUrl)}...`));
      
      // Send the request
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Config-API-Key': apiKey
        },
        body: JSON.stringify(config)
      });
      
      if (!response.ok) {
        const responseText = await response.text();
        console.error(chalk.red(`API request failed with status ${response.status}:`));
        console.error(chalk.red(responseText));
        process.exit(1);
      }
      
      const result = await response.json();
      console.log(chalk.green('Configuration posted successfully!'));
      console.log(JSON.stringify(result, null, 2));
    } catch (error) {
      console.error(chalk.red(`Failed to post configuration: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }
  });

// Command to load config to KV
program
  .command('load-kv')
  .description('Load configuration into Cloudflare KV')
  .argument('<config-file>', 'Path to configuration file')
  .option('-n, --namespace <n>', 'KV namespace ID or binding name', 
    process.env.KV_NAMESPACE || 'IMAGE_CONFIGURATION_STORE')
  .option('-k, --key <n>', 'Key to store the configuration under', 
    process.env.KV_KEY || 'config')
  .requiredOption('-e, --env <environment>', 'Environment to use (dev, staging, prod)')
  .action((configFile: string, options: {
    namespace: string;
    key: string;
    env: string;
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
      
      // Create metadata for comprehensive config
      const metadata = {
        version: config._meta?.version || '1.0.0',
        lastUpdated: new Date().toISOString(),
        modules: config._meta?.activeModules || [],
        type: 'comprehensive'
      };
      
      // Determine next version number
      let nextVersionNum = 1;
      try {
        // Try to get the current version
        const currentVersionOutput = execSync(`wrangler kv key get config_current --binding=${options.namespace} --env=${options.env} --remote`, { encoding: 'utf8' }).trim();
        if (currentVersionOutput && currentVersionOutput.match(/^v(\d+)$/)) {
          nextVersionNum = parseInt(currentVersionOutput.replace(/^v/, '')) + 1;
        }
      } catch (e) {
        // If no current version, use v1
        console.log(chalk.blue(`No current version found, using v1`));
      }
      
      const versionId = `v${nextVersionNum}`;
      
      // Create the versioned config directly (don't create redundant keys)
      console.log(chalk.blue(`Creating configuration version ${versionId}...`));
      const versionedKey = `config_v${nextVersionNum}`;
      const versionCommand = `wrangler kv key put ${versionedKey} --binding=${options.namespace} --path=${tempFilePath} --metadata='${JSON.stringify(metadata)}' --env=${options.env} --remote`;
      console.log(chalk.blue(`Executing command: ${chalk.cyan(versionCommand)}`));
      
      // Execute command
      const versionOutput = execSync(versionCommand, { encoding: 'utf8' });
      console.log(versionOutput);
      
      // Set the config_current key to point to the new version
      console.log(chalk.blue(`Setting config_current key to point to version ${versionId}...`));
      const currentCommand = `wrangler kv key put config_current "${versionId}" --binding=${options.namespace} --env=${options.env} --remote`;
      const currentOutput = execSync(currentCommand, { encoding: 'utf8' });
      console.log(currentOutput);
      
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
KV_NAMESPACE=IMAGE_CONFIGURATION_STORE
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

// Module management commands
program
  .command('modules')
  .description('Manage configuration modules')
  .addCommand(
    new Command('list')
      .description('List all available configuration modules')
      .action(() => {
        try {
          if (!fs.existsSync(modulesDir)) {
            console.error(chalk.red('Modules directory does not exist'));
            process.exit(1);
          }
          
          const files = fs.readdirSync(modulesDir);
          const moduleFiles = files.filter(file => file.endsWith('.json'));
          
          if (moduleFiles.length === 0) {
            console.log(chalk.yellow('No module files found'));
            process.exit(0);
          }
          
          console.log(chalk.cyan('Available modules:'));
          
          // Display modules with metadata
          moduleFiles.forEach(file => {
            const moduleName = path.basename(file, '.json');
            const modulePath = path.join(modulesDir, file);
            
            try {
              const module = readConfigFile(modulePath);
              
              if (module._meta) {
                console.log(`${chalk.green(moduleName)} (${chalk.yellow(module._meta.version)}) - ${module._meta.description}`);
              } else {
                console.log(`${chalk.green(moduleName)} ${chalk.yellow('(no metadata)')}`);
              }
            } catch (error) {
              console.log(`${chalk.green(moduleName)} ${chalk.red('(invalid)')}`);
            }
          });
        } catch (error) {
          console.error(chalk.red(`Error listing modules: ${error instanceof Error ? error.message : String(error)}`));
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('get')
      .description('Get a specific module')
      .argument('<n>', 'Name of the module to get')
      .action((moduleName) => {
        try {
          const modulePath = path.join(modulesDir, `${moduleName}.json`);
          
          if (!fs.existsSync(modulePath)) {
            console.error(chalk.red(`Module ${moduleName} not found`));
            process.exit(1);
          }
          
          const module = readConfigFile(modulePath);
          
          // Display module metadata
          if (module._meta) {
            console.log(chalk.cyan('\nModule Metadata:'));
            console.log(`Name: ${chalk.yellow(module._meta.name)}`);
            console.log(`Version: ${chalk.yellow(module._meta.version)}`);
            console.log(`Description: ${chalk.yellow(module._meta.description)}`);
          }
          
          // Display module configuration
          console.log(chalk.cyan('\nModule Configuration:'));
          console.log(JSON.stringify(module.config, null, 2));
        } catch (error) {
          console.error(chalk.red(`Error getting module: ${error instanceof Error ? error.message : String(error)}`));
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('update')
      .description('Update a module configuration')
      .argument('<n>', 'Name of the module to update')
      .argument('<file>', 'Path to the new module configuration file')
      .action((moduleName, filePath) => {
        try {
          const module = readConfigFile(filePath);
          
          // Validate module format
          if (!module._meta || !module.config) {
            console.error(chalk.red('Invalid module format. Module must have _meta and config sections.'));
            process.exit(1);
          }
          
          // Ensure module name is correct
          module._meta.name = moduleName;
          
          // Set or update version
          if (!module._meta.version) {
            module._meta.version = '1.0.0';
          }
          
          const outputPath = path.join(modulesDir, `${moduleName}.json`);
          
          // Ensure modules directory exists
          if (!fs.existsSync(modulesDir)) {
            fs.mkdirSync(modulesDir, { recursive: true });
          }
          
          // Write updated module
          fs.writeFileSync(outputPath, JSON.stringify(module, null, 2));
          
          console.log(chalk.green(`Module ${moduleName} updated successfully`));
        } catch (error) {
          console.error(chalk.red(`Error updating module: ${error instanceof Error ? error.message : String(error)}`));
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('validate')
      .description('Validate a module configuration')
      .argument('<n>', 'Name of the module to validate')
      .argument('[file]', 'Path to the module configuration file (optional)')
      .action((moduleName, filePath) => {
        try {
          let module;
          
          if (filePath) {
            // Validate a file
            module = readConfigFile(filePath);
          } else {
            // Validate an existing module
            const modulePath = path.join(modulesDir, `${moduleName}.json`);
            
            if (!fs.existsSync(modulePath)) {
              console.error(chalk.red(`Module ${moduleName} not found`));
              process.exit(1);
            }
            
            module = readConfigFile(modulePath);
          }
          
          // Basic validation
          const validationIssues = [];
          
          if (!module._meta) {
            validationIssues.push('Missing _meta section');
          } else {
            if (!module._meta.name) validationIssues.push('Missing _meta.name');
            if (!module._meta.version) validationIssues.push('Missing _meta.version');
            if (!module._meta.description) validationIssues.push('Missing _meta.description');
            
            // Check if name matches the expected module name
            if (module._meta.name !== moduleName) {
              validationIssues.push(`Module name mismatch: Expected "${moduleName}", got "${module._meta.name}"`);
            }
          }
          
          if (!module.config) {
            validationIssues.push('Missing config section');
          }
          
          if (validationIssues.length > 0) {
            console.error(chalk.red(`Validation failed for module ${moduleName}:`));
            validationIssues.forEach(issue => {
              console.error(chalk.red(`- ${issue}`));
            });
            process.exit(1);
          }
          
          console.log(chalk.green(`Module ${moduleName} is valid`));
        } catch (error) {
          console.error(chalk.red(`Error validating module: ${error instanceof Error ? error.message : String(error)}`));
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('upload-kv')
      .description('Upload a specific module to KV store')
      .argument('<n>', 'Name of the module to upload')
      .requiredOption('-e, --env <environment>', 'Environment to use (dev, staging, prod)')
      .option('-n, --namespace <namespace>', 'KV namespace ID or binding name', process.env.KV_NAMESPACE || 'IMAGE_CONFIGURATION_STORE')
      .action((moduleName, options) => {
        try {
          const modulePath = path.join(modulesDir, `${moduleName}.json`);
          
          if (!fs.existsSync(modulePath)) {
            console.error(chalk.red(`Module ${moduleName} not found`));
            process.exit(1);
          }
          
          const module = readConfigFile(modulePath);
          
          // Create temporary file for the value
          const tempFilePath = path.join(
            process.env.TMPDIR || process.env.TMP || '/tmp', 
            `module-${moduleName}-${Date.now()}.json`
          );
          
          // Write module to temporary file
          fs.writeFileSync(tempFilePath, JSON.stringify(module, null, 2));
          console.log(chalk.blue(`Wrote module to temporary file: ${chalk.cyan(tempFilePath)}`));
          
          // Create metadata JSON for this module
          const metadata = {
            module: moduleName,
            version: module._meta.version,
            description: module._meta.description,
            lastUpdated: new Date().toISOString()
          };
          
          // Create KV put command with metadata (updated for Wrangler v4+)
          const command = `wrangler kv key put config_module_${moduleName} --binding=${options.namespace} --path=${tempFilePath} --metadata='${JSON.stringify(metadata)}' --env=${options.env} --remote`;
          console.log(chalk.blue(`Executing command: ${chalk.cyan(command)}`));
          
          // Execute command
          const output = execSync(command, { encoding: 'utf8' });
          console.log(output);
          
          // Get the comprehensive config and update it with the new module
          console.log(chalk.blue(`Updating comprehensive config with new ${moduleName} module...`));
          
          // Get the current version
          let versionId = "v1";
          try {
            const versionOutput = execSync(`wrangler kv key get config_current --binding=${options.namespace} --env=${options.env} --remote`, { encoding: 'utf8' }).trim();
            if (versionOutput) {
              versionId = versionOutput;
            }
          } catch (e) {
            // If no current version, use v1
            console.log(chalk.yellow(`No current version found, using ${versionId}`));
          }
          
          // Get the current config if it exists
          let comprehensiveConfig;
          try {
            const configOutput = execSync(`wrangler kv key get config_v${versionId.replace(/^v/, '')} --binding=${options.namespace} --env=${options.env} --remote`, { encoding: 'utf8' });
            comprehensiveConfig = JSON.parse(configOutput);
          } catch (e) {
            // If no config exists, create a new one
            console.log(chalk.yellow(`No existing configuration found, creating new one`));
            comprehensiveConfig = {
              _meta: {
                version: "1.0.0",
                lastUpdated: new Date().toISOString(),
                activeModules: []
              },
              modules: {}
            };
          }
          
          // Update the module in the comprehensive config
          if (!comprehensiveConfig.modules) {
            comprehensiveConfig.modules = {};
          }
          comprehensiveConfig.modules[moduleName] = module;
          
          // Make sure the module is in activeModules
          if (!comprehensiveConfig._meta.activeModules.includes(moduleName)) {
            comprehensiveConfig._meta.activeModules.push(moduleName);
          }
          
          // Update the lastUpdated timestamp
          comprehensiveConfig._meta.lastUpdated = new Date().toISOString();
          
          // Calculate next version
          const nextVersionNum = parseInt(versionId.replace(/^v/, '')) + 1;
          const nextVersionId = `v${nextVersionNum}`;
          
          // Create a temporary file for the updated config
          const configTempPath = path.join(
            process.env.TMPDIR || process.env.TMP || '/tmp', 
            `config-${Date.now()}.json`
          );
          
          // Write updated config to temporary file
          fs.writeFileSync(configTempPath, JSON.stringify(comprehensiveConfig, null, 2));
          
          // Create metadata for the new version
          const versionMetadata = {
            version: comprehensiveConfig._meta.version,
            lastUpdated: comprehensiveConfig._meta.lastUpdated,
            modules: comprehensiveConfig._meta.activeModules,
            type: 'comprehensive'
          };
          
          // Upload the new version
          console.log(chalk.blue(`Uploading new version ${nextVersionId}...`));
          const versionCommand = `wrangler kv key put config_${nextVersionId} --binding=${options.namespace} --path=${configTempPath} --metadata='${JSON.stringify(versionMetadata)}' --env=${options.env} --remote`;
          const versionOutput = execSync(versionCommand, { encoding: 'utf8' });
          console.log(versionOutput);
          
          // Update the current version pointer
          console.log(chalk.blue(`Setting current version to ${nextVersionId}...`));
          const currentCommand = `wrangler kv key put config_current "${nextVersionId}" --binding=${options.namespace} --env=${options.env} --remote`;
          const currentOutput = execSync(currentCommand, { encoding: 'utf8' });
          console.log(currentOutput);
          
          // Clean up temporary file
          fs.unlinkSync(configTempPath);
          
          console.log(chalk.green(
            `Module ${moduleName} successfully loaded into KV namespace '${chalk.cyan(options.namespace)}' for environment '${chalk.cyan(options.env)}'`
          ));
          
          // Clean up temporary file
          fs.unlinkSync(tempFilePath);
          console.log(chalk.blue(`Removed temporary file: ${chalk.cyan(tempFilePath)}`));
        } catch (error) {
          console.error(chalk.red(`Error uploading module to KV: ${error instanceof Error ? error.message : String(error)}`));
          process.exit(1);
        }
      })
  );

// Comprehensive config commands
program
  .command('comprehensive')
  .description('Manage comprehensive configuration')
  .addCommand(
    new Command('create')
      .description('Create a comprehensive configuration from individual modules')
      .option('-o, --output <path>', 'Output path for the comprehensive config', path.join(comprehensiveDir, 'complete-config.json'))
      .action((options) => {
        try {
          // Create directory if it doesn't exist
          const outputDir = path.dirname(options.output);
          if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
          }
          
          // Check if modules directory exists
          if (!fs.existsSync(modulesDir)) {
            console.error(chalk.red('Modules directory does not exist'));
            process.exit(1);
          }
          
          const files = fs.readdirSync(modulesDir);
          const moduleFiles = files.filter(file => file.endsWith('.json'));
          
          if (moduleFiles.length === 0) {
            console.error(chalk.red('No module files found'));
            process.exit(1);
          }
          
          // Create comprehensive config structure
          const comprehensiveConfig = {
            _meta: {
              version: '1.0.0',
              lastUpdated: new Date().toISOString(),
              activeModules: []
            },
            modules: {}
          };
          
          // Load and add each module
          moduleFiles.forEach(file => {
            const moduleName = path.basename(file, '.json');
            const modulePath = path.join(modulesDir, file);
            
            try {
              const module = readConfigFile(modulePath);
              comprehensiveConfig.modules[moduleName] = module;
              comprehensiveConfig._meta.activeModules.push(moduleName);
              console.log(chalk.blue(`Added module ${chalk.cyan(moduleName)}`));
            } catch (error) {
              console.warn(chalk.yellow(`Skipping invalid module ${moduleName}: ${error instanceof Error ? error.message : String(error)}`));
            }
          });
          
          // Save the comprehensive config
          fs.writeFileSync(options.output, JSON.stringify(comprehensiveConfig, null, 2));
          console.log(chalk.green(`Created comprehensive configuration at ${options.output}`));
          console.log(chalk.blue(`Included modules: ${comprehensiveConfig._meta.activeModules.join(', ')}`));
        } catch (error) {
          console.error(chalk.red(`Error creating comprehensive config: ${error instanceof Error ? error.message : String(error)}`));
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('extract')
      .description('Extract individual modules from a comprehensive configuration')
      .argument('<file>', 'Path to the comprehensive configuration file')
      .option('-o, --output-dir <path>', 'Output directory for the modules', modulesDir)
      .action((filePath, options) => {
        try {
          const config = readConfigFile(filePath);
          
          // Validate that it's a comprehensive config
          if (!config.modules || !config._meta || !config._meta.activeModules) {
            console.error(chalk.red('Not a valid comprehensive configuration: missing modules or _meta section'));
            process.exit(1);
          }
          
          // Create output directory if it doesn't exist
          if (!fs.existsSync(options.outputDir)) {
            fs.mkdirSync(options.outputDir, { recursive: true });
          }
          
          // Extract each module
          let extractedCount = 0;
          for (const [moduleName, module] of Object.entries(config.modules)) {
            try {
              const outputPath = path.join(options.outputDir, `${moduleName}.json`);
              fs.writeFileSync(outputPath, JSON.stringify(module, null, 2));
              console.log(chalk.blue(`Extracted module ${chalk.cyan(moduleName)} to ${outputPath}`));
              extractedCount++;
            } catch (error) {
              console.warn(chalk.yellow(`Failed to extract module ${moduleName}: ${error instanceof Error ? error.message : String(error)}`));
            }
          }
          
          console.log(chalk.green(`Extracted ${extractedCount} modules from comprehensive configuration`));
        } catch (error) {
          console.error(chalk.red(`Error extracting modules: ${error instanceof Error ? error.message : String(error)}`));
          process.exit(1);
        }
      })
  );

// Command to diagnose configuration issues
program
  .command('diagnose')
  .description('Diagnose configuration issues')
  .requiredOption('-e, --env <environment>', 'Environment to use (dev, staging, prod)')
  .option('-n, --namespace <namespace>', 'KV namespace ID or binding name', process.env.KV_NAMESPACE || 'IMAGE_CONFIGURATION_STORE')
  .action((options) => {
    try {
      console.log(chalk.blue('Starting configuration diagnosis...'));
      
      // Check config_current key
      console.log(chalk.blue('Checking config_current key...'));
      let currentCommand = `wrangler kv key get config_current --binding=${options.namespace} --env=${options.env} --remote`;
      try {
        const currentValue = execSync(currentCommand, { encoding: 'utf8' }).trim();
        console.log(chalk.green(`✓ config_current value is set to: "${currentValue}"`));
        
        // Check if the current value is in the correct format (should be v1, v2, etc.)
        if (!currentValue.match(/^v\d+$/)) {
          console.log(chalk.yellow(`✗ Current value "${currentValue}" is not in version format (should be v1, v2, etc.)`));
          console.log(chalk.blue(`Setting config_current to "v1"...`));
          
          const setCommand = `wrangler kv key put config_current "v1" --binding=${options.namespace} --env=${options.env} --remote`;
          execSync(setCommand, { encoding: 'utf8' });
          console.log(chalk.green(`✓ Set config_current to "v1"`));
          currentValue = "v1";
        }
        
        // Check if proper versioned config exists
        const versionedKey = `config_${currentValue}`;
        console.log(chalk.blue(`Checking if versioned key "${versionedKey}" exists...`));
        const versionedCommand = `wrangler kv key get ${versionedKey} --binding=${options.namespace} --env=${options.env} --remote`;
        try {
          execSync(versionedCommand, { encoding: 'utf8' });
          console.log(chalk.green(`✓ Versioned key "${versionedKey}" exists`));
        } catch (e) {
          console.log(chalk.yellow(`✗ Versioned key "${versionedKey}" does not exist`));
          
          // Try to get the config from the "config" key as fallback
          try {
            console.log(chalk.blue(`Checking for backup config at "config" key...`));
            const configCommand = `wrangler kv key get config --binding=${options.namespace} --env=${options.env} --remote`;
            const configValue = execSync(configCommand, { encoding: 'utf8' });
            console.log(chalk.green(`✓ Found backup config at "config" key`));
            
            // Create a temporary file for the value
            const tempFilePath = path.join(
              process.env.TMPDIR || process.env.TMP || '/tmp', 
              `config-${Date.now()}.json`
            );
            
            // Write config to temporary file
            fs.writeFileSync(tempFilePath, configValue);
            
            // Create metadata for the versioned config
            const metadata = {
              version: "1.0.0",
              lastUpdated: new Date().toISOString(),
              type: 'comprehensive'
            };
            
            // Create versioned key
            console.log(chalk.blue(`Creating versioned key "${versionedKey}" from backup...`));
            const aliasCommand = `wrangler kv key put ${versionedKey} --binding=${options.namespace} --path=${tempFilePath} --metadata='${JSON.stringify(metadata)}' --env=${options.env} --remote`;
            execSync(aliasCommand, { encoding: 'utf8' });
            console.log(chalk.green(`✓ Created versioned key "${versionedKey}"`));
            
            // Clean up temporary file
            fs.unlinkSync(tempFilePath);
          } catch (configError) {
            console.log(chalk.red(`✗ Could not find backup configuration!`));
            console.log(chalk.red('This indicates a serious configuration issue. You need to upload a complete configuration.'));
          }
        }
      } catch (e) {
        console.log(chalk.red('✗ config_current key is not set!'));
        console.log(chalk.yellow('You should run: npm run config:set-current:prod'));
      }
      
      console.log(chalk.blue('\nDiagnosis complete.'));
    } catch (error) {
      console.error(chalk.red(`Error during diagnosis: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }
  });

// Command to set current config
program
  .command('set-current')
  .description('Set the current active configuration key')
  .argument('<key>', 'The key to set as current (e.g., "v1")')
  .requiredOption('-e, --env <environment>', 'Environment to use (dev, staging, prod)')
  .option('-n, --namespace <namespace>', 'KV namespace ID or binding name', process.env.KV_NAMESPACE || 'IMAGE_CONFIGURATION_STORE')
  .action((key, options) => {
    try {
      console.log(chalk.blue(`Setting config_current key to point to '${key}'...`));
      const command = `wrangler kv key put config_current "${key}" --binding=${options.namespace} --env=${options.env} --remote`;
      console.log(chalk.blue(`Executing command: ${chalk.cyan(command)}`));
      
      // Execute command
      const output = execSync(command, { encoding: 'utf8' });
      console.log(output);
      
      console.log(chalk.green(`Successfully set current configuration key to '${key}' in environment '${options.env}'`));
    } catch (error) {
      console.error(chalk.red(`Error setting current config key: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }
  });

// Parse command line arguments
program.parse();

// If no arguments, show help
if (process.argv.length <= 2) {
  program.help();
}