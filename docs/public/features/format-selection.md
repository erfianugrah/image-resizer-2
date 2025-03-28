# Image Format Selection

This guide explains how the image resizer selects and optimizes image formats.

## Automatic Format Selection

By default, the image resizer automatically selects the best format for each client based on:

1. Client capabilities (via Accept headers and client hints)
2. Image content type 
3. Performance considerations

### Supported Formats

The image resizer supports the following formats:

- **WebP** - Modern format with excellent compression (supported by most browsers)
- **AVIF** - Next-generation format with superior compression (growing browser support)
- **JPEG** - Universal format for photographs with lossy compression
- **PNG** - Lossless format with alpha channel support
- **GIF** - Animated images (with optional conversion to WebM/MP4)

### Format Selection Logic

The format selection follows this priority:

1. If explicitly specified in URL parameters (`format=webp`), use that format
2. If client supports AVIF and quality optimization is prioritized, use AVIF
3. If client supports WebP, use WebP for most images
4. Fall back to JPEG for photos or PNG for images requiring transparency

## Manual Format Selection

You can explicitly set the output format using the `format` parameter:

```
https://images.example.com/image.jpg?format=webp
```

Available format options:
- `webp` - Convert to WebP
- `avif` - Convert to AVIF
- `jpeg` or `jpg` - Convert to JPEG
- `png` - Convert to PNG
- `gif` - Keep as GIF or convert from static image to GIF
- `auto` - Use automatic format selection (default)

## Format and Quality Relationship

Format selection and quality are closely related:

- AVIF provides better quality at lower file sizes but requires more processing
- WebP offers a good balance of quality, file size, and processing time
- JPEG quality settings are calibrated differently than WebP/AVIF

## Best Practices

1. **Use `format=auto` for most cases** - Let the resizer determine the best format based on client capabilities
2. **Consider `format=webp` as a safe modern default** - When you need to specify a format explicitly
3. **Use `format=avif` for highest compression needs** - When file size is critical and processing time is less important
4. **Specify `format=png` for graphics requiring transparency** - Logos, icons, and UI elements

## API Examples

### Automatic Format Selection
```
https://images.example.com/image.jpg?width=800&format=auto
```

### Force WebP Format
```
https://images.example.com/image.jpg?width=800&format=webp
```

### Force AVIF with High Compression
```
https://images.example.com/image.jpg?width=800&format=avif&quality=75
```

## Advanced Configuration

For advanced format selection logic, refer to the [Client Detection](../client-detection/index.md) documentation which explains how format selection integrates with device capabilities detection.