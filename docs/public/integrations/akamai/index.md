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

## Supported Parameter Formats

The Image Resizer now supports two distinct parameter formats used by Akamai Image Manager:

### 1. Dot Notation Format (`im.X`)

The traditional format used in many Akamai implementations:

```
https://example.com/image.jpg?im.resize=width:200,height:300&im.quality=80
```

### 2. Equals Notation Format (`im=X`)

The newer format that matches Akamai's official documentation:

```
https://example.com/image.jpg?im=AspectCrop=(1,1),xPosition=.5,yPosition=.5
```

This dual format support ensures seamless compatibility with the full range of Akamai Image Manager implementations found in production.

## URL Parameter Mapping

Akamai Image Manager parameters are mapped to Cloudflare Image Resizing parameters:

| Akamai Parameter | Cloudflare Parameter | Example |
|------------------|----------------------|---------|
| `im.resize=width:800` or `im=Resize,width=800` | `width=800` | Resize width to 800px |
| `im.resize=height:600` or `im=Resize,height=600` | `height=600` | Resize height to 600px |
| `im.resize=mode:fit` or `im=Resize,mode=fit` | `fit=contain` | Fit mode |
| `im.resize=mode:crop` or `im=Resize,mode=crop` | `fit=crop` | Crop mode |
| `im.quality=80` or `im=Quality=80` | `quality=80` | Set quality to 80 |
| `im.format=webp` or `im=Format=webp` | `format=webp` | Convert to WebP |
| `im.aspectCrop=width:1,height:1` or `im=AspectCrop=(1,1)` | `width=800&height=800&fit=crop` | Create square crop |

## Basic Usage

Akamai-style parameters can be used in either format:

```
// Dot notation format
https://your-worker.com/path/to/image.jpg?im.resize=width:800,height:600,mode:fit&im.quality=80

// Equals notation format
https://your-worker.com/path/to/image.jpg?im=Resize,width=800,height=600,mode=fit&im=Quality=80
```

## Advanced Features

Advanced features include:

- **Aspect Ratio Crop**: `im=AspectCrop=(16,9),xPosition=0.5,yPosition=0.5`
- **Blur Effects**: `im.blur=20` or `im=Blur=20`
- **Mirror/Flip**: `im.mirror=horizontal` or `im=Mirror,horizontal`
- **Watermarks**: `im.composite=url:/watermarks/logo.png,position:top-right`
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

1. Detects Akamai-style parameters (both `im.X` and `im=X` formats)
2. Parses and validates the parameters
3. Translates to equivalent Cloudflare parameters
4. Adds to the transform options
5. Applies special handling for advanced features

## Live Examples

Here are some examples of Akamai compatibility in action:

#### Dot Notation Format (im.X)
![Akamai Resize](https://images.erfi.dev/Granna_1.JPG?im.resize=width:400,height:300,mode:fit&im.quality=80)

`https://images.erfi.dev/Granna_1.JPG?im.resize=width:400,height:300,mode:fit&im.quality=80`

#### Equals Notation Format (im=X)
![Akamai AspectCrop](https://images.erfi.dev/Granna_1.JPG?im=AspectCrop=(1,1),xPosition=0.5,yPosition=0.5)

`https://images.erfi.dev/Granna_1.JPG?im=AspectCrop=(1,1),xPosition=0.5,yPosition=0.5`

#### Advanced Features - Blur
![Blur Effect](https://images.erfi.dev/Granna_1.JPG?im.blur=20&im.resize=width:400)

`https://images.erfi.dev/Granna_1.JPG?im.blur=20&im.resize=width:400`

#### Advanced Features - Mirror
![Mirror Effect](https://images.erfi.dev/Granna_1.JPG?im=Mirror,horizontal)

`https://images.erfi.dev/Granna_1.JPG?im=Mirror,horizontal`

#### Advanced Features - Conditional Transformations
![Conditional Transform](https://images.erfi.dev/Granna_1.JPG?im.if-dimension=width>800,im.resize=width:400&debug=true)

`https://images.erfi.dev/Granna_1.JPG?im.if-dimension=width>800,im.resize=width:400`

For more details on Akamai compatibility, explore the individual topics in this section.