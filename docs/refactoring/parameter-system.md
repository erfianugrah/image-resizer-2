# Parameter System Documentation

## Overview

The Image Resizer's parameter system is responsible for parsing, normalizing, and processing transformation parameters from URLs. The system extracts parameters from various formats, handles conflicts based on priority, applies validation rules, and prepares the final parameter object for the transformation service.

This document provides a comprehensive overview of the parameter system architecture, usage patterns, and extension points.

## Architecture

The parameter system follows a modular, component-based architecture using the following design patterns:

1. **Strategy Pattern**: For extensible parameter processing
2. **Factory Pattern**: For parameter parser selection
3. **Adapter Pattern**: For bridging old and new systems via feature flags
4. **Registry Pattern**: For centralized parameter definitions

### Core Components

![Parameter System Architecture](parameter-system-architecture.png)

#### Parameter Parsers

Parsers extract parameters from different sections of the URL or different parameter formats:

- **StandardParser**: Handles standard URL parameters (`width=800`)
- **CompactParser**: Processes compact form parameters (`w=800`, `r=16:9`)
- **PathParser**: Extracts parameters from URL path segments (`_width=800`)
- **AkamaiParser**: Handles Akamai Image Manager formats (`im=resize=width:800,height:600`) 
- **NestedParser**: Processes nested parameters inside `im=` values (`im=AspectCrop(1,1),width=800`)

#### Parameter Processor

The `ParameterProcessor` manages the overall processing workflow:

1. Groups parameters by name
2. Resolves conflicts based on priority
3. Validates parameter values
4. Applies default values when needed
5. Handles client-specific optimizations

#### Parameter Registry

The registry maintains parameter definitions including:

- Name and aliases
- Validation rules
- Default values
- Formatting functions
- Type information
- Description

#### Feature Flag System

The feature flag system enables gradual rollout of the new parameter system with:

- URL parameter overrides (`flag_new_parameter_system=true`)
- Request header controls (`X-Feature-new-parameter-system: true`)
- Path-based activation rules
- Percentage-based rollout
- Environment variable defaults

## Usage Examples

### Basic Parameter Processing

```typescript
import { ParameterAdapter } from '../parameters';
import { extractClientHints } from '../utils/client-hints';

// Create the parameter adapter
const parameterAdapter = new ParameterAdapter(logger);

// Extract client hints for responsive adjustments
const clientHints = extractClientHints(request.headers);

// Parse parameters using feature flags to determine system
const parameters = parameterAdapter.parseParameters(request, {
  env: env,
  applyDefaults: true,
  enableClientDetection: !!clientHints,
  clientHints,
  strictValidation: false
});
```

### Adding Custom Parameters

To add new parameters to the system, update the parameter registry:

```typescript
// In registry.ts
export const parameterRegistry: Record<string, TransformParameterDefinition> = {
  // Existing parameters
  
  // New custom parameter
  'watermark': {
    name: 'watermark',
    aliases: ['wm'],
    type: 'string',
    validator: (value) => typeof value === 'string',
    formatter: (value) => String(value),
    defaultValue: null,
    description: 'Path to the watermark image to apply'
  }
};
```

### Creating a Custom Parser

Extend the `BaseParameterParser` to create a custom parser:

```typescript
import { BaseParameterParser } from '../parameters';
import { TransformParameter } from '../parameters/types';
import { Logger } from '../utils/logging';

export class CustomParser extends BaseParameterParser {
  constructor(logger: Logger) {
    super('custom', logger);
  }
  
  canParse(request: Request): boolean {
    // Logic to determine if this parser should be used
    return request.url.includes('custom=');
  }
  
  parse(request: Request): TransformParameter[] {
    const parameters: TransformParameter[] = [];
    const url = new URL(request.url);
    
    // Custom parsing logic here
    if (url.searchParams.has('custom')) {
      const value = url.searchParams.get('custom');
      parameters.push({
        name: 'customParam',
        value,
        priority: 10,
        source: 'custom'
      });
    }
    
    return parameters;
  }
}
```

## Parameter Sources and Priority

