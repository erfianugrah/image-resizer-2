# Parameter Processing and Cache Key Generation Fix

## Issue Summary

Two critical issues were identified and fixed in the parameter processing and cache key generation systems:

1. **Inconsistent Cache Keys**: Different URL parameters (e.g., `https://images.erfi.dev/Granna_1.JPG?r=21:9&p=0.7,0.5&f=xg` vs `https://images.erfi.dev/Granna_1.JPG?r=1:1&p=0.7,0.5&f=xs`) were generating identical cache keys, causing incorrect transformations to be served from cache.

2. **Ignored Explicit Parameters**: Explicit dimension parameters like `https://images.erfi.dev/Granna_1.JPG?imwidth=123` and size codes (`https://images.erfi.dev/Granna_1.JPG?f=xl`) were being overridden by responsive width calculations, ignoring user-specified dimensions.

## Root Causes

### Cache Key Generation Issues

1. **FNV-1a Hash Implementation**: The hash algorithm wasn't properly handling UTF-8 characters, leading to inconsistent hashing.
2. **Incomplete Parameter Inclusion**: The hash input didn't include all URL parameters or preserved their original format.

### Parameter Processing Issues

1. **Missing Explicit Flags**: The width and height parameters weren't being marked as explicitly set by the user.
2. **Responsive Override**: The responsive width calculation wasn't checking for explicit dimension flags before overriding values.
3. **Inconsistent Parameter Priorities**: Parameters like size codes (`f=xl`) had inconsistent priority in different parts of the system.

## Implemented Fixes

### Cache Key Generation Fixes

1. **Enhanced FNV-1a Algorithm**: 
   - Improved UTF-8 character handling with TextEncoder
   - Ensured proper 32-bit unsigned integer arithmetic
   - Added consistent padding for uniform key length

2. **Raw URL Parameter Preservation**:
   - Modified the hash input to include the raw URL search string
   - Ensured all parameters are consistently included in the cache key

```typescript
// For cache key consistency, we need to capture the exact set of URL parameters
const rawSearchParams = url.search;
    
// We'll use the original search parameters directly to ensure identical hash generation
const hashInput = `${url.pathname}${rawSearchParams}${transformString}`;
```

### Parameter Processing Fixes

1. **Explicit Dimension Flags**:
   - Added `__explicitWidth` and `__explicitHeight` flags to mark user-specified dimensions
   - Modified parameter processors to set these flags for all dimension-setting parameters

```typescript
// Add the explicit flag if defined
if (mapping.flag) {
  // Use type assertion for adding dynamic properties
  (newParam as any)[mapping.flag] = true;
  processedValues[mapping.flag] = true; // Set in processedValues too
}
```

2. **Size Code Handling**:
   - Enhanced `SizeCodeProcessor` to properly set both the width and explicit flag
   - Preserved the original size code parameter in the transform options

```typescript
// Add width parameter to result with explicit flag
result.width = width;
      
// Add the explicit flag to indicate this width should not be overridden
result.__explicitWidth = true;
```

3. **Responsive Width Respect**:
   - Modified responsive width calculation to respect explicit flags

```typescript
// Skip this calculation entirely if an explicit width flag is present
if (
  (!transformOptions.width || (transformOptions as any).__autoWidth === true) && 
  !explicitDimensions.width // Skip if width is explicitly set
) {
  // Calculate responsive width...
}
```

## Testing and Verification

The fixes were tested with various parameter combinations:

1. **Cache Key Tests**:
   - Different parameter combinations now generate unique cache keys
   - The cache key format remains human-readable for debugging

2. **Parameter Processing Tests**:
   - Explicit width parameters are correctly preserved through the transformation pipeline
   - Size codes correctly map to their width values and set explicit flags

Example test cases:
- `https://images.erfi.dev/Granna_1.JPG?width=100` -> Explicit width of 100px, overrides responsive width
- `https://images.erfi.dev/Granna_1.JPG?f=xl` -> Explicit width of 900px (from size code), overrides responsive width
- `https://images.erfi.dev/Granna_1.JPG?imwidth=200` -> Explicit width of 200px from Akamai parameter, overrides responsive width

## Conclusion

These fixes ensure that:
1. Different parameter combinations generate unique cache keys
2. Explicit parameters correctly override automatic calculations
3. All parameter types (standard, compact, Akamai) work consistently throughout the system

The implemented changes maintain backward compatibility while improving the reliability and predictability of the image transformation process.