# Cross-Origin Path Transformations

This document explains how to configure and use cross-origin path transformations in the Image Resizer Worker. Path transformations allow you to map URLs differently depending on which storage backend is being used.

## Quick Navigation

- [Back to Documentation Home](../index.md)
- [Storage Overview](index.md)
- [Authentication Configuration](authentication.md)
- [Core Architecture](../core/architecture.md)
- [Configuration Reference](../core/configuration-reference.md)

## Overview

Cross-origin path transformations allow you to map URLs differently depending on which storage backend is being used. This is useful when your different storage systems (R2, remote URLs, or fallback URLs) use different directory structures for the same logical assets.

## Configuration

Path transformations are configured in your `wrangler.jsonc` file in the `PATH_TRANSFORMS` object:

```javascript
"PATH_TRANSFORMS": {
  "images": {
    "prefix": "",
    "removePrefix": true
  },
  "assets": {
    "prefix": "img/",
    "removePrefix": true,
    /* Origin-specific transforms */
    "r2": {
      "prefix": "img/",
      "removePrefix": true
    },
    "remote": {
      "prefix": "assets/",
      "removePrefix": true
    },
    "fallback": {
      "prefix": "public/",
      "removePrefix": true
    }
  },
  "content": {
    "prefix": "content-images/",
    "removePrefix": true
  }
}
```

## How It Works

### Basic Transformation

For any segment in the URL path that matches a key in the `PATH_TRANSFORMS` object, the worker will:

1. Remove that segment from the path if `removePrefix` is `true`
2. Add the specified `prefix` to the beginning of the path

For example, with the above configuration, a request for `/assets/logo.png` will be transformed to `/img/logo.png` before being looked up in storage.

### Origin-Specific Transformations

With origin-specific transformations, you can define different mapping rules for each storage type:

- `r2`: Applied when retrieving from R2 storage
- `remote`: Applied when retrieving from remote URLs
- `fallback`: Applied when retrieving from fallback URLs

Using the configuration above, a request for `/assets/logo.png` would be transformed to:
- R2: `/img/logo.png`
- Remote: `/assets/logo.png`
- Fallback: `/public/logo.png`

## Fallback Behavior

If an origin-specific transformation is not defined, the worker will use the default transformation parameters (the ones defined at the root level of the transform object).

## Dynamic Storage Priority

You can control the order in which storage backends are checked by setting the `STORAGE_PRIORITY` environment variable:

```
STORAGE_PRIORITY=r2,remote,fallback
```

This is useful for testing different storage configurations. You can override this in development:

```bash
# To use remote sources only
wrangler dev --var STORAGE_PRIORITY=remote,fallback

# To use fallback only
wrangler dev --var STORAGE_PRIORITY=fallback

# To try different priority order
wrangler dev --var STORAGE_PRIORITY=fallback,remote,r2
```

## Practical Examples

### Example 1: Different Asset Paths for CDN vs Local Storage

If your CDN uses a different path structure than your local storage:

```javascript
"PATH_TRANSFORMS": {
  "assets": {
    "removePrefix": true,
    "prefix": "",
    "r2": {
      "removePrefix": true,
      "prefix": "static/"
    },
    "remote": {
      "removePrefix": true,
      "prefix": "public/assets/"
    }
  }
}
```

A request for `/assets/images/banner.jpg` would be transformed to:
- R2: `/static/images/banner.jpg`
- Remote: `/public/assets/images/banner.jpg`

### Example 2: Content Migration

When migrating content between systems with different structures:

```javascript
"PATH_TRANSFORMS": {
  "legacy": {
    "removePrefix": true,
    "prefix": "migrated/",
    "r2": {
      "removePrefix": true,
      "prefix": "new-content/"
    },
    "remote": {
      "removePrefix": true,
      "prefix": "old-content/"
    }
  }
}
```

A request for `/legacy/docs/guide.pdf` would be transformed to:
- R2: `/new-content/docs/guide.pdf`
- Remote: `/old-content/docs/guide.pdf`

## Best Practices

- **Keep path mapping simple**: Complex mappings can be hard to maintain
- **Document your path structure**: Create a reference document for your team
- **Use consistent patterns**: Try to follow similar patterns across different storage backends
- **Consider performance**: Excessive path transformations may impact request processing time
- **Test configurations thoroughly**: Ensure all storage backends work correctly with your transformations

## Troubleshooting

### Path Not Being Transformed

If your paths aren't being transformed as expected:

1. Check that the segment name in the URL matches exactly with the key in your `PATH_TRANSFORMS` object
2. Verify that the correct storage backend is being used (enable debug headers to see which one)
3. Ensure your configuration has the correct prefixes and `removePrefix` settings
4. Check that your `STORAGE_PRIORITY` setting is correct if you've customized it

### 404 Errors After Transformation

If you're getting 404 errors after path transformation:

1. Enable debug mode to see the transformed paths in the response headers
2. Verify the actual path structure in your storage backends
3. Double-check the prefix values in your configuration
4. Ensure your R2 bucket permissions are properly configured

## Debugging Path Transformations

To debug path transformations, add `?debug=true` to your URL. The response headers will include:

- `X-Original-Path`: The original path before transformation
- `X-Storage-Type`: Which storage backend was used (r2, remote, or fallback)
- `X-Transformed-Path`: The path after transformation
- `X-Original-URL`: For remote or fallback sources, the full URL that was requested

You can also check the worker logs for detailed transformation information when running in development mode.

## Related Resources

- [Storage Overview](index.md)
- [Authentication Configuration](authentication.md)
- [Core Architecture: Storage System](../core/architecture.md#5-storage-system-storagets)
- [Configuration Reference](../core/configuration-reference.md)
- [Debugging Headers](../debugging/debug-headers.md)
- [Cloudflare R2 Documentation](https://developers.cloudflare.com/r2/)

---

*Last Updated: March 22, 2025*