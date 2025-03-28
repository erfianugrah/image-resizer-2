# Image Quality Optimization

This guide explains how to optimize image quality and file size using the image resizer.

## Quality Settings

The quality parameter controls the compression level of the output image, balancing visual quality against file size.

### Basic Usage

```
https://images.example.com/image.jpg?quality=80
```

Quality settings range from 1-100:
- **1-30**: Extreme compression, significant visual artifacts
- **30-50**: High compression, noticeable quality loss
- **50-70**: Balanced compression, minor quality loss
- **70-85**: Light compression, negligible quality loss
- **85-100**: Minimal compression, highest quality

The default quality setting is 80, which provides a good balance for most images.

## Automatic Quality Optimization

When `quality=auto` is specified (or no quality is specified with `format=auto`), the image resizer applies intelligent quality optimization:

```
https://images.example.com/image.jpg?quality=auto
```

The automatic quality optimization:

1. Analyzes image content type (photos, graphics, text)
2. Adjusts quality based on client device capabilities
3. Considers network conditions when client hints are available
4. Applies format-specific quality adjustments

## Format-Specific Quality

Quality settings are interpreted differently for each format:

- **JPEG**: Standard quality scale (1-100)
- **WebP**: Quality settings optimized for WebP encoding
- **AVIF**: Quality mapped to appropriate AVIF compression parameters
- **PNG**: Quality affects palette optimization for PNG8 (not applicable for PNG24)

## Advanced Quality Parameters

### Lossless Mode

For formats that support lossless compression:

```
https://images.example.com/image.jpg?lossless=true
```

This parameter forces lossless compression for supported formats (WebP, AVIF, PNG). This increases file size but preserves all image data.

### Compression Level

For fine-tuned control over encoder effort:

```
https://images.example.com/image.jpg?compression_level=6
```

This controls how much processing time is spent optimizing the image:
- Lower values (1-3): Faster processing, less optimization
- Medium values (4-6): Balanced processing time and optimization
- Higher values (7-9): Slower processing, better optimization

The default is 4, which provides good optimization without excessive processing time.

## Client-Adaptive Quality

When combined with client detection, quality can adapt to device capabilities:

- Lower quality for slow network connections
- Higher quality for high-resolution displays
- Balanced approach for standard devices

Reference the [Client Detection](../client-detection/index.md) documentation for integration details.

## Measuring Quality Impact

The debug mode provides insights into quality optimization:

```
https://images.example.com/image.jpg?quality=auto&debug=true
```

This returns HTTP headers with information about:
- Original file size
- Optimized file size
- Compression ratio
- Applied quality setting

## Best Practices

1. **Use `quality=auto` for most cases** - Let the resizer determine the optimal quality
2. **Use quality 70-80 for standard images** - Good balance for most content
3. **Consider lower quality (50-65) for large background images** - Where detail is less important
4. **Use higher quality (85-95) for important photographic content** - When detail preservation is critical
5. **Test quality settings with your specific content** - Quality needs vary by image type