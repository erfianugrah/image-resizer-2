// Simple script to test the Configuration API

// Use the remote development endpoint
const API_URL = 'https://image-resizer-2-development.anugrah.workers.dev';

// Module registration data with moduleDependencies property 
// We've changed the old 'dependencies' property to 'moduleDependencies'
const testModule = {
  name: 'test-module',
  version: '1.0.0',
  description: 'Test Module for Validation',
  schema: {
    type: 'object',
    properties: {
      test: { type: 'string' }
    }
  },
  defaults: {
    test: 'default value'
  },
  moduleDependencies: ['core'] // Using the new property name
};

// Function to register a module
async function registerModule(data) {
  try {
    const response = await fetch(`${API_URL}/api/config/modules`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });
    
    console.log('Response status:', response.status);
    const result = await response.text();
    console.log('Raw response:', result);
    
    try {
      const jsonResult = JSON.parse(result);
      console.log('Registration result:', JSON.stringify(jsonResult, null, 2));
      return jsonResult;
    } catch (e) {
      console.log('Response is not JSON');
      return { success: false, message: result };
    }
  } catch (error) {
    console.error('Error registering module:', error);
    throw error;
  }
}

// Test health endpoint first to verify service is running
async function testHealth() {
  try {
    console.log('Testing health endpoint...');
    const response = await fetch(`${API_URL}/api/config/health`);
    console.log('Health response status:', response.status);
    const result = await response.text();
    console.log('Health response:', result);
    return response.ok;
  } catch (error) {
    console.error('Health check failed:', error);
    return false;
  }
}

// Execute the test
async function runTest() {
  // First check if service is running via health endpoint
  const isHealthy = await testHealth();
  
  if (!isHealthy) {
    console.log('Config API is not available. Make sure wrangler dev is running.');
    return;
  }
  
  console.log('Testing module registration with moduleDependencies property...');
  try {
    await registerModule(testModule);
    console.log('SUCCESS: Module registration test completed!');
  } catch (error) {
    console.error('FAILED: Module registration failed:', error);
  }
}

// Run the test
runTest();