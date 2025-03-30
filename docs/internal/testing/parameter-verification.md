# Parameter Processing Verification

This document provides detailed guidance for testing and verifying the parameter processing and cache key generation systems.

## Testing Parameter Processing

### Validation Tests

The parameter processing pipeline should correctly validate and normalize parameters according to their definitions.

#### Test Cases for Parameter Validation

| Test Case | Expected Behavior |
|-----------|------------------|
| `?width=800` | Valid width parameter, processed normally |
| `?width=invalid` | Invalid width, parameter ignored |
| `?width=-100` | Invalid negative width, parameter ignored |
| `?quality=85` | Valid quality parameter, processed normally |
| `?quality=101` | Quality clamped to 100 (maximum allowed) |
| `?quality=-10` | Invalid negative quality, use default (85) |
| `?format=webp` | Valid format parameter, processed normally |
| `?format=invalid` | Invalid format, use default (auto) |
| `?f=xl` | Valid size code, maps to width=900 |
| `?f=invalid` | Invalid size code, parameter ignored |

### Explicit Width Tests

The system should correctly mark and respect explicit width parameters from different sources.

#### Test Cases for Explicit Width

| Test Case | Expected Behavior |
|-----------|------------------|
| `?width=800` | Explicit width=800, marked with __explicitWidth |
| `?w=800` | Explicit width=800, marked with __explicitWidth |
| `?imwidth=800` | Explicit width=800, marked with __explicitWidth |
| `?f=xl` | Explicit width=900 (from size code), marked with __explicitWidth |
| no width param | Responsive width calculated based on device |

### Parameter Priority Tests

When multiple parameters affect the same property, the system should follow the correct priority order.

#### Test Cases for Parameter Priority

| Test Case | Expected Behavior |
|-----------|------------------|
| `?width=800&f=xl` | f=xl takes precedence, width=900 |
| `?width=800&w=600` | Higher priority parameter wins (depends on source) |
| `?imwidth=800&width=600` | imwidth takes precedence, width=800 |
| `?width=800&derivative=large` | width parameter overrides derivative |

## Testing Cache Key Generation

### Unique Cache Key Tests

Different parameter combinations should always generate unique cache keys.

#### Test Cases for Cache Key Uniqueness

| Test Case A | Test Case B | Expected Behavior |
|-------------|-------------|------------------|
| `?width=800` | `?width=900` | Different cache keys |
| `?width=800&height=600` | `?width=800&height=700` | Different cache keys |
| `?r=16:9&p=0.7,0.5&f=xl` | `?r=1:1&p=0.7,0.5&f=xs` | Different cache keys |
| `?width=800&format=webp` | `?width=800&format=avif` | Different cache keys |
| `?width=800` | `?w=800` | Different cache keys (different parameter names) |

### Cache Key Consistency Tests

The same parameter combination should always generate the same cache key, even across different requests.

#### Test Cases for Cache Key Consistency

| Test Case | Expected Behavior |
|-----------|------------------|
| Multiple requests with `?width=800` | Same cache key each time |
| Multiple requests with `?f=xl&format=webp` | Same cache key each time |
| Requests from different browsers with same params | Same cache key regardless of User-Agent |

### Cache Key Component Tests

Cache keys should correctly include all relevant components: prefix, path, parameters, format, and hash.

#### Test Cases for Cache Key Components

| Test Case | Expected Component Check |
|-----------|--------------------------|
| `?width=800` | Key includes "w800" in the parameters section |
| `?r=16:9` | Key includes "r16-9" in the parameters section |
| `?format=webp` | Key includes "webp" in the format section |
| `?f=xl` | Key includes "fxl" in the parameters section |

## Testing Cache Hit/Miss Behavior

### Cache Hit Tests

The system should correctly serve from cache when the same parameters are used.

#### Test Cases for Cache Hits

1. Make initial request with specific parameters:
   ```
   https://images.erfi.dev/Granna_1.JPG?width=800&format=webp
   ```

2. Make identical request again and verify:
   - `X-Cache` header shows "HIT"
   - Response time is significantly faster

### Cache Miss Tests

The system should correctly bypass cache when different parameters are used.

#### Test Cases for Cache Misses

1. Make initial request with specific parameters:
   ```
   https://images.erfi.dev/Granna_1.JPG?width=800&format=webp
   ```

2. Make request with different parameters and verify:
   - `X-Cache` header shows "MISS"
   - New cache key is generated

## Testing the Complete Pipeline

### End-to-End Test

This test verifies the entire parameter processing and caching pipeline.

1. Make a request with explicit parameters:
   ```
   https://images.erfi.dev/Granna_1.JPG?width=800&height=600&fit=cover&format=webp&quality=85&debug=headers
   ```

2. Verify debug headers show:
   - Parameters were processed correctly
   - Explicit width/height flags were set
   - Transform options match request parameters
   - Cache key was generated correctly

3. Make the same request again and verify:
   - `X-Cache` header shows "HIT"
   - Cache key is identical to the first request

4. Change one parameter and verify:
   - `X-Cache` header shows "MISS"
   - Cache key is different from the first request

## Load and Performance Testing

### Cache Performance Tests

These tests verify that the caching system improves performance under load.

1. Send multiple identical requests in sequence:
   ```
   https://images.erfi.dev/Granna_1.JPG?width=800
   ```

2. Measure and compare:
   - First request time (cache miss)
   - Subsequent request times (cache hits)
   - Average response time reduction

3. Send multiple different requests to test cache distribution:
   ```
   https://images.erfi.dev/Granna_1.JPG?width=800
   https://images.erfi.dev/Granna_1.JPG?width=400
   https://images.erfi.dev/Granna_1.JPG?f=xl
   ```

4. Monitor cache statistics:
   - Hit rate
   - Average response time
   - Cache size growth

## Troubleshooting Parameter Issues

### Common Issues and Solutions

| Issue | Possible Cause | Solution |
|-------|---------------|----------|
| Parameter ignored | Invalid value or format | Check parameter format against documentation |
| Unexpected transformation | Parameter priority override | Check for conflicting parameters |
| Same cache key for different params | Hash collision (very rare) | Verify all parameters are included in hash input |
| Cache miss when hit expected | Different URL format | Ensure exact URL format is used (e.g., same order of parameters) |
| Responsive width override | Missing explicit width flag | Use width=, w=, imwidth=, or f= parameter |

### Debugging Tools

1. **Debug Headers**:
   ```
   https://images.erfi.dev/Granna_1.JPG?width=800&debug=headers
   ```
   Shows detailed parameter processing information.

2. **HTML Debug Report**:
   ```
   https://images.erfi.dev/Granna_1.JPG?width=800&debug=html
   ```
   Shows visual report with transformation details.

3. **Logging**:
   Enable DEBUG level logging in configuration to see detailed parameter processing logs.