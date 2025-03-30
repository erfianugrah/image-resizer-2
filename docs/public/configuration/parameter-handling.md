# URL Parameter Handling

The image resizer supports multiple parameter formats to control image transformations, including standard parameters, compact shorthand parameters, and Akamai-compatible legacy parameters.

## Parameter Types

### Standard Parameters

These parameters use the standard format matching the Cloudflare Image Resizing API:

| Parameter | Description | Example |
|-----------|-------------|---------|
| `width` | Width in pixels | `width=800` |
| `height` | Height in pixels | `height=600` |
| `fit` | Resize behavior | `fit=cover` |
| `quality` | Image quality (1-100) | `quality=85` |
| `format` | Output format | `format=webp` |
| `blur` | Blur amount (1-250) | `blur=5` |
| `rotate` | Rotation (90, 180, 270) | `rotate=90` |

### Compact Parameters

Shorthand parameters for shorter URLs:

| Parameter | Equivalent | Example |
|-----------|------------|---------|
| `w` | `width` | `w=800` |
| `h` | `height` | `h=600` |
| `r` | `aspect` | `r=16:9` |
| `p` | `focal` | `p=0.5,0.2` |
| `f` | Size code (maps to width) | `f=xl` |
| `s` | `ctx` (smart cropping) | `s=true` |

### Size Codes

The `f` parameter maps to predefined widths:

| Code | Width | | Code | Width |
|------|-------|-|------|-------|
| `xxu` | 40px | | `l` | 750px |
| `xu` | 80px | | `xl` | 900px |
| `u` | 160px | | `xxl` | 1100px |
| `xxxs` | 300px | | `xxxl` | 1400px |
| `xxs` | 400px | | `sg` | 1600px |
| `xs` | 500px | | `g` | 2000px |
| `s` | 600px | | `xg` | 3000px |
| `m` | 700px | | `xxg` | 4000px |

Example: `?f=xl` sets width to 900px and marks it as explicit (overrides responsive width).

### Akamai-Compatible Parameters

Legacy parameters for compatibility with Akamai Image Manager:

| Parameter | Equivalent | Example |
|-----------|------------|---------|
| `imwidth` | `width` | `imwidth=800` |
| `imheight` | `height` | `imheight=600` |
| `im` | Various transforms | `im=Resize=(800,600)` |
| `im.resize` | Resize operation | `im.resize=width:800` |
| `im.crop` | Crop operation | `im.crop=width:800,height:600` |

## Parameter Priority

When multiple parameters affect the same property, the system uses this priority order:

1. Size Codes (`f=xl`) - Highest priority
2. Explicit width/height parameters (`width=800`, `imwidth=800`)
3. Derivative templates
4. Responsive calculations (for width only, when no explicit width is provided)

## Responsive Width Behavior

If no explicit width is provided, the system calculates a responsive width based on:

1. Client hints (`Viewport-Width`, `DPR`)
2. Detected device type (mobile, tablet, desktop)
3. Configuration defaults

To override responsive width and force an exact size, use any of these approaches:
- `width=800`
- `w=800`
- `imwidth=800`
- `f=xl` (maps to 900px)

## Parameter Combinations

Parameters can be combined for complex transformations:

```
https://images.erfi.dev/Granna_1.JPG?width=800&height=600&fit=cover&format=webp&quality=85
```

Preview:

![Complex Transformation](https://images.erfi.dev/Granna_1.JPG?width=400&height=300&fit=cover&format=webp&quality=85)

Or using the more compact form:

```
https://images.erfi.dev/Granna_1.JPG?w=800&h=600&fit=cover&format=webp&q=85
```

Preview:

![Complex Transformation Compact](https://images.erfi.dev/Granna_1.JPG?w=400&h=300&fit=cover&format=webp&q=85)

## Advanced Examples

### Aspect Ratio Cropping

To crop an image to a specific aspect ratio:

```
https://images.erfi.dev/Granna_1.JPG?width=800&aspect=16:9&fit=crop
```

Preview:

![16:9 Aspect Ratio](https://images.erfi.dev/Granna_1.JPG?width=400&aspect=16:9&fit=crop)

Compact form:

```
https://images.erfi.dev/Granna_1.JPG?w=800&r=16:9
```

Preview:

![16:9 Aspect Ratio Compact](https://images.erfi.dev/Granna_1.JPG?w=400&r=16:9)

### Smart Cropping with Focal Point

To crop intelligently around a specific focal point:

```
https://images.erfi.dev/Granna_1.JPG?width=800&height=600&fit=crop&focal=0.7,0.3
```

Preview:

![Focal Point Cropping](https://images.erfi.dev/Granna_1.JPG?width=400&height=300&fit=crop&focal=0.7,0.3)

Compact form:

```
https://images.erfi.dev/Granna_1.JPG?w=800&h=600&p=0.7,0.3
```

Preview:

![Focal Point Compact](https://images.erfi.dev/Granna_1.JPG?w=400&h=300&p=0.7,0.3)

### Size Code with Format

To use a predefined size with a specific format:

```
https://images.erfi.dev/Granna_1.JPG?f=xl&format=webp
```

Preview:

![Size Code with WebP Format](https://images.erfi.dev/Granna_1.JPG?f=xl&format=webp)

This sets width=900px and format=webp.

### Width-Based Examples

Here are examples using different widths:

| Size | Example |
|------|---------|
| Small (200px) | ![Small Image](https://images.erfi.dev/Granna_1.JPG?width=200) |
| Medium (400px) | ![Medium Image](https://images.erfi.dev/Granna_1.JPG?width=400) |
| Large (600px) | ![Large Image](https://images.erfi.dev/Granna_1.JPG?width=600) |

### Size Code Examples

Different size codes in action:

| Size Code | Result |
|-----------|--------|
| `f=xs` (500px) | ![Extra Small](https://images.erfi.dev/Granna_1.JPG?f=xs) |
| `f=m` (700px) | ![Medium](https://images.erfi.dev/Granna_1.JPG?f=m) |
| `f=l` (750px) | ![Large](https://images.erfi.dev/Granna_1.JPG?f=l) |

## Error Handling and Validation

For information on how parameters are validated and how errors are handled, see the [Parameter Validation and Error Handling](parameter-validation.md) documentation.

## Browser Compatibility

For details on browser compatibility and format auto-detection, see the [Browser Compatibility](../features/browser-compatibility.md) documentation.