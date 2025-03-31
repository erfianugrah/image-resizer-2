# Cache Key Generation and Parameter Processing Fixes

## Issues Fixed

### 1. Cache Key Generation

**Problem**:
Different image transformation parameters were resulting in the same cache key. For example:
- `r=21:9&p=0.7,0.5&f=xg` 
- `r=1:1&p=0.7,0.5&f=xs`

Both resulted in the same cache key: `transform:Granna_1.JPG:default:auto:2fe496ac`

**Solution**:
- Enhanced hash calculation in `SimpleKVTransformCacheManager.ts` to properly include all URL parameters
- Preserved the raw URL search string format to ensure consistent hash generation 
- Improved FNV-1a hash algorithm with UTF-8 encoding support and proper unsigned integer arithmetic

### 2. Parameter Processing for Size Codes ('f' parameter)

**Problem**:
The 'f' parameter (size code) was not being properly processed or preserved in the cache key.

**Solution**:
- Added direct handling of the 'f' parameter in the `ParameterProcessor`
- Mapped size codes (like 'l', 's', 'xg') directly to their width values
- Preserved the original 'f' parameter in cache key generation
- Set width parameter to explicitly override responsive width calculations

### 3. Explicit Width Parameters Not Being Respected

**Problem**: 
Parameters like `imwidth=123` were not being respected in the final transformation, being overridden by responsive width calculation.

**Solution**:
- Added explicit dimension flags to mark parameters that should never be overridden
- Enhanced parameter mapping to maintain parameter priority through the processing pipeline
- Modified responsive width calculation to respect explicit dimension flags
- Added detailed logging for better debugging

## Implementation Details

1. **Hash Calculation**:
   - Fixed raw URL parameter handling in cache key generation
   - Used TextEncoder for proper UTF-8 encoding of strings
   - Ensured consistent parameter ordering

2. **Parameter Mapping**:
   - Created flexible mapping system for various parameter types
   - Added explicit dimension flags to preserve parameter values
   - Ensured high priority for explicit parameters

3. **Transform Process**:
   - Improved detection of explicit dimensions
   - Added logic to skip responsive width calculation for explicit parameters
   - Enhanced debug logging

## Testing

The fix was verified by checking cache keys are unique for different parameters:
- Different 'f' parameters (like 'l' vs 's') now generate unique cache keys
- Different aspect ratios ('r' parameter) create unique cache keys
- Explicit dimensions override responsive width calculations