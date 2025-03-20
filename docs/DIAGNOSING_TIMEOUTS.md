# Diagnosing Cloudflare 524 Timeout Errors

This guide provides a step-by-step approach to diagnosing 524 timeout errors in the Image Resizer service using the breadcrumb tracing system.

## Understanding 524 Errors

A Cloudflare 524 error ("A timeout occurred") happens when a Worker exceeds its execution time limit:
- 30 seconds for paid plans
- 50ms for free plans

In the Image Resizer, timeouts typically occur during complex operations like:
- Image fetching from slow origins
- Complex transformations with large images
- The Akamai compatibility layer, especially the aspectCrop function

## Using Breadcrumbs for Diagnosis

The breadcrumb tracing system creates a chronological trail of operations throughout the request lifecycle, making it easier to identify where a timeout is occurring.

### Step 1: Monitor for 524 Errors

Set up monitoring to detect 524 errors in production:

```bash
# Using Wrangler
wrangler tail --format=json | grep -E '"status":\s*524'

# Using Cloudflare Analytics
# Check the Workers Invocations panel in the Cloudflare dashboard
```

### Step 2: Capture a Full Breadcrumb Trail

When a 524 error is detected, capture the complete breadcrumb trail:

```bash
# Capture all logs for a specific time period
wrangler tail --format=json > logs.json

# Extract breadcrumbs from the logs
cat logs.json | grep -E '"type":\s*"breadcrumb"' > breadcrumbs.json

# Or filter for visual marker in plain text logs
wrangler tail | grep "🔶" > breadcrumbs.txt
```

### Step 3: Analyze the Breadcrumb Timeline

Create a timeline of operations from the breadcrumbs:

1. Sort breadcrumbs chronologically
2. Note the timestamp and duration of each step
3. Calculate the time between consecutive breadcrumbs
4. Identify any abnormally large gaps

Example timeline analysis:

```
12:34:56.789 [INFO] [Handler] 🔶 BREADCRUMB: Request received
12:34:56.792 [INFO] [Path] 🔶 BREADCRUMB: URL parsed, duration=3ms
12:34:56.795 [INFO] [Storage] 🔶 BREADCRUMB: Starting R2 fetch, duration=3ms
12:34:56.850 [INFO] [Storage] 🔶 BREADCRUMB: R2 fetch complete, duration=55ms
12:34:56.855 [INFO] [Transform] 🔶 BREADCRUMB: Starting transformation, duration=5ms
12:34:56.860 [INFO] [AkamaiCompat] 🔶 BREADCRUMB: Starting aspectCrop, duration=5ms
... [30+ second gap - timeout occurred here] ...
```

### Step 4: Identify the Timeout Location

Look for these patterns in the breadcrumb trail:

1. **Missing Breadcrumbs**: A breadcrumb that starts an operation but has no matching completion breadcrumb
2. **Large Duration Values**: A breadcrumb that reports an unusually long duration
3. **Large Gaps**: A significant time gap between consecutive breadcrumbs

In our implementation, particular attention should be paid to:

```
[INFO] [AkamaiCompat] 🔶 BREADCRUMB: Starting aspectCrop
[INFO] [AkamaiCompat] 🔶 BREADCRUMB: Parsed aspectCrop parameters
[INFO] [AkamaiCompat] 🔶 BREADCRUMB: Setting gravity
[INFO] [AkamaiCompat] 🔶 BREADCRUMB: aspectCrop completed
```

If any of these breadcrumbs are missing, it indicates the timeout occurred during that operation.

### Step 5: Reproduce the Issue

Once you've identified the likely source of the timeout, attempt to reproduce it:

1. Create a test case that mimics the problematic request
2. Use the same parameters and image source
3. Add additional verbose logging if needed
4. Run the test in a development environment with higher timeouts

```bash
# Run with verbose logging enabled
LOGGING_LEVEL=DEBUG npm run dev

# Test with the specific problematic URL
curl "http://localhost:8787/path/to/problematic/image.jpg?width=800&height=600&crop=aspect"

# If you want to test with a known large image (13MB+)
curl "http://localhost:8787/Granna_1.JPG?width=800&height=600&fit=crop"
```

## Common Timeout Causes

### 1. Slow Image Origin

If breadcrumbs show timeout during storage operations:

```
[INFO] [Storage] 🔶 BREADCRUMB: Starting remote fetch
... [timeout] ...
```

Solutions:
- Implement stricter timeouts for origin fetches
- Add caching headers to the origin
- Consider using R2 as a primary storage

