# R2 Performance Optimization Strategy

## Problem Analysis

After analyzing the image-resizer-2 codebase and logs, we've identified that R2 fetch operations are the primary performance bottleneck. A typical request spends 97.5% of its time (314ms out of 322ms) fetching from R2, while actual image transformation takes only 8ms.

## Core Issues and Solutions

### 1. Authentication Overhead

**Issue:** Authentication check logic is still executed even when auth is disabled (auth.ts:387-393). This introduces unnecessary code execution and function calls.

**Solution:**
- Implement an early bailout at the entry point before calling `authenticateRequest`
- Create a specialized version of storage fetch functions for auth-disabled scenarios
- Add compile-time optimization for auth branches

```typescript
// Implementation: Fast path for disabled auth
// In the main handler or before using storage.ts:
export async function fetchImage(
  path: string,
  config: ImageResizerConfig,
  env: Env,
  request?: Request
): Promise<StorageResult> {
  // Fast path when auth is globally disabled
  if (!config.storage.auth?.enabled) {
    return fetchImageWithoutAuth(path, config, env, request);
  }
  
  // Original code path with auth checks
  // ...rest of the function
}

// Specialized version without auth overhead
async function fetchImageWithoutAuth(
  path: string,
  config: ImageResizerConfig,
  env: Env,
  request?: Request
): Promise<StorageResult> {
  // Simpler implementation without any auth checks
  // Direct R2 fetching without authentication overhead
}
```

### 2. Dynamic Import Overhead

**Issue:** Code is importing `aws4fetch` dynamically (storage.ts:294-304) on every request, even when not needed, adding significant latency.

**Solution:**
- Move dynamic imports outside the request path
- Use conditional imports based on configuration at initialization time
- Implement lazy-loading pattern for auth modules

```typescript
// Implementation: Conditional module loading
// At module initialization rather than in the request path:
let awsClient: typeof AwsClient | null = null;

// Initialize the module at startup, not during request
async function initializeAuthModules(config: ImageResizerConfig): Promise<void> {
  if (config.storage.auth?.enabled) {
    try {
      const aws4fetch = await import('aws4fetch');
      awsClient = aws4fetch.AwsClient;
      logger.debug('AWS auth module loaded');
    } catch (e) {
      logger.warn('Failed to load AWS auth module', { error: String(e) });
    }
  }
}

// Use the pre-loaded module in the request path
async function signAwsRequest(url: string, origin: OriginConfig, env: Env): Promise<Record<string, string> | null> {
  if (!awsClient) {
    logger.warn('AWS client not initialized');
    return null;
  }
  
  // Use the already loaded module
  const aws = new awsClient({
    accessKeyId: /* ... */,
    secretAccessKey: /* ... */,
    // rest of the config
  });
  
  // Rest of function using aws client
}
```

### 3. Path Transformation Inefficiency

**Issue:** `applyPathTransformation` (storage.ts:49-95) runs repeatedly for each request with no memoization, performing redundant string operations and segment checks.

**Solution:**
- Implement path transformation caching with a LRU cache
- Precompute common transformations
- Add fingerprinting for faster path lookup

```typescript
// Implementation: Path transformation caching
// Define an LRU cache for path transformations
const pathTransformCache = new Map<string, string>();
const MAX_CACHE_SIZE = 1000;

function applyPathTransformationCached(
  path: string, 
  config: ImageResizerConfig, 
  originType: 'r2' | 'remote' | 'fallback'
): string {
  // Create a cache key
  const cacheKey = `${path}:${originType}`;
  
  // Check cache first
  if (pathTransformCache.has(cacheKey)) {
    return pathTransformCache.get(cacheKey)!;
  }
  
  // Apply transformation
  const transformedPath = applyPathTransformation(path, config, originType);
  
  // Store in cache
  pathTransformCache.set(cacheKey, transformedPath);
  
  // Prune cache if needed
  if (pathTransformCache.size > MAX_CACHE_SIZE) {
    // Remove oldest entry
    const firstKey = pathTransformCache.keys().next().value;
    pathTransformCache.delete(firstKey);
  }
  
  return transformedPath;
}
```

