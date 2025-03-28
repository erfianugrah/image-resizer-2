/**
 * Detector Service Implementation
 * 
 * A unified client detection framework for image resizer that handles browser formats,
 * client hints, network conditions, and device capabilities with caching and fallbacks.
 */

import { 
  ClientDetectionService, 
  ClientInfo, 
  TransformOptions 
} from './interfaces';
import { ImageResizerConfig } from '../config';
import { Logger } from '../utils/logging';
import { 
  isFormatSupported, 
  normalizeBrowserName 
} from '../utils/browser-formats';
import { ClientHintsData } from '../utils/client-hints';

/**
 * A simple in-memory cache to optimize performance
 */
interface CacheEntry {
  timestamp: number;
  data: ClientInfo;
}

// Device capability types
interface DeviceCapabilities {
  memory: 'high' | 'medium' | 'low';
  processors: 'high' | 'medium' | 'low';
  platform?: string;
}

/**
 * Implementation of the client detection service
 */
export class DetectorServiceImpl implements ClientDetectionService {
  private logger: Logger;
  private config: ImageResizerConfig;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private detectorConfig: any;
  private cache: Map<string, CacheEntry> = new Map();
  private cacheHits = 0;
  private cacheMisses = 0;
  private parseCount = 0;
  
  /**
   * Create a new detector service
   * 
   * @param logger Logger instance for logging
   */
  constructor(logger: Logger) {
    this.logger = logger;
    // Default empty configuration until configure is called
    this.config = {} as ImageResizerConfig;
    this.detectorConfig = {};
  }
  
  /**
   * Configure the client detection service
   * 
   * @param config Application configuration
   */
  configure(config: ImageResizerConfig): void {
    this.config = config;
    this.detectorConfig = config.detector || {};
    
    // Setup cache configuration
    const maxCacheSize = this.detectorConfig.cache?.maxSize || 1000;
    const pruneTo = this.detectorConfig.cache?.pruneTo || Math.floor(maxCacheSize * 0.75);
    
    this.logger.debug('Detector configuration initialized', { 
      cacheSize: maxCacheSize,
      cachePruneTo: pruneTo,
      strategies: this.detectorConfig.strategies ? Object.keys(this.detectorConfig.strategies) : [],
      logLevel: this.detectorConfig.logLevel || 'info'
    });
  }
  
  /**
   * Get a cache key for a request
   * 
   * @param request The request to get a cache key for
   * @returns A string key for cache lookup
   */
  private getCacheKey(request: Request): string {
    // Use a combination of headers and URL as cache key
    const url = new URL(request.url);
    const parts = [
      // Origin/path
      url.origin,
      
      // Relevant headers for client detection
      request.headers.get('user-agent') || '',
      request.headers.get('sec-ch-ua') || '',
      request.headers.get('sec-ch-ua-mobile') || '',
      request.headers.get('sec-ch-ua-platform') || '',
      request.headers.get('sec-ch-viewport-width') || '',
      request.headers.get('sec-ch-viewport-height') || '',
      request.headers.get('sec-ch-dpr') || '',
      request.headers.get('save-data') || '',
      request.headers.get('ect') || '',
      request.headers.get('rtt') || '',
      request.headers.get('downlink') || '',
      request.headers.get('accept') || ''
    ];
    
    // Create a hash-like representation
    return parts.join('|');
  }
  
  /**
   * Prune the cache when it gets too large
   */
  private pruneCache(): void {
    const maxSize = this.detectorConfig.cache?.maxSize || 1000;
    const pruneTo = this.detectorConfig.cache?.pruneTo || Math.floor(maxSize * 0.75);
    
    if (this.cache.size <= maxSize) {
      return;
    }
    
    this.logger.debug('Pruning client detection cache', {
      before: this.cache.size,
      target: pruneTo
    });
    
    // Convert to array for sorting
    const entries = Array.from(this.cache.entries());
    
    // Sort by timestamp (oldest first)
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
    
    // Create a new map with only the newest entries
    const newCache = new Map();
    const keepEntries = entries.slice(entries.length - pruneTo);
    
    for (const [key, value] of keepEntries) {
      newCache.set(key, value);
    }
    
    this.cache = newCache;
    
    this.logger.debug('Client detection cache pruned', {
      after: this.cache.size,
      removed: entries.length - keepEntries.length
    });
  }
  
