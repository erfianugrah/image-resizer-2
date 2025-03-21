# Image Watermarking with Cloudflare Image Resizing

This document explains how to use watermarking capabilities in the Image Resizer application.

## Cloudflare Native Syntax (`draw` parameter)

Cloudflare Image Resizing supports image overlay via the `draw` parameter, which accepts a JSON array of objects:

```
/image.jpg?draw=[{"url":"/watermarks/logo.svg","bottom":10,"right":10}]
```

### Positioning Options

Position your watermark using these properties:

- `top`: Distance from the top edge
- `right`: Distance from the right edge
- `bottom`: Distance from the bottom edge
- `left`: Distance from the left edge

If no position is specified, the watermark is centered.

### Additional Options

- `opacity`: Value between 0-1 (e.g., 0.5 for 50% opacity)
- `repeat`: Set to `true` to tile the image across the base image
- `width`/`height`: Specify dimensions of the overlay

### Multiple Watermarks

Add multiple watermarks by adding more objects to the array:

```
/image.jpg?draw=[
  {"url":"/watermarks/logo.svg","top":10,"left":10},
  {"url":"/watermarks/copyright.svg","bottom":10,"right":10}
]
```

## Akamai Compatibility Syntax (`im.composite` parameter)

If you're using Akamai compatibility mode, you can use the simpler `im.composite` parameter:

```
/image.jpg?im.composite=url:/watermarks/logo.svg,placement:southeast,opacity:80
```

### Placement Options

- `north` or `top`: Top edge, centered horizontally
- `south` or `bottom`: Bottom edge, centered horizontally
- `east` or `right`: Right edge, centered vertically
- `west` or `left`: Left edge, centered vertically
- `northeast` or `topright`: Top-right corner
- `northwest` or `topleft`: Top-left corner
- `southeast` or `bottomright`: Bottom-right corner
- `southwest` or `bottomleft`: Bottom-left corner
- `center`: Centered (default)

### Additional Options

- `opacity`: Value between 0-100 (e.g., 50 for 50% opacity)
- `tile`: Set to `true` to tile the image
- `offset`: Distance from the edge in pixels (default: 5)

## Using `im.watermark` (Alias)

`im.watermark` is an alias for `im.composite` and works exactly the same:

```
/image.jpg?im.watermark=url:/watermarks/logo.svg,placement:center,opacity:50
```

## Sample Watermarks

This directory contains sample watermark images you can use for testing:

- `logo.svg`: A simple logo watermark
- `copyright.svg`: A copyright notice

## Demo Page

View the `/watermark-demo.html` page to see these watermarking techniques in action.