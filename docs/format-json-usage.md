# Using `format: json` for Image Metadata

This document explains how to use the `format: json` option in the image resizer to retrieve metadata about images and make informed transformation decisions.

## Overview

The `format: json` option allows you to retrieve detailed information about an image without actually transforming it. This is useful for:

1. Getting the original dimensions and aspect ratio of an image
2. Making informed transformation decisions based on the image's properties
3. Enabling smarter cropping and scaling operations

## Direct Usage

You can request JSON metadata directly by adding the `format=json` parameter to any image URL:

```
https://images.example.com/image.jpg?format=json
```

This will return a JSON response with information about the image:

```json
{
  "metadata": {
    "width": 1200,
    "height": 800,
    "format": "jpeg"
  },
  "result": {
    "width": 1200,
    "height": 800,
    "format": "json"
  }
}
```

## Automatic Dimension Pre-fetching

The image resizer now automatically pre-fetches dimensions for certain operations that benefit from knowing the original image dimensions:

1. Crop operations (`fit=crop` or `fit=cover`)
2. Auto gravity (`gravity=auto`) for focal point detection
3. When specific focal points are being used (object gravity)

The pre-fetching happens transparently - when you request a transformation that benefits from dimension data, the system will:

1. First make a quick `format=json` request to get the image's metadata
2. Store this information in a cache to avoid future requests for the same image
3. Use the dimension data to make optimal transformation decisions
4. Return the final transformed image

## Explicit Dimension Pre-fetching

You can also explicitly request dimension pre-fetching for any transformation by adding the `_needsImageInfo=true` parameter:

```
https://images.example.com/image.jpg?width=500&_needsImageInfo=true
```

This forces the system to fetch the image dimensions before proceeding with the transformation, which can be useful for:

- Complex transformations that need precise aspect ratio information
- Custom derivatives that adapt based on the original image's properties
- Art direction decisions that vary based on whether an image is portrait or landscape

## Performance Considerations

The dimension pre-fetching adds an additional request when first encountering an image, but this overhead is mitigated by:

1. **Intelligent targeting**: Only applying pre-fetching to operations that truly benefit 
2. **Caching**: Dimension data is cached by image path to avoid repeated requests
3. **Lightweight processing**: The JSON request is very small and fast compared to a full image transformation

## Example Use Cases

### Smart Cropping

```
https://images.example.com/image.jpg?fit=crop&width=400&height=400
```

The system will automatically fetch the dimensions to ensure optimal cropping that maintains the important parts of the image.

### Responsive Layout Decisions

```
https://images.example.com/image.jpg?_needsImageInfo=true
```

You can use this to get the image's aspect ratio and then make layout decisions on the client side based on whether the image is portrait or landscape.

### Conditional Transformations

```
https://images.example.com/image.jpg?fit=crop&width=500&height=300&_needsImageInfo=true
```

By getting the original dimensions, you can make more intelligent decisions about how to crop and resize the image to maintain visual quality.

## Internal Implementation

The dimension pre-fetching is implemented with:

1. An in-memory LRU cache for dimension data
2. Intelligent detection of operations that benefit from dimension data
3. Automatic dimension retrieval for qualifying transformation requests

This provides a performance-optimized way to leverage Cloudflare's `format: json` option to improve transformation quality.