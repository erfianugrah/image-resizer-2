# Parameter Validation and Error Handling

This document explains how the image resizer validates parameters and handles errors in the transformation process.

## Parameter Validation

The image resizer validates all parameters before processing them to ensure they meet the required format and constraints.

### Validation Process

1. **Type Checking**: Each parameter is checked against its expected type (number, string, boolean, etc.)
2. **Value Range Validation**: Numeric parameters are checked against their allowed ranges
3. **Enum Validation**: Parameters with predefined values are checked against their allowed values
4. **Format Validation**: String parameters are validated against their expected format

### Parameter Type Validation

| Parameter Type | Validation |
|---------------|------------|
| `number` | Must be a valid number, often with min/max constraints |
| `auto-or-number` | Either the string "auto" or a valid number |
| `string` | String value, often with format constraints |
| `boolean` | true/false or "true"/"false" |
| `enum` | Must be one of the predefined values |
| `size-code` | Must be a valid size code (e.g., "xs", "m", "xl") |
| `coordinate` | Must be a valid coordinate format (e.g., "0.5,0.2") |

## Error Handling

When invalid parameters are provided, the system handles them gracefully rather than failing.

### Invalid Parameter Handling

1. **Default Value Substitution**: 
   - If a parameter has an invalid value but a default is specified, the default is used
   - Example: `quality=invalid` → quality=85 (default)

2. **Parameter Removal**:
   - If a parameter is invalid and has no default, it's removed from processing
   - Example: `blur=1000` (out of range 1-250) → parameter ignored

3. **Value Normalization**:
   - Some values are normalized to valid values
   - Example: `rotate=45` → rotate=90 (nearest valid rotation)

### Example Validation Scenarios

```
https://images.erfi.dev/Granna_1.JPG?width=invalid
```
Result: Width parameter is ignored, responsive width is used instead

```
https://images.erfi.dev/Granna_1.JPG?quality=101
```
Result: Quality value is clamped to 100 (maximum allowed value)

```
https://images.erfi.dev/Granna_1.JPG?f=unknown
```
Result: Size code is ignored, no width is set from it

## Validation in the Pipeline

The validation occurs at multiple points in the parameter processing pipeline:

1. **Parser Validation**: Basic type checking during parameter extraction
2. **Registry Validation**: Checking against parameter definitions
3. **Processor Validation**: Special validation for specific parameter types
4. **Transform Option Building**: Final validation before passing to Cloudflare

![Validation Pipeline](https://images.erfi.dev/Granna_1.JPG?width=800&fit=contain&gravity=center)

## Error Handling for Complex Parameters

### Gravity Parameter

The `gravity` parameter supports multiple formats:
- Named position: `gravity=center`
- Focal point coordinates: `gravity=0.7,0.3`
- JSON object: `gravity={"x":0.7,"y":0.3}`

Invalid gravity values fall back to "center".

### Draw Parameter

The `draw` parameter for watermarks and overlays validates:
- URL must be present
- Width/height must be positive numbers if specified
- Position parameters must be valid
- Only one positioning method can be used (e.g., can't use both 'top' and 'bottom')

### Size Codes

Invalid size codes are ignored rather than causing an error.

## Testing and Verification

### Verifying Parameter Processing

You can verify parameter processing by adding `?debug=headers` to your request. This adds debug headers showing:

```
https://images.erfi.dev/Granna_1.JPG?width=800&debug=headers
```

The response will include headers showing:
- `X-Debug-Params`: The processed parameters
- `X-Debug-Pipeline`: The parameter processing pipeline stages
- `X-Debug-Transforms`: The final transformation options

### Verifying Cache Keys

To verify unique cache keys for different parameters:

1. Make a request with specific parameters:
   ```
   https://images.erfi.dev/Granna_1.JPG?width=800&debug=headers
   ```

2. Check the `X-Cache-Key` header in the response

3. Change parameters and verify the cache key changes:
   ```
   https://images.erfi.dev/Granna_1.JPG?width=900&debug=headers
   ```

If the cache keys are different, the parameters are being processed correctly.

## Browser Compatibility

The image resizer considers browser compatibility when selecting output formats.

### Format Support by Browser

| Format | Chrome | Firefox | Safari | Edge |
|--------|--------|---------|--------|------|
| WebP   | ✅     | ✅      | ✅ (14+)| ✅   |
| AVIF   | ✅ (85+)| ✅ (86+)| ❌     | ✅ (85+) |
| JPEG   | ✅     | ✅      | ✅     | ✅   |
| PNG    | ✅     | ✅      | ✅     | ✅   |
| GIF    | ✅     | ✅      | ✅     | ✅   |

### Format Auto-Selection

When `format=auto` is specified, the system:

1. Checks the `Accept` header for supported formats
2. Uses client hints or user agent detection as fallback
3. Selects the most efficient format the browser supports

```
https://images.erfi.dev/Granna_1.JPG?format=auto
```

Will serve:
- AVIF to browsers that support it
- WebP to browsers that support WebP but not AVIF
- JPEG to browsers that support neither

### Testing Format Selection

To test format selection:

1. Use different browsers to request an image with `format=auto`
2. Check the `Content-Type` header in the response
3. Verify the appropriate format was selected

For debugging, add `?debug=headers` to see format selection details in the response headers.