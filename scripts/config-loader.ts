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

// Base paths for config files
const configDir = path.resolve(process.cwd(), 'config');
const modulesDir = path.resolve(configDir, 'modules');
const comprehensiveDir = path.resolve(configDir, 'comprehensive');

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
      
      // Create KV put command
      const command = `wrangler kv:key put --binding=${options.namespace} ${options.key} --path=${tempFilePath} --env=${options.env}`;
      console.log(chalk.blue(`Executing command: ${chalk.cyan(command)}`));
      
      // Execute command
      const output = execSync(command, { encoding: 'utf8' });
      console.log(output);
      
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

// Module management commands
program
  .command('modules')
  .description('Manage configuration modules')
  .addCommand(
    new Command('list')
      .description('List all available configuration modules')
      .action(() => {
        try {
          console.log(chalk.blue('Available configuration modules:'));
          
          // Create modules directory if it doesn't exist
          if (!fs.existsSync(modulesDir)) {
            console.log(chalk.yellow('Modules directory does not exist. Creating directory...'));
            fs.mkdirSync(modulesDir, { recursive: true });
          }
          
          // List files in the modules directory
          const files = fs.readdirSync(modulesDir);
          
          if (files.length === 0) {
            console.log(chalk.yellow('No modules found in the modules directory.'));
            return;
          }
          
          files.forEach(file => {
            if (file.endsWith('.json')) {
              const moduleName = path.basename(file, '.json');
              const modulePath = path.join(modulesDir, file);
              try {
                const module = readConfigFile(modulePath);
                console.log(`- ${chalk.green(moduleName)} (${chalk.yellow(module._meta?.version || 'unknown')}): ${module._meta?.description || 'No description'}`);
              } catch (error) {
                console.log(`- ${chalk.red(moduleName)} (Invalid module format)`);
              }
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
      .description('Get a specific module configuration')
      .argument('<name>', 'Name of the module to get')
      .option('-o, --output <path>', 'Save output to file')
      .action((moduleName, options) => {
        try {
          const modulePath = path.join(modulesDir, `${moduleName}.json`);
          
          if (!fs.existsSync(modulePath)) {
            console.error(chalk.red(`Module ${moduleName} not found`));
            process.exit(1);
          }
          
          const module = readConfigFile(modulePath);
          console.log(chalk.green(`Module ${moduleName} configuration:`));
          const moduleJson = JSON.stringify(module, null, 2);
          console.log(moduleJson);
          
          if (options.output) {
            fs.writeFileSync(options.output, moduleJson);
            console.log(chalk.blue(`Saved module ${moduleName} to ${options.output}`));
          }
        } catch (error) {
          console.error(chalk.red(`Error retrieving module: ${error instanceof Error ? error.message : String(error)}`));
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('update')
      .description('Update a module configuration')
      .argument('<name>', 'Name of the module to update')
      .argument('<file>', 'Path to the new module configuration file')
      .action((moduleName, filePath) => {
        try {
          const modulePath = path.join(modulesDir, `${moduleName}.json`);
          const newModule = readConfigFile(filePath);
          
          // Basic validation
          if (!newModule._meta || !newModule._meta.name || !newModule._meta.version) {
            console.error(chalk.red('Invalid module format: Missing _meta information'));
            process.exit(1);
          }
          
          if (!newModule.config) {
            console.error(chalk.red('Invalid module format: Missing config section'));
            process.exit(1);
          }
          
          // Create directory if it doesn't exist
          if (!fs.existsSync(modulesDir)) {
            fs.mkdirSync(modulesDir, { recursive: true });
          }
          
          // Update the module name to match the parameter
          newModule._meta.name = moduleName;
          
          // Write the updated module
          fs.writeFileSync(modulePath, JSON.stringify(newModule, null, 2));
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
      .argument('<name>', 'Name of the module to validate')
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
      .argument('<name>', 'Name of the module to upload')
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
          
          // Create KV put command
          const command = `wrangler kv:key put --binding=${options.namespace} config_module_${moduleName} --path=${tempFilePath} --env=${options.env}`;
          console.log(chalk.blue(`Executing command: ${chalk.cyan(command)}`));
          
          // Execute command
          const output = execSync(command, { encoding: 'utf8' });
          console.log(output);
          
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

// Parse command line arguments
program.parse();

// If no arguments, show help
if (process.argv.length <= 2) {
  program.help();
}