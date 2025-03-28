# Format JSON Workflow

This guide explains how to integrate the Format JSON feature into your application workflow, including generating, validating, and using Format JSON configurations.

## Development Workflow

### 1. Define Transformation Requirements

Before implementing Format JSON, clearly define your image transformation requirements:

- What sizes and formats do you need?
- Do you need responsive variations?
- Are there specific crops or focus areas?
- What quality settings are appropriate?

### 2. Create Format JSON Configuration

Based on your requirements, create a Format JSON configuration object:

```javascript
// Basic configuration
const formatConfig = {
  width: 800,
  height: 600,
  fit: "cover",
  quality: 80,
  format: "webp"
};

// Client-specific configuration
const responsiveConfig = {
  client: {
    mobile: {
      width: 400,
      height: 300,
      fit: "cover",
      quality: 75
    },
    tablet: {
      width: 800,
      height: 450,
      fit: "cover",
      quality: 80
    },
    desktop: {
      width: 1200,
      fit: "inside",
      quality: 85
    }
  }
};
```

### 3. Convert to URL Format

Convert your Format JSON configuration to a URL-safe format:

```javascript
// Simple JSON approach
const formatParam = encodeURIComponent(JSON.stringify(formatConfig));
const url = `https://images.example.com/image.jpg?format=${formatParam}`;

// Base64 approach (recommended for complex configurations)
const formatParamBase64 = btoa(JSON.stringify(formatConfig));
const urlBase64 = `https://images.example.com/image.jpg?format=${formatParamBase64}`;
```

### 4. Test and Validate

Before implementing in production, test your Format JSON configurations:

- Verify transformations render correctly
- Test on different devices and browsers
- Check cache behavior and performance
- Validate error handling

## Implementation Examples

### Basic JavaScript Implementation

```javascript
function createImageUrl(imagePath, options) {
  const formatConfig = {
    width: options.width || 800,
    height: options.height,
    fit: options.fit || "inside",
    quality: options.quality || 80,
    format: options.format || "auto"
  };
  
  const formatParam = btoa(JSON.stringify(formatConfig));
  return `https://images.example.com/${imagePath}?format=${formatParam}`;
}

// Usage
const productImageUrl = createImageUrl('products/chair.jpg', {
  width: 600,
  height: 400,
  fit: 'cover',
  format: 'webp'
});
```

### React Component Example

```jsx
import React from 'react';

function OptimizedImage({ src, alt, options }) {
  const formatConfig = {
    width: options.width || 800,
    height: options.height,
    fit: options.fit || "inside",
    quality: options.quality || 80,
    format: options.format || "auto"
  };
  
  const formatParam = btoa(JSON.stringify(formatConfig));
  const imageUrl = `https://images.example.com/${src}?format=${formatParam}`;
  
  return (
    <img 
      src={imageUrl} 
      alt={alt} 
      width={options.width} 
      height={options.height} 
      loading="lazy"
    />
  );
}

// Usage
function ProductPage() {
  return (
    <OptimizedImage
      src="products/chair.jpg"
      alt="Office Chair"
      options={{
        width: 600,
        height: 400,
        fit: 'cover',
        format: 'webp'
      }}
    />
  );
}
```

### Responsive Image Implementation

```jsx
import React from 'react';

function ResponsiveImage({ src, alt, sizes }) {
  // Create base64 encoded Format JSON for each size variant
  const formatSmall = btoa(JSON.stringify({
    width: sizes.small.width,
    height: sizes.small.height,
    fit: "cover",
    quality: 75
  }));
  
  const formatMedium = btoa(JSON.stringify({
    width: sizes.medium.width,
    height: sizes.medium.height,
    fit: "cover",
    quality: 80
  }));
  
  const formatLarge = btoa(JSON.stringify({
    width: sizes.large.width,
    height: sizes.large.height,
    fit: "cover",
    quality: 85
  }));
  
  // Create image URLs for each size
  const smallUrl = `https://images.example.com/${src}?format=${formatSmall}`;
  const mediumUrl = `https://images.example.com/${src}?format=${formatMedium}`;
  const largeUrl = `https://images.example.com/${src}?format=${formatLarge}`;
  
  return (
    <img 
      src={smallUrl} 
      srcSet={`
        ${smallUrl} ${sizes.small.width}w,
        ${mediumUrl} ${sizes.medium.width}w,
        ${largeUrl} ${sizes.large.width}w
      `}
      sizes={`
        (max-width: 600px) ${sizes.small.width}px,
        (max-width: 1024px) ${sizes.medium.width}px,
        ${sizes.large.width}px
      `}
      alt={alt} 
      loading="lazy"
      width={sizes.large.width}
      height={sizes.large.height}
    />
  );
}

