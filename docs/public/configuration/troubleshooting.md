# Configuration API Troubleshooting Guide

This guide addresses common issues you might encounter when working with the Configuration API and provides solutions to resolve them.

## Common Issues

### KV Namespace Not Found

**Symptoms:**
- Error: "Configuration store KV binding is not available"
- Configuration API requests return 500 errors

**Solutions:**
1. Verify your KV namespace bindings in `wrangler.jsonc`:
   ```jsonc
   "kv_namespaces": [
     {
       "binding": "IMAGE_CONFIGURATION_STORE",
       "id": "your-namespace-id"
     }
   ]
   ```

2. Check environment-specific bindings:
   ```jsonc
   "env": {
     "development": {
       "kv_namespaces": [
         {
           "binding": "IMAGE_CONFIGURATION_STORE_DEV",
           "id": "your-dev-namespace-id"
         }
       ]
     }
   }
   ```

3. Confirm namespace existence with:
   ```bash
   wrangler kv:namespace list
   ```

4. If missing, create the namespace:
   ```bash
   wrangler kv:namespace create "IMAGE_CONFIGURATION_STORE"
   wrangler kv:namespace create "IMAGE_CONFIGURATION_STORE_DEV" --preview
   ```

### Authentication Failures

**Symptoms:**
- 401 Unauthorized responses
- "Invalid API key" error

**Solutions:**
1. Check that you're including the API key header:
   ```bash
   curl "https://your-worker.example.com/api/config" \
     -H "X-API-Key: your-api-key"
   ```

2. Verify your API key is correctly set in worker secrets:
   ```bash
   wrangler secret put CONFIG_API_KEY
   # Enter your API key
   ```

3. For development, ensure `DISABLE_CONFIG_AUTH` is set to `"true"` in your development environment:
   ```jsonc
   "env": {
     "development": {
       "vars": {
         "DISABLE_CONFIG_AUTH": "true"
       }
     }
   }
   ```

4. Reset your API key if necessary:
   ```bash
   # Generate a new API key
   KEY=$(openssl rand -hex 32)
   echo "Your new Configuration API Key: $KEY"
   
   # Update it in worker secrets
   wrangler secret put CONFIG_API_KEY
   ```

### Configuration Not Persisting

**Symptoms:**
- Configuration changes appear to save but revert on page refresh
- Changes don't persist across worker restarts

**Solutions:**
1. Check KV write permissions for your account/API token
2. Verify your requests include proper JSON content-type:
   ```bash
   curl -X PUT "https://your-worker.example.com/api/config/modules/cache" \
     -H "Content-Type: application/json" \
     -H "X-API-Key: your-api-key" \
     -d '{"config": {...}, "comment": "Update", "author": "me"}'
   ```

3. Examine KV storage directly:
   ```bash
   # List KV entries to check if config is being stored
   wrangler kv:key list --binding=IMAGE_CONFIGURATION_STORE
   
   # View the current config value
   wrangler kv:key get --binding=IMAGE_CONFIGURATION_STORE config_current
   ```

4. Make sure your configuration is valid JSON:
   ```bash
   # Validate your JSON with jq before sending
   cat your-config.json | jq
   ```

### Invalid Configuration Formatting

**Symptoms:**
- "Validation Error" responses
- Configuration update API calls fail

**Solutions:**
1. Validate your configuration against the schema:
   ```bash
   curl -X POST "https://your-worker.example.com/api/config/validate" \
     -H "Content-Type: application/json" \
     -H "X-API-Key: your-api-key" \
     -d @your-config.json
   ```

2. Check the required fields for your request:
   - `config` - The configuration object
   - `comment` - A description of the change (required)
   - `author` - Who made the change (optional)

3. Ensure you're following the expected structure:
   ```json
   {
     "core": { ... },
     "storage": { ... },
     "transform": { ... },
     "cache": { ... }
   }
   ```

4. For module updates, make sure you're only updating the module's content, not its metadata:
   ```json
   {
     "config": {
       "ttl": { "ok": 86400 }
     },
     "comment": "Update TTL",
     "author": "developer"
   }
   ```

### Missing Environment Variables

