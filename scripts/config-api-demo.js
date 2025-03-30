/**
 * Configuration API Demo
 * 
 * This script demonstrates how to use the Configuration API,
 * including the new features like environment variable interpolation,
 * module registration, and schema validation.
 */

// Base URL for the Configuration API
const BASE_URL = 'https://your-worker.example.com';
const API_KEY = 'your-api-key';

// Helper function for making API requests
async function apiRequest(endpoint, method = 'GET', body = null) {
  const url = `${BASE_URL}${endpoint}`;
  const headers = {
    'X-API-Key': API_KEY,
    'Content-Type': 'application/json'
  };
  
  const options = {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  };
  
  const response = await fetch(url, options);
  const data = await response.json();
  
  if (!response.ok) {
    throw new Error(`API Error (${response.status}): ${data.message || 'Unknown error'}`);
  }
  
  return data;
}

// 1. Get current configuration
async function getCurrentConfig() {
  console.log('1. Getting current configuration...');
  const config = await apiRequest('/api/config');
  console.log(`Configuration version: ${config._meta.version}`);
  console.log(`Active modules: ${config._meta.activeModules.join(', ')}`);
  return config;
}

// 2. Register a new module
async function registerModule() {
  console.log('\n2. Registering a new module...');
  
  const moduleRegistration = {
    name: 'metrics',
    version: '1.0.0',
    description: 'Metrics and monitoring configuration',
    schema: {
      type: 'object',
      required: ['enabled', 'endpoint'],
      properties: {
        enabled: { type: 'boolean' },
        endpoint: { type: 'string', format: 'uri' },
        apiKey: { type: 'string' },
        interval: { type: 'integer', minimum: 1, maximum: 3600 },
        tags: { 
          type: 'array', 
          items: { type: 'string' } 
        }
      }
    },
    defaults: {
      enabled: true,
      endpoint: 'https://${METRICS_HOST}/v1/metrics',
      apiKey: '${METRICS_API_KEY}',
      interval: 60,
      tags: ['image-resizer', 'cloudflare']
    },
    dependencies: ['core']
  };
  
  try {
    const result = await apiRequest('/api/config/modules', 'POST', moduleRegistration);
    console.log(`Module registration result: ${result.message}`);
  } catch (error) {
    console.error(`Failed to register module: ${error.message}`);
  }
}

// 3. Update a module with environment variables
async function updateModule() {
  console.log('\n3. Updating a module with environment variables...');
  
  const moduleUpdate = {
    config: {
      datadog: {
        enabled: true,
        apiKey: '${DATADOG_API_KEY}',
        endpoint: 'https://api.${DATADOG_SITE}/v1/series',
        tags: ['prod', 'image-service']
      }
    },
    comment: 'Added DataDog integration with environment variables',
    author: 'demo-script'
  };
  
  try {
    const result = await apiRequest('/api/config/modules/monitoring', 'PUT', moduleUpdate);
    console.log(`Module update result: ${result.message}`);
  } catch (error) {
    console.error(`Failed to update module: ${error.message}`);
  }
}

// 4. Test environment variable resolution
async function testEnvVarResolution() {
  console.log('\n4. Testing environment variable resolution...');
  
  const testValue = {
    endpoint: 'https://${API_HOST}/api',
    credentials: {
      username: '${API_USER}',
      password: '${API_PASSWORD}'
    }
  };
  
  try {
    const result = await apiRequest('/api/config/resolve-env', 'POST', { value: testValue });
    console.log('Original:', JSON.stringify(testValue, null, 2));
    console.log('Resolved:', JSON.stringify(result.resolved, null, 2));
  } catch (error) {
    console.error(`Failed to resolve environment variables: ${error.message}`);
  }
}

// 5. Bulk update multiple modules
async function bulkUpdate() {
  console.log('\n5. Performing a bulk update...');
  
  const bulkUpdateBody = {
    modules: {
      core: {
        environment: 'production',
        debug: { enabled: false }
      },
      cache: {
        ttl: { 
          ok: 86400,
          clientError: 300,
          serverError: 60
        }
      }
    },
    comment: 'Production settings update',
    author: 'demo-script'
  };
  
  try {
    const result = await apiRequest('/api/config/bulk-update', 'PUT', bulkUpdateBody);
    console.log(`Bulk update result: ${result.message}`);
    console.log(`New version: ${result.version.id}`);
  } catch (error) {
    console.error(`Failed to perform bulk update: ${error.message}`);
  }
}

// 6. Compare two configuration versions
async function compareVersions(version1, version2) {
  console.log(`\n6. Comparing versions ${version1} and ${version2}...`);
  
  try {
    const diff = await apiRequest(`/api/config/diff/${version1}/${version2}`);
    console.log('Added paths:', diff.added);
    console.log('Modified paths:', diff.modified);
    console.log('Removed paths:', diff.removed);
    console.log('Unchanged paths:', diff.unchanged.length);
  } catch (error) {
    console.error(`Failed to compare versions: ${error.message}`);
  }
}

// 7. List all available versions
async function listVersions() {
  console.log('\n7. Listing all configuration versions...');
  
  try {
    const result = await apiRequest('/api/config/versions');
    console.log(`Found ${result.versions.length} versions`);
    
    // Display the most recent 5 versions
    const recentVersions = result.versions.slice(0, 5);
    recentVersions.forEach(version => {
      console.log(`- ${version.id}: "${version.comment}" by ${version.author} (${version.timestamp})`);
    });
    
    return result.versions;
  } catch (error) {
    console.error(`Failed to list versions: ${error.message}`);
    return [];
  }
}

// 8. Retrieve schema for validating configuration
async function getSchemas() {
  console.log('\n8. Retrieving configuration schemas...');
  
  try {
    const result = await apiRequest('/api/config/schema');
    console.log(`Retrieved schemas for ${Object.keys(result.schemas).length} modules`);
    
    // Show all module schemas
    Object.keys(result.schemas).forEach(moduleName => {
      console.log(`- ${moduleName}: ${JSON.stringify(result.schemas[moduleName]).substring(0, 50)}...`);
    });
  } catch (error) {
    console.error(`Failed to get schemas: ${error.message}`);
  }
}

// Run the demo
(async function runDemo() {
  try {
    console.log('=== Configuration API Demo ===\n');
    
    // Get current config and list available versions
    const config = await getCurrentConfig();
    const versions = await listVersions();
    
    // Register a new module
    await registerModule();
    
    // Update a module with environment variables
    await updateModule();
    
    // Test environment variable resolution
    await testEnvVarResolution();
    
    // Perform a bulk update
    await bulkUpdate();
    
    // Compare the first two versions if available
    if (versions.length >= 2) {
      await compareVersions(versions[0].id, versions[1].id);
    }
    
    // Get all schemas
    await getSchemas();
    
    console.log('\n=== Demo completed successfully! ===');
  } catch (error) {
    console.error('Demo failed:', error);
  }
})();