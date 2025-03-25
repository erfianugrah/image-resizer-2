# Performance Investigation: Multiple Worker Invocations

## Summary

An investigation of the image transformation logs revealed a critical issue affecting performance:

1. **Multiple Worker Invocations**: The same image request is being processed multiple times by the CF worker

## Log Analysis

Analyzing a single request for `https://images.erfi.dev/Granna_1.JPG?width=1900` shows:

- The request is processed 3 separate times
- Each transformation takes ~2.6 seconds
- The original image is 16,159,522 bytes (~15.4MB)
- First AVIF transformation produces 1,153,717 bytes (~1.1MB)
- Second AVIF transformation produces 833,862 bytes (~834KB)

## Identified Issues

### Duplicate Processing

The worker is being invoked multiple times for the same request, which:
- Wastes compute resources
- Increases overall latency
- Creates inconsistent output sizes

## Potential Root Causes

1. **Worker Re-invocation**:
   - Cache misses in the Cloudflare edge network
   - Internal redirect loops
   - Subrequest detection failing
   - Request forwarding issues

## Recommendations

### Short-term Fixes

1. **Improve Subrequest Detection**:
   - Enhance the `via` header checking logic
   - Add additional markers for worker-processed images

2. **Optimize Cache Strategy**:
   - Implement stronger cache directives
   - Use cache tags more effectively
   - Ensure proper cache status propagation

### Long-term Improvements

1. **Advanced Request Deduplication**:
   - Implement request coalescing using Cache API
   - Create pending request tracking
   - Use waitUntil for continued processing without blocking

2. **Performance Telemetry**:
   - Add detailed performance tracking
   - Create request path tracking
   - Monitor transformation performance

## Next Steps

1. Conduct code review focusing on subrequest detection and CF caching
2. Implement improved subrequest detection
3. Test with various request patterns to verify fixes
4. Document optimization results