  /**
   * Detect client information from a request
   * 
   * @param request Original request
   * @returns Client information
   */
  async detectClient(request: Request): Promise<ClientInfo> {
    // Check for cached client info
    const cacheKey = this.getCacheKey(request);
    const cached = this.cache.get(cacheKey);
    
    if (cached && this.isCacheEntryValid(cached)) {
      this.cacheHits++;
      
      if (this.cacheHits % 100 === 0) {
        this.logger.debug('Client detection cache stats', {
          hits: this.cacheHits,
          misses: this.cacheMisses,
          ratio: Math.round((this.cacheHits / (this.cacheHits + this.cacheMisses)) * 100) + '%',
          size: this.cache.size
        });
      }
      
      return cached.data;
    }
    
    this.cacheMisses++;
    this.parseCount++;
    
    // Parse data from request
    const clientInfo = await this.parseClientInfo(request);
    
    // Cache the result
    this.cache.set(cacheKey, {
      timestamp: Date.now(),
      data: clientInfo
    });
    
    // Prune cache if needed
    if (this.parseCount % 50 === 0) {
      this.pruneCache();
    }
    
    return clientInfo;
  }
  
  /**
   * Check if a cached entry is still valid
   * 
   * @param entry The cache entry to check
   * @returns True if the entry is still valid
   */
  private isCacheEntryValid(entry: CacheEntry): boolean {
    const cacheTtl = this.detectorConfig.cache?.ttl || 600000; // Default 10 minutes
    const age = Date.now() - entry.timestamp;
    return age < cacheTtl;
  }
  
  /**
   * Parse client information from a request
   * 
   * @param request The request to parse
   * @returns Client information
   */
  private async parseClientInfo(request: Request): Promise<ClientInfo> {
    const userAgent = request.headers.get('user-agent') || '';
    const acceptHeader = request.headers.get('accept') || '';
    
    // Parse client hints data
    const clientHints = this.parseClientHints(request);
    
    // Detect device type
    const deviceType = this.detectDeviceType(userAgent, clientHints);
    
    // Check format support
    const acceptsWebp = this.checkWebpSupport(userAgent, acceptHeader);
    const acceptsAvif = this.checkAvifSupport(userAgent, acceptHeader);
    
    // Determine network quality
    const networkQuality = this.determineNetworkQuality(clientHints);
    
    // Create preferred formats array
    const preferredFormats = this.getPreferredFormats(acceptsAvif, acceptsWebp);
    
    // Get device capabilities
    const deviceCapabilities = this.getDeviceCapabilities(clientHints);
    
    // Determine memory and processor constraints
    const memoryConstraints = deviceCapabilities.memory === 'low';
    const processorConstraints = deviceCapabilities.processors === 'low';
    
    // Determine device classification
    const deviceClassification = this.getDeviceClassificationFromCapabilities(deviceCapabilities);
    
    // Combine all data into a client info object
    const clientInfo: ClientInfo = {
      viewportWidth: clientHints.viewportWidth,
      devicePixelRatio: clientHints.dpr,
      saveData: clientHints.saveData === true,
      acceptsWebp,
      acceptsAvif,
      deviceType,
      networkQuality,
      preferredFormats,
      deviceClassification,
      memoryConstraints,
      processorConstraints
    };
    
    this.logger.debug('Detected client info', {
      viewportWidth: clientInfo.viewportWidth,
      devicePixelRatio: clientInfo.devicePixelRatio,
      saveData: clientInfo.saveData,
      deviceType: clientInfo.deviceType,
      networkQuality: clientInfo.networkQuality,
      acceptsWebp: clientInfo.acceptsWebp,
      acceptsAvif: clientInfo.acceptsAvif,
      deviceClassification: clientInfo.deviceClassification
    });
    
    return clientInfo;
  }
  
