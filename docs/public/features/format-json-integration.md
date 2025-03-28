# Image Dimension Pre-fetch with Format:JSON

## Overview

The Format:JSON integration enables the image resizer to make intelligent transformation decisions by pre-fetching image dimensions and metadata. This feature is particularly valuable for operations that depend on knowing the original image's characteristics.

## How It Works

The Format:JSON integration:

1. Makes a lightweight request to get image metadata using Cloudflare's `format=json` option
2. Caches dimension results to prevent duplicate fetches
3. Uses this information to enhance transformations that benefit from dimension awareness
4. Optimizes performance by only fetching this data when necessary

## When Dimensions Are Pre-fetched

The system automatically pre-fetches dimensions for:

1. **Cropping operations**: When `fit: 'crop'` or `fit: 'cover'` is specified
2. **Aspect ratio transformations**: When derivative templates or transformations specify maintaining aspect ratios
3. **Focal point operations**: When `gravity: 'auto'` or specific focal points are being used
4. **Explicit requests**: When clients include a `_needsImageInfo=true` parameter

## Direct Access to JSON Data

You can explicitly request JSON metadata:

```
https://images.example.com/image.jpg?format=json
```

Returns:
```json
{
  "metadata": {
    "width": 1200,
    "height": 800,
    "format": "jpeg"
  },
  "result": {
    "width": 1200,
    "height": 800,
    "format": "json"
  }
}
```

## Usage Examples

### Smart Cropping with Dimension Awareness

```
https://images.example.com/image.jpg?fit=crop&width=400&height=400
```

The system will automatically fetch the dimensions to ensure optimal cropping.

### Explicit Dimension Pre-fetching

```
https://images.example.com/image.jpg?width=500&_needsImageInfo=true
```

Forces dimension pre-fetching even for operations that wouldn't normally require it.

### Derivative with Aspect Ratio Maintenance

```
https://images.example.com/image.jpg?derivative=thumbnail
```

If the thumbnail derivative includes aspect ratio constraints, the system will automatically fetch dimensions.

## Performance Considerations

1. **Intelligent targeting**: Only applies to operations that truly benefit
2. **Caching**: Dimension data is cached by image path
3. **Lightweight processing**: The JSON request is very small and fast

## Smart Transformation Parameters

The Format:JSON integration supports several parameters for intelligent transformations:

| Parameter | Description | Example |
|-----------|-------------|---------|
| `smart` | Enable smart transformations | `?smart=true` |
| `platform` | Target platform for aspect ratio optimization | `?platform=instagram` |
| `aspect` | Desired aspect ratio | `?aspect=16:9` or `?aspect=16-9` |
| `content` | Content type for focal point optimization | `?content=portrait` |
| `focal` | Custom focal point | `?focal=0.5,0.33` |
| `allowExpansion` | Allow image expansion to fit aspect ratio | `?allowExpansion=true` |
| `device` | Target device for dimension optimization | `?device=mobile` |
| `debug` | Include diagnostic information in response | `?debug=true` |

## Platform Presets

| Platform | Aspect Ratio | Default Width | Notes |
|----------|-------------|--------------|-------|
| `twitter` | 16:9 | 1200px | Twitter cards |
| `facebook` | 1.91:1 | 1200px | Facebook link previews |
| `instagram` | 1:1 | 1080px | Instagram square format |
| `instagram_portrait` | 4:5 | 1080px | Instagram portrait format |
| `instagram_landscape` | 16:9 | 1080px | Instagram landscape format |
| `pinterest` | 2:3 | 1000px | Pinterest pins |
| `linkedin` | 1.91:1 | 1200px | LinkedIn posts |

For detailed implementation information, see [Format JSON Usage](format-json-usage.md) and [Format JSON Workflow](format-json-workflow.md).