// Usage
function ProductGallery() {
  return (
    <ResponsiveImage
      src="products/chair.jpg"
      alt="Office Chair"
      sizes={{
        small: { width: 400, height: 300 },
        medium: { width: 800, height: 600 },
        large: { width: 1200, height: 900 }
      }}
    />
  );
}
```

## Advanced Usage

### Integration with Art Direction

For more sophisticated art direction, you can use the Picture element with Format JSON:

```jsx
import React from 'react';

function ArtDirectedImage({ src, alt }) {
  // Mobile - square crop from top
  const mobileFormat = btoa(JSON.stringify({
    width: 400,
    height: 400,
    fit: "cover",
    position: "top",
    quality: 75
  }));
  
  // Tablet - 16:9 crop from center
  const tabletFormat = btoa(JSON.stringify({
    width: 800,
    height: 450,
    fit: "cover",
    position: "center",
    quality: 80
  }));
  
  // Desktop - original aspect ratio
  const desktopFormat = btoa(JSON.stringify({
    width: 1200,
    fit: "inside",
    quality: 85
  }));
  
  return (
    <picture>
      <source 
        media="(max-width: 600px)" 
        srcSet={`https://images.example.com/${src}?format=${mobileFormat}`} 
      />
      <source 
        media="(max-width: 1024px)" 
        srcSet={`https://images.example.com/${src}?format=${tabletFormat}`} 
      />
      <img 
        src={`https://images.example.com/${src}?format=${desktopFormat}`} 
        alt={alt} 
        loading="lazy" 
      />
    </picture>
  );
}
```

### Server-Side Implementation

For server-side rendering, generate Format JSON URLs during the rendering process:

```javascript
// Node.js example (Express)
app.get('/product/:id', (req, res) => {
  const product = getProduct(req.params.id);
  
  // Generate image URLs with Format JSON
  const formatConfig = {
    width: 800,
    height: 600,
    fit: "cover",
    quality: 80,
    format: "auto"
  };
  
  const formatParam = Buffer.from(JSON.stringify(formatConfig)).toString('base64');
  product.imageUrl = `https://images.example.com/${product.imagePath}?format=${formatParam}`;
  
  res.render('product', { product });
});
```

## Performance Considerations

1. **Generate URLs at Build Time** - When possible, generate Format JSON URLs during build rather than at runtime
2. **Cache Format JSON Strings** - Cache the encoded Format JSON strings for reuse
3. **Limit Complexity** - Very complex Format JSON configurations may impact processing time
4. **Monitor Performance** - Track response times and optimize as needed

## Error Handling

Implement proper error handling for Format JSON URLs:

```javascript
function createImageUrl(imagePath, options) {
  try {
    const formatConfig = {
      width: options.width || 800,
      height: options.height,
      fit: options.fit || "inside",
      quality: options.quality || 80,
      format: options.format || "auto"
    };
    
    // Validate configuration
    if (formatConfig.width <= 0 || (formatConfig.height && formatConfig.height <= 0)) {
      throw new Error("Invalid dimensions");
    }
    
    const formatParam = btoa(JSON.stringify(formatConfig));
    return `https://images.example.com/${imagePath}?format=${formatParam}`;
  } catch (error) {
    console.error("Error generating Format JSON URL:", error);
    // Fallback to basic URL without Format JSON
    return `https://images.example.com/${imagePath}?width=${options.width || 800}`;
  }
}
```

## Next Steps

1. Create a Format JSON configuration generator for your specific use cases
2. Implement Format JSON with your image components
3. Test performance and optimize as needed
4. Consider integrating with a content management system for dynamic configuration

For more details on the Format JSON parameters and features, see the [Format JSON Usage](format-json-usage.md) documentation.