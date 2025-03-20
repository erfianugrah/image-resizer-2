# Setup Guide

This guide provides step-by-step instructions for setting up and deploying Image Resizer 2 on Cloudflare Workers.

## Prerequisites

Before getting started, ensure you have the following:

1. **Cloudflare Account**: You need a Cloudflare account with Workers enabled
2. **Node.js**: Version 18 or later installed
3. **Wrangler CLI**: Cloudflare's command-line tool for Workers
4. **Optional**: An R2 bucket for image storage

## Installation

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/image-resizer-2.git
cd image-resizer-2
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Wrangler

Create or update your `wrangler.jsonc` file with your account details and configuration:

```jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "image-resizer-2",
  "main": "src/index.ts",
  "compatibility_date": "2025-03-19",
  "compatibility_flags": [
    "nodejs_compat"
  ],
  "assets": {
    "binding": "ASSETS",
    "directory": "./public"
  },
  "vars": {
    "ENVIRONMENT": "development",
    "DEBUG": "true",
    "REMOTE_URL": "https://example.com/images",
    "FALLBACK_URL": "https://placehold.co",
    "CACHE_TTL_OK": "60",
    "CACHE_TTL_CLIENT_ERROR": "10",
    "CACHE_TTL_SERVER_ERROR": "5",
    "CACHE_TTL_REMOTE_FETCH": "60",
    "CACHE_METHOD": "cf",
    "DEFAULT_QUALITY": "80",
    "DEFAULT_FIT": "scale-down"
  },
  "r2_buckets": [
    {
      "binding": "IMAGES_BUCKET",
      "bucket_name": "your-r2-bucket-name",
      "preview_bucket_name": "your-dev-bucket-name"
    }
  ],
  "routes": [
    {
      "pattern": "images.yourdomain.com/*",
      "zone_id": "your-zone-id-here"
    }
  ]
}
```

### 4. Configure Authentication (Optional)

If you need to access protected image origins, configure authentication settings:

```jsonc
"vars": {
  // ... other settings ...
  
  /* Authentication settings */
  "AUTH_ENABLED": "true",
  "AUTH_SECURITY_LEVEL": "strict",
  "AUTH_CACHE_TTL": "3600",
  "AUTH_USE_ORIGIN_AUTH": "true",
  "AUTH_SHARE_PUBLICLY": "true",
  
  /* Auth domain settings */
  "AUTH_DOMAIN_SECURE": "secure.example.com"
}
```

Set up secrets for authentication credentials:

```bash
wrangler secret put AUTH_TOKEN_SECRET_SECURE
```

For local development, create a `.dev.vars` file with your development secrets:

```
AUTH_TOKEN_SECRET_SECURE=your-dev-token-secret-here
```

## Development

### 1. Start the Development Server

```bash
npm run dev
# or
wrangler dev
```

This will start a local development server that simulates the Cloudflare Workers environment.

### 2. Test Image Transformations

With the development server running, you can test image transformations:

```
http://localhost:8787/path/to/image.jpg?width=800&height=600
```

### 3. Debug Mode

Enable debug mode to see detailed information about image transformations:

```
http://localhost:8787/path/to/image.jpg?width=800&height=600&debug=true
```

This will return additional headers with debugging information.

## Deployment

### 1. Deploy to Cloudflare Workers

```bash
npm run deploy
# or
wrangler deploy
```

### 2. Configure Environment Variables for Production

Update the `wrangler.jsonc` file with production-specific settings:

```jsonc
"env": {
  "production": {
    "vars": {
      "ENVIRONMENT": "production",
      "DEBUG": "false",
      "CACHE_TTL_OK": "604800",
      "CACHE_TTL_CLIENT_ERROR": "60",
      "CACHE_TTL_SERVER_ERROR": "10",
      "CACHE_TTL_REMOTE_FETCH": "86400",
      "CACHE_METHOD": "cf"
    }
  }
}
```

### 3. Deploy to Production Environment

```bash
wrangler deploy --env production
```

### 4. Setup Production Secrets

Set up secrets for production:

```bash
wrangler secret put AUTH_TOKEN_SECRET_SECURE --env production
```

## Custom Domain Setup

### 1. Add a Custom Domain in Cloudflare Dashboard

1. Go to Workers & Pages in your Cloudflare dashboard
2. Select your worker
3. Go to the Triggers tab
4. Add a Custom Domain

### 2. Update DNS Settings

1. Add a CNAME record for your subdomain (e.g., `images.yourdomain.com`)
2. Point it to `workers.dev`

### 3. Test Your Custom Domain

```
https://images.yourdomain.com/path/to/image.jpg?width=800&height=600
```

## R2 Bucket Setup

### 1. Create an R2 Bucket

1. Go to R2 in your Cloudflare dashboard
2. Create a new bucket for your images
3. Upload some test images to the bucket

### 2. Configure R2 in Wrangler

Update your `wrangler.jsonc` file with your R2 bucket details:

```jsonc
"r2_buckets": [
  {
    "binding": "IMAGES_BUCKET",
    "bucket_name": "your-r2-bucket-name"
  }
]
```

## Advanced Configuration

### Storage Priority

Configure the priority order for image sources:

```jsonc
"vars": {
  // ... other settings ...
  "STORAGE_PRIORITY": "r2,remote,fallback"
}
```

### Custom Derivatives

Create custom transformation templates:

```jsonc
"vars": {
  // ... other settings ...
  "DERIVATIVES": "{\"hero\":{\"width\":1920,\"height\":600,\"fit\":\"cover\",\"gravity\":\"auto\",\"quality\":80}}"
}
```

### Cache Configuration

Fine-tune caching behavior:

```jsonc
"vars": {
  // ... other settings ...
  "CACHE_TAGS_ENABLED": "true",
  "CACHE_TAGS_PREFIX": "img-",
  "CACHE_USE_TTL_BY_STATUS": "true",
  "CACHE_STATUS_SUCCESS_RANGE": "200-299",
  "CACHE_TTL_STATUS_SUCCESS": "604800"
}
```

## Monitoring and Troubleshooting

### Debug Headers

Enable debug headers to troubleshoot image transformations:

```jsonc
"vars": {
  "DEBUG": "true",
  "DEBUG_HEADERS": "all"
}
```

### Check Logs

View logs in the Cloudflare dashboard:

1. Go to Workers & Pages
2. Select your worker
3. Go to the Logs tab

## Performance Optimization

### 1. Enable Cache API

Use the Cache API for better caching control:

```jsonc
"vars": {
  "CACHE_METHOD": "cache-api",
  "CACHE_EVERYTHING": "true"
}
```

### 2. Optimize Format Quality Settings

Adjust quality settings by format:

```jsonc
"vars": {
  "FORMAT_QUALITY_WEBP": "85",
  "FORMAT_QUALITY_AVIF": "80",
  "FORMAT_QUALITY_JPEG": "85",
  "FORMAT_QUALITY_PNG": "90"
}
```

### 3. Use Client Hints

Enable client hints in your HTML:

```html
<meta http-equiv="Accept-CH" content="DPR, Viewport-Width, Width">
```

## Next Steps

- Review the [Authentication Guide](AUTHENTICATION.md) for secured image access
- Explore [Transformation Options](TRANSFORMATION.md) for advanced image manipulation
- Check [Architecture Documentation](ARCHITECTURE.md) to understand the system design