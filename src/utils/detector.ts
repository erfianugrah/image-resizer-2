/**
 * Client Detection Service
 * 
 * A unified client detection framework for image resizer that handles browser formats,
 * client hints, network conditions, and device capabilities with caching and fallbacks.
 */

import { createLogger, Logger, defaultLogger } from './logging';
import { isFormatSupported, normalizeBrowserName } from './browser-formats';
import { 
  parseClientHints, 
  ClientHintsData,
  browserSupportsClientHints,
  getNetworkQuality,
  getDeviceCapabilities,
  calculatePerformanceBudget,
  suggestOptimizations,
  NetworkQuality,
  DeviceCapabilities,
  PerformanceBudget
} from './client-hints';

// Use default logger until a configured one is provided
let logger: Logger = defaultLogger;

/**
 * Set the logger for the client detector module
 * 
 * @param configuredLogger The logger to use
 */
export function setLogger(configuredLogger: Logger): void {
  logger = configuredLogger;
}

/**
 * Browser information detected from user agent or client hints
 */
export interface BrowserInfo {
  name: string;
  version: string;
  mobile: boolean;
  platform?: string;
  source: 'client-hints' | 'user-agent' | 'unknown';
}

/**
 * Format support information with detection source
 */
export interface FormatSupport {
  webp: boolean;
  avif: boolean;
  source: 'accept-header' | 'client-hints' | 'user-agent' | 'static-data' | 'defaults';
}

/**
 * Complete client detection result
 */
export interface ClientCapabilities {
  browser: BrowserInfo;
  formats: FormatSupport;
  network: NetworkQuality;
  device: DeviceCapabilities;
  performance: PerformanceBudget;
  clientHints: ClientHintsData;
  detectionTime: number;
  detectionSource?: string;
  optimizedFor?: {
    saveData?: boolean;
    reducedMotion?: boolean;
    colorScheme?: string;
    viewportWidth?: number;
    dpr?: number;
  };
}

// In-memory cache for detection results to avoid recomputing
const detectionCache = new Map<string, ClientCapabilities>();

/**
 * Generate a cache key for the detection result
 * OPTIMIZATION: Use a fast hash generation approach for cache keys
 */
function generateCacheKey(request: Request): string {
  // Only extract the parts of headers we need for the key
  const userAgent = request.headers.get('User-Agent') || 'unknown';
  // Hash the user agent to avoid storing long strings
  const uaHash = hashString(userAgent);
  
  // Get the minimal set of headers needed for reliable caching
  const acceptHeader = request.headers.get('Accept') || '';
  const acceptHash = acceptHeader.includes('image/webp') ? 'W' : '';
  const acceptHash2 = acceptHeader.includes('image/avif') ? 'A' : '';
  
  const dpr = request.headers.get('Sec-CH-DPR') || request.headers.get('DPR') || '1';
  const viewportWidth = request.headers.get('Sec-CH-Viewport-Width') || request.headers.get('Viewport-Width') || '';
  const saveData = request.headers.get('Save-Data') === 'on' ? 'S' : '';
  const clientHints = request.headers.has('Sec-CH-UA') ? 'C' : '';
  
  // Combine into a compact string key
  return `${uaHash}|${acceptHash}${acceptHash2}|${dpr}|${viewportWidth}|${saveData}|${clientHints}`;
}

/**
 * Simple string hash function
 * OPTIMIZATION: Fast string hashing for cache keys
 */
