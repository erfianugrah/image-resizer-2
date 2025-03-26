# Using the format=json Feature for Intelligent Image Processing

This document provides examples and usage patterns for the `format=json` feature in the image resizer. It complements the implementation outlined in `format-json-workflow.md`.

## Overview

The `format=json` feature allows you to request metadata about an image instead of the image itself. This metadata can be used to make intelligent decisions about how to process and display the image.

## Basic Usage

To get JSON metadata for an image:

```
https://your-domain.com/path/to/image.jpg?format=json
```

The response will include information like:

```json
{
  "metadata": {
    "width": 1200,
    "height": 800,
    "format": "jpeg",
    "orientation": 1
  }
}
```

## Akamai Compatibility

The same feature is available with Akamai syntax:

```
https://your-domain.com/path/to/image.jpg?im.format=json
```

## Smart Transformation Using Metadata

We've implemented a parameter-based approach to utilize metadata for intelligent transformations:

```
https://your-domain.com/path/to/image.jpg?smart=true
```

This feature:

1. Fetches metadata for the image using `format=json`
2. Analyzes the metadata to determine optimal transformation parameters
3. Applies those parameters to create an optimized image

Alternatively, you can enable smart transformations through derivatives defined in your configuration (e.g., `instagram`, `twitter`) to create fixed endpoint URLs without query parameters.

### Smart Transformation Parameters

Smart transformations support several parameters:

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

The following platform presets are available:

| Platform | Aspect Ratio | Default Width | Notes |
|----------|-------------|--------------|-------|
| `twitter` | 16:9 | 1200px | Twitter cards |
| `facebook` | 1.91:1 | 1200px | Facebook link previews |
| `instagram` | 1:1 | 1080px | Instagram square format |
| `instagram_portrait` | 4:5 | 1080px | Instagram portrait format |
| `instagram_landscape` | 16:9 | 1080px | Instagram landscape format |
| `pinterest` | 2:3 | 1000px | Pinterest pins |
| `linkedin` | 1.91:1 | 1200px | LinkedIn posts |

## Device Presets

| Device | Max Width | Notes |
|--------|-----------|-------|
| `mobile` | 600px | Mobile devices |
| `tablet` | 1200px | Tablet devices |
| `desktop` | 1800px | Desktop devices |

## Content Type Presets

| Content Type | Focal Point | Notes |
|--------------|-------------|-------|
| `portrait` | y: 0.33 | Focus on upper third for portraits |
| `landscape` | y: 0.4 | Slightly above center for landscapes |
| `product` | y: 0.5 | Center focus for product images |

## Example Use Cases

### Social Media Optimization

```
https://your-domain.com/image.jpg?smart=true&platform=instagram
```

This will return a square-cropped version of the image optimized for Instagram.

### Art Direction

```
https://your-domain.com/image.jpg?smart=true&aspect=21:9&content=landscape
```

This will return a cinematic 21:9 crop with landscape-optimized focal point.

### Responsive Images

```
https://your-domain.com/image.jpg?smart=true&device=mobile&platform=twitter
```

This will return a Twitter-optimized image sized appropriately for mobile devices.

### Derivative-Based Approach

In your configuration, define derivatives for common platforms:

```json
"derivatives": {
  "instagram": {
    "smart": true,
    "platform": "instagram"
  },
  "twitter": {
    "smart": true,
    "platform": "twitter"
  }
}
```

Then simply use:

```
https://your-domain.com/image.jpg/instagram
```

### Debug Mode

```
https://your-domain.com/image.jpg?smart=true&platform=facebook&debug=true
```

This will include diagnostic information about the metadata analysis and transformation process in the response headers.

## Implementation Status

This feature is currently in development. The following components have been implemented:

- [x] `format=json` response
- [x] `MetadataFetchingService` for retrieving and processing metadata
- [x] Basic `/smart/` route handling
- [x] Platform presets
- [x] Content type focal point optimization
- [x] Device-specific sizing
- [ ] Integration with client hints for responsive images
- [ ] Advanced focal point detection
- [ ] Caching for metadata requests

## Next Steps

See `format-json-workflow.md` for the detailed implementation plan and timeline.