### 2. Large Image Processing

If breadcrumbs show timeout during transformation:

```
[INFO] [Transform] 🔶 BREADCRUMB: Starting transformation
... [timeout] ...
```

Solutions:
- Add size limits for input images
- Implement progressive resizing for very large images
- Add timeouts for transformation operations

### 3. Cloudflare Image Resizing Subrequests

If breadcrumbs show a pattern of repeated transformations with the same image:

```
[INFO] [Transform] 🔶 BREADCRUMB: Starting transformation for image.jpg
[INFO] [Transform] 🔶 BREADCRUMB: Starting transformation for image.jpg (again)
... [timeout] ...
```

Solutions:
- Implement the interceptor pattern to handle Cloudflare Image Resizing subrequests
- Check that "via: image-resizing" header detection is working properly
- Review the complete implementation in [INTERCEPTOR_PATTERN.md](./INTERCEPTOR_PATTERN.md)

### 4. Akamai Compatibility Issues

If breadcrumbs show timeout during aspectCrop:

```
[INFO] [AkamaiCompat] 🔶 BREADCRUMB: Setting gravity
... [timeout] ...
```

Solutions:
- Optimize the aspectCrop algorithm
- Add timeout guards around complex calculations
- Implement a simplified fallback for edge cases

## Optimization Strategies

Once you've identified the source of timeouts, consider these optimization approaches:

1. **Input Validation**: Reject requests with parameters that could cause timeouts
2. **Timeouts**: Add explicit timeouts to long-running operations
3. **Caching**: Increase cache TTLs for problematic resources
4. **Simplification**: Create simpler implementations for edge cases
5. **Load Shedding**: Implement mechanisms to reject requests during high load
6. **Circuit Breakers**: Temporarily disable problematic features when failures occur

## Example: Optimizing aspectCrop

If the aspectCrop function in the Akamai compatibility layer is causing timeouts, consider these specific optimizations:

```typescript
// Before:
export function aspectCrop(params) {
  // Complex calculations without timeouts
  // ...
}

// After:
export function aspectCrop(params) {
  // Set a timeout guard
  const timeoutMs = 5000;
  const startTime = Date.now();
  
  // Add breadcrumbs at key points
  logger.breadcrumb('Starting aspectCrop');
  
  // Add a check for parameters that might cause issues
  if (isComplexCase(params)) {
    logger.breadcrumb('Using simplified algorithm for complex case');
    return simplifiedAspectCrop(params);
  }
  
  // Check timeout during processing
  const checkTimeout = () => {
    if (Date.now() - startTime > timeoutMs) {
      logger.breadcrumb('Timeout detected in aspectCrop', Date.now() - startTime);
      throw new Error('Timeout while processing aspectCrop');
    }
  };
  
  // Main processing
  try {
    // Step 1: Parse parameters
    const parsed = parseParams(params);
    logger.breadcrumb('Parsed aspectCrop parameters', Date.now() - startTime, parsed);
    checkTimeout();
    
    // Step 2: Calculate dimensions
    const dimensions = calculateDimensions(parsed);
    logger.breadcrumb('Calculated dimensions', Date.now() - startTime, dimensions);
    checkTimeout();
    
    // Step 3: Set gravity
    const gravity = calculateGravity(dimensions);
    logger.breadcrumb('Set gravity', Date.now() - startTime, { gravity });
    checkTimeout();
    
    // Step 4: Return result
    const result = {
      // ... final transformation params
    };
    
    logger.breadcrumb('aspectCrop completed', Date.now() - startTime, { 
      finalParams: result
    });
    
    return result;
  } catch (error) {
    logger.breadcrumb('aspectCrop failed', Date.now() - startTime, { 
      error: error.message
    });
    throw error;
  }
}
```

## Monitoring Improvements

After implementing fixes:

1. Continue monitoring for 524 errors
2. Compare breadcrumb trails before and after fixes
3. Look for improved performance metrics
4. Validate that the problematic cases now complete successfully

## Additional Resources

- [Cloudflare Workers Limits](https://developers.cloudflare.com/workers/platform/limits/)
- [Cloudflare 524 Error Troubleshooting](https://developers.cloudflare.com/support/troubleshooting/cloudflare-errors/troubleshooting-cloudflare-5xx-errors/#error-524-a-timeout-occurred)
- [Image Resizer Logging Documentation](./LOGGING.md)
- [Interceptor Pattern Documentation](./INTERCEPTOR_PATTERN.md)
- [Akamai Compatibility Documentation](./AKAMAI_COMPATIBILITY.md)