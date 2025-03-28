# Akamai Image Manager Compatibility Demos

This document provides visual examples of Akamai Image Manager parameters and their Cloudflare Image Resizing equivalents. All examples use the same base image for easy comparison.

## Quick Navigation

- [Back to Documentation Home](../../index.md)
- [Akamai Integration](index.md)
- [Basic Features](basic-features.md)
- [Advanced Features](advanced-features.md)
- [Implementation Details](implementation.md)
- [Transformation Guide](../../core/transformation.md)

## Base Image

Original image without any transformations:

![Original Image](https://images.erfi.dev/Granna_1.JPG)

## Basic Transformations

### Resizing

| Description | Akamai URL | Cloudflare URL | Result |
|-------------|-----------|---------------|--------|
| Basic resize to 400px width | [Akamai](https://images.erfi.dev/Granna_1.JPG?im.resize=width:400) | [Cloudflare](https://images.erfi.dev/Granna_1.JPG?width=400) | ![Resized image](https://images.erfi.dev/Granna_1.JPG?im.resize=width:400) |
| Resize with fixed dimensions | [Akamai](https://images.erfi.dev/Granna_1.JPG?im.resize=width:400,height:300,mode:fit) | [Cloudflare](https://images.erfi.dev/Granna_1.JPG?width=400&height=300&fit=contain) | ![Resized image with fixed dimensions](https://images.erfi.dev/Granna_1.JPG?im.resize=width:400,height:300,mode:fit) |
| Crop to dimensions | [Akamai](https://images.erfi.dev/Granna_1.JPG?im.resize=width:400,height:300,mode:crop) | [Cloudflare](https://images.erfi.dev/Granna_1.JPG?width=400&height=300&fit=crop) | ![Cropped image](https://images.erfi.dev/Granna_1.JPG?im.resize=width:400,height:300,mode:crop) |
| Pad to dimensions | [Akamai](https://images.erfi.dev/Granna_1.JPG?im.resize=width:400,height:300,mode:pad) | [Cloudflare](https://images.erfi.dev/Granna_1.JPG?width=400&height=300&fit=pad) | ![Padded image](https://images.erfi.dev/Granna_1.JPG?im.resize=width:400,height:300,mode:pad) |

### Quality and Format

| Description | Akamai URL | Cloudflare URL | Result |
|-------------|-----------|---------------|--------|
| WebP format | [Akamai](https://images.erfi.dev/Granna_1.JPG?im.format=webp&im.resize=width:400) | [Cloudflare](https://images.erfi.dev/Granna_1.JPG?format=webp&width=400) | ![WebP image](https://images.erfi.dev/Granna_1.JPG?im.format=webp&im.resize=width:400) |
| Low quality JPEG | [Akamai](https://images.erfi.dev/Granna_1.JPG?im.quality=50&im.resize=width:400) | [Cloudflare](https://images.erfi.dev/Granna_1.JPG?quality=50&width=400) | ![Low quality image](https://images.erfi.dev/Granna_1.JPG?im.quality=50&im.resize=width:400) |
| Named quality (high) | [Akamai](https://images.erfi.dev/Granna_1.JPG?im.quality=high&im.resize=width:400) | [Cloudflare](https://images.erfi.dev/Granna_1.JPG?quality=90&width=400) | ![High quality image](https://images.erfi.dev/Granna_1.JPG?im.quality=high&im.resize=width:400) |

### Image Adjustments

| Description | Akamai URL | Cloudflare URL | Result |
|-------------|-----------|---------------|--------|
| Grayscale | [Akamai](https://images.erfi.dev/Granna_1.JPG?im.grayscale=true&im.resize=width:400) | [Cloudflare](https://images.erfi.dev/Granna_1.JPG?saturation=0&width=400) | ![Grayscale image](https://images.erfi.dev/Granna_1.JPG?im.grayscale=true&im.resize=width:400) |
| Brightness adjustment | [Akamai](https://images.erfi.dev/Granna_1.JPG?im.brightness=1.2&im.resize=width:400) | [Cloudflare](https://images.erfi.dev/Granna_1.JPG?brightness=1.2&width=400) | ![Brightness adjusted image](https://images.erfi.dev/Granna_1.JPG?im.brightness=1.2&im.resize=width:400) |
| Contrast adjustment | [Akamai](https://images.erfi.dev/Granna_1.JPG?im.contrast=1.2&im.resize=width:400) | [Cloudflare](https://images.erfi.dev/Granna_1.JPG?contrast=1.2&width=400) | ![Contrast adjusted image](https://images.erfi.dev/Granna_1.JPG?im.contrast=1.2&im.resize=width:400) |
| Sharpen | [Akamai](https://images.erfi.dev/Granna_1.JPG?im.sharpen=50&im.resize=width:400) | [Cloudflare](https://images.erfi.dev/Granna_1.JPG?sharpen=5&width=400) | ![Sharpened image](https://images.erfi.dev/Granna_1.JPG?im.sharpen=50&im.resize=width:400) |

### Rotation

| Description | Akamai URL | Cloudflare URL | Result |
|-------------|-----------|---------------|--------|
| Rotate 90° | [Akamai](https://images.erfi.dev/Granna_1.JPG?im.rotate=90&im.resize=width:400) | [Cloudflare](https://images.erfi.dev/Granna_1.JPG?rotate=90&width=400) | ![Rotated image](https://images.erfi.dev/Granna_1.JPG?im.rotate=90&im.resize=width:400) |
| Rotate 180° | [Akamai](https://images.erfi.dev/Granna_1.JPG?im.rotate=180&im.resize=width:400) | [Cloudflare](https://images.erfi.dev/Granna_1.JPG?rotate=180&width=400) | ![Rotated image](https://images.erfi.dev/Granna_1.JPG?im.rotate=180&im.resize=width:400) |

## Advanced Features

### Aspect Crop

| Description | Akamai URL | Cloudflare URL | Result |
|-------------|-----------|---------------|--------|
| 16:9 Aspect ratio | [Akamai](https://images.erfi.dev/Granna_1.JPG?im.aspectCrop=width:16,height:9) | [Cloudflare](https://images.erfi.dev/Granna_1.JPG?width=400&height=225&fit=crop) | ![16:9 aspect ratio](https://images.erfi.dev/Granna_1.JPG?im.aspectCrop=width:16,height:9) |
| Positioned aspect crop | [Akamai](https://images.erfi.dev/Granna_1.JPG?im.aspectCrop=width:16,height:9,hoffset:0.5,voffset:0.2) | [Cloudflare](https://images.erfi.dev/Granna_1.JPG?width=400&height=225&fit=crop&gravity=north) | ![Positioned aspect crop](https://images.erfi.dev/Granna_1.JPG?im.aspectCrop=width:16,height:9,hoffset:0.5,voffset:0.2) |

### Blur Effect

| Description | Akamai URL | Cloudflare URL | Result |
|-------------|-----------|---------------|--------|
| Light blur | [Akamai](https://images.erfi.dev/Granna_1.JPG?im.blur=10&im.resize=width:400) | [Cloudflare](https://images.erfi.dev/Granna_1.JPG?blur=25&width=400) | ![Light blur](https://images.erfi.dev/Granna_1.JPG?im.blur=10&im.resize=width:400) |
| Heavy blur | [Akamai](https://images.erfi.dev/Granna_1.JPG?im.blur=40&im.resize=width:400) | [Cloudflare](https://images.erfi.dev/Granna_1.JPG?blur=100&width=400) | ![Heavy blur](https://images.erfi.dev/Granna_1.JPG?im.blur=40&im.resize=width:400) |

### Mirror/Flip Effects

| Description | Akamai URL | Cloudflare URL | Result |
|-------------|-----------|---------------|--------|
| Horizontal mirror | [Akamai](https://images.erfi.dev/Granna_1.JPG?im.mirror=horizontal&im.resize=width:400) | [Cloudflare](https://images.erfi.dev/Granna_1.JPG?flip=true&width=400) | ![Horizontal mirror](https://images.erfi.dev/Granna_1.JPG?im.mirror=horizontal&im.resize=width:400) |
| Vertical mirror | [Akamai](https://images.erfi.dev/Granna_1.JPG?im.mirror=vertical&im.resize=width:400) | [Cloudflare](https://images.erfi.dev/Granna_1.JPG?flop=true&width=400) | ![Vertical mirror](https://images.erfi.dev/Granna_1.JPG?im.mirror=vertical&im.resize=width:400) |
| Both mirrors | [Akamai](https://images.erfi.dev/Granna_1.JPG?im.mirror=both&im.resize=width:400) | [Cloudflare](https://images.erfi.dev/Granna_1.JPG?flip=true&flop=true&width=400) | ![Both mirrors](https://images.erfi.dev/Granna_1.JPG?im.mirror=both&im.resize=width:400) |

### Watermarking (with Placeholder Watermark)

These examples use a placeholder watermark URL. Replace with your actual watermark URL for testing.

| Description | Akamai URL | Cloudflare URL | Illustration |
|-------------|-----------|---------------|--------------|
| Basic watermark | `im.composite=url:watermark.png,placement:southeast` | Cloudflare draw array with `bottom` and `right` properties | ![Diagram](https://images.erfi.dev/Granna_1.JPG?im.resize=width:400&im.text=Watermark%20Bottom%20Right,position:southeast,size:18) |
| Center watermark | `im.composite=url:watermark.png,placement:center` | Cloudflare draw array with centered watermark | ![Diagram](https://images.erfi.dev/Granna_1.JPG?im.resize=width:400&im.text=Centered%20Watermark,position:center,size:25) |
| Watermark with opacity | `im.composite=url:watermark.png,opacity:50` | Cloudflare draw array with `opacity: 0.5` | ![Diagram](https://images.erfi.dev/Granna_1.JPG?im.resize=width:400&im.text=Semi-Transparent,position:center,size:25,opacity:50) |
| Watermark with sizing | `im.composite=url:watermark.png,width:100,height:50,placement:northeast` | Cloudflare draw array with `width: 100, height: 50, top: 10, right: 10` | ![Diagram](https://images.erfi.dev/Granna_1.JPG?im.resize=width:400&im.text=Sized%20Watermark,position:northeast,size:18) |
| Tiled watermark | `im.composite=url:watermark.png,tile:true` | Cloudflare draw array with `repeat: true` | ![Diagram](https://images.erfi.dev/Granna_1.JPG?im.resize=width:400&im.text=Tiled,position:center,size:18&im.text.repeat=true) |

### Conditional Transformations

These examples demonstrate conditional transformations based on image dimensions:

| Description | Akamai URL | Result |
|-------------|-----------|--------|
| Resize only if width > 800px | `im.if-dimension=width>800,im.resize=width:400` | Original is scaled down only if it's wider than 800px |
| Change aspect to 16:9 only for landscape images | `im.if-dimension=ratio>1,im.aspectCrop=width:16,height:9` | Images with width > height get cropped to 16:9 ratio |
| Apply different quality based on width | `im.if-dimension=width<500,im.quality=85` and `im.if-dimension=width>=500,im.quality=75` | Different quality settings based on image size |

## Combined Transformations

| Description | Akamai URL | Cloudflare URL | Result |
|-------------|-----------|---------------|--------|
| Resize + Quality + Format | [Akamai](https://images.erfi.dev/Granna_1.JPG?im.resize=width:400&im.quality=75&im.format=webp) | [Cloudflare](https://images.erfi.dev/Granna_1.JPG?width=400&quality=75&format=webp) | ![Combined transformation](https://images.erfi.dev/Granna_1.JPG?im.resize=width:400&im.quality=75&im.format=webp) |
| Resize + Grayscale + Blur | [Akamai](https://images.erfi.dev/Granna_1.JPG?im.resize=width:400&im.grayscale=true&im.blur=20) | [Cloudflare](https://images.erfi.dev/Granna_1.JPG?width=400&saturation=0&blur=50) | ![Resized grayscale with blur](https://images.erfi.dev/Granna_1.JPG?im.resize=width:400&im.grayscale=true&im.blur=20) |
| Crop + Mirror + Sharpen | [Akamai](https://images.erfi.dev/Granna_1.JPG?im.resize=width:400,height:300,mode:crop&im.mirror=horizontal&im.sharpen=30) | [Cloudflare](https://images.erfi.dev/Granna_1.JPG?width=400&height=300&fit=crop&flip=true&sharpen=3) | ![Cropped, mirrored and sharpened](https://images.erfi.dev/Granna_1.JPG?im.resize=width:400,height:300,mode:crop&im.mirror=horizontal&im.sharpen=30) |
| Resize + Watermark + Blur | [Akamai](https://images.erfi.dev/Granna_1.JPG?im.resize=width:400&im.composite=url:watermark.png,placement:southeast&im.blur=10) | [Cloudflare](https://images.erfi.dev/Granna_1.JPG?width=400&blur=25&draw=[{"url":"watermark.png","bottom":10,"right":10}]) | ![Complex transformation](https://images.erfi.dev/Granna_1.JPG?im.resize=width:400&im.blur=10&im.text=Watermark,position:southeast,size:18) |

## Testing Parameters

You can test the compatibility layer by adding `debug=true` to any of the Akamai format URLs:

```
https://images.erfi.dev/Granna_1.JPG?im.resize=width:400&im.quality=75&im.format=webp&im.blur=20&debug=true
```

This will add debug headers to the response showing:
- Original Akamai parameters
- Translated Cloudflare parameters
- Whether advanced features were enabled
- Processing time for the translation

## Parameter Reference

### Akamai `im.composite` Parameters

| Parameter | Description | Cloudflare Equivalent |
|-----------|-------------|----------------------|
| `url` | URL of the watermark image | `url` in draw array object |
| `placement` | Position of the watermark (e.g., `center`, `southeast`) | Positioning properties (`top`, `right`, `bottom`, `left`) |
| `opacity` | Opacity from 0-100 | `opacity` (0-1 scale) |
| `offset` | Distance from edge in pixels | Value of positioning property |
| `width` | Width of the watermark in pixels | `width` in draw array object |
| `height` | Height of the watermark in pixels | `height` in draw array object |
| `tile` | Set to `true` for repeating pattern | `repeat: true` |

### Cloudflare Draw Array Translation

```json
// Akamai format:
im.composite=url:watermark.png,placement:southeast,opacity:80,offset:20

// Translates to Cloudflare format:
draw=[{
  "url": "watermark.png",
  "bottom": 20,
  "right": 20,
  "opacity": 0.8
}]
```

## URL Format Compatibility

Akamai supports several URL formats for transformation parameters:

1. **Query Parameters**
   ```
   https://images.erfi.dev/Granna_1.JPG?im.resize=width:400,height:300,mode:fit&im.quality=75
   ```

2. **Path Segment Parameters with im-**
   ```
   https://images.erfi.dev/im-resize=width:400,height:300,mode:fit/im-quality=75/Granna_1.JPG
   ```

3. **Path Segment Parameters with im()**
   ```
   https://images.erfi.dev/im(resize=width:400,height:300,mode:fit,quality=75)/Granna_1.JPG
   ```

All these formats are automatically detected and converted to Cloudflare's query parameter format.

## Troubleshooting

### Image Rendering Issues

If images aren't rendering as expected:

1. Check the debug headers to see how parameters are being translated
2. Verify the syntax of your Akamai parameters
3. Compare with the examples in this document
4. Try simplifying the parameters to isolate the issue
5. Check if the parameters are being properly URL-encoded

### Parameter Compatibility Problems

If a specific Akamai parameter isn't working:

1. Verify the parameter is supported by checking the parameter mapping table in [Basic Features](basic-features.md)
2. Check if the feature requires `ENABLE_AKAMAI_ADVANCED_FEATURES` to be enabled
3. Try an alternative parameter that achieves a similar effect
4. Check the implementation details in [Implementation Details](implementation.md)
5. Check for any syntax issues in the parameter value

## Related Resources

- [Basic Features](basic-features.md) - Parameter mapping documentation
- [Advanced Features](advanced-features.md) - Complex Akamai feature implementations
- [Implementation Details](implementation.md) - Technical implementation details
- [Transformation Guide](../../core/transformation.md) - Native Cloudflare transformation options
- [Debugger Reference](../../debugging/debug-headers.md) - Debug headers and tools
- [Akamai Image Manager Documentation](https://techdocs.akamai.com/imaging/docs/image-manager) - Original Akamai documentation

---

*Last Updated: March 22, 2025*