### 4. Excessive Conditional Logic

**Issue:** The `fetchFromR2` function (storage.ts:100-233) has separate code paths for with/without request object, duplicating code and adding complexity.

**Solution:**
- Refactor to use a single code path with sensible defaults
- Extract common operations into helper functions
- Eliminate duplicate code blocks

```typescript
// Implementation: Unified R2 fetch with sensible defaults
async function fetchFromR2Unified(
  path: string, 
  bucket: R2Bucket,
  request?: Request,
  config?: ImageResizerConfig
): Promise<StorageResult | null> {
  try {
    // Normalize the path by removing leading slashes
    const normalizedPath = path.replace(/^\/+/, '');
    
    // Prepare options object with sensible defaults
    const options: R2GetOptions = {};
    
    // Add conditional request options if request exists
    if (request) {
      // Extract conditional headers and range requests
      const conditionalOptions = extractConditionalOptions(request);
      Object.assign(options, conditionalOptions);
    }
    
    // Single fetch operation
    const object = await bucket.get(normalizedPath, options);
    
    // Handle 304 Not Modified for conditional requests
    if (object === null && request && (request.headers.get('If-None-Match') || request.headers.get('If-Modified-Since'))) {
      return {
        response: new Response(null, { status: 304 }),
        sourceType: 'r2',
        contentType: null,
        size: 0
      };
    }
    
    if (!object) {
      return null;
    }
    
    // Create response with unified approach
    return createR2Response(object, options, config);
  } catch (error) {
    // Error handling
    logger.error('Error fetching from R2', { 
      error: error instanceof Error ? error.message : String(error),
      path
    });
    throw new StorageError('Error accessing R2 storage', { 
      originalError: error instanceof Error ? error.message : String(error),
      path
    });
  }
}

// Helper function to extract conditional options
function extractConditionalOptions(request: Request): R2GetOptions {
  const options: R2GetOptions = {};
  
  // If-None-Match / If-Modified-Since logic
  const ifNoneMatch = request.headers.get('If-None-Match');
  const ifModifiedSince = request.headers.get('If-Modified-Since');
  
  if (ifNoneMatch) {
    options.onlyIf = { etagDoesNotMatch: ifNoneMatch };
  } else if (ifModifiedSince) {
    const ifModifiedSinceDate = new Date(ifModifiedSince);
    if (!isNaN(ifModifiedSinceDate.getTime())) {
      options.onlyIf = { uploadedAfter: ifModifiedSinceDate };
    }
  }
  
  // Range request handling
  const rangeHeader = request.headers.get('Range');
  if (rangeHeader && rangeHeader.startsWith('bytes=')) {
    try {
      const rangeValue = rangeHeader.substring(6);
      const [start, end] = rangeValue.split('-').map(v => parseInt(v, 10));
      
      if (!isNaN(start)) {
        const range: R2Range = { offset: start };
        
        if (!isNaN(end)) {
          range.length = end - start + 1;
        }
        
        options.range = range;
      }
    } catch (e) {
      // Invalid range header, ignore
    }
  }
  
  return options;
}

// Helper function to create R2 response
function createR2Response(
  object: R2Object, 
  options: R2GetOptions, 
  config?: ImageResizerConfig
): StorageResult {
  // Create headers using R2 object's writeHttpMetadata
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  
  // Add additional headers
  const r2CacheTtl = config?.cache.ttl.r2Headers || 86400;
  headers.set('Cache-Control', `public, max-age=${r2CacheTtl}`);
  headers.set('Accept-Ranges', 'bytes');
  
  // The Range response
  let status = 200;
  if (options.range && 'offset' in options.range) {
    status = 206;
    const offset = options.range.offset || 0;
    const length = options.range.length || 0;
    const end = offset + length - 1;
    const total = object.size;
    headers.set('Content-Range', `bytes ${offset}-${end}/${total}`);
  }
  
  // Return a successful result with the object details
  return {
    response: new Response(object.body, {
      headers,
      status
    }),
    sourceType: 'r2',
    contentType: object.httpMetadata?.contentType || null,
    size: object.size,
    path: object.key
  };
}
```