**Symptoms:**
- Environment variable references not being resolved
- "${VAR_NAME}" appearing in your configuration values

**Solutions:**
1. Check that your environment variables are set:
   ```bash
   # For local development
   wrangler dev --env-var AWS_ACCESS_KEY_ID=your-key --env-var AWS_SECRET_ACCESS_KEY=your-secret
   
   # For production
   wrangler secret put AWS_ACCESS_KEY_ID
   wrangler secret put AWS_SECRET_ACCESS_KEY
   ```

2. Test environment variable resolution:
   ```bash
   curl -X POST "https://your-worker.example.com/api/config/resolve-env" \
     -H "Content-Type: application/json" \
     -H "X-API-Key: your-api-key" \
     -d '{"value": {"accessKey": "${AWS_ACCESS_KEY_ID}"}}'
   ```

3. Make sure your `configValueResolver.ts` is properly detecting environment variables:
   ```typescript
   // The pattern should match ${VAR_NAME}
   this.envVarPattern = /\${([A-Za-z0-9_]+)}/g;
   ```

### Path-Based Origins Not Working

**Symptoms:**
- All requests go to the default origin regardless of path
- 404 errors for specific paths

**Solutions:**
1. Check your path patterns are valid regular expressions:
   ```json
   "pattern": "/products/.*"
   ```

2. Ensure the R2 bucket binding exists:
   ```jsonc
   "r2_buckets": [
     {
       "binding": "PRODUCTS_BUCKET",
       "bucket_name": "products-bucket"
     }
   ]
   ```

3. Verify your path transformations:
   ```json
   "pathTransforms": {
     "products": {
       "prefix": "product-images",
       "removePrefix": true
     }
   }
   ```

4. Test with the most specific path:
   ```bash
   curl "https://your-worker.example.com/products/specific-product.jpg?width=300"
   ```

### Worker Dev/Route Problems

**Symptoms:**
- Worker not accessible at expected URL
- Routing issues between environments

**Solutions:**
1. Check your `workers_dev` and route settings:
   ```jsonc
   "env": {
     "development": {
       "workers_dev": true
     },
     "production": {
       "workers_dev": false,
       "routes": [
         {
           "pattern": "images.example.com/*",
           "zone_id": "your-zone-id"
         }
       ]
     }
   }
   ```

2. Make sure your zone ID is correct for custom domains:
   ```bash
   # Get your zone ID
   wrangler zone list
   ```

3. For local development, use localhost:
   ```bash
   curl "http://localhost:8787/api/config"
   ```

4. For production, use your custom domain:
   ```bash
   curl "https://images.example.com/api/config"
   ```

## Advanced Troubleshooting

### Debug Logging

Enable debug logging for detailed information:

```jsonc
"vars": {
  "LOGGING_LEVEL": "DEBUG",
  "DEBUG": "true"
}
```

View logs in the Cloudflare Workers dashboard or with:

```bash
wrangler tail
```

### Test KV Operations Directly

Test KV operations directly to isolate issues:

```bash
# Write a test value
wrangler kv:key put --binding=IMAGE_CONFIGURATION_STORE test "Hello World"

# Read it back
wrangler kv:key get --binding=IMAGE_CONFIGURATION_STORE test
```

### Validate Your Wrangler Configuration

Check for wrangler.jsonc syntax issues:

```bash
# Validate wrangler.jsonc
jq . wrangler.jsonc
```

## Contacting Support

If you've tried these troubleshooting steps and still have issues:

1. Gather the following information:
   - The exact error message
   - Your wrangler.jsonc configuration (redact sensitive values)
   - Steps to reproduce the issue
   - Any relevant console logs

2. Open an issue on the GitHub repository with this information.

## Common Error Codes

| Status Code | Error | Possible Causes |
|-------------|-------|-----------------|
| 400 | Invalid Request | Malformed JSON, missing required fields |
| 401 | Unauthorized | Missing or invalid API key |
| 403 | Forbidden | Insufficient permissions |
| 404 | Not Found | Resource doesn't exist, wrong endpoint URL |
| 409 | Conflict | Configuration validation failed |
| 429 | Too Many Requests | Rate limiting |
| 500 | Internal Error | Worker error, KV namespace issue |