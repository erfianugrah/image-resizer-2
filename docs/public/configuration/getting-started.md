# Getting Started with Configuration API

This guide provides a comprehensive, step-by-step walkthrough for setting up and using the Configuration API with your Image Resizer worker.

## Prerequisites

Before starting, ensure you have:

1. Cloudflare Workers account with appropriate permissions
2. Wrangler CLI installed (`npm install -g wrangler`)
3. Node.js (v16 or later)
4. Git (for cloning the repository)

## Step 1: Clone the Repository

```bash
# Clone the repository
git clone https://github.com/your-org/image-resizer.git
cd image-resizer

# Install dependencies
npm install
```

## Step 2: Set Up KV Namespaces

Create the necessary KV namespaces for storing configuration data:

```bash
# Create KV namespace for configuration in production
wrangler kv:namespace create "IMAGE_CONFIGURATION_STORE"

# Create KV namespace for configuration in development
wrangler kv:namespace create "IMAGE_CONFIGURATION_STORE_DEV" --preview
```

Copy the namespace IDs from the output and add them to your `wrangler.jsonc` file:

```jsonc
"kv_namespaces": [
  {
    "binding": "IMAGE_CONFIGURATION_STORE",
    "id": "your-production-namespace-id-here"
  }
],
"env": {
  "development": {
    "kv_namespaces": [
      {
        "binding": "IMAGE_CONFIGURATION_STORE_DEV",
        "id": "your-dev-namespace-id-here"
      }
    ]
  }
}
```

## Step 3: Generate API Key

Generate a secure API key for accessing the Configuration API:

```bash
# Generate a random API key
KEY=$(openssl rand -hex 32)
echo "Your Configuration API Key: $KEY"

# Add it to your wrangler secrets
wrangler secret put CONFIG_API_KEY
# Paste the generated key when prompted
```

## Step 4: Prepare Initial Configuration

Choose an example configuration from the `docs/public/configuration/examples/` directory:

```bash
# Use the load script from the scripts directory
chmod +x ./scripts/load-initial-config.js

# Load the auth and path-based origins example
./scripts/load-initial-config.js ./docs/public/configuration/examples/auth-and-path-origins-config.json --key=config --env=dev
```

## Step 5: Start Development Server

Start the development server to test your configuration:

```bash
npm run dev
# or
wrangler dev
```

## Step 6: Verify Configuration API

Test that the Configuration API is working properly:

```bash
# Get the current configuration
curl "http://localhost:8787/api/config" \
  -H "X-API-Key: your-api-key"

# This should return your initial configuration
```

## Step 7: Update Configuration (Optional)

Update a specific module in your configuration:

```bash
# Update the cache module configuration
curl -X PUT "http://localhost:8787/api/config/modules/cache" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "config": {
      "method": "cf",
      "ttl": {
        "ok": 3600,
        "clientError": 60,
        "serverError": 10
      },
      "cacheEverything": true
    },
    "comment": "Update cache TTL for testing",
    "author": "developer"
  }'
```

## Step 8: Deploy to Production

When you're ready to deploy to production:

```bash
# First, deploy the worker
wrangler deploy --env production

# Then, load the production configuration
./scripts/load-initial-config.js ./docs/public/configuration/examples/auth-and-path-origins-config.json --key=config --env=production
```

## Step 9: Setting Up Path-Based Origins

To configure path-based origins for different content types:

1. Identify your different content sources (R2 buckets, S3 buckets, etc.)
2. Define path patterns for each content type
3. Create bucket bindings in `wrangler.jsonc`
4. Update your configuration with appropriate origin settings

Example for adding a product images path:

```bash
# First create an R2 bucket (if it doesn't exist)
wrangler r2 bucket create products-bucket

# Then add it to wrangler.jsonc in the r2_buckets section
# "r2_buckets": [
#   {
#     "binding": "PRODUCTS_BUCKET",
#     "bucket_name": "products-bucket"
#   }
# ]

# Finally, update your configuration to include this path pattern
curl -X PUT "https://your-worker.example.com/api/config/modules/storage" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "config": {
      "pathBasedOrigins": {
        "products": {
          "pattern": "/products/.*",
          "priority": ["r2", "remote"],
          "r2": {
            "enabled": true,
            "bindingName": "PRODUCTS_BUCKET"
          },
          "pathTransforms": {
            "products": {
              "prefix": "product-images",
              "removePrefix": true
            }
          }
        }
      }
    },
    "comment": "Added product images path configuration",
    "author": "developer"
  }'
```

## Step 10: Verify with Real Requests

Test your configuration with real image requests:

```bash
# Test a basic image request
curl "https://your-worker.example.com/image.jpg?width=300&height=300"

# Test path-based routing
curl "https://your-worker.example.com/products/sample-product.jpg?width=800"
```

## Next Steps

- Check out the [API Reference](./api.md) for all available endpoints
- Explore [Example Configurations](./examples/index.md)
- Learn about [Troubleshooting](./troubleshooting.md) common issues
- Read the [Migration Guide](./migration-guide.md) if transitioning from an older version