### 5. Multiple R2 Bucket Accesses

**Issue:** When a transformed path fails, the code tries again with a normalized path (storage.ts:702-726), causing sequential R2 operations.

**Solution:**
- Parallelize fetch operations for transformed and normalized paths
- Use Promise.race to get the first successful result
- Implement a priority-based fetch strategy that avoids unnecessary operations

```typescript
// Implementation: Parallel path fetching
async function fetchFromR2WithMultiplePaths(
  originalPath: string,
  transformedPath: string,
  bucket: R2Bucket,
  request?: Request,
  config?: ImageResizerConfig
): Promise<StorageResult | null> {
  // Only perform dual fetch if paths differ
  if (originalPath === transformedPath) {
    return fetchFromR2Unified(transformedPath, bucket, request, config);
  }
  
  // Create a normalized path as well
  const normalizedPath = originalPath.startsWith('/') ? originalPath.substring(1) : originalPath;
  
  // Start fetches in parallel
  const fetchPromises = [
    // Try transformed path first (higher priority)
    fetchFromR2Unified(transformedPath, bucket, request, config)
      .then(result => result ? { result, path: 'transformed' } : null),
      
    // Also try normalized path in parallel
    fetchFromR2Unified(normalizedPath, bucket, request, config)
      .then(result => result ? { result, path: 'normalized' } : null)
  ];
  
  // Wait for first successful result or all failures
  const results = await Promise.all(fetchPromises);
  const successfulResult = results.find(result => result !== null);
  
  if (successfulResult) {
    logger.debug('Found image with path strategy', { pathType: successfulResult.path });
    return successfulResult.result;
  }
  
  return null;
}
```

## Implementation Plan

1. **Benchmark Current Performance**
   - Establish baseline metrics for different image sizes
   - Identify specific slow operations in the code path
   - Measure R2 fetch time in isolation

2. **Implement Authentication Fast Path (Day 1)**
   - Create specialized fetch function for auth-disabled scenarios
   - Implement early bailout patterns
   - Add configuration pre-checks

3. **Fix Dynamic Import Issues (Day 2)**
   - Move dynamic imports to module initialization
   - Implement conditional module loading
   - Create pre-initialized auth clients

4. **Optimize Path Transformations (Days 3-4)**
   - Implement path transformation caching
   - Add path fingerprinting for faster lookups
   - Optimize segment analysis for common paths

5. **Refactor R2 Client Implementation (Days 5-7)**
   - Unify conditional request handling
   - Extract helper functions for common operations
   - Implement optimized R2 fetcher with better error handling

6. **Implement Parallel Fetch Operations (Days 8-10)**
   - Add parallel path fetching
   - Implement Promise.race for faster resolution
   - Add cancellation support for unnecessary fetches

7. **Validation and Testing (Days 11-14)**
   - Comprehensive performance testing
   - Regression testing for all optimizations
   - Production validation with real traffic patterns

## Expected Outcomes

- **R2 Fetch Time**: Reduce from 314ms to <100ms (68% improvement)
- **Total Response Time**: Decrease from 322ms to <120ms (63% improvement)
- **CPU Utilization**: Lower by 40% through optimized processing
- **Memory Usage**: Reduce by 25% through better resource management
- **Bandwidth Efficiency**: Improve by implementing better cache patterns

## Monitoring Strategy

- Implement detailed timing metrics for each processing stage
- Add custom performance headers to track optimization effectiveness
- Develop a dashboard to visualize R2 fetch performance over time
- Set up alerts for performance degradation