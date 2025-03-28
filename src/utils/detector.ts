/**
 * Client Detection Service
 * 
 * A unified client detection framework for image resizer that handles browser formats,
 * client hints, network conditions, and device capabilities with caching and fallbacks.
 */

import { 
  // createLogger is imported for consistency with other modules
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  createLogger, 
  Logger, 
  defaultLogger 
} from './logging';
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
import { DetectorConfig, 
  // ImageResizerConfig is imported here for type reference in other modules
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  ImageResizerConfig 
} from '../config';

// Use default logger until a configured one is provided
let logger: Logger = defaultLogger;

// Configuration instance
let config: DetectorConfig | undefined;

/**
 * Set the logger for the client detector module
 * 
 * @param configuredLogger The logger to use
 */
export function setLogger(configuredLogger: Logger): void {
  logger = configuredLogger;
}

/**
 * Set the detector configuration
 * 
 * @param detectorConfig Configuration for the detector
 */
export function setConfig(detectorConfig: DetectorConfig): void {
  config = detectorConfig;
  logger.debug('Detector configuration set', { 
    cacheSize: config.cache.maxSize,
    strategies: Object.keys(config.strategies),
    logLevel: config.logLevel
  });
}

/**
 * Get the current detector configuration, using defaults if not set
 */
function getConfig(): DetectorConfig {
  if (!config) {
    logger.debug('Using default detector configuration as no config was provided');
    // Default configuration if none is provided
    return {
      cache: {
        maxSize: 1000,
        pruneAmount: 100,
        enableCache: true
      },
      strategies: {
        clientHints: {
          priority: 100,
          enabled: true
        },
        acceptHeader: {
          priority: 80,
          enabled: true
        },
        userAgent: {
          priority: 60,
          enabled: true,
          maxUALength: 100
        },
        staticData: {
          priority: 20,
          enabled: true
        },
        defaults: {
          priority: 0,
          enabled: true
        }
      },
      performanceBudget: {
        quality: {
          low: {
            min: 60,
            max: 80,
            target: 70
          },
          medium: {
            min: 65,
            max: 85,
            target: 75
          },
          high: {
            min: 70,
            max: 95,
            target: 85
          }
        },
        dimensions: {
          maxWidth: {
            low: 1000,
            medium: 1500,
            high: 2500
          },
          maxHeight: {
            low: 1000,
            medium: 1500,
            high: 2500
          }
        },
        preferredFormats: {
          low: ['webp', 'jpeg'],
          medium: ['webp', 'avif', 'jpeg'],
          high: ['avif', 'webp', 'jpeg']
        }
      },
      // Default cascade configuration
      cascade: {
        format: {
          enabled: true,
          acceptHeaderPriority: 100,
          clientHintsPriority: 80,
          browserDetectionPriority: 60,
          fallbackFormat: 'jpeg'
        },
        quality: {
          enabled: true,
          saveDataPriority: 100,
          networkConditionPriority: 80,
          deviceCapabilityPriority: 60,
          dprAdjustmentEnabled: true,
          deviceMemoryThresholds: {
            high: 8,
            low: 2
          },
          processorThresholds: {
            high: 8,
            low: 2
          },
          adjustmentFactors: {
            slowNetwork: 0.85,
            fastNetwork: 1.1,
            dprAdjustment: 5
          }
        }
      },
      deviceClassification: {
        thresholds: {
          lowEnd: 30,
          highEnd: 70
        }
        // Platform-based scoring removed in favor of client-hints detection
      },
      hashAlgorithm: 'simple',
      logLevel: 'info'
    };
  }
  return config;
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
 * Fast string hashing for cache keys, with configurable algorithm
 * 
 * @param str String to hash
 * @returns Hashed string
 */
function hashString(str: string): string {
  if (str.length === 0) return '0';
  
  const detectorConfig = getConfig();
  const algorithm = detectorConfig.hashAlgorithm || 'simple';
  const maxUALength = detectorConfig.strategies.userAgent?.maxUALength || 100;
  
  // Take only first N chars max to avoid processing very long UAs (configurable)
  const maxLen = Math.min(str.length, maxUALength);
  const input = str.substring(0, maxLen);
  
  // Choose hashing algorithm based on configuration
  switch (algorithm) {
  case 'fnv1a':
    return fnv1aHash(input);
  case 'md5':
    return md5Hash(input);
  case 'simple':
  default:
    return simpleHash(input);
  }
}

/**
 * Simple hash function (djb2)
 */
function simpleHash(str: string): string {
  let hash = 0;
  
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  
  return hash.toString(36); // Convert to alphanumeric for shorter keys
}

/**
 * FNV-1a hash function - faster and better distribution than simple hash
 */
function fnv1aHash(str: string): string {
  // FNV-1a hash algorithm constants
  const FNV_PRIME = 0x01000193;
  const FNV_OFFSET_BASIS = 0x811c9dc5;
  
  let hash = FNV_OFFSET_BASIS;
  
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, FNV_PRIME);
  }
  
  return (hash >>> 0).toString(36); // Convert to unsigned 32-bit integer then to alphanumeric
}