function hashString(str: string): string {
  let hash = 0;
  if (str.length === 0) return hash.toString(36);
  
  // Take only first 100 chars max to avoid processing very long UAs
  const maxLen = Math.min(str.length, 100);
  
  for (let i = 0; i < maxLen; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  
  return hash.toString(36); // Convert to alphanumeric for shorter keys
}

/**
 * Browser detection strategy implementations
 */
interface DetectionStrategy {
  detect(request: Request): Promise<Partial<ClientCapabilities> | null>;
  priority: number;
  name: string;
}

/**
 * Client Hints detection strategy
 * OPTIMIZATION: Fast path for client hint detection with minimal parsing
 */
class ClientHintsStrategy implements DetectionStrategy {
  priority = 100; // Highest priority
  name = 'client-hints';
  
  // Cache for client hint support detection by user agent
  private static supportCache = new Map<string, boolean>();
  
  async detect(request: Request): Promise<Partial<ClientCapabilities> | null> {
    const start = Date.now();
    const userAgent = request.headers.get('User-Agent') || '';
    
    // OPTIMIZATION: Fast browser support check with caching
    let browserSupportsHints: boolean;
    
    if (userAgent) {
      const uaHash = hashString(userAgent);
      
      // Check if we've already determined client hint support for this browser
      if (ClientHintsStrategy.supportCache.has(uaHash)) {
        browserSupportsHints = ClientHintsStrategy.supportCache.get(uaHash)!;
      } else {
        // Determine client hint support and cache the result
        browserSupportsHints = browserSupportsClientHints(userAgent);
        ClientHintsStrategy.supportCache.set(uaHash, browserSupportsHints);
      }
      
      if (!browserSupportsHints) {
        logger.debug('Browser does not support client hints', { userAgent: userAgent.substring(0, 50) });
        return null;
      }
    }
    
    // OPTIMIZATION: Quick check for minimal client hints
    // If none of these are present, we can skip the full parsing
    const hasAnyClientHints = request.headers.has('Sec-CH-UA') || 
                              request.headers.has('Sec-CH-UA-Mobile') || 
                              request.headers.has('Sec-CH-UA-Platform') ||
                              request.headers.has('Sec-CH-DPR') ||
                              request.headers.has('DPR') ||
                              request.headers.has('Viewport-Width') ||
                              request.headers.has('Save-Data');
    
    if (!hasAnyClientHints) {
      logger.debug('No client hints found in request headers');
      return null;
    }
    
    // OPTIMIZATION: Parse client hints in a focused way
    const hints = parseClientHints(request);
    
    // If no meaningful client hints were parsed, return null
    if (Object.keys(hints).length === 0) {
      logger.debug('No useful client hints found after parsing');
      return null;
    }
    
    logger.debug('Using client hints for detection', { 
      hintsFound: Object.keys(hints).length 
    });
    
    // OPTIMIZATION: Compute only what's needed in a streamlined way
    
    // Extract browser info efficiently
    const browser: BrowserInfo = {
      name: 'unknown',
      version: '0',
      mobile: hints.uaMobile || false,
      source: 'client-hints'
    };
    
    // Add brand info if available (single branching)
    if (hints.uaBrands && hints.uaBrands.length > 0) {
      browser.name = normalizeBrowserName(hints.uaBrands[0]);
      browser.version = '100'; // Use a standard modern version
      
      if (hints.uaPlatform) {
        browser.platform = hints.uaPlatform;
      }
    }
    
    // Format support - rely directly on computed values to avoid recomputation
    const formats: FormatSupport = {
      webp: !!hints.supportsWebP,
      avif: !!hints.supportsAVIF,
      source: 'client-hints'
    };
    
    // Network and device capabilities - use shared data where possible
    const network = getNetworkQuality(hints);
    const device = getDeviceCapabilities(hints);
    const performance = calculatePerformanceBudget(hints);
    
    // Optimized-for preferences - use efficient property access
    const optimizedFor = {
      saveData: hints.saveData,
      reducedMotion: hints.prefersReducedMotion,
      colorScheme: hints.prefersColorScheme,
      viewportWidth: hints.viewportWidth,
      dpr: hints.dpr
    };
    
    return {
      browser,
      formats,
      network,
      device,
      performance,
      clientHints: hints,
      detectionTime: Date.now() - start,
      optimizedFor
    };
  }
}

/**
 * Accept header detection strategy
 * Used primarily for format support detection
 */
class AcceptHeaderStrategy implements DetectionStrategy {
  priority = 80;
  name = 'accept-header';
  
  async detect(request: Request): Promise<Partial<ClientCapabilities> | null> {
    const start = Date.now();
    const acceptHeader = request.headers.get('Accept') || '';
    
    // Check for image format support in Accept header
    if (!acceptHeader.includes('image/')) {
      return null;
    }
    
    logger.debug('Using Accept header for format detection', { 
      acceptHeader 
    });
    
    // Format support from Accept header
    const formats: FormatSupport = {
      webp: acceptHeader.includes('image/webp'),
      avif: acceptHeader.includes('image/avif'),
      source: 'accept-header'
    };
    
    return {
      formats,
      detectionTime: Date.now() - start
    };
  }
}

/**
 * User-Agent detection strategy
 */
class UserAgentStrategy implements DetectionStrategy {
  priority = 60;
  name = 'user-agent';
  
  async detect(request: Request): Promise<Partial<ClientCapabilities> | null> {
    const start = Date.now();
    const userAgent = request.headers.get('User-Agent') || '';
    
    if (!userAgent) {
      return null;
    }
    
    logger.debug('Using User-Agent for detection', { 
      userAgent: userAgent.substring(0, 100) 
    });
    
    // Extract browser info from User-Agent
    const browserInfo = this.getBrowserInfo(userAgent);
    
    if (!browserInfo) {
      logger.debug('Could not extract browser info from User-Agent');
      return null;
    }
    
    // Format support from browser detection
    const formats: FormatSupport = {
      webp: isFormatSupported('webp', browserInfo.name, browserInfo.version),
      avif: isFormatSupported('avif', browserInfo.name, browserInfo.version),
      source: 'user-agent'
    };
    
    // Create a simplified client hints object with detected data
    const simulatedHints: ClientHintsData = {
      uaMobile: browserInfo.mobile,
      uaPlatform: browserInfo.platform
    };
    
    // Network quality - we don't have much info from UA alone
    const network = getNetworkQuality(simulatedHints);
    
    // Device capabilities - we don't have much info from UA alone
    const device = getDeviceCapabilities(simulatedHints);
    
    // Performance budget with limited information
    const performance = calculatePerformanceBudget(simulatedHints);
    
    return {
      browser: {
        ...browserInfo,
        source: 'user-agent'
      },
      formats,
      network,
      device,
      performance,
      clientHints: simulatedHints,
      detectionTime: Date.now() - start
    };
  }
  
  /**
   * Extract browser name and version from User-Agent string
   * 
   * @param userAgent - The User-Agent string to parse
   * @returns Object with browser name, version, and mobile flag, or null if not recognized
   */
  private getBrowserInfo(userAgent: string): BrowserInfo | null {
    try {
      // Check for mobile devices first since they often include multiple browser identifiers
      const isMobile = /Mobile|Android|iPhone|iPad|iPod/i.test(userAgent);
      
      // iOS devices
      let match = userAgent.match(/iPad|iPhone|iPod/i);
      if (match) {
        // iOS Safari
        const versionMatch = userAgent.match(/OS (\d+[_\.]\d+)/i);
        if (versionMatch) {
          // Convert version format from 14_0 to 14.0
          const version = versionMatch[1].replace('_', '.');
          return { 
            name: 'ios_saf', 
            version, 
            mobile: true,
            platform: 'iOS',
            source: 'user-agent'
          };
        }
        
        // If we can't determine iOS version, use Safari version if available
        const safariMatch = userAgent.match(/Version\/(\d+\.\d+)/i);
        if (safariMatch) {
          return { 
            name: 'ios_saf', 
            version: safariMatch[1], 
            mobile: true,
            platform: 'iOS',
            source: 'user-agent'
          };
        }
        
        // If no version info, return a safe default
        return { 
          name: 'ios_saf', 
          version: '9.0', 
          mobile: true,
          platform: 'iOS',
          source: 'user-agent'
        };
      }
      
      // Android devices
      if (userAgent.includes('Android')) {
        // Chrome for Android
        match = userAgent.match(/Chrome\/(\d+\.\d+)/i);
        if (match) {
          return { 
            name: 'and_chr', 
            version: match[1], 
            mobile: true,
            platform: 'Android',
            source: 'user-agent'
          };
        }
        
        // Firefox for Android
        match = userAgent.match(/Firefox\/(\d+\.\d+)/i);
        if (match) {
          return { 
            name: 'and_ff', 
            version: match[1], 
            mobile: true,
            platform: 'Android',
            source: 'user-agent'
          };
        }
        
        // Android browser or WebView
        match = userAgent.match(/Android (\d+\.\d+)/i);
        if (match) {
          return { 
            name: 'android', 
            version: match[1], 
            mobile: true,
            platform: 'Android',
            source: 'user-agent'
          };
        }
      }
      
      // Now handle desktop browsers
      
      // Edge (Chromium-based)
      match = userAgent.match(/Edg(e)?\/(\d+\.\d+)/i);
      if (match) {
        // When Edge is Chromium-based, it's 79+
        const version = match[2];
        const versionNumber = parseFloat(version);
        if (versionNumber >= 79) {
          return { 
            name: 'edge_chromium', 
            version, 
            mobile: isMobile,
            platform: userAgent.includes('Windows') ? 'Windows' : undefined,
            source: 'user-agent'
          };
        }
        return { 
          name: 'edge', 
          version, 
          mobile: isMobile,
          platform: userAgent.includes('Windows') ? 'Windows' : undefined,
          source: 'user-agent'
        };
      }
      
      // Chrome, Chromium
      match = userAgent.match(/(Chrome|Chromium)\/(\d+\.\d+)/i);
      if (match) {
        return { 
          name: 'chrome', 
          version: match[2], 
          mobile: isMobile,
          platform: userAgent.includes('Windows') ? 'Windows' : 
                   userAgent.includes('Mac') ? 'macOS' : 
                   userAgent.includes('Linux') ? 'Linux' : undefined,
          source: 'user-agent'
        };
      }
      
      // Firefox
      match = userAgent.match(/Firefox\/(\d+\.\d+)/i);
      if (match) {
        return { 
          name: 'firefox', 
          version: match[1], 
          mobile: isMobile,
          platform: userAgent.includes('Windows') ? 'Windows' : 
                   userAgent.includes('Mac') ? 'macOS' : 
                   userAgent.includes('Linux') ? 'Linux' : undefined,
          source: 'user-agent'
        };
      }
      
      // Safari
      match = userAgent.match(/Version\/(\d+\.\d+).*Safari/i);
      if (match && userAgent.includes('Safari')) {
        return { 
          name: 'safari', 
          version: match[1], 
          mobile: isMobile,
          platform: userAgent.includes('Mac') ? 'macOS' : undefined,
          source: 'user-agent'
        };
      }
      
      // Opera
      match = userAgent.match(/OPR\/(\d+\.\d+)/i);
      if (match) {
        return { 
          name: 'opera', 
          version: match[1], 
          mobile: isMobile,
          platform: userAgent.includes('Windows') ? 'Windows' : 
                   userAgent.includes('Mac') ? 'macOS' : 
                   userAgent.includes('Linux') ? 'Linux' : undefined,
          source: 'user-agent'
        };
      }
      
      // Internet Explorer
      match = userAgent.match(/MSIE (\d+\.\d+)/i) || userAgent.match(/Trident.*rv:(\d+\.\d+)/i);
      if (match) {
        return { 
          name: 'ie', 
          version: match[1], 
          mobile: isMobile,
          platform: 'Windows',
          source: 'user-agent'
        };
      }
      
      // Samsung Internet
      match = userAgent.match(/SamsungBrowser\/(\d+\.\d+)/i);
      if (match) {
        return { 
          name: 'samsung', 
          version: match[1], 
          mobile: true,
          platform: 'Android',
          source: 'user-agent'
        };
      }
      
      // Brave (identifies as Chrome)
      if (userAgent.includes('Brave')) {
        match = userAgent.match(/Chrome\/(\d+\.\d+)/i);
        if (match) {
          return { 
            name: 'chrome', 
            version: match[1], 
            mobile: isMobile,
            platform: userAgent.includes('Windows') ? 'Windows' : 
                     userAgent.includes('Mac') ? 'macOS' : 
                     userAgent.includes('Linux') ? 'Linux' : undefined,
            source: 'user-agent'
          };
        }
      }
      
      logger.debug('Could not identify browser from User-Agent', { userAgent });
      return null;
    } catch (error) {
      logger.warn('Error parsing browser info from User-Agent', { 
        userAgent,
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }
}

/**
 * Default fallback strategy
 * Used when no other strategy provides the needed information
 */
class DefaultFallbackStrategy implements DetectionStrategy {
  priority = 0; // Lowest priority
  name = 'defaults';
  
  async detect(request: Request): Promise<Partial<ClientCapabilities>> {
    const start = Date.now();
    
    logger.debug('Using default fallback values for detection');
    
    // Minimal browser info
    const browser: BrowserInfo = {
      name: 'unknown',
      version: '0',
      mobile: false,
      source: 'unknown'
    };
    
    // Conservative format support
    const formats: FormatSupport = {
      webp: false,  // Assume no WebP support to be safe
      avif: false,  // Assume no AVIF support to be safe
      source: 'defaults'
    };
    
    // Empty client hints
    const clientHints: ClientHintsData = {};
    
    // Default network - assume medium quality to be safe
    const network: NetworkQuality = {
      tier: 'medium',
      description: 'Unknown network (using defaults)',
      estimated: true
    };
    
    // Default device - assume mid-range to be safe
    const device: DeviceCapabilities = {
      class: 'mid-range',
      description: 'Unknown device (using defaults)',
      estimated: true
    };
    
    // Conservative performance budget
    const performance: PerformanceBudget = {
      quality: {
        min: 60,
        max: 85,
        target: 75
      },
      maxWidth: 1200,
      maxHeight: 1200,
      preferredFormat: 'jpeg',
      dpr: 1
    };
    
    return {
      browser,
      formats,
      network,
      device,
      performance,
      clientHints,
      detectionTime: Date.now() - start
    };
  }
}

/**
 * Static data strategy
 * Used as a last resort for format detection when other strategies fail
 */
class StaticDataStrategy implements DetectionStrategy {
  priority = 20; // Low priority
  name = 'static-data';
  
  // Cache of format support by browser
  private static formatSupportCache = new Map<string, FormatSupport>();
  
  async detect(request: Request): Promise<Partial<ClientCapabilities> | null> {
    const start = Date.now();
    const userAgent = request.headers.get('User-Agent') || '';
    
    if (!userAgent) {
      return null;
    }
    
    logger.debug('Using static data for detection', { 
      userAgent: userAgent.substring(0, 100) 
    });
    
    // Get browser info either from the request object (if available from a previous strategy)
    // or by parsing the user agent
    let browserInfo: BrowserInfo | null = null;
    
    // Try to get from previous strategy (optimization to avoid re-parsing)
    const uaStrategy = new UserAgentStrategy();
    browserInfo = await uaStrategy.detect(request).then(
      result => result?.browser || null
    );
    
    if (!browserInfo) {
      logger.debug('No browser info available for static data strategy');
      return null;
    }
    
    // Check if we have cached format support for this browser
    const cacheKey = `${browserInfo.name}:${browserInfo.version}`;
    if (StaticDataStrategy.formatSupportCache.has(cacheKey)) {
      const cachedFormats = StaticDataStrategy.formatSupportCache.get(cacheKey)!;
      
      logger.debug('Using cached format support', {
        browser: browserInfo.name,
        version: browserInfo.version,
        webp: cachedFormats.webp,
        avif: cachedFormats.avif
      });
      
      return {
        formats: cachedFormats,
        detectionTime: Date.now() - start
      };
    }
    
    // Format support from static data
    const formats: FormatSupport = {
      webp: isFormatSupported('webp', browserInfo.name, browserInfo.version),
      avif: isFormatSupported('avif', browserInfo.name, browserInfo.version),
      source: 'static-data'
    };
    
    // Cache for future use
    StaticDataStrategy.formatSupportCache.set(cacheKey, formats);
    
    return {
      formats,
      detectionTime: Date.now() - start
    };
  }
}

/**
 * Main client detector class that orchestrates the detection strategies
 */
export class ClientDetector {
  private strategies: DetectionStrategy[] = [];
  
  constructor() {
    // Register strategies in order of preference
    this.strategies = [
      new ClientHintsStrategy(),
      new AcceptHeaderStrategy(),
      new UserAgentStrategy(),
      new StaticDataStrategy(),
      new DefaultFallbackStrategy()
    ];
    
    // Sort by priority (highest first)
    this.strategies.sort((a, b) => b.priority - a.priority);
  }
  
  /**
   * Detect client capabilities from a request
   * Uses multiple strategies with fallbacks and caching
   * 
   * @param request The request to analyze
   * @param useCache Whether to use the in-memory cache (default: true)
   * @returns Complete client capabilities information
   */
  async detect(request: Request, useCache = true): Promise<ClientCapabilities> {
    const startTime = Date.now();
    
    // OPTIMIZATION: Check cache first if enabled (fastest path)
    if (useCache) {
      const cacheKey = generateCacheKey(request);
      const cached = detectionCache.get(cacheKey);
      
      if (cached) {
        logger.debug('Using cached client detection result', { 
          cacheKey, 
          age: Date.now() - startTime
        });
        return cached;
      }
    }
    
    logger.debug('Starting client detection', { 
      useCache,
      strategiesAvailable: this.strategies.length
    });
    
    // Build up the result from multiple strategies
    let result: Partial<ClientCapabilities> = {};
    
    // Track which fields have been filled by better strategies
    const filledFields = new Set<string>();
    
    // OPTIMIZATION: Pre-check headers to avoid running strategies that will definitely fail
    const hasUserAgent = !!request.headers.get('User-Agent');
    const hasClientHints = !!request.headers.get('Sec-CH-UA') || 
                          !!request.headers.get('Sec-CH-UA-Mobile') ||
                          !!request.headers.get('Sec-CH-UA-Platform');
    const hasAcceptHeader = !!request.headers.get('Accept');
    
    // OPTIMIZATION: Apply each strategy in order of priority, but skip incompatible ones
    for (const strategy of this.strategies) {
      // Skip strategies that can't possibly work based on headers
      if ((strategy.name === 'client-hints' && !hasClientHints) ||
          (strategy.name === 'user-agent' && !hasUserAgent) ||
          (strategy.name === 'accept-header' && !hasAcceptHeader)) {
        logger.debug('Skipping incompatible strategy', { 
          strategy: strategy.name,
          reason: `missing required headers`
        });
        continue;
      }
      
      const strategyStart = Date.now();
      logger.debug('Trying detection strategy', { 
        strategy: strategy.name,
        priority: strategy.priority
      });
      
      try {
        const partialResult = await strategy.detect(request);
        
        if (partialResult) {
          const strategyTime = Date.now() - strategyStart;
          logger.debug('Strategy provided partial result', {
            strategy: strategy.name,
            fields: Object.keys(partialResult).filter(k => k !== 'detectionTime').join(', '),
            time: strategyTime
          });
          
          // OPTIMIZATION: Merge the partial result, but don't overwrite fields from higher priority strategies
          // Use Object.entries for better performance on large objects compared to for...in loops
          Object.entries(partialResult).forEach(([key, value]) => {
            if (!filledFields.has(key) && value !== undefined && value !== null) {
              (result as any)[key] = value;
              filledFields.add(key);
            }
          });
        }
      } catch (error) {
        logger.warn('Error in detection strategy', {
          strategy: strategy.name,
          error: error instanceof Error ? error.message : String(error)
        });
      }
      
      // OPTIMIZATION: Check early if we've filled all the required fields to avoid unnecessary work
      const requiredFields = ['browser', 'formats', 'network', 'device', 'performance'];
      const allFieldsFilled = requiredFields.every(field => filledFields.has(field));
      
      if (allFieldsFilled) {
        logger.debug('All required fields filled, stopping detection', {
          filledBy: strategy.name
        });
        break;
      }
    }
    
    // Ensure we have client hints, even if empty
    if (!result.clientHints) {
      result.clientHints = {};
    }
    
    // Set final detection time
    const totalTime = Date.now() - startTime;
    result.detectionTime = totalTime;
    
    // Ensure the result is a complete ClientCapabilities object
    const completeResult = result as ClientCapabilities;
    
    // Log strategies used
    if (completeResult.browser && completeResult.formats) {
      completeResult.detectionSource = `browser:${completeResult.browser.source},formats:${completeResult.formats.source}`;
    }
    
    // OPTIMIZATION: Cache the result if caching is enabled - use a more efficient approach
    if (useCache) {
      const cacheKey = generateCacheKey(request);
      
      // Use cache with limited size to prevent memory issues
      const MAX_CACHE_SIZE = 1000;
      const PRUNE_AMOUNT = 100;
      
      if (detectionCache.size >= MAX_CACHE_SIZE) {
        // More efficient cache pruning by converting only the keys we need to delete
        const keys = Array.from(detectionCache.keys());
        for (let i = 0; i < PRUNE_AMOUNT && i < keys.length; i++) {
          detectionCache.delete(keys[i]);
        }
        
        logger.debug('Pruned detection cache', {
          deletedEntries: Math.min(PRUNE_AMOUNT, keys.length),
          newSize: detectionCache.size
        });
      }
      
      // Cache after pruning
      detectionCache.set(cacheKey, completeResult);
    }
    
    logger.debug('Client detection complete', {
      totalTimeMs: totalTime,
      browser: `${completeResult.browser.name} ${completeResult.browser.version}`,
      formats: `WebP: ${completeResult.formats.webp}, AVIF: ${completeResult.formats.avif}`,
      networkQuality: completeResult.network.tier,
      deviceClass: completeResult.device.class
    });
    
    return completeResult;
  }
  
  /**
   * Get recommended transformations based on client capabilities
   * 
   * @param request The request to analyze
   * @param options Current transformation options
   * @returns Optimized transformation options
   */
  async getOptimizedOptions(request: Request, options: Record<string, any> = {}): Promise<Record<string, any>> {
    // Detect client capabilities
    const capabilities = await this.detect(request);
    
    // Apply client hints-based optimizations
    const optimizations = suggestOptimizations(options, capabilities.clientHints);
    
    // Return the original options enhanced with optimizations
    return {
      ...options,
      ...optimizations,
      __detectionMetrics: {
        browser: `${capabilities.browser.name} ${capabilities.browser.version}`,
        deviceClass: capabilities.device.class,
        networkQuality: capabilities.network.tier,
        detectionTime: capabilities.detectionTime,
        source: {
          browser: capabilities.browser.source,
          formats: capabilities.formats.source
        }
      }
    };
  }
  
  /**
   * Clear the detection cache
   */
  clearCache(): void {
    const cacheSize = detectionCache.size;
    detectionCache.clear();
    logger.debug('Detection cache cleared', { previousSize: cacheSize });
  }
}

// Export a singleton instance for easy use
export const detector = new ClientDetector();