Parameters can come from multiple sources with different priorities:

1. **URL Parameters** (Priority: 10): Direct query parameters have highest priority
2. **Akamai Parameters** (Priority: 8): Parameters in Akamai format
3. **Compact Parameters** (Priority: 7): Shorthand form like `w=` and `h=`
4. **Path Parameters** (Priority: 5): Parameters embedded in the URL path
5. **Default Values** (Priority: 0): Applied when no explicit value is provided

When the same parameter comes from multiple sources, the highest priority value wins. In case of equal priority, an optional conflict threshold can be used to determine what constitutes a conflict.

## Feature Flag System

The parameter system uses feature flags for gradual rollout. The primary flag is:

```
FLAG_NEW_PARAMETER_SYSTEM_ENABLED=true
```

Additional flags allow fine-grained control:

```
# Path-based activation
FLAG_NEW_PARAMETER_SYSTEM_PATHS=/example/path,/another/path

# Percentage-based rollout (0-100)
FLAG_NEW_PARAMETER_SYSTEM_PERCENTAGE=10
```

Users can also use URL parameters for testing:

```
https://example.com/image.jpg?width=800&flag_new_parameter_system=true
```

Or request headers:

```
X-Feature-new-parameter-system: true
```

## Client-Aware Optimizations

The parameter system can optimize parameters based on client characteristics:

- **Device Pixel Ratio (DPR)**: Automatically adjusts image resolution
- **Viewport Width**: Sets appropriate image dimensions
- **Save-Data Mode**: Reduces quality for bandwidth-constrained users

These optimizations are applied only when the corresponding parameter is not explicitly specified in the URL.

## Error Handling

The parameter system uses structured error types to provide detailed information:

- **ParameterParsingError**: When a parser fails to parse parameters
- **MissingParameterError**: When a required parameter is missing
- **InvalidParameterError**: When a parameter has an invalid value
- **ConflictingParametersError**: When incompatible parameter values are detected
- **ParameterDependencyError**: When a parameter depends on another that's missing

## Performance Considerations

The parameter system is designed for efficiency with:

- Fast map-based lookups instead of switch statements
- Short-circuit evaluation for validation
- Minimal object creation and copying
- Efficient error handling with proper context

Benchmark results comparing the old and new systems:

| Metric | Legacy System | New System | Difference |
|--------|--------------|------------|------------|
| Average parse time | 0.85ms | 0.92ms | +8% |
| Complex URL parse time | 1.25ms | 1.10ms | -12% |
| Memory usage | Base | Base+10% | +10% |

## Testing

The parameter system includes comprehensive test coverage:

- Unit tests for individual parsers
- Integration tests for the entire parameter pipeline
- Property-based tests for validation rules
- Benchmark tests for performance comparison

## Extending the System

### Adding New Parameter Types

1. Define the parameter in the registry
2. Create a processor strategy if special handling is needed
3. Register the processor in the processor registry

### Supporting New URL Formats

1. Create a new parser extending `BaseParameterParser`
2. Implement the `canParse` and `parse` methods
3. Register the parser in the `ParameterParserFactory`

## Best Practices

1. **Use the Registry**: Always define parameters in the registry with proper validation
2. **Respect Priorities**: Consider parameter source priority when implementing new parsers
3. **Provide Defaults**: Define sensible defaults for parameters when possible
4. **Handle Conflicts**: Use proper conflict detection and resolution
5. **Validate Early**: Catch invalid parameters as early as possible
6. **Log Clearly**: Include detailed context in error logging

## Troubleshooting

Common issues and solutions:

| Issue | Possible Cause | Solution |
|-------|---------------|----------|
| Parameters not recognized | Parser not detecting format | Check parser detection logic |
| Parameters overridden unexpectedly | Priority conflict | Review priority settings |
| Feature flag not working | Environment variable not set | Check environment configuration |
| Type errors | Incorrect validation | Update parameter definition in registry |

## Migration Guide

When migrating from the legacy parameter system:

1. Enable feature flags for testing
2. Monitor logs for parameter differences
3. Update client code to use normalized parameter names
4. Gradually increase percentage-based rollout
5. Enable the system fully after validating performance