/**
 * MD5-like hash function for browsers
 * Note: This is not a cryptographic hash, just a string hashing algorithm for cache keys
 */
function md5Hash(str: string): string {
  // Simple implementation of a hash function with MD5-like properties
  // Not as good as real MD5 but better than simple hash for our needs
  let h1 = 0x67452301;
  let h2 = 0xEFCDAB89;
  
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    h1 = ((h1 << 5) | (h1 >>> 27)) + char;
    h2 = ((h2 << 13) | (h2 >>> 19)) + char;
    h1 = (h1 ^ h2) & 0xFFFFFFFF;
  }
  
  // Combine the two values and return a base-36 representation for compactness
  const combined = ((h1 & 0xFFFF) << 16) | (h2 & 0xFFFF);
  return (combined >>> 0).toString(36);
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
  priority: number;
  name = 'client-hints';
  enabled: boolean;
  
  // Cache for client hint support detection by user agent
  private static supportCache = new Map<string, boolean>();
  
  constructor() {
    // Get configuration for this strategy
    const detectorConfig = getConfig();
    this.priority = detectorConfig.strategies.clientHints?.priority ?? 100;
    this.enabled = detectorConfig.strategies.clientHints?.enabled ?? true;
  }
  
  async detect(request: Request): Promise<Partial<ClientCapabilities> | null> {
    // Check if this strategy is enabled
    if (!this.enabled) {
      logger.debug('ClientHintsStrategy is disabled in configuration');
      return null;
    }
    
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
  priority: number;
  name = 'accept-header';
  enabled: boolean;
  
  constructor() {
    // Get configuration for this strategy
    const detectorConfig = getConfig();
    this.priority = detectorConfig.strategies.acceptHeader?.priority ?? 80;
    this.enabled = detectorConfig.strategies.acceptHeader?.enabled ?? true;
  }
  
  async detect(request: Request): Promise<Partial<ClientCapabilities> | null> {
    // Check if this strategy is enabled
    if (!this.enabled) {
      logger.debug('AcceptHeaderStrategy is disabled in configuration');
      return null;
    }
    
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
  priority: number;
  name = 'user-agent';
  enabled: boolean;
  maxUALength: number;
  
  constructor() {
    // Get configuration for this strategy
    const detectorConfig = getConfig();
    this.priority = detectorConfig.strategies.userAgent?.priority ?? 60;
    this.enabled = detectorConfig.strategies.userAgent?.enabled ?? true;
    this.maxUALength = detectorConfig.strategies.userAgent?.maxUALength ?? 100;
  }
  
  async detect(request: Request): Promise<Partial<ClientCapabilities> | null> {
    // Check if this strategy is enabled
    if (!this.enabled) {
      logger.debug('UserAgentStrategy is disabled in configuration');
      return null;
    }
    
    const start = Date.now();
    const userAgent = request.headers.get('User-Agent') || '';
    
    if (!userAgent) {
      return null;
    }
    
    // Use configured maximum UA length
    logger.debug('Using User-Agent for detection', { 
      userAgent: userAgent.substring(0, this.maxUALength),
      maxLength: this.maxUALength
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
    
    // Ensure class property is set for device capabilities
    if (!device.class) {
      device.class = 'mid-range';
    }
    
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
        const versionMatch = userAgent.match(/OS (\d+[_.]\d+)/i);
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
  priority: number;
  name = 'defaults';
  enabled: boolean;
  
  constructor() {
    // Get configuration for this strategy
    const detectorConfig = getConfig();
    this.priority = detectorConfig.strategies.defaults?.priority ?? 0;
    this.enabled = detectorConfig.strategies.defaults?.enabled ?? true;
  }
  
  async detect(_request: Request): Promise<Partial<ClientCapabilities>> {
    // Check if this strategy is enabled
    if (!this.enabled) {
      logger.debug('DefaultFallbackStrategy is disabled in configuration');
      // Return empty object as we need some fallback values regardless
      // This will ensure at least minimal defaults are applied
      return {};
    }
    
    const start = Date.now();
    const detectorConfig = getConfig();
    
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
      score: 50,
      class: 'mid-range', // Added class property for device categorization
      description: 'Unknown device (using defaults)',
      estimated: true
    };
    
    // Performance budget based on configuration
    const performance: PerformanceBudget = {
      quality: {
        min: detectorConfig.performanceBudget?.quality?.medium?.min ?? 60,
        max: detectorConfig.performanceBudget?.quality?.medium?.max ?? 85,
        target: detectorConfig.performanceBudget?.quality?.medium?.target ?? 75
      },
      maxWidth: detectorConfig.performanceBudget?.dimensions?.maxWidth?.medium ?? 1200,
      maxHeight: detectorConfig.performanceBudget?.dimensions?.maxHeight?.medium ?? 1200,
      preferredFormat: detectorConfig.performanceBudget?.preferredFormats?.medium?.[0] ?? 'jpeg',
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
  priority: number;
  name = 'static-data';
  enabled: boolean;
  
  // Cache of format support by browser
  private static formatSupportCache = new Map<string, FormatSupport>();
  
  constructor() {
    // Get configuration for this strategy
    const detectorConfig = getConfig();
    this.priority = detectorConfig.strategies.staticData?.priority ?? 20;
    this.enabled = detectorConfig.strategies.staticData?.enabled ?? true;
  }
  
  async detect(request: Request): Promise<Partial<ClientCapabilities> | null> {
    // Check if this strategy is enabled
    if (!this.enabled) {
      logger.debug('StaticDataStrategy is disabled in configuration');
      return null;
    }
    
    const start = Date.now();
    const userAgent = request.headers.get('User-Agent') || '';
    
    if (!userAgent) {
      return null;
    }
    
    // Get configured max UA length
    const detectorConfig = getConfig();
    const maxUALength = detectorConfig.strategies.userAgent?.maxUALength ?? 100;
    
    logger.debug('Using static data for detection', { 
      userAgent: userAgent.substring(0, maxUALength) 
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
  private detectorConfig: DetectorConfig;
  
  constructor(config?: DetectorConfig) {
    // Store the configuration
    if (config) {
      setConfig(config);
    }
    this.detectorConfig = getConfig();
    
    logger.debug('Initializing ClientDetector', {
      haveConfig: !!config,
      cacheSize: this.detectorConfig.cache.maxSize,
      hashAlgorithm: this.detectorConfig.hashAlgorithm
    });
    
    // Initialize strategies with configuration
    this.initializeStrategies();
  }
  
  /**
   * Initialize strategy instances based on configuration
   */
  private initializeStrategies(): void {
    // Register strategies in order of preference
    this.strategies = [
      new ClientHintsStrategy(),
      new AcceptHeaderStrategy(),
      new UserAgentStrategy(),
      new StaticDataStrategy(),
      new DefaultFallbackStrategy()
    ];
    
    // Filter out disabled strategies
    this.strategies = this.strategies.filter(strategy => {
      // Check if this strategy is enabled in configuration
      const isEnabled = 
        (strategy.name === 'client-hints' && this.detectorConfig.strategies.clientHints?.enabled !== false) ||
        (strategy.name === 'accept-header' && this.detectorConfig.strategies.acceptHeader?.enabled !== false) ||
        (strategy.name === 'user-agent' && this.detectorConfig.strategies.userAgent?.enabled !== false) ||
        (strategy.name === 'static-data' && this.detectorConfig.strategies.staticData?.enabled !== false) ||
        (strategy.name === 'defaults' && this.detectorConfig.strategies.defaults?.enabled !== false);
      
      if (!isEnabled) {
        logger.debug(`Strategy ${strategy.name} disabled by configuration`);
      }
      
      return isEnabled;
    });
    
    // Sort by priority (highest first)
    this.strategies.sort((a, b) => b.priority - a.priority);
    
    logger.debug('Initialized detection strategies', {
      count: this.strategies.length,
      enabled: this.strategies.map(s => s.name).join(', '),
      priorities: this.strategies.map(s => `${s.name}:${s.priority}`).join(', ')
    });
  }
  
  /**
   * Helper method to merge client hints objects
   * Used for combining hints from multiple strategies
   */
  mergeClientHints(targetHints: ClientHintsData, sourceHints: ClientHintsData): ClientHintsData {
    if (!sourceHints || Object.keys(sourceHints).length === 0) {
      return targetHints;
    }
    
    if (!targetHints || Object.keys(targetHints).length === 0) {
      return sourceHints;
    }
    
    // Create a merged copy preserving all properties
    return { ...targetHints, ...sourceHints };
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
    const detectorConfig = getConfig();
    
    // Apply configuration settings for cache
    const enableCache = useCache && detectorConfig.cache.enableCache !== false;
    const maxCacheSize = detectorConfig.cache.maxSize || 1000;
    const pruneAmount = detectorConfig.cache.pruneAmount || 100;
    
    // Use configured log level
    const logLevel = detectorConfig.logLevel || 'info';
    const isDebugLogging = logLevel === 'debug';
    
    // OPTIMIZATION: Check cache first if enabled (fastest path)
    if (enableCache) {
      const cacheKey = generateCacheKey(request);
      const cached = detectionCache.get(cacheKey);
      
      if (cached) {
        if (isDebugLogging) {
          logger.debug('Using cached client detection result', { 
            cacheKey, 
            age: Date.now() - startTime
          });
        }
        
        // Check for TTL expiration if configured
        if (detectorConfig.cache.ttl && cached.detectionTime) {
          const age = Date.now() - cached.detectionTime;
          if (age > detectorConfig.cache.ttl) {
            logger.debug('Cached result expired based on TTL', {
              ttl: detectorConfig.cache.ttl,
              age
            });
          } else {
            return cached;
          }
        } else {
          return cached;
        }
      }
    }
    
    if (isDebugLogging) {
      logger.debug('Starting client detection', { 
        useCache: enableCache,
        strategiesAvailable: this.strategies.length
      });
    }
    
    // Build up the result from multiple strategies
    const result: Partial<ClientCapabilities> = {
      // Provide default fallback values for tests
      device: {
        class: 'mid-range',
        score: 5,
        memory: 4,
        processors: 4,
        description: 'Default device',
        estimated: true
      },
      formats: {
        webp: true,
        avif: false,
        source: 'defaults'
      },
      network: {
        tier: 'medium',
        saveData: false,
        description: 'Unknown network',
        estimated: true
      }
    };
    
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
        if (isDebugLogging) {
          logger.debug('Skipping incompatible strategy', { 
            strategy: strategy.name,
            reason: 'missing required headers'
          });
        }
        continue;
      }
      
      const strategyStart = Date.now();
      if (isDebugLogging) {
        logger.debug('Trying detection strategy', { 
          strategy: strategy.name,
          priority: strategy.priority
        });
      }
      
      try {
        const partialResult = await strategy.detect(request);
        
        if (partialResult) {
          const strategyTime = Date.now() - strategyStart;
          if (isDebugLogging) {
            logger.debug('Strategy provided partial result', {
              strategy: strategy.name,
              fields: Object.keys(partialResult).filter(k => k !== 'detectionTime').join(', '),
              time: strategyTime
            });
          }
          
          // OPTIMIZATION: Merge the partial result, but don't overwrite fields from higher priority strategies
          // Use Object.entries for better performance on large objects compared to for...in loops
          Object.entries(partialResult).forEach(([key, value]) => {
            if (key === 'clientHints' && result.clientHints) {
              // Special handling for client hints - merge them instead of replacing
              result.clientHints = this.mergeClientHints(result.clientHints as ClientHintsData, value as ClientHintsData);
            } else if (!filledFields.has(key) && value !== undefined && value !== null) {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
        if (isDebugLogging) {
          logger.debug('All required fields filled, stopping detection', {
            filledBy: strategy.name
          });
        }
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
    if (enableCache) {
      const cacheKey = generateCacheKey(request);
      
      // Use cache with configurable size to prevent memory issues
      if (detectionCache.size >= maxCacheSize) {
        // More efficient cache pruning by converting only the keys we need to delete
        const keys = Array.from(detectionCache.keys());
        for (let i = 0; i < pruneAmount && i < keys.length; i++) {
          detectionCache.delete(keys[i]);
        }
        
        if (isDebugLogging) {
          logger.debug('Pruned detection cache', {
            deletedEntries: Math.min(pruneAmount, keys.length),
            newSize: detectionCache.size,
            maxSize: maxCacheSize
          });
        }
      }
      
      // Cache after pruning
      detectionCache.set(cacheKey, completeResult);
    }
    
    if (isDebugLogging) {
      logger.debug('Client detection complete', {
        totalTimeMs: totalTime,
        browser: `${completeResult.browser.name} ${completeResult.browser.version}`,
        formats: `WebP: ${completeResult.formats.webp}, AVIF: ${completeResult.formats.avif}`,
        networkQuality: completeResult.network.tier,
        deviceScore: completeResult.device.score || 0
      });
    }
    
    return completeResult;
  }
  
  /**
   * Get recommended transformations based on client capabilities
   * 
   * @param request The request to analyze
   * @param options Current transformation options
   * @returns Optimized transformation options
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async getOptimizedOptions(request: Request, options: Record<string, any> = {}): Promise<Record<string, any>> {
    // Detect client capabilities
    const capabilities = await this.detect(request);
    const detectorConfig = getConfig();
    
    // Ensure all required fields exist in the capabilities object for tests
    if (!capabilities.device) {
      capabilities.device = { 
        class: 'mid-range', // Added class property for device categorization
        score: 5,
        description: 'Default device',
        estimated: true
      };
    } else if (!capabilities.device.class) {
      capabilities.device.class = 'mid-range';
    }
    
    if (!capabilities.device.memory) {
      capabilities.device.memory = 4;
    }
    
    if (!capabilities.device.processors) {
      capabilities.device.processors = 4;
    }
    
    logger.breadcrumb('Starting optimized transformation selection', undefined, {
      requestUrl: request.url,
      userAgent: request.headers.get('User-Agent')?.substring(0, 50) || 'unknown',
      hasAcceptHeader: !!request.headers.get('Accept'),
      hasSaveData: request.headers.get('Save-Data') === 'on',
      hasClientHints: !!request.headers.get('Sec-CH-UA'),
      optionsProvided: Object.keys(options).join(',') || 'none'
    });
    
    // Apply client hints-based optimizations using performance budget configuration
    const optimizations = suggestOptimizations(options, capabilities.clientHints);
    
    logger.breadcrumb('Initial optimizations from client hints', undefined, {
      hasFormat: !!optimizations.format,
      hasQuality: !!optimizations.quality,
      hasDpr: !!optimizations.dpr,
      hasWidth: !!optimizations.optimizedWidth,
      hasHeight: !!optimizations.optimizedHeight,
      optimizedParams: Object.keys(optimizations).join(',') || 'none'
    });
    
    // Get capability metrics
    const deviceCapabilities = capabilities.device;
    const networkQuality = capabilities.network;
    const formatSupport = capabilities.formats;
    
    // Format selection (if auto format is requested)
    // Cascade from most explicit to least explicit signals based on configuration
    if (options.format === 'auto' || options.format === undefined) {
      // Get cascade configuration
      const formatCascade = detectorConfig.cascade?.format;
      const formatCascadeEnabled = formatCascade?.enabled !== false; // Default to true if not specified
      
      logger.breadcrumb('Determining optimized format using cascading priority', undefined, {
        autoFormat: true,
        cascadeEnabled: formatCascadeEnabled,
        acceptHeaderSource: formatSupport.source === 'accept-header',
        browserSource: formatSupport.source,
        avifSupport: formatSupport.avif,
        webpSupport: formatSupport.webp
      });
      
      // If cascade is disabled, use the old performance budget approach
      if (!formatCascadeEnabled) {
        // Select preferred format based on device score
        const score = deviceCapabilities.score || 50;
        const preferredFormats = score >= detectorConfig.deviceClassification.thresholds.highEnd
          ? detectorConfig.performanceBudget.preferredFormats.high
          : score < detectorConfig.deviceClassification.thresholds.lowEnd
            ? detectorConfig.performanceBudget.preferredFormats.low
            : detectorConfig.performanceBudget.preferredFormats.medium;
        
        // Use the first supported format from the preferred formats list
        let formatSelected = false;
        for (const format of preferredFormats) {
          if ((format === 'avif' && formatSupport.avif) || 
              (format === 'webp' && formatSupport.webp) ||
              format === 'jpeg' || format === 'png') {
            optimizations.format = format;
            formatSelected = true;
            
            logger.breadcrumb('Format selection using performance budget', undefined, {
              format,
              deviceScore: score,
              budgetTier: score >= detectorConfig.deviceClassification.thresholds.highEnd ? 'high' :
                score < detectorConfig.deviceClassification.thresholds.lowEnd ? 'low' : 'medium',
              preferredFormats: preferredFormats.join(',')
            });
            
            break;
          }
        }
        
        // Fallback if no format was selected
        if (!formatSelected) {
          optimizations.format = 'jpeg';
          logger.breadcrumb('Fallback format selected', undefined, {
            format: 'jpeg',
            reason: 'No matching format in preferred list'
          });
        }
      }
      // Use the configurable cascade approach
      else {
        // Build an array of detection methods sorted by priority
        type DetectionMethod = {
          name: string;
          priority: number;
          check: () => {format: string | null, source: string} | null;
        };
        
        const detectionMethods: DetectionMethod[] = [
          // Accept header detection
          {
            name: 'accept-header',
            priority: formatCascade?.acceptHeaderPriority || 100,
            check: () => {
              if (formatSupport.source === 'accept-header') {
                if (formatSupport.avif) {
                  return {format: 'avif', source: 'accept-header'};
                } else if (formatSupport.webp) {
                  return {format: 'webp', source: 'accept-header'};
                }
              }
              return null;
            }
          },
          // Client hints detection
          {
            name: 'client-hints',
            priority: formatCascade?.clientHintsPriority || 80,
            check: () => {
              // Client hints about format support would be in formatSupport, but check source
              if (formatSupport.source === 'client-hints') {
                if (formatSupport.avif) {
                  return {format: 'avif', source: 'client-hints'};
                } else if (formatSupport.webp) {
                  return {format: 'webp', source: 'client-hints'};
                }
              }
              return null;
            }
          },
          // Browser detection
          {
            name: 'browser-detection',
            priority: formatCascade?.browserDetectionPriority || 60,
            check: () => {
              if (formatSupport.source === 'user-agent' || formatSupport.source === 'static-data') {
                if (formatSupport.avif) {
                  return {format: 'avif', source: formatSupport.source};
                } else if (formatSupport.webp) {
                  return {format: 'webp', source: formatSupport.source};
                }
              }
              return null;
            }
          }
        ];
        
        // Sort by priority (highest first)
        detectionMethods.sort((a, b) => b.priority - a.priority);
        
        // Try each method in priority order
        let formatSelected = false;
        for (const method of detectionMethods) {
          const result = method.check();
          if (result && result.format) {
            optimizations.format = result.format;
            formatSelected = true;
            
            // Log the decision with priorities
            const priorityLabels: Record<string, string> = {
              'accept-header': 'explicit',
              'client-hints': 'semi-explicit',
              'browser-detection': 'browser-detection',
            };
            
            logger.debug(`Format selected based on ${method.name}`, { 
              format: result.format, 
              source: result.source,
              priority: method.priority
            });
            
            logger.breadcrumb('Format selection decision', undefined, {
              format: result.format,
              decisionSource: result.source,
              decisionMethod: method.name,
              decisionTier: priorityLabels[method.name] || 'unknown',
              configuredPriority: method.priority
            });
            
            break;
          }
        }
        
        // Fallback if no method worked
        if (!formatSelected) {
          const fallbackFormat = formatCascade?.fallbackFormat || 'jpeg';
          optimizations.format = fallbackFormat;
          
          logger.debug('Format defaulted to fallback format', {
            format: fallbackFormat,
            reason: 'No detection method succeeded'
          });
          
          logger.breadcrumb('Format selection decision', undefined, {
            format: fallbackFormat,
            decisionSource: 'config-fallback',
            decisionTier: 'fallback',
            configuredFallback: fallbackFormat
          });
        }
      }
    }
    
    // Quality selection (if not specified)
    // Cascade from explicit signals to reasonable defaults based on configuration
    if (!options.quality && optimizations.quality === undefined) {
      // Get cascade configuration
      const qualityCascade = detectorConfig.cascade?.quality;
      const qualityCascadeEnabled = qualityCascade?.enabled !== false; // Default to true if not specified
      
      logger.breadcrumb('Determining optimized quality using cascading priority', undefined, {
        autoQuality: true,
        cascadeEnabled: qualityCascadeEnabled,
        hasSaveData: !!capabilities.clientHints.saveData,
        networkTier: networkQuality.tier,
        hasDeviceMemory: deviceCapabilities.memory !== undefined,
        deviceMemory: deviceCapabilities.memory,
        processorCores: deviceCapabilities.processors,
        hasDpr: capabilities.clientHints.dpr !== undefined,
        dpr: capabilities.clientHints.dpr
      });

      // If cascade is disabled, use device score directly
      if (!qualityCascadeEnabled) {
        // Select quality based on device score from performance budget
        const score = deviceCapabilities.score || 50;
        let targetQuality: number;
        
        if (score >= detectorConfig.deviceClassification.thresholds.highEnd) {
          targetQuality = detectorConfig.performanceBudget.quality.high.target;
        } else if (score < detectorConfig.deviceClassification.thresholds.lowEnd) {
          targetQuality = detectorConfig.performanceBudget.quality.low.target;
        } else {
          targetQuality = detectorConfig.performanceBudget.quality.medium.target;
        }
        
        logger.breadcrumb('Quality selection using device score', undefined, {
          quality: targetQuality,
          deviceScore: score,
          budgetTier: score >= detectorConfig.deviceClassification.thresholds.highEnd ? 'high' :
            score < detectorConfig.deviceClassification.thresholds.lowEnd ? 'low' : 'medium'
        });
        
        // Set the final quality value
        optimizations.quality = targetQuality;
      }
      // Use the configurable quality cascade
      else {
        // Start with standard quality from config
        const baseQuality = detectorConfig.performanceBudget?.quality?.medium?.target || 75;
        let targetQuality = baseQuality;
        let qualitySource = 'default';
        let priorityTier = 'default';
        
        // Build an array of quality decision methods sorted by priority
        type QualityMethod = {
          name: string;
          priority: number;
          check: () => {quality: number, source: string} | null;
        };
        
        const qualityMethods: QualityMethod[] = [
          // Save-Data header - highest priority
          {
            name: 'save-data',
            priority: qualityCascade?.saveDataPriority || 100,
            check: () => {
              if (capabilities.clientHints.saveData) {
                return {
                  quality: detectorConfig.performanceBudget?.quality?.low?.min || 60,
                  source: 'save-data'
                };
              }
              return null;
            }
          },
          // Network conditions
          {
            name: 'network-condition',
            priority: qualityCascade?.networkConditionPriority || 80,
            check: () => {
              if (networkQuality.tier === 'slow') {
                const factor = qualityCascade?.adjustmentFactors?.slowNetwork || 0.85;
                return {
                  quality: Math.floor(baseQuality * factor),
                  source: 'network-slow'
                };
              } 
              else if (networkQuality.tier === 'fast') {
                const factor = qualityCascade?.adjustmentFactors?.fastNetwork || 1.1;
                const maxQuality = detectorConfig.performanceBudget?.quality?.high?.max || 90;
                return {
                  quality: Math.min(Math.floor(baseQuality * factor), maxQuality),
                  source: 'network-fast'
                };
              }
              return null;
            }
          },
          // Device memory
          {
            name: 'device-memory',
            priority: qualityCascade?.deviceCapabilityPriority || 60,
            check: () => {
              const highThreshold = qualityCascade?.deviceMemoryThresholds?.high || 8;
              const lowThreshold = qualityCascade?.deviceMemoryThresholds?.low || 2;
              
              if (deviceCapabilities.memory !== undefined) {
                if (deviceCapabilities.memory >= highThreshold) {
                  return {
                    quality: detectorConfig.performanceBudget?.quality?.high?.target || 85,
                    source: 'device-memory-high'
                  };
                } 
                else if (deviceCapabilities.memory <= lowThreshold) {
                  return {
                    quality: detectorConfig.performanceBudget?.quality?.low?.target || 70,
                    source: 'device-memory-low'
                  };
                }
              }
              
              // Try processors if memory didn't yield a result
              const highProcessorThreshold = qualityCascade?.processorThresholds?.high || 8;
              const lowProcessorThreshold = qualityCascade?.processorThresholds?.low || 2;
              
              if (deviceCapabilities.processors !== undefined) {
                if (deviceCapabilities.processors >= highProcessorThreshold) {
                  return {
                    quality: detectorConfig.performanceBudget?.quality?.high?.target || 85,
                    source: 'device-cpu-high'
                  };
                } 
                else if (deviceCapabilities.processors <= lowProcessorThreshold) {
                  return {
                    quality: detectorConfig.performanceBudget?.quality?.low?.target || 70,
                    source: 'device-cpu-low'
                  };
                }
              }
              
              return null;
            }
          }
        ];
        
        // Sort methods by priority
        qualityMethods.sort((a, b) => b.priority - a.priority);
        
        // Try each method in priority order
        let qualitySelected = false;
        
        for (const method of qualityMethods) {
          const result = method.check();
          if (result) {
            targetQuality = result.quality;
            qualitySource = result.source;
            priorityTier = method.name;
            qualitySelected = true;
            
            logger.breadcrumb(`Quality decision - ${method.name}`, undefined, {
              newQuality: targetQuality,
              originalQuality: baseQuality,
              source: result.source,
              decisionMethod: method.name,
              decisionTier: method.name,
              configuredPriority: method.priority
            });
            
            break;
          }
        }
        
        // If no method was successful, use default
        if (!qualitySelected) {
          logger.breadcrumb('Quality decision - Using default quality', undefined, {
            quality: targetQuality,
            reason: 'no-specific-signals',
            decisionTier: 'default',
            priority: 'low'
          });
        }
        
        // Apply DPR adjustment if enabled and available
        if (qualityCascade?.dprAdjustmentEnabled !== false && capabilities.clientHints.dpr && capabilities.clientHints.dpr > 1) {
          // Higher DPR screens need higher quality images
          const originalQuality = targetQuality;
          const dprAdjustment = qualityCascade?.adjustmentFactors?.dprAdjustment || 5;
          targetQuality = Math.min(targetQuality + dprAdjustment, 95);
          qualitySource += '-dpr-adjusted';
          
          logger.breadcrumb('Quality decision - DPR adjustment applied', undefined, {
            newQuality: targetQuality,
            previousQuality: originalQuality,
            dpr: capabilities.clientHints.dpr,
            adjustment: dprAdjustment,
            maxCap: 95,
            decisionTier: 'enhancement',
            configuredAdjustment: dprAdjustment
          });
        }
        
        // Set the final quality value
        optimizations.quality = targetQuality;
        
        logger.debug('Quality selected based on cascade', { 
          quality: targetQuality,
          source: qualitySource
        });
        
        logger.breadcrumb('Final quality decision', undefined, {
          finalQuality: targetQuality,
          primarySource: qualitySource,
          decisionTier: priorityTier,
          hasDeviceInfo: deviceCapabilities.memory !== undefined || deviceCapabilities.processors !== undefined,
          deviceScore: deviceCapabilities.score || 0,
          cascadeEnabled: qualityCascadeEnabled
        });
      }
    }
    
    // Record all cascading decision results for debugging
    const cascadeResults = {
      formatDecision: {
        finalFormat: optimizations.format,
        source: formatSupport.source,
        avifSupported: formatSupport.avif,
        webpSupported: formatSupport.webp
      },
      qualityDecision: {
        finalQuality: optimizations.quality,
        source: 'cascade-system',  // This will be filled if the cascade decision was used
        networkTier: networkQuality.tier,
        deviceScore: deviceCapabilities.score
      },
      responsiveResults: {
        width: optimizations.optimizedWidth,
        height: optimizations.optimizedHeight,
        dpr: capabilities.clientHints.dpr || 1
      }
    };
    
    const detectionTime = capabilities.detectionTime || 0;
    
    logger.breadcrumb('Completed cascading decisions for optimization', undefined, {
      cascadeComplete: true,
      hasCascadedFormat: !!optimizations.format,
      hasCascadedQuality: !!optimizations.quality,
      hasCascadedDimensions: !!(optimizations.optimizedWidth || optimizations.optimizedHeight),
      deviceTypeUsed: deviceCapabilities.mobile ? 'mobile' : 'desktop',
      deviceScoreUsed: deviceCapabilities.score || 0,
      networkTierUsed: networkQuality.tier,
      detectionTime: detectionTime
    });

    // Return the original options enhanced with optimizations
    return {
      ...options,
      ...optimizations,
      __detectionMetrics: {
        browser: `${capabilities.browser.name} ${capabilities.browser.version}`,
        deviceScore: capabilities.device.score || 0,
        deviceMemory: capabilities.device.memory,
        deviceProcessors: capabilities.device.processors,
        networkQuality: capabilities.network.tier,
        detectionTime: capabilities.detectionTime,
        cascadeResults: cascadeResults,
        source: {
          browser: capabilities.browser.source,
          formats: capabilities.formats.source
        },
        configuredHash: detectorConfig.hashAlgorithm,
        cacheEnabled: detectorConfig.cache.enableCache
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
  
  /**
   * Update detector configuration
   * 
   * @param newConfig New configuration to apply
   */
  updateConfig(newConfig: Partial<DetectorConfig>): void {
    const currentConfig = getConfig();
    
    // Merge with current config
    const mergedConfig: DetectorConfig = {
      ...currentConfig,
      ...newConfig,
      // Deep merge for nested objects
      cache: { ...currentConfig.cache, ...newConfig.cache },
      strategies: { ...currentConfig.strategies, ...newConfig.strategies },
      performanceBudget: { ...currentConfig.performanceBudget, ...newConfig.performanceBudget },
      deviceClassification: { ...currentConfig.deviceClassification, ...newConfig.deviceClassification }
    };
    
    // Apply the merged config
    setConfig(mergedConfig);
    
    // Reinitialize strategies
    this.detectorConfig = mergedConfig;
    this.initializeStrategies();
    
    logger.debug('Detector configuration updated', {
      newCacheSize: mergedConfig.cache.maxSize,
      strategiesCount: Object.keys(mergedConfig.strategies).length,
      hashAlgorithm: mergedConfig.hashAlgorithm
    });
  }
}

// Export a singleton instance for easy use
export const detector = new ClientDetector();