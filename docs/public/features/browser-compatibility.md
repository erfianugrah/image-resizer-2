# Browser Compatibility

The image resizer is designed to work optimally across all modern browsers by intelligently serving the most efficient image format each browser supports.

## Format Auto-Detection

When `format=auto` is specified (or when no format is specified), the image resizer automatically selects the best format for each browser using a multi-stage detection process:

1. **Client Hints**: Uses `Accept` and `Sec-CH-Accept` headers for precise format support detection
2. **User Agent Detection**: Falls back to User-Agent-based detection when client hints aren't available
3. **Accept Header Parsing**: Analyzes the request's `Accept` header to determine supported formats
4. **Conservative Defaults**: Uses well-supported formats when detection is inconclusive

## Format Support By Browser

| Format | Chrome | Firefox | Safari | Edge | IE 11 |
|--------|--------|---------|--------|------|-------|
| AVIF   | ✅ 85+ | ✅ 93+  | ❌     | ✅ 85+ | ❌   |
| WebP   | ✅ 17+ | ✅ 65+  | ✅ 14+ | ✅ 18+ | ❌   |
| JPEG   | ✅     | ✅      | ✅     | ✅     | ✅   |
| PNG    | ✅     | ✅      | ✅     | ✅     | ✅   |
| GIF    | ✅     | ✅      | ✅     | ✅     | ✅   |

## Format Selection Priority

When using `format=auto`, the system selects formats in this priority order:

1. **AVIF**: Best compression, newer support
2. **WebP**: Good compression, wide support
3. **JPEG/PNG**: Universal fallback

This prioritization optimizes for:
- File size (smaller files load faster)
- Visual quality (at equivalent file sizes)
- Browser compatibility (fallback for unsupported formats)

## Testing Browser Format Selection

You can test the format auto-selection by requesting the same image with different browsers:

```
https://images.erfi.dev/Granna_1.JPG?width=800&format=auto
```

Check the `Content-Type` header in the response to see which format was selected.

## Examples in Different Browsers

| Browser | Request | Result |
|---------|---------|--------|
| Chrome 92+ | ?format=auto | AVIF format |
| Firefox 95+ | ?format=auto | AVIF format |
| Safari 14+ | ?format=auto | WebP format |
| Safari 13 | ?format=auto | JPEG format |
| IE 11 | ?format=auto | JPEG format |

## Browser-Specific Optimizations

### Mobile Browsers

Mobile browsers receive additional optimizations:

1. **Reduced Quality**: Slightly lower quality settings to reduce file size
2. **Responsive Sizing**: Appropriately sized images based on viewport width
3. **DPR Awareness**: Properly scaled images for high-DPI displays

### Save-Data Header

Browsers that send the `Save-Data: on` header receive:

1. **Higher Compression**: More aggressive quality reduction
2. **Preferred Formats**: Always use most efficient available format
3. **Simplified Images**: Reduced visual complexity when possible

## Forcing Specific Formats

While auto-detection is recommended, you can force a specific format for all browsers:

```
https://images.erfi.dev/Granna_1.JPG?width=800&format=webp
```

Browser compatibility examples:

| Format Parameter | Browser Compatibility |
|------------------|----------------------|
| format=avif | Modern Chrome, Edge, Firefox only |
| format=webp | Most modern browsers except older Safari |
| format=jpeg | All browsers |
| format=png | All browsers |

## Browser Feature Detection

The image resizer detects various browser capabilities beyond just format support:

1. **Viewport Width**: Using `Viewport-Width` and `Sec-CH-Viewport-Width`
2. **Device Pixel Ratio**: Using `DPR` and `Sec-CH-DPR`
3. **Network Quality**: Using `Downlink` and `RTT` headers
4. **Device Memory**: Using `Device-Memory` header

These signals help optimize image delivery for each browser and device.

## Best Practices

1. **Use format=auto**: Let the system choose the optimal format
2. **Set explicit width**: Always specify width to avoid responsive overrides
3. **Consider quality parameter**: Balance quality and file size for your needs
4. **Test across browsers**: Verify appearance across major browsers

## Visual Comparisons

Format comparison at the same quality level (85):

| Format | Example | File Size |
|--------|---------|-----------|
| AVIF | ![AVIF Example](https://images.erfi.dev/Granna_1.JPG?width=300&format=avif&quality=85) | Smallest |
| WebP | ![WebP Example](https://images.erfi.dev/Granna_1.JPG?width=300&format=webp&quality=85) | Medium |
| JPEG | ![JPEG Example](https://images.erfi.dev/Granna_1.JPG?width=300&format=jpeg&quality=85) | Largest |

## Troubleshooting Format Issues

If you're experiencing format compatibility issues:

1. **Force JPEG format** as a universal fallback:
   ```
   https://images.erfi.dev/Granna_1.JPG?width=800&format=jpeg
   ```

2. **Check browser support** using the format support table above

3. **Use debug headers** to see format detection logic:
   ```
   https://images.erfi.dev/Granna_1.JPG?width=800&format=auto&debug=headers
   ```