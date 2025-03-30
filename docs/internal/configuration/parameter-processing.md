# Parameter Processing and Caching

This document provides details on how URL parameters are processed and how the caching system generates keys based on those parameters.

## Parameter Processing Pipeline

The image resizer processes URL parameters through a multi-stage pipeline:

1. **Parameter Parsing**: Parameters are extracted from the URL using different parsers:
   - StandardParser: Handles standard parameters like `width=800`
   - CompactParser: Handles compact parameters like `w=800`, `f=xl`, `r=16:9`
   - AkamaiParser: Handles legacy parameters like `imwidth=800`
   - PathParser: Extracts parameters from URL path segments

2. **Parameter Processing**: Extracted parameters are processed, validated and merged:
   - Parameters are validated against their definitions in the parameter registry
   - Conflicting parameters are resolved based on priority
   - Special parameters like size codes are converted to their corresponding values

3. **Transform Option Building**: The processed parameters are used to build transformation options:
   - Explicit parameters (marked with `__explicitWidth` and `__explicitHeight` flags) override automatic calculations
   - Responsive width is calculated only when no explicit width is provided

## Parameter Types and Priority

When multiple parameters affect the same property, the system uses this priority order:

1. Size Codes (`f=xl`) - Highest priority
2. Explicit width/height parameters (`width=800`, `imwidth=800`)
3. Derivative templates
4. Responsive calculations (for width only, when no explicit width is provided)

### Standard Parameters

Regular URL parameters matching the Cloudflare Image Resizing API parameters.

Examples:
- `width=800`
- `height=600`
- `format=webp`
- `quality=85`

### Compact Parameters

Shorthand versions of standard parameters, useful for shorter URLs.

Examples:
- `w=800` (width)
- `h=600` (height)
- `r=16:9` (aspect ratio)
- `p=0.5,0.5` (focal point)
- `f=xl` (size code, maps to predefined width)

### Size Codes

The `f` parameter maps to predefined widths:

```
xxu: 40px     xu: 80px      u: 160px     xxxs: 300px    xxs: 400px
xs: 500px     s: 600px      m: 700px     l: 750px       xl: 900px 
xxl: 1100px   xxxl: 1400px  sg: 1600px   g: 2000px      xg: 3000px    xxg: 4000px
```

Example: `?f=xl` sets width to 900px and marks it as explicit (overrides responsive width).

### Akamai Compatible Parameters

Legacy parameters for compatibility with Akamai Image Manager.

Examples:
- `imwidth=800`
- `imheight=600`
- `im=AspectCrop=(16,9)`

## Explicit Dimensions

Parameters that set explicit dimensions are marked with special flags:

- `__explicitWidth`: Set when width is explicitly specified by the user (via width, w, imwidth, or f parameters)
- `__explicitHeight`: Set when height is explicitly specified by the user (via height, h, or imheight parameters)

These flags ensure that responsive width calculations don't override user-specified dimensions.

## Cache Key Generation

The caching system generates unique keys based on:

1. **Image path**: The basename of the requested image
2. **Parameter Summary**: A normalized summary of the main transform parameters
3. **Format**: The output format (webp, avif, jpeg, etc.)
4. **Hash**: A consistent hash of the URL path, search parameters, and transform options

Example cache key: `transform:Granna_1.JPG:w800-r16-9:webp:a1b2c3d4`

### Hash Generation

The hash is generated using the FNV-1a algorithm on a string that combines:
- The URL path
- The raw URL search parameters (preserving exact format)
- The stringified transform options

This ensures that even if two different parameter combinations result in similar transformations, they will still have unique cache keys.

## Best Practices

1. **Use Compact Parameters**: When possible, use compact parameters for shorter URLs (e.g., `https://images.erfi.dev/Granna_1.JPG?w=800&h=600`)
2. **Explicitly Set Width**: Always specify width when you need a specific size (e.g., `https://images.erfi.dev/Granna_1.JPG?width=800`)

   ![Width Example](https://images.erfi.dev/Granna_1.JPG?width=400)

3. **Use Size Codes**: For common sizes, use size codes (e.g., `https://images.erfi.dev/Granna_1.JPG?f=xl`)

   ![Size Code Example](https://images.erfi.dev/Granna_1.JPG?f=m)

4. **Aspect Ratios**: Use `r=16:9` format for aspect ratios (e.g., `https://images.erfi.dev/Granna_1.JPG?r=16:9&w=800`)

   ![Aspect Ratio Example](https://images.erfi.dev/Granna_1.JPG?r=16:9&w=400)

## Testing and Verification

For detailed information on testing and verifying the parameter processing and cache key generation, see the [Parameter Verification](../testing/parameter-verification.md) document.

The verification document includes:
- Test cases for parameter validation
- Tests for explicit width handling
- Tests for parameter priority
- Cache key uniqueness verification
- End-to-end pipeline testing
- Performance testing