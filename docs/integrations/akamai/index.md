# Akamai Compatibility

The Image Resizer includes comprehensive support for Akamai Image Manager URL parameters, allowing for seamless migration from Akamai to Cloudflare.

## Key Topics

- [Basic Features](basic-features.md) - Core Akamai Image Manager compatibility
- [Advanced Features](advanced-features.md) - Advanced features like blur, watermarking, and conditional transforms
- [Implementation Details](implementation.md) - Technical implementation of Akamai compatibility
- [Demo Examples](demos.md) - Live examples of Akamai compatibility
- [Migration Guide](migration-guide.md) - Guide for migrating from Akamai to Cloudflare

## Akamai Compatibility Features

The Image Resizer supports the following Akamai Image Manager features:

1. **Basic Transformations**: Resize, crop, quality adjustment
2. **Format Conversion**: WebP, AVIF, JPEG, PNG
3. **Advanced Effects**: Blur, sharpen, brightness, contrast
4. **Watermarking**: Text and image watermarks
5. **Conditional Transformations**: Apply transformations based on image attributes
6. **Device-Specific Optimizations**: Mobile, desktop-specific transformations

## URL Parameter Mapping

Akamai Image Manager parameters are mapped to Cloudflare Image Resizing parameters:

| Akamai Parameter | Cloudflare Parameter | Example |
|------------------|----------------------|---------|
| `im.resize=width:800` | `width=800` | Resize width to 800px |
| `im.resize=height:600` | `height=600` | Resize height to 600px |
| `im.resize=mode:fit` | `fit=contain` | Fit mode |
| `im.resize=mode:crop` | `fit=crop` | Crop mode |
| `im.quality=80` | `quality=80` | Set quality to 80 |
| `im.format=webp` | `format=webp` | Convert to WebP |

## Basic Usage

Akamai-style parameters are used just like in Akamai Image Manager:

```
https://your-worker.com/path/to/image.jpg?im.resize=width:800,height:600,mode:fit&im.quality=80
```

## Advanced Features

Advanced features include:

- **Blur Effects**: `im.blur=20`
- **Mirror/Flip**: `im.mirror=horizontal`
- **Watermarks**: `im.overlay=image:/watermarks/logo.png,position:top-right`
- **Conditional Transforms**: `im.if-dimension=width>800,im.resize=width:800`

## Configuration

Akamai compatibility is configured through environment variables:

```jsonc
{
  "vars": {
    "ENABLE_AKAMAI_COMPATIBILITY": "true",
    "ENABLE_AKAMAI_ADVANCED_FEATURES": "true"
  }
}
```

## Implementation Approach

The Image Resizer translates Akamai Image Manager parameters to Cloudflare Image Resizing parameters:

1. Detects Akamai-style parameters (`im.*`)
2. Parses and validates the parameters
3. Translates to equivalent Cloudflare parameters
4. Adds to the transform options
5. Applies special handling for advanced features

## Live Examples

Here are some examples of Akamai compatibility in action:

#### Basic Akamai Parameters
`https://images.example.com/image.jpg?im.resize=width:400,height:300,mode:fit&im.quality=80`

#### Advanced Features - Blur
`https://images.example.com/image.jpg?im.blur=20&im.resize=width:400`

#### Advanced Features - Mirror
`https://images.example.com/image.jpg?im.mirror=horizontal&im.resize=width:400`

#### Advanced Features - Conditional Transformations
`https://images.example.com/image.jpg?im.if-dimension=width>800,im.resize=width:400`

For more details on Akamai compatibility, explore the individual topics in this section.