## API Reference

### Core Interfaces

```typescript
// Parameter definition in the registry
interface TransformParameterDefinition {
  name: string;
  aliases?: string[];
  type: 'string' | 'number' | 'boolean' | 'object';
  validator?: (value: any) => boolean;
  formatter?: (value: any) => any;
  defaultValue?: any;
  description?: string;
}

// Raw parsed parameter before processing
interface TransformParameter {
  name: string;
  value: any;
  priority: number;
  source: 'url' | 'path' | 'akamai' | 'compact' | 'derivative';
}

// Options for parameter processing
interface ParameterProcessorOptions {
  applyDefaults?: boolean;
  enableClientDetection?: boolean;
  clientHints?: {
    viewportWidth?: number;
    dpr?: number;
    saveData?: boolean;
  };
  strictValidation?: boolean;
  strictConflictHandling?: boolean;
  conflictThreshold?: number;
}
```

### Key Functions

```typescript
// Parse parameters using feature flags
parseParameters(request: Request, options: ParseParametersOptions): NormalizedParameters

// Check if a feature flag is enabled
isEnabled(flag: FeatureFlag, options: FeatureFlagOptions): boolean

// Get parameter definition from registry
getParameterDefinition(name: string): TransformParameterDefinition | undefined

// Resolve parameter aliases to canonical name
resolveParameterName(name: string): string
```

## Metadata Processing Workflow

The parameter system interacts with image metadata in a specific workflow designed to enable smart image transformations:

### Two-Phase Transform Architecture

1. **Metadata Fetch Phase**: For requests requiring content-aware processing (with `ctx=true` or aspect ratio parameters):
   - A request with `format=json` is made to the Cloudflare Image Resizing API
   - This returns image metadata including original dimensions and format
   - This metadata informs intelligent transformation decisions

2. **Image Transform Phase**: Using the metadata from phase 1:
   - A second request is made to transform the actual image
   - Parameters like aspect ratio cropping use the metadata for optimal results
   - The final image is returned with appropriate transformations

### Preventing Recursive Metadata Loops

A key consideration in this workflow is preventing recursive loops:

- When we request `format=json` for metadata, we must ensure this request doesn't trigger another metadata fetch
- Without proper handling, this creates an infinite recursion: metadata request → metadata request → ...
- This results in 522 Connection Timeout errors when the recursion exceeds timeout limits

The solution is to detect `format=json` requests and modify their behavior:

```typescript
// In CloudflareOptionsBuilder.ts
if (params.format === 'json') {
  // This is a metadata request - don't add any parameters that would trigger
  // further metadata fetching
  
  // Don't set gravity=auto for metadata requests as it would trigger another fetch
  if (imageOptions.gravity === 'auto') {
    delete imageOptions.gravity;
    this.logger.debug('Removed gravity=auto for format=json request to prevent metadata fetching loop');
  }
}
```

### Content-Aware Processing with Aspect Ratio

For aspect ratio transformations that use content-aware cropping:

1. The `AspectRatioProcessor` implicitly enables content-aware processing:
   ```typescript
   // In aspect-processor.ts
   context.state.contextAware = true;
   context.parameters._contextAware = true;
   ```

2. The `CloudflareOptionsBuilder` converts this to Cloudflare's `gravity=auto` parameter:
   ```typescript
   // Convert ctx=true to gravity=auto for Cloudflare
   if ((params.ctx === true || params._contextAware === true) && 
       !imageOptions.gravity && 
       params.format !== 'json') {
     imageOptions.gravity = 'auto';
   }
   ```

3. Special handling prevents recursive metadata fetching for `format=json` requests

This approach ensures that aspect ratio processing works correctly with content-aware cropping while preventing infinite loops.

## Conclusion

The new parameter system provides a flexible, maintainable foundation for handling transformation parameters. It improves code quality through better type safety, modular architecture, and comprehensive error handling, while maintaining compatibility with existing URL formats. The system also handles metadata processing in a way that prevents recursive loops while enabling powerful content-aware transformations.