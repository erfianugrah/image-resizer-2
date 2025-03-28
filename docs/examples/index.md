# Examples

This section contains practical examples for using various features of the Image Resizer.

## Key Topics

- [Path-Based Origins Example](path-based-origins-example.md) - Comprehensive example of configuring path-based origins
- [Watermark Examples](watermark-examples.md) - Examples of using watermarks in different positions and styles
- [Watermark Implementation](watermark-implementation.md) - Technical implementation of watermarking functionality
- [Authentication Examples](authentication-examples.md) - Examples of different authentication configurations

## Live Demo Examples

Below are examples using a sample image through our image resizer:

### Original Image (Automatically Resized)

![Original Image](https://images.erfi.dev/Granna_1.JPG)

```
https://images.erfi.dev/Granna_1.JPG
```

### With Width Parameter

![Width 400px](https://images.erfi.dev/Granna_1.JPG?width=400)

```
https://images.erfi.dev/Granna_1.JPG?width=400
```

### Using WebP Format

![WebP Format](https://images.erfi.dev/Granna_1.JPG?format=webp&width=600)

```
https://images.erfi.dev/Granna_1.JPG?format=webp&width=600
```

### Using a Derivative (Thumbnail)

![Thumbnail Derivative](https://images.erfi.dev/thumbnail/Granna_1.JPG)

```
https://images.erfi.dev/thumbnail/Granna_1.JPG
```

### Quality and Format Control

![Quality 50](https://images.erfi.dev/Granna_1.JPG?quality=50&width=500)

```
https://images.erfi.dev/Granna_1.JPG?quality=50&width=500
```

### Image Cropping with Central Focus

![Cropped Image](https://images.erfi.dev/Granna_1.JPG?width=400&height=300&fit=crop&gravity=center)

```
https://images.erfi.dev/Granna_1.JPG?width=400&height=300&fit=crop&gravity=center
```

### Path Parameters (Alternative Syntax)

![Path Parameters](https://images.erfi.dev/_width=300/_format=webp/Granna_1.JPG)

```
https://images.erfi.dev/_width=300/_format=webp/Granna_1.JPG
```

### Image Effects (Brightness, Contrast, Saturation)

![Image Effects](https://images.erfi.dev/Granna_1.JPG?width=400&brightness=10&contrast=15&saturation=-5)

```
https://images.erfi.dev/Granna_1.JPG?width=400&brightness=10&contrast=15&saturation=-5
```

### Advanced Gravity with Focus Point

![Focus Point](https://images.erfi.dev/Granna_1.JPG?width=400&height=400&fit=crop&gravity=auto)

```
https://images.erfi.dev/Granna_1.JPG?width=400&height=400&fit=crop&gravity=auto
```

## Example Code Snippets

### Basic JavaScript Example

```javascript
// Generating a responsive image URL with the image resizer
function getResponsiveImageUrl(imagePath, width = 'auto') {
  const baseUrl = 'https://images.example.com';
  return `${baseUrl}/${imagePath}?width=${width}&format=auto&quality=auto`;
}

// Usage
const url = getResponsiveImageUrl('photos/sunset.jpg', 800);
```

### React Component Example

```jsx
import React from 'react';

// Responsive image component that uses the image resizer
const ResponsiveImage = ({ src, alt, width, height, quality = 'auto', format = 'auto' }) => {
  const baseUrl = 'https://images.example.com';
  const imageUrl = `${baseUrl}/${src}?width=${width || 'auto'}&height=${height || 'auto'}&quality=${quality}&format=${format}`;
  
  return (
    <img 
      src={imageUrl} 
      alt={alt}
      loading="lazy"
      width={width}
      height={height}
    />
  );
};

// Usage
export default function ProductImage() {
  return (
    <ResponsiveImage 
      src="products/camera.jpg"
      alt="Digital Camera"
      width={600}
      format="webp"
    />
  );
}
```

### HTML Picture Element Example

```html
<!-- Using the image resizer with picture element for responsive images -->
<picture>
  <!-- Large screens (desktop) -->
  <source
    media="(min-width: 1024px)"
    srcset="https://images.example.com/landscape.jpg?width=1200&format=avif 1x, 
            https://images.example.com/landscape.jpg?width=2400&format=avif 2x"
    type="image/avif"
  />
  
  <!-- Medium screens (tablet) -->
  <source
    media="(min-width: 640px)"
    srcset="https://images.example.com/landscape.jpg?width=800&format=webp 1x,
            https://images.example.com/landscape.jpg?width=1600&format=webp 2x"
    type="image/webp"
  />
  
  <!-- Small screens (mobile) -->
  <source
    srcset="https://images.example.com/landscape.jpg?width=400&format=webp 1x,
            https://images.example.com/landscape.jpg?width=800&format=webp 2x"
    type="image/webp"
  />
  
  <!-- Fallback -->
  <img 
    src="https://images.example.com/landscape.jpg?width=800" 
    alt="Beautiful landscape"
    loading="lazy"
    width="800"
    height="600"
  />
</picture>
```

### PHP Example

```php
/**
 * Generate an image URL with the image resizer
 * 
 * @param string $imagePath The path to the image
 * @param array $options Transformation options
 * @return string The transformed image URL
 */
function getResizedImageUrl($imagePath, $options = []) {
    $baseUrl = 'https://images.example.com';
    $queryParams = http_build_query($options);
    
    return $baseUrl . '/' . $imagePath . ($queryParams ? '?' . $queryParams : '');
}

// Usage
$imageUrl = getResizedImageUrl('products/shoe.jpg', [
    'width' => 600,
    'height' => 400,
    'fit' => 'contain',
    'format' => 'webp',
    'quality' => 85
]);
```

For more specific examples, explore the individual topics in this section.