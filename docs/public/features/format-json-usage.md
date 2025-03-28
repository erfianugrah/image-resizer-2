# Format JSON Usage Guide

The Format JSON feature provides a powerful way to define complex image transformations through a JSON configuration object. This allows for more advanced transformations than can be expressed through URL parameters alone.

## Basic Usage

To use Format JSON, pass a JSON configuration object in the `format` parameter:

```
https://images.example.com/image.jpg?format={"width":800,"height":600,"fit":"cover","position":"entropy"}
```

For readability, you can also base64-encode the JSON:

```
https://images.example.com/image.jpg?format=eyJ3aWR0aCI6ODAwLCJoZWlnaHQiOjYwMCwiZml0IjoiY292ZXIiLCJwb3NpdGlvbiI6ImVudHJvcHkifQ==
```

## Supported Properties

The Format JSON object supports all standard transformation parameters:

```json
{
  "width": 800,               // Output width in pixels
  "height": 600,              // Output height in pixels
  "fit": "cover",             // Fit mode: cover, contain, fill, inside, outside
  "position": "entropy",      // Position/focal point: center, top, bottom, left, right, or entropy
  "quality": 80,              // Output quality (1-100)
  "format": "webp",           // Output format: jpeg, png, webp, avif, etc.
  "background": "#ffffff",    // Background color for transparent images
  "sharpen": 0.5,             // Sharpen amount (0-1)
  "rotation": 90,             // Rotation angle in degrees
  "flip": true,               // Horizontal flip
  "flop": false,              // Vertical flip
  "grayscale": false,         // Convert to grayscale
  "blur": 0,                  // Blur sigma value
  "metadata": "none"          // Metadata handling: none, keep, copyright
}
```

## Advanced Features

Format JSON enables several advanced features not available through regular URL parameters:

### Image Pipeline

Define multiple operations to be applied in sequence:

```json
{
  "pipeline": [
    {
      "width": 800,
      "height": 600,
      "fit": "cover",
      "position": "entropy"
    },
    {
      "blur": 2,
      "sharpen": 0.5
    },
    {
      "format": "webp",
      "quality": 80
    }
  ]
}
```

### Conditional Transformations

Apply different transformations based on image characteristics:

```json
{
  "conditions": [
    {
      "if": {
        "width": ">= 2000",
        "height": ">= 1500"
      },
      "then": {
        "width": 1200,
        "format": "webp",
        "quality": 85
      },
      "else": {
        "width": 800,
        "format": "webp",
        "quality": 75
      }
    }
  ]
}
```

### Focus Areas

Define specific areas to focus on when cropping:

```json
{
  "width": 800,
  "height": 600,
  "fit": "cover",
  "focus": {
    "x": 0.3,
    "y": 0.4,
    "width": 0.2,
    "height": 0.2
  }
}
```

## Integration with Client Detection

Format JSON works seamlessly with client detection:

```json
{
  "client": {
    "desktop": {
      "width": 1200,
      "quality": 85
    },
    "tablet": {
      "width": 800,
      "quality": 80
    },
    "mobile": {
      "width": 400,
      "quality": 75
    }
  }
}
```

## Error Handling

If the Format JSON is invalid or incorrectly formatted:

1. The service will return a 400 Bad Request error
2. The response will include details about the parsing error
3. In development mode, additional debugging information will be provided

## Security Considerations

1. Format JSON parameters are validated to prevent injection attacks
2. Max size limits prevent excessive processing 
3. Certain operations may be restricted based on configuration

## Best Practices

1. **Use Base64 Encoding** - For readability and to avoid URL encoding issues
2. **Keep JSON Simple** - Avoid overly complex structures when possible
3. **Use Client Detection** - Leverage client-specific transformations for responsive images
4. **Validate Input** - Always validate Format JSON on the client before sending
5. **Cache Results** - Format JSON transformations are cacheable like any other transformation

## Examples

### High-Quality Image Optimization

```json
{
  "width": 1200,
  "format": "auto",
  "quality": 85,
  "fit": "inside",
  "sharpen": 0.3,
  "metadata": "copyright"
}
```

### Art-Directed Responsive Images

```json
{
  "client": {
    "mobile": {
      "width": 400,
      "height": 300,
      "fit": "cover",
      "position": "top"
    },
    "tablet": {
      "width": 800,
      "height": 450,
      "fit": "cover",
      "position": "center"
    },
    "desktop": {
      "width": 1200,
      "fit": "inside"
    }
  }
}
```

### Multi-Step Editing

```json
{
  "pipeline": [
    {
      "crop": {
        "left": 100,
        "top": 100,
        "width": 800,
        "height": 600
      }
    },
    {
      "grayscale": true,
      "sharpen": 0.5
    },
    {
      "width": 400,
      "format": "webp"
    }
  ]
}
```

For more information on implementing Format JSON in your application, see the [Format JSON Workflow](format-json-workflow.md) documentation.