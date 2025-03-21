# Image Watermarking Examples

This document demonstrates how to use watermarking capabilities in the Image Resizer application.

## Sample Images with EA Watermarks

### Original Image (No Watermark)

![Original Image](https://images.erfi.dev/Granna_1.JPG?width=500)

### With EA Logo Watermark (Bottom Right)

![EA Logo Watermark Bottom Right](https://images.erfi.dev/Granna_1.JPG?width=500&draw=[{"url":"/watermarks/ea-logo.svg","bottom":10,"right":10,"opacity":0.8}])

URL:
```
/image.jpg?width=500&draw=[{"url":"/watermarks/ea-logo.svg","bottom":10,"right":10,"opacity":0.8}]
```

### With EA Logo Watermark (Centered)

![EA Logo Watermark Centered](https://images.erfi.dev/Granna_1.JPG?width=500&draw=[{"url":"/watermarks/ea-logo.svg","opacity":0.6}])

URL:
```
/image.jpg?width=500&draw=[{"url":"/watermarks/ea-logo.svg","opacity":0.6}]
```

### Multiple Watermarks (Logo + Copyright)

![Multiple Watermarks](https://images.erfi.dev/Granna_1.JPG?width=500&draw=[{"url":"/watermarks/ea-logo.svg","top":10,"left":10,"opacity":0.7},{"url":"/watermarks/copyright-ea.svg","bottom":10,"right":10}])

URL:
```
/image.jpg?width=500&draw=[{"url":"/watermarks/ea-logo.svg","top":10,"left":10,"opacity":0.7},{"url":"/watermarks/copyright-ea.svg","bottom":10,"right":10}]
```

## Using Akamai Compatibility Parameters

### Basic Watermark (Southeast)

![Akamai Watermark Southeast](https://images.erfi.dev/Granna_1.JPG?im.resize=width:500&im.composite=url:/watermarks/ea-logo.svg,placement:southeast)

URL:
```
/image.jpg?im.resize=width:500&im.composite=url:/watermarks/ea-logo.svg,placement:southeast
```

### Watermark with Opacity (Center)

![Akamai Watermark Center with Opacity](https://images.erfi.dev/Granna_1.JPG?im.resize=width:500&im.composite=url:/watermarks/ea-logo.svg,placement:center,opacity:50)

URL:
```
/image.jpg?im.resize=width:500&im.composite=url:/watermarks/ea-logo.svg,placement:center,opacity:50
```

### Using im.watermark Alias

![Akamai Watermark Alias](https://images.erfi.dev/Granna_1.JPG?im.resize=width:500&im.watermark=url:/watermarks/ea-logo.svg,placement:northeast,opacity:70)

URL:
```
/image.jpg?im.resize=width:500&im.watermark=url:/watermarks/ea-logo.svg,placement:northeast,opacity:70
```

## Usage Instructions

### Cloudflare Native Syntax

```
/image.jpg?draw=[{"url":"/path/to/watermark.png","bottom":10,"right":10,"opacity":0.8}]
```

#### Positioning Options:
- `top`: Distance from the top edge
- `right`: Distance from the right edge
- `bottom`: Distance from the bottom edge
- `left`: Distance from the left edge
- No position = centered

#### Additional Options:
- `opacity`: Value between 0-1 (e.g., 0.5 for 50% opacity)
- `repeat`: Set to `true` to tile the image
- `width`/`height`: Specify dimensions of the overlay

### Akamai Compatibility Syntax

```
/image.jpg?im.composite=url:/path/to/watermark.png,placement:southeast,opacity:80
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