  /**
   * Parse client hints from request headers
   * 
   * @param request The request to extract client hints from
   * @returns Client hints data object with available values
   */
  private parseClientHints(request: Request): ClientHintsData {
    const hints: ClientHintsData = {};
    const headers = request.headers;
    const acceptHeader = request.headers.get('accept') || '';
    
    try {
      // Device characteristics
      const dpr = headers.get('Sec-CH-DPR') || headers.get('DPR');
      if (dpr) {
        hints.dpr = parseFloat(dpr);
      }
      
      const viewportWidth = headers.get('Sec-CH-Viewport-Width') || headers.get('Viewport-Width');
      if (viewportWidth) {
        hints.viewportWidth = parseInt(viewportWidth, 10);
      }
      
      const viewportHeight = headers.get('Sec-CH-Viewport-Height');
      if (viewportHeight) {
        hints.viewportHeight = parseInt(viewportHeight, 10);
      }
      
      const width = headers.get('Sec-CH-Width') || headers.get('Width');
      if (width) {
        hints.width = parseInt(width, 10);
      }
      
      // Browser identification
      const uaRaw = headers.get('Sec-CH-UA');
      if (uaRaw) {
        try {
          // Format: '( "Chrome"; v="119" ), ( "Not?A_Brand"; v="24" )'
          const brands: string[] = [];
          const matches = uaRaw.matchAll(/"\s*([^"]+)"\s*;\s*v\s*=\s*"([^"]*)"/g);
          for (const match of matches) {
            if (match[1] && match[1] !== 'Not A Brand' && match[1] !== 'Not?A_Brand') {
              brands.push(match[1]);
            }
          }
          hints.uaBrands = brands;
        } catch (e) {
          this.logger.warn('Failed to parse Sec-CH-UA header', { header: uaRaw, error: String(e) });
        }
      }
      
      const uaMobile = headers.get('Sec-CH-UA-Mobile');
      if (uaMobile) {
        hints.uaMobile = uaMobile === '?1';
      }
      
      const uaPlatform = headers.get('Sec-CH-UA-Platform');
      if (uaPlatform) {
        hints.uaPlatform = uaPlatform.replace(/"/g, '');
      }
      
      const uaArch = headers.get('Sec-CH-UA-Arch');
      if (uaArch) {
        hints.uaArch = uaArch.replace(/"/g, '');
      }
      
      const uaBitness = headers.get('Sec-CH-UA-Bitness');
      if (uaBitness) {
        hints.uaBitness = uaBitness.replace(/"/g, '');
      }
      
      // Network conditions
      const saveData = headers.get('Save-Data');
      if (saveData) {
        hints.saveData = saveData === 'on';
      }
      
      const ect = headers.get('ECT');
      if (ect) {
        hints.ect = ect.toLowerCase();
      }
      
      const rtt = headers.get('RTT');
      if (rtt) {
        hints.rtt = parseInt(rtt, 10);
      }
      
      const downlink = headers.get('Downlink');
      if (downlink) {
        hints.downlink = parseFloat(downlink);
      }
      
      // User preferences
      const prefersColorScheme = headers.get('Sec-CH-Prefers-Color-Scheme');
      if (prefersColorScheme) {
        hints.prefersColorScheme = prefersColorScheme.toLowerCase();
      }
      
      const prefersReducedMotion = headers.get('Sec-CH-Prefers-Reduced-Motion');
      if (prefersReducedMotion) {
        hints.prefersReducedMotion = prefersReducedMotion === 'reduce';
      }
      
      // Device capabilities
      const deviceMemory = headers.get('Device-Memory');
      if (deviceMemory) {
        hints.deviceMemory = parseFloat(deviceMemory);
      }
      
      const hardwareConcurrency = headers.get('Hardware-Concurrency');
      if (hardwareConcurrency) {
        hints.hardwareConcurrency = parseInt(hardwareConcurrency, 10);
      }
      
      // Accept header for format detection
      if (acceptHeader) {
        hints.acceptFormats = [];
        if (acceptHeader.includes('image/avif')) hints.acceptFormats.push('avif');
        if (acceptHeader.includes('image/webp')) hints.acceptFormats.push('webp');
        if (acceptHeader.includes('image/jpeg') || acceptHeader.includes('image/jpg')) hints.acceptFormats.push('jpeg');
        if (acceptHeader.includes('image/png')) hints.acceptFormats.push('png');
        if (acceptHeader.includes('image/gif')) hints.acceptFormats.push('gif');
      }
    } catch (error) {
      this.logger.error('Error parsing client hints', { 
        error: error instanceof Error ? error.message : String(error)
      });
    }
    
    return hints;
  }
  
  /**
   * Detect device type based on headers and client hints
   * 
   * @param userAgent User agent string
   * @param clientHints Parsed client hints
   * @returns Device type classification
   */
  private detectDeviceType(
    userAgent: string, 
    clientHints: ClientHintsData
  ): 'mobile' | 'tablet' | 'desktop' | 'unknown' {
    // First check client hints
    if (clientHints.uaMobile === true) {
      return 'mobile';
    }
    
    // Tablet detection is tricky - not natively supported in client hints
    if (userAgent.toLowerCase().includes('tablet')) {
      return 'tablet';
    }
    
    // If mobile client hint is false, it's probably desktop
    if (clientHints.uaMobile === false) {
      return 'desktop';
    }
    
    // Fallback to user agent detection
    const ua = userAgent.toLowerCase();
    
    // Mobile detection
    if (
      /iphone|ipod|android.*mobile|windows.*phone|blackberry|bb\d+|meego|silk|googlebot-mobile/i.test(ua)
    ) {
      return 'mobile';
    }
    
    // Tablet detection
    if (
      /ipad|android(?!.*mobile)|tablet|kindle|playbook|silk|gt-p1000/i.test(ua)
    ) {
      return 'tablet';
    }
    
    // Desktop is the default
    return 'desktop';
  }
  
  /**
   * Check if WebP is supported
   * 
   * @param userAgent User agent string
   * @param acceptHeader Accept header value
   * @returns True if WebP is supported
   */
  private checkWebpSupport(userAgent: string, acceptHeader: string): boolean {
    // Check accept header first
    if (acceptHeader.includes('image/webp')) {
      return true;
    }
    
    // Fall back to browser detection
    const browserName = normalizeBrowserName(userAgent);
    const browserVersion = this.extractBrowserVersion(userAgent) || '0';
    return isFormatSupported('webp', browserName, browserVersion);
  }
  
  /**
   * Check if AVIF is supported
   * 
   * @param userAgent User agent string
   * @param acceptHeader Accept header value
   * @returns True if AVIF is supported
   */
  private checkAvifSupport(userAgent: string, acceptHeader: string): boolean {
    // Check accept header first
    if (acceptHeader.includes('image/avif')) {
      return true;
    }
    
    // Fall back to browser detection
    const browserName = normalizeBrowserName(userAgent);
    const browserVersion = this.extractBrowserVersion(userAgent) || '0';
    return isFormatSupported('avif', browserName, browserVersion);
  }
  
  /**
   * Extract browser version from user agent string
   * 
   * @param userAgent User agent string
   * @returns Browser version or null if not found
   */
  private extractBrowserVersion(userAgent: string): string | null {
    if (!userAgent) return null;
    
    // Try to extract version using common patterns
    const patterns = [
      /Chrome\/(\d+\.\d+)/i,
      /Firefox\/(\d+\.\d+)/i,
      /Safari\/(\d+\.\d+)/i,
      /Edge\/(\d+\.\d+)/i,
      /OPR\/(\d+\.\d+)/i,
      /Version\/(\d+\.\d+)/i,
      /MSIE (\d+\.\d+)/i,
      /rv:(\d+\.\d+)/i
    ];
    
    for (const pattern of patterns) {
      const match = userAgent.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }
    
    return null;
  }
  
  /**
   * Determine network quality from client hints
   * 
   * @param clientHints Parsed client hints data
   * @returns Network quality classification
   */
  private determineNetworkQuality(clientHints: ClientHintsData): 'fast' | 'medium' | 'slow' {
    // Use save-data header as a strong indicator of network constraints
    if (clientHints.saveData === true) {
      return 'slow';
    }
    
    // Use ECT (Effective Connection Type) if available
    if (clientHints.ect) {
      switch (clientHints.ect) {
      case '4g':
        return 'fast';
      case '3g':
        return 'medium';
      case '2g':
      case 'slow-2g':
        return 'slow';
      }
    }
    
    // Use RTT and downlink for more precise classification
    if (typeof clientHints.rtt === 'number' && typeof clientHints.downlink === 'number') {
      // Fast network: RTT < 100ms and downlink > 5Mbps
      if (clientHints.rtt < 100 && clientHints.downlink > 5) {
        return 'fast';
      }
      
      // Slow network: RTT > 500ms or downlink < 1Mbps
      if (clientHints.rtt > 500 || clientHints.downlink < 1) {
        return 'slow';
      }
      
      // Medium for everything in between
      return 'medium';
    }
    
    // Default to medium if we can't determine
    return 'medium';
  }
  
  /**
   * Get preferred formats based on browser support
   * 
   * @param acceptsAvif Whether AVIF is supported
   * @param acceptsWebp Whether WebP is supported
   * @returns Array of preferred formats in order
   */
  private getPreferredFormats(acceptsAvif: boolean, acceptsWebp: boolean): string[] {
    const formats: string[] = [];
    
    // Add formats in order of preference
    if (acceptsAvif) {
      formats.push('avif');
    }
    
    if (acceptsWebp) {
      formats.push('webp');
    }
    
    // Always include fallback formats
    formats.push('jpeg', 'png');
    
    return formats;
  }
  
  /**
   * Get device capabilities estimate from client hints
   * 
   * @param clientHints Parsed client hints data
   * @returns Device capabilities assessment
   */
  private getDeviceCapabilities(clientHints: ClientHintsData): DeviceCapabilities {
    const capabilities: DeviceCapabilities = {
      memory: 'medium',
      processors: 'medium'
    };
    
    // Set platform if available
    if (clientHints.uaPlatform) {
      capabilities.platform = clientHints.uaPlatform;
    }
    
    // Device memory classification
    if (typeof clientHints.deviceMemory === 'number') {
      if (clientHints.deviceMemory >= 4) {
        capabilities.memory = 'high';
      } else if (clientHints.deviceMemory <= 1) {
        capabilities.memory = 'low';
      }
    }
    
    // Processor classification based on hardware concurrency
    if (typeof clientHints.hardwareConcurrency === 'number') {
      if (clientHints.hardwareConcurrency >= 8) {
        capabilities.processors = 'high';
      } else if (clientHints.hardwareConcurrency <= 2) {
        capabilities.processors = 'low';
      }
    }
    
    return capabilities;
  }
  
  /**
   * Get optimized transformation options based on client capabilities
   * 
   * @param request Original request
   * @param baseOptions Base transformation options
   * @param config Application configuration
   * @returns Optimized transformation options
   */
  async getOptimizedOptions(
    request: Request,
    baseOptions: TransformOptions,
    _config: ImageResizerConfig
  ): Promise<TransformOptions> {
    // Detect client information
    const clientInfo = await this.detectClient(request);
    
    // Clone the base options
    const options = { ...baseOptions };
    
    // Apply format optimization if not specified
    if (!options.format) {
      if (clientInfo.preferredFormats && clientInfo.preferredFormats.length > 0) {
        options.format = clientInfo.preferredFormats[0];
      }
    }
    
    // Apply quality adjustments based on network and device
    if (!options.quality) {
      let quality = 80; // Default quality
      
      // Adjust quality based on network
      if (clientInfo.networkQuality === 'slow') {
        quality -= 10;
      } else if (clientInfo.networkQuality === 'fast') {
        quality += 5;
      }
      
      // Adjust quality based on device
      if (clientInfo.deviceClassification === 'low-end') {
        quality -= 5;
      } else if (clientInfo.deviceClassification === 'high-end') {
        quality += 5;
      }
      
      // Ensure quality stays within bounds
      options.quality = Math.max(30, Math.min(100, quality));
    }
    
    // Apply DPR if available and not specified
    if (!options.dpr && clientInfo.devicePixelRatio) {
      options.dpr = Math.min(clientInfo.devicePixelRatio, 3); // Cap at 3x
    }
    
    // Consider width adjustments for mobile
    if (
      !options.width && 
      clientInfo.deviceType === 'mobile' && 
      clientInfo.viewportWidth
    ) {
      const maxWidth = clientInfo.viewportWidth * (clientInfo.devicePixelRatio || 1);
      
      // If original is wider than viewport, reduce to viewport size
      if (options.width && options.width > maxWidth) {
        options.width = maxWidth;
      }
    }
    
    // If save-data is requested, prioritize compression over quality
    if (clientInfo.saveData) {
      options.quality = Math.min(options.quality || 80, 70);
      options.compression = 'fast';
    }
    
    this.logger.debug('Optimized transform options', {
      originalFormat: baseOptions.format,
      optimizedFormat: options.format,
      originalQuality: baseOptions.quality,
      optimizedQuality: options.quality,
      clientType: clientInfo.deviceType,
      networkQuality: clientInfo.networkQuality
    });
    
    return options;
  }
  
  /**
   * Determine if a client supports a specific image format
   * 
   * @param request Original request
   * @param format Format to check support for (webp, avif, etc.)
   * @returns True if format is supported
   */
  async supportsFormat(request: Request, format: string): Promise<boolean> {
    const clientInfo = await this.detectClient(request);
    const normalizedFormat = format.toLowerCase();
    
    if (normalizedFormat === 'webp') {
      return !!clientInfo.acceptsWebp;
    }
    
    if (normalizedFormat === 'avif') {
      return !!clientInfo.acceptsAvif;
    }
    
    // Default formats are always supported
    if (['jpeg', 'jpg', 'png', 'gif'].includes(normalizedFormat)) {
      return true;
    }
    
    // For other formats, check the preferred formats list
    return clientInfo.preferredFormats?.includes(normalizedFormat) || false;
  }
  
  /**
   * Get device classification based on client capabilities
   * 
   * @param request Original request
   * @returns Device classification (high-end, mid-range, low-end)
   */
  async getDeviceClassification(request: Request): Promise<'high-end' | 'mid-range' | 'low-end'> {
    const clientInfo = await this.detectClient(request);
    const classification = clientInfo.deviceClassification || 'mid-range';
    return classification;
  }
  
  /**
   * Get device classification from the capabilities
   * 
   * @param capabilities Device capabilities
   * @returns Device classification
   */
  private getDeviceClassificationFromCapabilities(capabilities: DeviceCapabilities): 'high-end' | 'mid-range' | 'low-end' {
    // Low-end devices: low memory or low processor capabilities
    if (capabilities.memory === 'low' || capabilities.processors === 'low') {
      return 'low-end';
    }
    
    // High-end devices: high memory and processor capabilities
    if (capabilities.memory === 'high' && capabilities.processors === 'high') {
      return 'high-end';
    }
    
    // Everything else is mid-range
    return 'mid-range';
  }
  
  /**
   * Get network quality classification based on client capabilities
   * 
   * @param request Original request
   * @returns Network quality (fast, medium, slow)
   */
  async getNetworkQuality(request: Request): Promise<'fast' | 'medium' | 'slow'> {
    const clientInfo = await this.detectClient(request);
    return clientInfo.networkQuality || 'medium';
  }
  
  /**
   * Clear detection cache
   */
  clearCache(): void {
    const oldSize = this.cache.size;
    this.cache.clear();
    this.logger.debug('Client detection cache cleared', { 
      previousSize: oldSize,
      currentSize: 0
    });
  }
}