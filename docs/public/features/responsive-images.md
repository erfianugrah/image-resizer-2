# Responsive Images

This guide explains how to create responsive images that automatically adapt to different screen sizes and device capabilities.

## Basic Responsive Sizing

The image resizer supports responsive image sizing through several mechanisms:

### Width-Based Resizing

Specify only the width and let the height adjust proportionally:

```
https://images.example.com/image.jpg?width=800
```

This is ideal for responsive layouts where images need to fit within a container of a specific width.

### Height-Based Resizing

Specify only the height and let the width adjust proportionally:

```
https://images.example.com/image.jpg?height=600
```

Useful for situations where maintaining a specific height is important.

### Maximum Dimensions

Set maximum dimensions while preserving aspect ratio:

```
https://images.example.com/image.jpg?width=800&height=600&fit=inside
```

With `fit=inside`, the image will be resized to fit within the specified dimensions while maintaining its aspect ratio.

## Advanced Responsive Techniques

### Device Pixel Ratio (DPR)

Account for high-density displays by using the DPR parameter:

```
https://images.example.com/image.jpg?width=800&dpr=2
```

This delivers a higher resolution image for high-DPI displays. The resizer also automatically detects the client's DPR via client hints when available.

### Client Hints Integration

The image resizer can automatically adjust based on client hints headers:

- `Viewport-Width`: Browser viewport width
- `DPR`: Device pixel ratio
- `Width`: Desired resource width

When these headers are present, the resizer can automatically optimize images for the specific device without explicit parameters.

## HTML Implementation

For optimal responsive images, use the `srcset` and `sizes` attributes:

```html
<img src="https://images.example.com/image.jpg?width=800" 
     srcset="https://images.example.com/image.jpg?width=400 400w,
             https://images.example.com/image.jpg?width=800 800w,
             https://images.example.com/image.jpg?width=1200 1200w"
     sizes="(max-width: 600px) 400px,
            (max-width: 1200px) 800px,
            1200px"
     alt="Responsive image">
```

### Picture Element for Art Direction

For more control, use the picture element with media queries:

```html
<picture>
  <source media="(max-width: 600px)" 
          srcset="https://images.example.com/image.jpg?width=400&crop=top">
  <source media="(max-width: 1200px)" 
          srcset="https://images.example.com/image.jpg?width=800">
  <img src="https://images.example.com/image.jpg?width=1200" 
       alt="Responsive image with art direction">
</picture>
```

## Performance Optimizations

### Automatic Format Selection

Combine responsive sizing with automatic format selection:

```
https://images.example.com/image.jpg?width=800&format=auto
```

This delivers the optimal format based on browser support along with the correct size.

### Lazy Loading

Implement lazy loading for responsive images:

```html
<img src="https://images.example.com/image.jpg?width=800" 
     loading="lazy" 
     alt="Lazy loaded responsive image">
```

### Cache Efficiency

All responsive image variations are individually cached for optimal performance.

## Best Practices

1. **Set appropriate breakpoints** - Match your CSS breakpoints for consistency
2. **Limit resolution variations** - 3-4 size variants are typically sufficient
3. **Consider art direction needs** - Use different crops for different screen sizes when layout changes drastically
4. **Implement client hints** - Enable client hints for the most accurate automatic optimizations
5. **Test across device types** - Verify responsive behavior across phones, tablets, and desktops