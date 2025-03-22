# Browser Compatibility

The Client Detection framework uses a comprehensive browser compatibility database to determine which image formats are supported by different browsers. This information is crucial for format selection in the cascade system.

## Browser Support Data Source

The browser compatibility data is sourced from the [@mdn/browser-compat-data](https://github.com/mdn/browser-compat-data) package, which provides up-to-date information about web platform feature support across browsers.

This replaced the previously used `caniuse-db` package to ensure more accurate and comprehensive data.

## Supported Image Formats

The system tracks support for the following image formats:

- **AVIF**: AV1 Image Format (high efficiency)
- **WebP**: Web Picture format (good balance of quality and size)
- **WebP Lossless**: Lossless WebP compression
- **WebP Alpha**: WebP with alpha channel (transparency)
- **JPEG XL**: JPEG XL format (next-gen JPEG)
- **JPEG 2000**: JPEG 2000 format (mostly for Safari)
- **PNG**: Portable Network Graphics (universally supported)
- **JPEG**: Joint Photographic Experts Group (universally supported)
- **GIF**: Graphics Interchange Format (universally supported)

## Format Support by Major Browser

| Browser           | Version | AVIF | WebP | WebP Lossless | WebP Alpha | JPEG XL | JPEG 2000 |
|-------------------|---------|------|------|---------------|------------|---------|-----------|
| Chrome            | 100+    | ✅   | ✅   | ✅            | ✅         | ❌      | ❌        |
| Chrome            | 85+     | ✅   | ✅   | ✅            | ✅         | ❌      | ❌        |
| Chrome            | 70-84   | ❌   | ✅   | ✅            | ✅         | ❌      | ❌        |
| Firefox           | 119+    | ✅   | ✅   | ✅            | ✅         | ❌      | ❌        |
| Firefox           | 65-118  | ❌   | ✅   | ✅            | ✅         | ❌      | ❌        |
| Safari            | 16+     | ✅   | ✅   | ✅            | ✅         | ❌      | ✅        |
| Safari            | 14-15   | ❌   | ✅   | ✅            | ✅         | ❌      | ✅        |
| Safari            | 5-13    | ❌   | ❌   | ❌            | ❌         | ❌      | ✅        |
| Edge (Chromium)   | 85+     | ✅   | ✅   | ✅            | ✅         | ❌      | ❌        |
| Edge (Legacy)     | 18      | ❌   | ✅   | ✅            | ✅         | ❌      | ❌        |
| Samsung Internet  | 13+     | ✅   | ✅   | ✅            | ✅         | ❌      | ❌        |
| Opera             | 71+     | ✅   | ✅   | ✅            | ✅         | ❌      | ❌        |
| UC Browser        | 12.13+  | ❌   | ✅   | ✅            | ✅         | ❌      | ❌        |
| Android Browser   | 92+     | ✅   | ✅   | ✅            | ✅         | ❌      | ❌        |
| iOS Safari        | 16+     | ✅   | ✅   | ✅            | ✅         | ❌      | ✅        |

Note: PNG, JPEG, and GIF are supported by all browsers and versions listed.

## Detection Methods

The system uses multiple methods to detect format support:

### 1. Accept Header Detection

The `Accept` header provides the most reliable indication of browser support:

```http
Accept: image/avif,image/webp,image/apng,image/*,*/*;q=0.8
```

In this example, the browser explicitly declares support for AVIF, WebP, and APNG.

### 2. Client Hints Detection

Client Hints like `Sec-CH-UA` and `Sec-CH-UA-Platform` are used to identify the browser and version:

```http
Sec-CH-UA: "Not?A_Brand";v="8", "Chromium";v="108", "Google Chrome";v="108"
Sec-CH-UA-Platform: "Windows"
```

These are matched against the browser compatibility database.

### 3. User-Agent Detection (Fallback)

For browsers that don't support Client Hints, the User-Agent string is parsed:

```http
User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36
```

This is less reliable due to UA string inconsistencies and spoofing.

## Browser Detection Code

The detection code is structured to prioritize more reliable methods:

```typescript
// In acceptHeader.strategy.ts
export class AcceptHeaderStrategy implements DetectionStrategy {
  priority = 80;
  name = 'accept-header';
  
  detect(request: Request): DetectionResult {
    const accept = request.headers.get('Accept');
    if (!accept) return null;
    
    return {
      formats: {
        avif: accept.includes('image/avif'),
        webp: accept.includes('image/webp'),
        webpLossless: accept.includes('image/webp'),
        webpAlpha: accept.includes('image/webp'),
        jpeg2000: false, // Not typically in Accept headers
        jpegXl: accept.includes('image/jxl')
      },
      // Other detection results...
    };
  }
  
  isAvailable(request: Request): boolean {
    return !!request.headers.get('Accept');
  }
}
```

## Format Selection Logic

Format selection follows these principles:

1. **Modern First**: Prefer modern, efficient formats when supported
2. **Fallback Chain**: Have a clear progression of fallbacks
3. **Universal Last**: Always have universally supported formats as final fallbacks

The standard format priority order is:

1. AVIF (if supported)
2. WebP (if supported)
3. JPEG (universal fallback)
4. PNG (only for images requiring transparency)

## Special Handling for Safari

Safari requires special handling due to its unique format support pattern:

- Supports JPEG 2000 (most browsers don't)
- Added WebP support relatively recently (Safari 14+)
- Added AVIF support in Safari 16+

The detection system includes special cases for Safari to ensure optimal format selection.

## Updating Browser Compatibility Data

The browser compatibility data is generated during the build process:

```bash
npm run update-browser-data
```

This script:
1. Fetches the latest data from @mdn/browser-compat-data
2. Processes it into a compact format optimized for runtime use
3. Generates a TypeScript file with the compatibility information

This ensures the format support data stays current with browser releases.

## Testing Format Detection

The system includes tests for format detection across browsers:

```typescript
describe('Format detection', () => {
  it('should detect AVIF support in Chrome 90', () => {
    const request = new Request('https://example.com');
    request.headers.set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.212 Safari/537.36');
    
    const detector = new ClientDetector(request, defaultConfig);
    const result = detector.detect();
    
    expect(result.formats.avif).toBe(true);
    expect(result.formats.webp).toBe(true);
  });
  
  it('should detect no AVIF support in Firefox 88', () => {
    const request = new Request('https://example.com');
    request.headers.set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:88.0) Gecko/20100101 Firefox/88.0');
    
    const detector = new ClientDetector(request, defaultConfig);
    const result = detector.detect();
    
    expect(result.formats.avif).toBe(false);
    expect(result.formats.webp).toBe(true);
  });
});
```# Static Browser Support Dictionary Implementation Plan

This document outlines the plan to replace the dependency on `caniuse-api` and `caniuse-lite` with a lightweight static dictionary for browser format support detection.

## Motivation

The current implementation in `transform.ts` uses the full `caniuse-api` library to detect browser support for WebP and AVIF image formats based on User-Agent information. This approach has several drawbacks:

1. **Large Bundle Size**: The `caniuse-lite` package is ~400KB and includes comprehensive browser compatibility data that we only need a tiny fraction of.
2. **Performance Impact**: Loading and parsing the large dataset impacts cold-start times in the Cloudflare Worker environment.
3. **Complexity**: The current code includes dynamic imports, fallbacks, and error handling for the caniuse API.
4. **Limited Usage**: We only check support for two image formats (WebP and AVIF), which doesn't justify including the entire library.

## Current Usage Analysis

1. **Primary Usage**: The caniuse-api is used in `transform.ts` to detect browser support for WebP and AVIF image formats.

2. **Core Functions**:
   - `getBrowserInfo()`: Extracts browser name and version from User-Agent strings
   - `detectFormatSupportFromBrowser()`: Uses hardcoded rules for format support detection
   - `getFormat()`: Uses caniuse-api when available, but falls back to hardcoded logic

3. **Feature Coverage**: Only two features are checked:
   - WebP support
   - AVIF support

## Implementation Plan

### Step 1: Create a Static Support Dictionary

Create a new file `src/utils/browser-formats.ts` containing:

```typescript
// Static dictionary of browser format support by version
export const formatSupport = {
  // First version with support
  webp: {
    chrome: 32,           // Jan 2014
    firefox: 65,          // Jan 2019
    safari: 14,           // Sep 2020
    edge: 18,             // Nov 2018
    edge_chromium: 79,    // Jan 2020
    opera: 19,            // Jan 2014
    samsung: 4,           // Apr 2016
    ios_saf: 14,          // Sep 2020
    and_chr: 32,          // Jan 2014
    and_ff: 65            // Jan 2019
  },
  avif: {
    chrome: 85,           // Aug 2020
    firefox: 93,          // Oct 2021
    safari: 16.4,         // Mar 2023
    edge: 90,             // Apr 2021
    edge_chromium: 90,    // Apr 2021
    opera: 71,            // Aug 2020
    samsung: 16,          // Aug 2021
    ios_saf: 16.4,        // Mar 2023
    and_chr: 92,          // Jul 2021
    and_ff: 93            // Oct 2021
  }
};

/**
 * Determine if a browser supports a specific image format
 * 
 * @param format The format to check support for ('webp' or 'avif')
 * @param browser The browser name
 * @param version The browser version
 * @returns true if the browser supports the format, false otherwise
 */
export function isFormatSupported(format: 'webp' | 'avif', browser: string, version: string): boolean {
  // Normalize browser name to match our dictionary keys
  const normalizedBrowser = normalizeBrowserName(browser);
  
  // Parse version number
  const versionNumber = parseFloat(version);
  if (isNaN(versionNumber)) {
    return false;
  }
  
  // Check support
  const supportData = formatSupport[format];
  if (!supportData || !supportData[normalizedBrowser]) {
    return false;
  }
  
  return versionNumber >= supportData[normalizedBrowser];
}

/**
 * Normalize browser names to match our dictionary keys
 */
function normalizeBrowserName(browser: string): string {
  // Map from various formats to our dictionary keys
  const browserMap: Record<string, string> = {
    'chrome': 'chrome',
    'firefox': 'firefox',
    'safari': 'safari',
    'edge': 'edge',
    'edge_chromium': 'edge_chromium',
    'ie': 'ie',
    'opera': 'opera',
    'samsung': 'samsung',
    'ios_saf': 'ios_saf',
    'and_chr': 'and_chr',
    'and_ff': 'and_ff',
    // Add any other mappings needed
  };
  
  return browserMap[browser.toLowerCase()] || browser.toLowerCase();
}
```

### Step 2: Update the transform.ts File

Modify `transform.ts` to replace the dynamic caniuse-api imports with the static dictionary:

1. Remove these lines:
```typescript
// Note: We dynamically import caniuse-api to avoid test failures
// and make it optional to prevent breaking existing functionality
let caniuseApi: any = null;
let isCaniuseLoading = false;

// Attempt to load caniuse-api at module initialization
try {
  // Import at module level for faster initial load
  // This will be caught and handled if it fails
  import('caniuse-api').then(module => {
    caniuseApi = module;
    logger.debug('caniuse-api loaded successfully at module initialization');
  }).catch(err => {
    logger.debug('caniuse-api failed to load at module initialization', { 
      error: err instanceof Error ? err.message : String(err) 
    });
  });
} catch (error) {
  logger.debug('caniuse-api not available', { 
    error: error instanceof Error ? error.message : String(error) 
  });
}
```

2. Add import for the new utilities:
```typescript
import { isFormatSupported } from './utils/browser-formats';
```

3. Replace the caniuse-api usage in `getFormat()`:
```typescript
// Replace this:
if (caniuseApi) {
  // Use already loaded caniuse-api
  try {
    if (!supportsWebP) {
      supportsWebP = caniuseApi.isSupported('webp', browser.name + ' ' + browser.version);
    }
    
    if (!supportsAVIF) {
      supportsAVIF = caniuseApi.isSupported('avif', browser.name + ' ' + browser.version);
    }
    
    logger.debug('Format support detected by caniuse', { supportsWebP, supportsAVIF });
  } catch (apiError) {
    logger.debug('Error using caniuse-api', { 
      error: apiError instanceof Error ? apiError.message : String(apiError) 
    });
  }
} else if (!isCaniuseLoading) {
  // Try loading caniuse-api if not already loading
  isCaniuseLoading = true;
  logger.debug('Attempting to load caniuse-api on demand');
  
  try {
    // We can't await this in a non-async function, but we'll
    // prepare for future requests by loading the module
    import('caniuse-api').then(module => {
      caniuseApi = module;
      isCaniuseLoading = false;
      logger.debug('caniuse-api loaded successfully on demand');
    }).catch(err => {
      isCaniuseLoading = false;
      logger.debug('Failed to load caniuse-api dynamically', { 
        error: err instanceof Error ? err.message : String(err) 
      });
    });
  } catch (importError) {
    isCaniuseLoading = false;
    logger.debug('Dynamic import of caniuse-api failed', { 
      error: importError instanceof Error ? importError.message : String(importError) 
    });
  }
}

// With this simpler code:
try {
  if (!supportsWebP) {
    supportsWebP = isFormatSupported('webp', browser.name, browser.version);
  }
  
  if (!supportsAVIF) {
    supportsAVIF = isFormatSupported('avif', browser.name, browser.version);
  }
  
  logger.debug('Format support detected from static dictionary', { supportsWebP, supportsAVIF });
} catch (error) {
  logger.debug('Error detecting format support', { 
    error: error instanceof Error ? error.message : String(error) 
  });
}
```

### Step 3: Update the detectFormatSupportFromBrowser Function

Replace the hardcoded format detection logic with calls to the static dictionary:

```typescript
export function detectFormatSupportFromBrowser(
  browser: { name: string; version: string },
  callback: (webpSupported: boolean, avifSupported: boolean) => void
): void {
  const { name, version } = browser;
  
  const webpSupported = isFormatSupported('webp', name, version);
  const avifSupported = isFormatSupported('avif', name, version);
  
  callback(webpSupported, avifSupported);
}
```

### Step 4: Update Package.json

Remove the caniuse dependencies:

```json
"dependencies": {
  // Remove these lines:
  "caniuse-api": "^3.0.0",
  "caniuse-lite": "^1.0.30001706"
}
```

And remove the types from devDependencies:

```json
"devDependencies": {
  // Remove this line:
  "@types/caniuse-api": "^3.0.6",
}
```

### Step 5: Update Tests

Add new tests for the static dictionary in `test/transform/browser-formats.spec.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { isFormatSupported, normalizeBrowserName } from '../../src/utils/browser-formats';

describe('Browser Format Support', () => {
  describe('isFormatSupported', () => {
    it('correctly identifies WebP support for Chrome versions', () => {
      expect(isFormatSupported('webp', 'chrome', '31.0')).toBe(false);
      expect(isFormatSupported('webp', 'chrome', '32.0')).toBe(true);
      expect(isFormatSupported('webp', 'chrome', '96.0')).toBe(true);
    });
    
    it('correctly identifies AVIF support for Chrome versions', () => {
      expect(isFormatSupported('avif', 'chrome', '84.0')).toBe(false);
      expect(isFormatSupported('avif', 'chrome', '85.0')).toBe(true);
      expect(isFormatSupported('avif', 'chrome', '96.0')).toBe(true);
    });
    
    it('correctly identifies WebP support for Firefox versions', () => {
      expect(isFormatSupported('webp', 'firefox', '64.0')).toBe(false);
      expect(isFormatSupported('webp', 'firefox', '65.0')).toBe(true);
      expect(isFormatSupported('webp', 'firefox', '100.0')).toBe(true);
    });
    
    it('correctly identifies AVIF support for Firefox versions', () => {
      expect(isFormatSupported('avif', 'firefox', '92.0')).toBe(false);
      expect(isFormatSupported('avif', 'firefox', '93.0')).toBe(true);
      expect(isFormatSupported('avif', 'firefox', '100.0')).toBe(true);
    });
    
    it('correctly identifies Safari support for image formats', () => {
      expect(isFormatSupported('webp', 'safari', '13.1')).toBe(false);
      expect(isFormatSupported('webp', 'safari', '14.0')).toBe(true);
      expect(isFormatSupported('avif', 'safari', '16.3')).toBe(false);
      expect(isFormatSupported('avif', 'safari', '16.4')).toBe(true);
    });
  });
  
  describe('normalizeBrowserName', () => {
    it('correctly normalizes browser names', () => {
      expect(normalizeBrowserName('chrome')).toBe('chrome');
      expect(normalizeBrowserName('Chrome')).toBe('chrome');
      expect(normalizeBrowserName('CHROME')).toBe('chrome');
      expect(normalizeBrowserName('firefox')).toBe('firefox');
      expect(normalizeBrowserName('edge_chromium')).toBe('edge_chromium');
      expect(normalizeBrowserName('ios_saf')).toBe('ios_saf');
    });
    
    it('handles unknown browser names', () => {
      expect(normalizeBrowserName('unknown')).toBe('unknown');
    });
  });
});
```

Update the existing `browser-detection.spec.ts` tests to ensure they still pass with the new implementation.

## Expected Benefits

1. **Reduced Bundle Size**: Eliminating ~400KB of dependencies
2. **Faster Startup Time**: No async loading or large data parsing
3. **Simplified Code**: No need for dynamic imports and fallbacks
4. **Improved Reliability**: Predictable behavior without external data
5. **Better Worker Performance**: Critical for Cloudflare Worker environments where bundle size directly impacts cold-start performance

## Future Enhancements (Optional)

For even better maintenance, consider creating a build script that generates the static dictionary from the latest caniuse-lite data during the build process:

1. This script would run during the build step
2. Extract only WebP and AVIF support data from caniuse-lite
3. Generate the static dictionary file with the latest browser support data
4. This ensures up-to-date data without shipping the entire library

## Implementation Checklist

- [ ] Create static dictionary module (`src/utils/browser-formats.ts`)
- [ ] Update `transform.ts` to use the static dictionary
- [ ] Update `detectFormatSupportFromBrowser` function
- [ ] Remove caniuse dependencies from package.json
- [ ] Create tests for the new static dictionary
- [ ] Run existing tests to ensure functionality is preserved
- [ ] Verify bundle size reduction

## Implementation Timeline

Expected implementation time: 4-7 hours for all steps including testing.