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

![Logo Bottom Right](https://images.erfi.dev/Granna_1.JPG?width=500&draw=[{"url":"https://cdn.erfianugrah.com/ea_favicon.png","bottom":10,"right":10,"width":60}])

URL:
```
https://images.erfi.dev/Granna_1.JPG?width=500&draw=[{"url":"https://cdn.erfianugrah.com/ea_favicon.png","bottom":10,"right":10,"width":60}]
```

### Logo in Bottom-Left Corner

![Logo Bottom Left](https://images.erfi.dev/Granna_1.JPG?width=500&draw=[{"url":"https://cdn.erfianugrah.com/ea_favicon.png","bottom":10,"left":10,"width":60}])

URL:
```
https://images.erfi.dev/Granna_1.JPG?width=500&draw=[{"url":"https://cdn.erfianugrah.com/ea_favicon.png","bottom":10,"left":10,"width":60}]
```

### Semi-Transparent Watermark Centered

![Centered Watermark](https://images.erfi.dev/Granna_1.JPG?width=500&draw=[{"url":"https://cdn.erfianugrah.com/ea_favicon.png","opacity":0.5,"width":120}])

URL:
```
https://images.erfi.dev/Granna_1.JPG?width=500&draw=[{"url":"https://cdn.erfianugrah.com/ea_favicon.png","opacity":0.5,"width":120}]
```

### Tiled Background Watermark

![Tiled Watermark](https://images.erfi.dev/Granna_1.JPG?width=500&draw=[{"url":"https://cdn.erfianugrah.com/ea_favicon.png","repeat":true,"opacity":0.2,"width":40}])

URL:
```
https://images.erfi.dev/Granna_1.JPG?width=500&draw=[{"url":"https://cdn.erfianugrah.com/ea_favicon.png","repeat":true,"opacity":0.2,"width":40}]
```

### Play Button Overlay for Video Thumbnails

![Play Button](https://images.erfi.dev/Granna_1.JPG?width=500&draw=[{"url":"https://cdn.erfianugrah.com/ea_favicon.png","width":50}])

URL:
```
https://images.erfi.dev/Granna_1.JPG?width=500&draw=[{"url":"https://cdn.erfianugrah.com/ea_favicon.png","width":50}]
```

### Multiple Watermarks in Different Positions

![Multiple Watermarks](https://images.erfi.dev/Granna_1.JPG?width=500&draw=[{"url":"https://cdn.erfianugrah.com/ea_favicon.png","bottom":10,"left":10,"width":40},{"url":"https://cdn.erfianugrah.com/ea_favicon.png","bottom":10,"right":10,"width":40}])

URL:
```
https://images.erfi.dev/Granna_1.JPG?width=500&draw=[{"url":"https://cdn.erfianugrah.com/ea_favicon.png","bottom":10,"left":10,"width":40},{"url":"https://cdn.erfianugrah.com/ea_favicon.png","bottom":10,"right":10,"width":40}]
```

### "New" Badge in Top-Right Corner

![New Badge](https://images.erfi.dev/Granna_1.JPG?width=500&draw=[{"url":"https://cdn.erfianugrah.com/ea_favicon.png","top":10,"right":10,"width":40}])

URL:
```
https://images.erfi.dev/Granna_1.JPG?width=500&draw=[{"url":"https://cdn.erfianugrah.com/ea_favicon.png","top":10,"right":10,"width":40}]
```

### Horizontal Banner Watermark

![Banner](https://images.erfi.dev/Granna_1.JPG?width=500&draw=[{"url":"https://cdn.erfianugrah.com/ea_favicon.png","bottom":0,"left":0,"width":500,"height":40,"fit":"cover"}])

URL:
```
https://images.erfi.dev/Granna_1.JPG?width=500&draw=[{"url":"https://cdn.erfianugrah.com/ea_favicon.png","bottom":0,"left":0,"width":500,"height":40,"fit":"cover"}]
```

## Using Akamai Compatibility Parameters

### Akamai Style 1: Dot Notation (im.composite)

#### Simple Watermark (Bottom-Right Corner)

![Akamai Bottom Right](https://images.erfi.dev/Granna_1.JPG?width=500&im.composite=url:https://cdn.erfianugrah.com/ea_favicon.png,placement:southeast,width:60,offset:10)

URL:
```
https://images.erfi.dev/Granna_1.JPG?width=500&im.composite=url:https://cdn.erfianugrah.com/ea_favicon.png,placement:southeast,width:60,offset:10
```

#### Semi-Transparent Centered Watermark

![Akamai Centered](https://images.erfi.dev/Granna_1.JPG?width=500&im.composite=url:https://cdn.erfianugrah.com/ea_favicon.png,opacity:50,width:120)

URL:
```
https://images.erfi.dev/Granna_1.JPG?width=500&im.composite=url:https://cdn.erfianugrah.com/ea_favicon.png,opacity:50,width:120
```

#### Tiled Background Watermark

![Akamai Tiled](https://images.erfi.dev/Granna_1.JPG?width=500&im.composite=url:https://cdn.erfianugrah.com/ea_favicon.png,tile:true,opacity:20,width:40)

URL:
```
https://images.erfi.dev/Granna_1.JPG?width=500&im.composite=url:https://cdn.erfianugrah.com/ea_favicon.png,tile:true,opacity:20,width:40
```

#### Using im.watermark Alias

![Watermark Alias](https://images.erfi.dev/Granna_1.JPG?width=500&im.watermark=url:https://cdn.erfianugrah.com/ea_favicon.png,placement:northeast,opacity:70,width:40)

URL:
```
https://images.erfi.dev/Granna_1.JPG?width=500&im.watermark=url:https://cdn.erfianugrah.com/ea_favicon.png,placement:northeast,opacity:70,width:40
```

### Akamai Style 2: Equals Notation (im=Composite)

#### Simple Logo in Bottom-Right with Specific Size

![Akamai Equals Notation](https://images.erfi.dev/Granna_1.JPG?width=500&im=Composite,image=(url=https://cdn.erfianugrah.com/ea_favicon.png),placement=southeast,x=20,y=20,width=80)

URL:
```
https://images.erfi.dev/Granna_1.JPG?width=500&im=Composite,image=(url=https://cdn.erfianugrah.com/ea_favicon.png),placement=southeast,x=20,y=20,width=80
```

#### Top-Left Corner Watermark

![Akamai Top Left](https://images.erfi.dev/Granna_1.JPG?width=500&im=Composite,image=(url=https://cdn.erfianugrah.com/ea_favicon.png),placement=northwest,x=20,y=20,width=80)

URL:
```
https://images.erfi.dev/Granna_1.JPG?width=500&im=Composite,image=(url=https://cdn.erfianugrah.com/ea_favicon.png),placement=northwest,x=20,y=20,width=80
```

#### Semi-Transparent Center Watermark

![Akamai Center Transparent](https://images.erfi.dev/Granna_1.JPG?width=500&im=Composite,image=(url=https://cdn.erfianugrah.com/ea_favicon.png),placement=center,opacity=0.5,width=150)

URL:
```
https://images.erfi.dev/Granna_1.JPG?width=500&im=Composite,image=(url=https://cdn.erfianugrah.com/ea_favicon.png),placement=center,opacity=0.5,width=150
```

#### Using Watermark Alternative 

![Akamai Watermark Alternative](https://images.erfi.dev/Granna_1.JPG?width=500&im=Watermark,image=(url=https://cdn.erfianugrah.com/ea_favicon.png),placement=northeast,x=15,y=15,width=60)

URL:
```
https://images.erfi.dev/Granna_1.JPG?width=500&im=Watermark,image=(url=https://cdn.erfianugrah.com/ea_favicon.png),placement=northeast,x=15,y=15,width=60
```

## Usage Instructions

### Cloudflare Native Syntax

```json
{
  "draw": [
    {
      "url": "https://cdn.erfianugrah.com/ea_favicon.png",
      "bottom": 10,
      "right": 10,
      "width": 60,
      "opacity": 0.8
    }
  ]
}
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

#### Dot Notation (im.composite)

```
im.composite=url:https://cdn.erfianugrah.com/ea_favicon.png,placement:southeast,width:60,opacity:80
```

#### Equals Notation (im=Composite)

```
im=Composite,image=(url=https://cdn.erfianugrah.com/ea_favicon.png),placement=southeast,x=20,y=20,width=80
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

#### Dot Notation Options:
- `url`: URL of the watermark image
- `opacity`: Value between 0-100 (e.g., 50 for 50% opacity)
- `tile`: Set to `true` to tile the image
- `offset`: Distance from the edge in pixels (default: 5)
- `width`/`height`: Specify dimensions of the overlay
- `fit`: How to resize the overlay
- `background`: Background color
- `rotate`: Rotation angle

#### Equals Notation Options:
- `image=(url=...)`: URL of the watermark image
- `placement`: Position of the watermark (as listed above)
- `x`/`y`: Distance from the specified edge in pixels
- `width`/`height`: Dimensions of the watermark
- `opacity`: Value between 0-1 (e.g., 0.5 for 50% opacity)
- `fit`: How to resize the overlay
- `background`: Background color
- `rotate`: Rotation angle

## Implementation Tips

1. **URL Encoding**: Always URL-encode the draw parameter in your application code before sending to the service.

2. **Multiple Overlays**: When using multiple overlays, remember they are drawn in array order (the last item appears on top).

3. **Responsive Sizing**: For responsive designs, consider using relative heights/widths based on the transformed image size.

4. **Performance**: Keep overlay images as small as possible to reduce processing time and bandwidth.

5. **Caching**: These parameters affect the cache key, so each unique watermark configuration will be cached separately.

6. **PNG Format for Watermarks**: PNG files with transparency are ideal for watermarks and overlays.

7. **Absolute URLs**: Use absolute URLs for watermark images to ensure they work correctly in all contexts.

8. **Optimal Sizing**: Keep watermark sizes proportional to the main image - typically 5-15% of the main image width for logos and watermarks.

9. **URL Parameter Format**: The draw parameter must be URL-encoded JSON. For example:
   ```
   ?draw=%5B%7B%22url%22%3A%22https%3A%2F%2Fcdn.erfianugrah.com%2Fea_favicon.png%22%2C%22width%22%3A60%7D%5D
   ```