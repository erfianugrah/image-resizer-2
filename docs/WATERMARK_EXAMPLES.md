# Image Watermarking Examples

This document demonstrates how to use watermarking capabilities in the Image Resizer application.

## Base Image

For these examples, we'll use this sample image:
```
https://images.erfi.dev/Granna_1.JPG
```

## Sample Images with Watermarks

### Original Image (No Watermark)

![Original Image](https://images.erfi.dev/Granna_1.JPG?width=500)

### Simple Logo in Bottom-Right Corner

![Logo Bottom Right](https://images.erfi.dev/Granna_1.JPG?width=500&draw=[{"url":"/watermarks/logo.png","bottom":10,"right":10,"width":150}])

URL:
```
https://images.erfi.dev/Granna_1.JPG?width=500&draw=[{"url":"/watermarks/logo.png","bottom":10,"right":10,"width":150}]
```

### SVG Logo in Bottom-Right Corner

![SVG Logo Bottom Right](https://images.erfi.dev/Granna_1.JPG?width=500&draw=[{"url":"/watermarks/logo.svg","bottom":10,"right":10,"width":150}])

URL:
```
https://images.erfi.dev/Granna_1.JPG?width=500&draw=[{"url":"/watermarks/logo.svg","bottom":10,"right":10,"width":150}]
```

### Semi-Transparent Watermark Centered

![Centered Watermark](https://images.erfi.dev/Granna_1.JPG?width=500&draw=[{"url":"/watermarks/ea-logo.svg","opacity":0.5,"width":300}])

URL:
```
https://images.erfi.dev/Granna_1.JPG?width=500&draw=[{"url":"/watermarks/ea-logo.svg","opacity":0.5,"width":300}]
```

### Tiled Background Watermark

![Tiled Watermark](https://images.erfi.dev/Granna_1.JPG?width=500&draw=[{"url":"/watermarks/logo.png","repeat":true,"opacity":0.2}])

URL:
```
https://images.erfi.dev/Granna_1.JPG?width=500&draw=[{"url":"/watermarks/logo.png","repeat":true,"opacity":0.2}]
```

### Play Button Overlay for Video Thumbnails

![Play Button](https://images.erfi.dev/Granna_1.JPG?width=500&draw=[{"url":"/watermarks/ea-logo.svg","width":80}])

URL:
```
https://images.erfi.dev/Granna_1.JPG?width=500&draw=[{"url":"/watermarks/ea-logo.svg","width":80}]
```

### Combined Copyright and Logo

![Multiple Watermarks](https://images.erfi.dev/Granna_1.JPG?width=500&draw=[{"url":"/watermarks/copyright.svg","bottom":10,"left":10,"width":100},{"url":"/watermarks/logo.svg","bottom":10,"right":10,"width":100}])

URL:
```
https://images.erfi.dev/Granna_1.JPG?width=500&draw=[{"url":"/watermarks/copyright.svg","bottom":10,"left":10,"width":100},{"url":"/watermarks/logo.svg","bottom":10,"right":10,"width":100}]
```

### Copyright in Top-Right Corner

![Copyright Badge](https://images.erfi.dev/Granna_1.JPG?width=500&draw=[{"url":"/watermarks/copyright-ea.svg","top":10,"right":10,"width":120}])

URL:
```
https://images.erfi.dev/Granna_1.JPG?width=500&draw=[{"url":"/watermarks/copyright-ea.svg","top":10,"right":10,"width":120}]
```

### Horizontal Banner Watermark

![Banner](https://images.erfi.dev/Granna_1.JPG?width=500&draw=[{"url":"/watermarks/logo.svg","bottom":0,"left":0,"width":1000,"height":80,"fit":"cover"}])

URL:
```
https://images.erfi.dev/Granna_1.JPG?width=500&draw=[{"url":"/watermarks/logo.svg","bottom":0,"left":0,"width":1000,"height":80,"fit":"cover"}]
```

## Using Akamai Compatibility Parameters

### Simple Watermark (Bottom-Right Corner)

![Akamai Bottom Right](https://images.erfi.dev/Granna_1.JPG?im.resize=width:500&im.composite=url:/watermarks/logo.svg,placement:southeast,width:150,offset:10)

URL:
```
https://images.erfi.dev/Granna_1.JPG?im.resize=width:500&im.composite=url:/watermarks/logo.svg,placement:southeast,width:150,offset:10
```

### Semi-Transparent Centered Watermark

![Akamai Centered](https://images.erfi.dev/Granna_1.JPG?im.resize=width:500&im.composite=url:/watermarks/ea-logo.svg,opacity:50,width:300)

URL:
```
https://images.erfi.dev/Granna_1.JPG?im.resize=width:500&im.composite=url:/watermarks/ea-logo.svg,opacity:50,width:300
```

### Tiled Background Watermark

![Akamai Tiled](https://images.erfi.dev/Granna_1.JPG?im.resize=width:500&im.composite=url:/watermarks/logo.png,tile:true,opacity:20)

URL:
```
https://images.erfi.dev/Granna_1.JPG?im.resize=width:500&im.composite=url:/watermarks/logo.png,tile:true,opacity:20
```

### Using im.watermark Alias

![Watermark Alias](https://images.erfi.dev/Granna_1.JPG?im.resize=width:500&im.watermark=url:/watermarks/copyright-ea.svg,placement:northeast,opacity:70)

URL:
```
https://images.erfi.dev/Granna_1.JPG?im.resize=width:500&im.watermark=url:/watermarks/copyright-ea.svg,placement:northeast,opacity:70
```

## Usage Instructions

### Cloudflare Native Syntax

```
https://images.erfi.dev/Granna_1.JPG?draw=[{"url":"/watermarks/logo.svg","bottom":10,"right":10,"opacity":0.8}]
```

#### Positioning Options:
- `top`: Distance from the top edge
- `right`: Distance from the right edge
- `bottom`: Distance from the bottom edge
- `left`: Distance from the left edge
- No position = centered

#### Additional Options:
- `opacity`: Value between 0-1 (e.g., 0.5 for 50% opacity)
- `repeat`: Set to `true` to tile the image, or `"x"` or `"y"` for directional tiling
- `width`/`height`: Specify dimensions of the overlay
- `fit`: How to resize the overlay (`"contain"`, `"cover"`, `"crop"`, `"pad"`, `"scale-down"`)
- `background`: Background color (e.g., `"white"`, `"transparent"`, `"#FF0000"`)
- `rotate`: Rotation angle (only 90, 180, or 270 degrees are supported)

### Akamai Compatibility Syntax

```
https://images.erfi.dev/Granna_1.JPG?im.composite=url:/watermarks/logo.svg,placement:southeast,opacity:80
```

#### Placement Options:
- `north` or `top`
- `south` or `bottom`
- `east` or `right`
- `west` or `left`
- `northeast` or `topright`
- `northwest` or `topleft`
- `southeast` or `bottomright`
- `southwest` or `bottomleft`
- `center` (default)

#### Additional Options:
- `opacity`: Value between 0-100 (e.g., 50 for 50% opacity)
- `tile`: Set to `true` to tile the image
- `offset`: Distance from the edge in pixels (default: 5)
- `width`/`height`: Specify dimensions of the overlay
- `fit`: How to resize the overlay
- `background`: Background color
- `rotate`: Rotation angle

## Implementation Tips

1. **URL Encoding**: Always URL-encode the draw parameter in your application code before sending to the service.

2. **Multiple Overlays**: When using multiple overlays, remember they are drawn in array order (the last item appears on top).

3. **Responsive Sizing**: For responsive designs, consider using relative heights/widths based on the transformed image size.

4. **Performance**: Keep overlay images as small as possible to reduce processing time and bandwidth.

5. **Caching**: These parameters affect the cache key, so each unique watermark configuration will be cached separately.

6. **SVG Support**: SVG files are fully supported and offer better scaling for logos and text overlays.

7. **Relative Paths**: When using watermarks from the same domain, you can use relative paths like `/watermarks/logo.svg`.