# Configuration Setup Guide

This guide will help you set up the Configuration API for your Image Resizer service.

## Prerequisites

- Cloudflare Workers account
- Wrangler CLI installed (`npm install -g wrangler`)
- Node.js (v14 or higher)

## 1. Create a KV Namespace

First, create a KV namespace to store your configuration:

```bash
wrangler kv:namespace create CONFIG_STORE
```

Add the binding to your `wrangler.toml`:

```toml
kv_namespaces = [
  { binding = "CONFIG_STORE", id = "your-namespace-id" }
]
```

## 2. Configure Authentication

Set up authentication for the Configuration API by adding secrets to your Wrangler environment:

```bash
# For API Key authentication
wrangler secret put CONFIG_API_KEY

# For Basic Auth (optional)
wrangler secret put CONFIG_ADMIN_USER
wrangler secret put CONFIG_ADMIN_PASSWORD
```

## 3. Load Initial Configuration

Use the provided script to load the initial configuration:

```bash
# Load the default configuration for development
node scripts/load-initial-config.js

# Or specify a custom configuration file and environment
node scripts/load-initial-config.js path/to/config.json production
```

This script will:
1. Convert your configuration to the appropriate format
2. Create a new configuration version
3. Store it in the KV namespace
4. Set it as the current active configuration

## 4. Verify Setup

To verify your setup, deploy your worker and make a request to the health endpoint:

```bash
curl https://your-worker.example.com/api/config/health
```

You should see a response indicating the API is working:

```json
{
  "status": "ok",
  "version": "1.0.0",
  "timestamp": "2023-01-20T12:00:00Z"
}
```

## 5. Access Configuration

To access the current configuration (if you're authenticated):

```bash
curl -H "X-API-Key: your-api-key" https://your-worker.example.com/api/config
```

## Configuration Structure

The Image Resizer uses a simplified configuration structure organized by modules:

```json
{
  "core": {
    "environment": "production",
    "debug": { "enabled": false }
  },
  "transform": {
    "formats": { "preferWebp": true }
  },
  "cache": {
    "method": "cf",
    "ttl": { "default": 86400 }
  }
}
```

See the [Configuration Reference](../core/configuration-reference.md) for all available options.

## Next Steps

- [Configuration API Documentation](./api.md) - Learn about the available API endpoints
- [Example configurations](../../examples/configuration/) - View example configurations
- [Schema Reference](./schema.md) - Understand configuration validation rules