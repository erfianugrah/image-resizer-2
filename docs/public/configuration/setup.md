# Setting Up the Configuration System

This guide explains how to set up and initialize the Configuration API in your Cloudflare Workers environment.

## Prerequisites

Before setting up the Configuration system, ensure you have:

1. Cloudflare Workers account with access to KV namespaces
2. Wrangler CLI installed (for KV operations)
3. Proper bindings in your `wrangler.toml` configuration

## Creating the KV Namespace

First, create a KV namespace to store your configurations:

```bash
# Create the KV namespace
wrangler kv:namespace create "IMAGE_RESIZER_CONFIG"

# Add the namespace to your dev environment
wrangler kv:namespace create "IMAGE_RESIZER_CONFIG_DEV" --preview
```

## Binding the KV Namespace

Add the KV namespace binding to your `wrangler.toml`:

```toml
kv_namespaces = [
  { binding = "IMAGE_RESIZER_CONFIG", id = "your-namespace-id-here" }
]

[env.dev]
kv_namespaces = [
  { binding = "IMAGE_RESIZER_CONFIG", id = "your-preview-namespace-id-here" }
]
```

## Initialize Configuration

There are two ways to initialize your configuration:

### Option 1: Load Initial Configuration Using a Script

Use the provided script to load an initial configuration into your KV namespace:

```bash
# Use the script from the scripts directory
chmod +x ./scripts/load-initial-config.js

# Load a configuration file
./scripts/load-initial-config.js ./docs/public/configuration/examples/auth-and-path-origins-config.json --key=config --env=dev
```

This script will:
1. Read the specified JSON configuration file
2. Use wrangler to upload it to your KV namespace
3. Store it under the specified key

### Option 2: Configure Programmatically at Startup

Alternatively, you can initialize the configuration during worker startup:

```typescript
export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      // Check if configuration exists
      const configExists = await env.IMAGE_RESIZER_CONFIG.get('config');
      
      // If no configuration exists, create an initial one
      if (!configExists) {
        console.log('No configuration found, initializing with defaults');
        
        // Create initial configuration
        const initialConfig = {
          core: {
            environment: 'development',
            version: '1.0.0',
            // ... other default settings
          },
          // ... more default settings
        };
        
        // Store in KV
        await env.IMAGE_RESIZER_CONFIG.put('config', JSON.stringify(initialConfig));
      }
      
      // Continue handling the request
      // ...
    } catch (error) {
      console.error('Error initializing configuration', error);
      return new Response('Configuration error', { status: 500 });
    }
  }
}
```

## Securing the Configuration API

It's important to secure the Configuration API to prevent unauthorized changes:

1. Add API key authentication middleware:

```typescript
import { configAuthMiddleware } from './handlers/configAuthMiddleware';

// In your request handler:
if (request.url.includes('/config')) {
  // Apply authentication middleware
  const authResult = configAuthMiddleware(request, env);
  if (!authResult.success) {
    return new Response(authResult.message, { status: authResult.status });
  }
  
  // Continue with configuration request handling
}
```

2. Set a strong API key in your environment variables:

```toml
[vars]
CONFIG_API_KEY = "your-strong-random-api-key-here"
```

## Testing the Configuration

After setting up, you can test if your configuration is working correctly:

```bash
# Get the current configuration
curl https://your-worker.example.com/config \
  -H "X-API-Key: your-api-key"

# Update a specific module
curl -X PUT https://your-worker.example.com/config/cache \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{"method":"cf","ttl":{"ok":86400}}'
```

## Environment Variables

When using sensitive information in your configuration, you can reference environment variables:

```json
{
  "storage": {
    "remoteAuth": {
      "accessKeyVar": "AWS_ACCESS_KEY_ID",
      "secretKeyVar": "AWS_SECRET_ACCESS_KEY"
    }
  }
}
```

Then set these variables in your `wrangler.toml` or using Cloudflare's dashboard:

```toml
[vars]
AWS_ACCESS_KEY_ID = "your-access-key"
AWS_SECRET_ACCESS_KEY = "your-secret-key"
```

## Next Steps

After setting up the Configuration system, you may want to:

1. Create custom configurations for your specific needs
2. Set up automated deployments with configuration updates
3. Implement secure configuration backup and versioning

For more details, check the [Configuration API Reference](./api.md) and [Example Configurations](./examples/index.md).