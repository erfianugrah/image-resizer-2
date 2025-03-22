# Core Documentation

This section contains the core documentation for the Image Resizer, covering the fundamental concepts, architecture, and configuration.

## In This Section

- [Architecture](architecture.md) - System architecture and component overview
- [Setup](setup.md) - Installation and deployment instructions
- [Configuration Reference](configuration-reference.md) - Complete configuration options reference
- [Transformation](transformation.md) - Image transformation capabilities and options

## Quick Navigation

- [Back to Documentation Home](../index.md)
- [Client Detection Framework](../client-detection/index.md)
- [Storage Systems](../storage/index.md)
- [Caching System](../caching/index.md)
- [Debugging and Diagnostics](../debugging/index.md)

## Core Concepts

The Image Resizer is built around a few key concepts:

1. **Image Transformation**: On-the-fly resizing, format conversion, and optimization
2. **Multiple Storage Options**: Support for R2, remote URLs, and fallback strategies
3. **Caching**: Efficient caching for performance and reduced origin load
4. **Derivatives**: Template-based transformations for common use cases
5. **Path Handling**: Flexible path mapping and transformation

## Main Components

The system consists of several key components:

- **Main Handler**: Entry point that processes requests and coordinates components
- **Transform Engine**: Handles image transformation using Cloudflare's Image Resizing
- **Storage Manager**: Fetches images from different storage sources based on priority
- **Cache System**: Manages caching behavior and cache tags
- **Client Detector**: Determines client capabilities for optimization
- **Debug Tools**: Provides debugging information and performance metrics

## System Architecture Diagram

```
┌───────────────┐      ┌──────────────┐      ┌───────────────┐
│   Request     │─────►│  Main Handler │─────►│  URL Parser   │
└───────────────┘      └──────┬───────┘      └───────┬───────┘
                              │                      │
                              ▼                      ▼
┌───────────────┐      ┌──────────────┐      ┌───────────────┐
│   Response    │◄─────┤  Transform   │◄─────┤Storage Manager│
└───────────────┘      │   Engine     │      └───────┬───────┘
                       └──────┬───────┘              │
                              │                      │
                              ▼                      ▼
                       ┌──────────────┐      ┌───────────────┐
                       │Client Detector│      │ R2, Remote,   │
                       └──────┬───────┘      │ or Fallback   │
                              │              └───────────────┘
                              ▼
                       ┌──────────────┐
                       │ Cache System │
                       └──────────────┘
```

## Getting Started

To get started with the Image Resizer, see the [Setup Guide](setup.md) for installation instructions and basic configuration.

For a complete overview of configuration options, refer to the [Configuration Reference](configuration-reference.md).

To understand the transformation capabilities, see the [Transformation Guide](transformation.md).

## Related Resources

- [Client Detection Framework](../client-detection/index.md)
- [Storage Systems](../storage/index.md)
- [Caching System](../caching/index.md)
- [Debugging and Diagnostics](../debugging/index.md)
- [Examples](../examples/index.md)

---

*Last Updated: March 22, 2025*