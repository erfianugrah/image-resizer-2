# Parameter System - Metadata Service Integration Resolution

## Problem Statement

The image resizer was experiencing 522 Connection Timeout errors when using content-aware transformations with aspect ratio parameters. This was caused by a recursive metadata fetching loop:

1. A request with aspect ratio parameters comes in
2. The system needs to fetch metadata to determine optimal dimensions
3. It makes a `format=json` request to get the metadata
4. This metadata request itself triggered another metadata fetch (because `gravity=auto` was being added)
5. This created an infinite loop until the request timed out

## Root Cause

The root cause was identified as:

1. When a request with `format=json` is made, the CloudflareOptionsBuilder was still adding `gravity=auto` to the request parameters
2. This created recursive metadata fetching, as each metadata request would trigger another metadata request

## Solution

The solution has two components:

1. **Parameter System Integration**:
   - Created a `metadata-fetch.ts` module with helper functions
   - Implemented `createMetadataFetchParameters()` that adds anti-recursion flags:
     - `_metadata_request: true` - Marks this as a metadata-only request
     - `_skip_ctx: true` - Prevents adding context-aware processing parameters
   - Added detection functions `isMetadataRequest()` and `shouldSkipContextAware()`
   - Updated CloudflareOptionsBuilder to check for these flags

2. **CloudflareOptionsBuilder Enhancements**:
   - Added logic to detect metadata requests (`format=json` or `_metadata_request: true`)
   - Prevented adding `gravity=auto` to metadata requests
   - Added special handling for context-aware processing to prevent recursive loops

## Implementation Details

### Anti-Recursion Flags

The key to preventing recursion is the use of special flags in metadata requests:

```typescript
// In metadata-fetch.ts
export function createMetadataFetchParameters(options?: {
  includeExif?: boolean;
  skipMetadataRecursion?: boolean;
}): NormalizedParameters {
  const params: NormalizedParameters = {
    format: 'json'
  };
  
  // Add optional parameters for different types of metadata
  if (options?.includeExif) {
    params.metadata = 'keep';
  }
  
  // By default, add parameters to prevent recursive metadata fetching
  if (options?.skipMetadataRecursion !== false) {
    // This flag tells the system not to trigger another metadata fetch
    // for a request that is already fetching metadata
    params._metadata_request = true;
    
    // Explicitly disable content-aware processing for metadata requests
    // to prevent loops with gravity=auto
    params._skip_ctx = true;
  }
  
  return params;
}
```

### CloudflareOptionsBuilder Integration

The CloudflareOptionsBuilder was updated to respect these flags:

```typescript
// In CloudflareOptionsBuilder.ts
private applyStandardParameters(
  params: NormalizedParameters,
  imageOptions: Record<string, any>
): void {
  // Check if this is a metadata request (format=json)
  if (params.format === 'json' || params._metadata_request === true) {
    // This is a metadata request - disable context-aware processing
    // to prevent recursive metadata fetching that causes 522 errors
    if (imageOptions.gravity === 'auto') {
      delete imageOptions.gravity;
      this.logger.debug('Removed gravity=auto for metadata request to prevent recursive fetch loop');
    }
    
    // Mark this as a metadata request to prevent further recursion
    imageOptions._metadata_request = true;
  }
}
```

### Context-Aware Processing Integration

The system also needed to skip context-aware processing for metadata requests:

```typescript
// Handle special case - convert ctx (or smart) to gravity=auto for Cloudflare
// Skip for metadata requests or when _skip_ctx flag is set
const isMetadataRequest = params.format === 'json' || params._metadata_request === true;
const shouldSkipCtx = isMetadataRequest || params._skip_ctx === true;

if ((params.ctx === true || params._contextAware === true) && 
    !imageOptions.gravity && 
    !shouldSkipCtx) {
  imageOptions.gravity = 'auto';
  this.logger.debug('Converted context-aware processing to gravity=auto');
}
```

## Usage Guide

### How to Create Metadata Requests

To correctly fetch metadata without triggering a recursive loop:

```typescript
import { createMetadataFetchParameters } from '../parameters/metadata-fetch';

// Create parameters for a metadata-only request with anti-recursion flags
const metadataParams = createMetadataFetchParameters();
// Result: { format: 'json', _metadata_request: true, _skip_ctx: true }

// Create a URL with these parameters
const metadataUrl = new URL(imageUrl);
metadataUrl.search = '';

// Add all metadata parameters to the URL
for (const [key, value] of Object.entries(metadataParams)) {
  if (value !== undefined) {
    metadataUrl.searchParams.set(key, String(value));
  }
}

// Fetch metadata safely without recursive loops
const metadataResponse = await fetch(metadataUrl.toString());
const metadata = await metadataResponse.json();
```

### Feature Flag Integration

The solution is designed to work with the feature flag system:

1. When `FLAG_NEW_PARAMETER_SYSTEM_ENABLED=true`, the `ParameterAdapter` will use our new parameter system
2. This automatically includes the metadata integration that prevents recursive fetching
3. During the transition, both systems will handle metadata requests correctly

## Verification

Integration tests have been added to verify that:

1. The parameter system creates metadata requests with anti-recursion flags
2. CloudflareOptionsBuilder correctly handles these flags
3. The feature flag integration enables the solution when turned on

This solution ensures that the system can safely perform content-aware transformations with aspect ratio parameters without causing recursive metadata fetching loops.