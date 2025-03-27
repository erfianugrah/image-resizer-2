/**
 * Client Detection Service
 * 
 * Provides advanced client detection capabilities for optimizing image transformations
 * based on client device characteristics and network conditions.
 */

import { ImageResizerConfig } from '../config';
import { ClientDetectionService, ClientInfo, TransformOptions } from './interfaces';
import { Logger } from '../utils/logging';
import { detector, BrowserInfo, FormatSupport, ClientCapabilities } from '../utils/detector';

/**
 * Default implementation of the ClientDetectionService
 */
export class DefaultClientDetectionService implements ClientDetectionService {
  private logger: Logger;
  private detectorCacheEnabled: boolean;
  private networkQualityThresholds: {
    slow: number;
    fast: number;
  };
  private deviceScoreThresholds: {
    lowEnd: number;
    highEnd: number;
  };
  private detectionStatistics: {
    detectionCount: number;
    cacheHitCount: number;
    detectionSources: Record<string, number>;
    detectedBrowsers: Record<string, number>;
    detectedDeviceTypes: Record<string, number>;
    detectedFormatSupport: Record<string, number>;
    averageDetectionTime: number;
  };

  constructor(logger: Logger) {
    this.logger = logger;
    this.detectorCacheEnabled = true;
    this.networkQualityThresholds = {
      slow: 1.0, // Mbps
      fast: 10.0 // Mbps
    };
    this.deviceScoreThresholds = {
      lowEnd: 30,
      highEnd: 70
    };
    this.detectionStatistics = {
      detectionCount: 0,
      cacheHitCount: 0,
      detectionSources: {},
      detectedBrowsers: {},
      detectedDeviceTypes: {},
      detectedFormatSupport: {},
      averageDetectionTime: 0
    };
  }
  
  /**
   * Service lifecycle method for initialization
   * 
   * This method is called during the service container initialization phase
   * and performs any necessary setup such as:
   * - Initializing the detector cache
   * - Setting up detection statistics tracking
   * - Configuring threshold values
   * 
   * @returns Promise that resolves when initialization is complete
   */
  async initialize(): Promise<void> {
    this.logger.debug('Initializing ClientDetectionService');
    
    // Reset detection statistics
    this.detectionStatistics = {
      detectionCount: 0,
      cacheHitCount: 0,
      detectionSources: {},
      detectedBrowsers: {},
      detectedDeviceTypes: {},
      detectedFormatSupport: {
        webp: 0,
        avif: 0,
        jpeg: 0,
        png: 0,
        gif: 0
      },
      averageDetectionTime: 0
    };
    
    // Reset detector cache if necessary
    if (!this.detectorCacheEnabled) {
      detector.clearCache();
      this.logger.debug('Cleared detector cache during initialization (cache disabled)');
    }
    
    // Update detector configuration
    detector.updateConfig({
      cache: {
        enableCache: this.detectorCacheEnabled,
        maxSize: 1000,
        pruneAmount: 100
      }
    });
    
    this.logger.info('ClientDetectionService initialization complete');
    return Promise.resolve();
  }
  
  /**
   * Service lifecycle method for shutdown
   * 
   * This method is called during the service container shutdown phase
   * and performs any necessary cleanup such as:
   * - Logging detection statistics
   * - Clearing the detector cache
   * 
   * @returns Promise that resolves when shutdown is complete
   */
  async shutdown(): Promise<void> {
    this.logger.debug('Shutting down ClientDetectionService');
    
    // Log detection statistics if any detections were performed
    if (this.detectionStatistics.detectionCount > 0) {
      const cacheHitRate = Math.round(
        (this.detectionStatistics.cacheHitCount / this.detectionStatistics.detectionCount) * 100
      );
      
      this.logger.debug('Client detection statistics', {
        detectionCount: this.detectionStatistics.detectionCount,
        cacheHitCount: this.detectionStatistics.cacheHitCount,
        cacheHitRate: `${cacheHitRate}%`,
        averageDetectionTime: `${Math.round(this.detectionStatistics.averageDetectionTime)}ms`,
        detectionSources: this.detectionStatistics.detectionSources,
        mostCommonBrowser: this.getMostCommonKey(this.detectionStatistics.detectedBrowsers),
        mostCommonDeviceType: this.getMostCommonKey(this.detectionStatistics.detectedDeviceTypes),
        formatSupport: this.detectionStatistics.detectedFormatSupport
      });
    } else {
      this.logger.debug('No client detections were performed during this session');
    }
    
    // Clear the detector cache
    detector.clearCache();
    
    this.logger.info('ClientDetectionService shutdown complete');
    return Promise.resolve();
  }
  
  /**
   * Helper method to find the most common key in a record
   * 
   * @param record Record with keys and count values
   * @returns The most common key or undefined if the record is empty
   */
  private getMostCommonKey(record: Record<string, number>): string | undefined {
    if (Object.keys(record).length === 0) {
      return undefined;
    }
    
    let mostCommonKey: string | undefined;
    let highestCount = 0;
    
    Object.entries(record).forEach(([key, count]) => {
      if (count > highestCount) {
        mostCommonKey = key;
        highestCount = count;
      }
    });
    
    return mostCommonKey;
  }

  /**
   * Configure the client detection service
   * 
   * @param config Configuration options
   */
  configure(config: ImageResizerConfig): void {
    if (config.detector) {
      this.detectorCacheEnabled = config.detector.cache?.enableCache !== false;
      
      if (config.detector.deviceClassification?.thresholds) {
        this.deviceScoreThresholds = {
          lowEnd: config.detector.deviceClassification.thresholds.lowEnd || 30,
          highEnd: config.detector.deviceClassification.thresholds.highEnd || 70
        };
      }
      
      // Update detector configuration through its API
      detector.updateConfig(config.detector);
      
      this.logger.debug('Client detection service configured', {
        cacheEnabled: this.detectorCacheEnabled,
        deviceScoreThresholds: this.deviceScoreThresholds,
        hashAlgorithm: config.detector.hashAlgorithm
      });
    }
  }

  /**
   * Detect client information from the request
   */
  async detectClient(request: Request): Promise<ClientInfo> {
    const startTime = Date.now();
    this.logger.debug('Detecting client information', {
      url: request.url,
      headers: this.getSafeHeadersForLogging(request)
    });

    try {
      // Increment detection count for statistics
      this.detectionStatistics.detectionCount++;
      
      // Use the detector utility to get client capabilities
      const capabilities = await detector.detect(request, this.detectorCacheEnabled);
      
      // Track cache hit (if available) - use type assertion since this is an internal property
      // that may be added by our implementation but isn't in the base interface
      if ((capabilities as any).fromCache) {
        this.detectionStatistics.cacheHitCount++;
      }
      
      // Track detection source
      const source = capabilities.detectionSource || 'unknown';
      if (this.detectionStatistics.detectionSources[source]) {
        this.detectionStatistics.detectionSources[source]++;
      } else {
        this.detectionStatistics.detectionSources[source] = 1;
      }
      
      // Track browser information
      if (capabilities.browser?.name) {
        const browser = capabilities.browser.name.toLowerCase();
        if (this.detectionStatistics.detectedBrowsers[browser]) {
          this.detectionStatistics.detectedBrowsers[browser]++;
        } else {
          this.detectionStatistics.detectedBrowsers[browser] = 1;
        }
      }
      
      // Convert the detector result to the ClientInfo interface
      const clientInfo: ClientInfo = {
        viewportWidth: this.getViewportWidth(request, capabilities),
        devicePixelRatio: this.getDevicePixelRatio(request, capabilities),
        saveData: this.getSaveDataPreference(request, capabilities),
        acceptsWebp: capabilities.formats?.webp || false,
        acceptsAvif: capabilities.formats?.avif || false,
        deviceType: this.getDeviceType(capabilities),
        networkQuality: this.getNetworkQualityTier(capabilities),
        preferredFormats: this.getPreferredFormats(capabilities),
        deviceClassification: this.getDeviceClassificationFromCapabilities(capabilities),
        memoryConstraints: capabilities.device?.memory !== undefined
          ? capabilities.device.memory < 4
          : undefined,
        processorConstraints: capabilities.device?.processors !== undefined
          ? capabilities.device.processors < 4
          : undefined
      };
      
      // Track device type
      if (clientInfo.deviceType) {
        const deviceType = clientInfo.deviceType;
        if (this.detectionStatistics.detectedDeviceTypes[deviceType]) {
          this.detectionStatistics.detectedDeviceTypes[deviceType]++;
        } else {
          this.detectionStatistics.detectedDeviceTypes[deviceType] = 1;
        }
      }
      
      // Track format support
      if (clientInfo.acceptsWebp) {
        this.detectionStatistics.detectedFormatSupport.webp++;
      }
      if (clientInfo.acceptsAvif) {
        this.detectionStatistics.detectedFormatSupport.avif++;
      }
      
      // Track detection time
      const detectionTime = Date.now() - startTime;
      const currentAvg = this.detectionStatistics.averageDetectionTime;
      const count = this.detectionStatistics.detectionCount;
      
      // Calculate moving average for detection time
      if (currentAvg === 0) {
        this.detectionStatistics.averageDetectionTime = detectionTime;
      } else {
        this.detectionStatistics.averageDetectionTime = 
          (currentAvg * (count - 1) + detectionTime) / count;
      }

      this.logger.debug('Client detection completed', {
        deviceType: clientInfo.deviceType,
        viewportWidth: clientInfo.viewportWidth,
        dpr: clientInfo.devicePixelRatio,
        saveData: clientInfo.saveData,
        acceptsWebp: clientInfo.acceptsWebp,
        acceptsAvif: clientInfo.acceptsAvif,
        detectionMethod: capabilities.detectionSource || 'unknown',
        networkQuality: clientInfo.networkQuality,
        deviceClassification: clientInfo.deviceClassification,
        preferredFormats: clientInfo.preferredFormats?.join(','),
        detectionTime: `${detectionTime}ms`,
        fromCache: (capabilities as any).fromCache || false
      });

      return clientInfo;
    } catch (error) {
      this.logger.warn('Error detecting client information', {
        error: error instanceof Error ? error.message : String(error),
        url: request.url
      });

      // Fallback to basic detection from headers
      return this.detectFromHeaders(request);
    }
  }

  /**
   * Get optimized transformation options based on client capabilities
   */
  async getOptimizedOptions(
    request: Request,
    baseOptions: TransformOptions,
    config: ImageResizerConfig
  ): Promise<TransformOptions> {
    this.logger.debug('Getting optimized transformation options', {
      url: request.url,
      baseOptions: Object.keys(baseOptions).join(',')
    });

    try {
      // Get client info first
      const clientInfo = await this.detectClient(request);
      
      // Get optimized options from the detector
      const optimizedOptions = await detector.getOptimizedOptions(request, baseOptions);
      
      // Enhanced bandwidth-aware optimizations
      if (clientInfo.saveData || clientInfo.networkQuality === 'slow') {
        this.logger.debug('Applying bandwidth-aware optimizations', {
          saveData: clientInfo.saveData,
          networkQuality: clientInfo.networkQuality
        });
        
        // Use more aggressive compression for low bandwidth scenarios
        if (!baseOptions.quality && !optimizedOptions.quality) {
          const qualityReduction = clientInfo.saveData ? 0.7 : 0.85; // 30% or 15% reduction
          const baseQuality = 75; // Default starting point
          optimizedOptions.quality = Math.round(baseQuality * qualityReduction);
          
          this.logger.debug('Applied bandwidth-aware quality reduction', {
            newQuality: optimizedOptions.quality,
            reductionFactor: qualityReduction,
            saveData: clientInfo.saveData
          });
        }
        
        // Prioritize smaller formats when bandwidth is constrained
        if (!baseOptions.format && (!optimizedOptions.format || optimizedOptions.format === 'auto')) {
          // WebP is a good balance of compression and support
          if (clientInfo.acceptsWebp) {
            optimizedOptions.format = 'webp';
            this.logger.debug('Applied bandwidth-aware format selection', {
              format: 'webp',
              reasonBandwidthConstrained: true
            });
          }
        }
      }
      
      // Enhanced device capability optimizations
      if (clientInfo.deviceClassification === 'high-end' && !baseOptions.quality && !optimizedOptions.quality) {
        // High-end devices can handle higher quality images
        optimizedOptions.quality = 85;
        this.logger.debug('Applied device-aware quality enhancement', {
          quality: 85,
          deviceClass: 'high-end'
        });
      } else if (clientInfo.deviceClassification === 'low-end' && !baseOptions.quality && !optimizedOptions.quality) {
        // Low-end devices need more aggressive optimization
        optimizedOptions.quality = 70;
        this.logger.debug('Applied device-aware quality reduction', {
          quality: 70,
          deviceClass: 'low-end'
        });
      }
      
      // Enhanced responsive sizing
      if (!baseOptions.width && !optimizedOptions.width && clientInfo.viewportWidth) {
        // Calculate responsive width based on viewport and device pixel ratio
        const dpr = clientInfo.devicePixelRatio || 1;
        let calculatedWidth = Math.round(clientInfo.viewportWidth * dpr);
        
        // Cap at reasonable maximum for the device class
        const maxWidth = clientInfo.deviceClassification === 'high-end' ? 2500 :
          clientInfo.deviceClassification === 'low-end' ? 1200 : 1800;
        
        calculatedWidth = Math.min(calculatedWidth, maxWidth);
        
        // Round to nearest 100 for better caching
        optimizedOptions.width = Math.ceil(calculatedWidth / 100) * 100;
        optimizedOptions.optimizedWidth = optimizedOptions.width;
        
        this.logger.debug('Applied responsive width calculation', {
          viewportWidth: clientInfo.viewportWidth,
          dpr: dpr,
          calculatedWidth: calculatedWidth,
          roundedWidth: optimizedOptions.width,
          deviceClass: clientInfo.deviceClassification,
          maxWidthForClass: maxWidth
        });
      }
      
      // Forward client detection data for debugging
      if (!optimizedOptions.__clientInfo) {
        optimizedOptions.__clientInfo = {
          deviceType: clientInfo.deviceType,
          networkQuality: clientInfo.networkQuality,
          deviceClassification: clientInfo.deviceClassification,
          saveData: clientInfo.saveData,
          viewportWidth: clientInfo.viewportWidth,
          pixelRatio: clientInfo.devicePixelRatio,
          formatSupport: {
            webp: clientInfo.acceptsWebp,
            avif: clientInfo.acceptsAvif
          }
        };
      }

      // Merge with base options to create final options (base options take precedence)
      return {
        ...optimizedOptions,
        ...baseOptions
      };
    } catch (error) {
      this.logger.warn('Error optimizing transformation options', {
        error: error instanceof Error ? error.message : String(error),
        url: request.url
      });

      // Return original options as fallback
      return baseOptions;
    }
  }

  /**
   * Determine if a client supports a specific image format
   */
  async supportsFormat(request: Request, format: string): Promise<boolean> {
    this.logger.debug('Checking format support', {
      url: request.url,
      format
    });

    try {
      // Get client capabilities
      const capabilities = await detector.detect(request, this.detectorCacheEnabled);
      
      // Check format support
      switch (format.toLowerCase()) {
      case 'webp':
        return capabilities.formats?.webp || false;
      case 'avif':
        return capabilities.formats?.avif || false;
      case 'jpeg':
      case 'jpg':
      case 'png':
      case 'gif':
        return true; // Always supported
      default:
        this.logger.warn('Unknown format for support check', { format });
        return false;
      }
    } catch (error) {
      this.logger.warn('Error checking format support', {
        error: error instanceof Error ? error.message : String(error),
        url: request.url,
        format
      });

      // Fallback to conservative approach
      return format.toLowerCase() === 'jpeg' || 
             format.toLowerCase() === 'jpg' || 
             format.toLowerCase() === 'png' || 
             format.toLowerCase() === 'gif';
    }
  }

  /**
   * Get device classification based on client capabilities
   */
  async getDeviceClassification(request: Request): Promise<'high-end' | 'mid-range' | 'low-end'> {
    this.logger.debug('Getting device classification', {
      url: request.url
    });

    try {
      // Get client capabilities
      const capabilities = await detector.detect(request, this.detectorCacheEnabled);
      
      return this.getDeviceClassificationFromCapabilities(capabilities);
    } catch (error) {
      this.logger.warn('Error getting device classification', {
        error: error instanceof Error ? error.message : String(error),
        url: request.url
      });

      // Fallback to mid-range assumption
      return 'mid-range';
    }
  }

  /**
   * Get network quality classification based on client capabilities
   */
  async getNetworkQuality(request: Request): Promise<'fast' | 'medium' | 'slow'> {
    this.logger.debug('Getting network quality', {
      url: request.url
    });

    try {
      // Get client capabilities
      const capabilities = await detector.detect(request, this.detectorCacheEnabled);
      
      // Check network tier
      if (capabilities.network) {
        return capabilities.network.tier as 'fast' | 'medium' | 'slow';
      }
      
      return 'medium';
    } catch (error) {
      this.logger.warn('Error getting network quality', {
        error: error instanceof Error ? error.message : String(error),
        url: request.url
      });

      // Fallback to medium assumption
      return 'medium';
    }
  }

  /**
   * Clear detection cache
   */
  clearCache(): void {
    this.logger.debug('Clearing client detection cache');
    detector.clearCache();
  }

  /**
   * Helper method to get viewport width
   */
  private getViewportWidth(request: Request, capabilities: ClientCapabilities): number | undefined {
    // Try to get from client hints first
    if (capabilities.clientHints?.viewportWidth) {
      return capabilities.clientHints.viewportWidth;
    }
    
    // Fall back to Viewport-Width header
    const viewportWidth = request.headers.get('Viewport-Width');
    if (viewportWidth) {
      const width = parseInt(viewportWidth, 10);
      if (!isNaN(width)) {
        return width;
      }
    }
    
    // No viewport width available
    return undefined;
  }

  /**
   * Helper method to get device pixel ratio
   */
  private getDevicePixelRatio(request: Request, capabilities: ClientCapabilities): number | undefined {
    // Try to get from client hints first
    if (capabilities.clientHints?.dpr) {
      return capabilities.clientHints.dpr;
    }
    
    // Fall back to DPR header
    const dpr = request.headers.get('DPR');
    if (dpr) {
      const ratio = parseFloat(dpr);
      if (!isNaN(ratio)) {
        return ratio;
      }
    }
    
    // No DPR available
    return undefined;
  }

  /**
   * Helper method to get Save-Data preference
   */
  private getSaveDataPreference(request: Request, capabilities: ClientCapabilities): boolean {
    // Try to get from client hints first
    if (capabilities.clientHints?.saveData !== undefined) {
      return capabilities.clientHints.saveData;
    }
    
    // Fall back to Save-Data header
    const saveData = request.headers.get('Save-Data');
    if (saveData) {
      return saveData.toLowerCase() === 'on';
    }
    
    // No Save-Data preference available
    return false;
  }

  /**
   * Helper method to get device type
   */
  private getDeviceType(capabilities: ClientCapabilities): 'mobile' | 'tablet' | 'desktop' | 'unknown' {
    // Check browser mobile flag
    if (capabilities.browser?.mobile) {
      // Try to distinguish between mobile and tablet
      const userAgent = capabilities.browser?.name?.toLowerCase() || '';
      
      if (userAgent.includes('ipad') || 
          userAgent.includes('tablet') || 
          (userAgent.includes('android') && !userAgent.includes('mobile'))) {
        return 'tablet';
      }
      
      return 'mobile';
    }
    
    // Check if device class is explicitly set
    if (capabilities.device?.class) {
      if (capabilities.device.class === 'mobile' || capabilities.device.class === 'tablet') {
        return capabilities.device.class;
      }
    }
    
    // Default to desktop for non-mobile browsers
    return 'desktop';
  }

  /**
   * Helper method to get network quality tier from capabilities
   */
  private getNetworkQualityTier(capabilities: ClientCapabilities): 'fast' | 'medium' | 'slow' | undefined {
    if (capabilities.network?.tier) {
      return capabilities.network.tier as 'fast' | 'medium' | 'slow';
    }
    
    // Check if we have effective connection type or downlink information
    const downlink = capabilities.clientHints?.downlink;
    if (downlink !== undefined) {
      // Downlink is in Mbps
      if (downlink <= this.networkQualityThresholds.slow) {
        return 'slow';
      } else if (downlink >= this.networkQualityThresholds.fast) {
        return 'fast';
      } else {
        return 'medium';
      }
    }
    
    // No network information available
    return undefined;
  }

  /**
   * Helper method to get device classification from capabilities
   */
  private getDeviceClassificationFromCapabilities(capabilities: ClientCapabilities): 'high-end' | 'mid-range' | 'low-end' {
    // Check device score
    if (capabilities.device?.score !== undefined) {
      const score = capabilities.device.score;
      
      if (score >= this.deviceScoreThresholds.highEnd) {
        return 'high-end';
      } else if (score <= this.deviceScoreThresholds.lowEnd) {
        return 'low-end';
      }
    }
    
    // Check memory and processors as fallback indicators
    if (capabilities.device?.memory !== undefined || capabilities.device?.processors !== undefined) {
      // Score based on memory and processors combined
      let score = 50; // Start at mid-range
      
      if (capabilities.device.memory !== undefined) {
        // Adjust score based on device memory
        if (capabilities.device.memory >= 8) {
          score += 20; // High memory
        } else if (capabilities.device.memory <= 2) {
          score -= 20; // Low memory
        } else {
          score += (capabilities.device.memory - 4) * 5; // Scale around 4GB
        }
      }
      
      if (capabilities.device.processors !== undefined) {
        // Adjust score based on processor count
        if (capabilities.device.processors >= 8) {
          score += 20; // Many cores
        } else if (capabilities.device.processors <= 2) {
          score -= 20; // Few cores
        } else {
          score += (capabilities.device.processors - 4) * 5; // Scale around 4 cores
        }
      }
      
      // Normalize to thresholds
      if (score >= this.deviceScoreThresholds.highEnd) {
        return 'high-end';
      } else if (score <= this.deviceScoreThresholds.lowEnd) {
        return 'low-end';
      }
    }
    
    // Default to mid-range if not enough information
    return 'mid-range';
  }

  /**
   * Helper method to get preferred formats based on capabilities
   */
  private getPreferredFormats(capabilities: ClientCapabilities): string[] {
    const formats: string[] = [];
    
    // Check for AVIF support first (best compression)
    if (capabilities.formats?.avif) {
      formats.push('avif');
    }
    
    // Check for WebP support
    if (capabilities.formats?.webp) {
      formats.push('webp');
    }
    
    // Add standard formats
    formats.push('jpeg', 'png');
    
    // Always add GIF for animated content support
    formats.push('gif');
    
    // Ensure webp is included if supported (for animated webp)
    if (capabilities.formats?.webp && !formats.includes('webp')) {
      formats.push('webp');
    }
    
    return formats;
  }

  /**
   * Helper method to detect client info from headers as fallback
   */
  private detectFromHeaders(request: Request): ClientInfo {
    this.logger.debug('Detecting client info from headers (fallback method)', {
      url: request.url,
      headers: this.getSafeHeadersForLogging(request)
    });

    // Get headers
    const userAgent = request.headers.get('User-Agent') || '';
    const acceptHeader = request.headers.get('Accept') || '';
    const viewportWidthHeader = request.headers.get('Viewport-Width');
    const dprHeader = request.headers.get('DPR');
    const saveDataHeader = request.headers.get('Save-Data');
    const downlinkHeader = request.headers.get('Downlink');
    const rttHeader = request.headers.get('RTT');
    const ectHeader = request.headers.get('ECT');

    // Parse viewport width
    let viewportWidth: number | undefined;
    if (viewportWidthHeader) {
      const width = parseInt(viewportWidthHeader, 10);
      if (!isNaN(width)) {
        viewportWidth = width;
      }
    }

    // Parse DPR
    let devicePixelRatio: number | undefined;
    if (dprHeader) {
      const ratio = parseFloat(dprHeader);
      if (!isNaN(ratio)) {
        devicePixelRatio = ratio;
      }
    }

    // Parse Save-Data
    const saveData = saveDataHeader === 'on';

    // Detect network quality
    let networkQuality: 'fast' | 'medium' | 'slow' | undefined;
    if (downlinkHeader || ectHeader) {
      const downlink = parseFloat(downlinkHeader || '0');
      
      if (ectHeader) {
        // ECT header values: slow-2g, 2g, 3g, 4g
        switch (ectHeader.toLowerCase()) {
        case 'slow-2g':
        case '2g':
          networkQuality = 'slow';
          break;
        case '3g':
          networkQuality = 'medium';
          break;
        case '4g':
          networkQuality = 'fast';
          break;
        }
      } else if (!isNaN(downlink)) {
        // Downlink is in Mbps
        if (downlink < this.networkQualityThresholds.slow) {
          networkQuality = 'slow';
        } else if (downlink > this.networkQualityThresholds.fast) {
          networkQuality = 'fast';
        } else {
          networkQuality = 'medium';
        }
      }
    }

    // Detect device type from User-Agent
    let deviceType: 'mobile' | 'tablet' | 'desktop' | 'unknown' = 'unknown';
    
    if (userAgent) {
      const mobileRegex = /Mobile|Android|iPhone|iPad|iPod/i;
      const tabletRegex = /iPad|Android(?!.*Mobile)/i;
      
      if (tabletRegex.test(userAgent)) {
        deviceType = 'tablet';
      } else if (mobileRegex.test(userAgent)) {
        deviceType = 'mobile';
      } else {
        deviceType = 'desktop';
      }
    }

    // Detect format support from Accept header
    const acceptsWebp = acceptHeader.includes('image/webp');
    const acceptsAvif = acceptHeader.includes('image/avif');

    // Determine preferred formats
    const preferredFormats: string[] = [];
    if (acceptsAvif) {
      preferredFormats.push('avif');
    }
    if (acceptsWebp) {
      preferredFormats.push('webp');
    }
    preferredFormats.push('jpeg', 'png');

    // Determine device classification based on device type and user agent
    let deviceClassification: 'high-end' | 'mid-range' | 'low-end' = 'mid-range';
    if (deviceType === 'desktop') {
      deviceClassification = 'high-end';
    } else if (deviceType === 'mobile') {
      // Check for low-end devices
      if (userAgent.includes('Android') && 
          (userAgent.includes('4.') || userAgent.includes('5.'))) {
        // Older Android versions tend to be low-end
        deviceClassification = 'low-end';
      } else if (userAgent.includes('iPhone') && 
                (userAgent.includes('iPhone 5') || userAgent.includes('iPhone 6'))) {
        // Older iPhone models
        deviceClassification = 'low-end';
      }
    }

    // Enhanced fallback client info with more properties
    return {
      viewportWidth,
      devicePixelRatio,
      saveData,
      acceptsWebp,
      acceptsAvif,
      deviceType,
      networkQuality,
      preferredFormats,
      deviceClassification,
      // Memory constraints unknown in header-only detection
      memoryConstraints: undefined,
      processorConstraints: undefined
    };
  }

  /**
   * Get safe headers for logging (filtering out sensitive information)
   */
  private getSafeHeadersForLogging(request: Request): Record<string, string> {
    const safeHeaders: Record<string, string> = {};
    const safeHeaderNames = [
      'User-Agent',
      'Accept',
      'Accept-Encoding',
      'Viewport-Width',
      'DPR',
      'Save-Data',
      'Sec-CH-UA',
      'Sec-CH-UA-Mobile',
      'Sec-CH-UA-Platform',
      'Sec-CH-Viewport-Width',
      'Sec-CH-DPR',
      'Sec-CH-Save-Data',
      'Downlink',
      'RTT',
      'ECT',
      'Device-Memory',
      'Sec-CH-Device-Memory',
      'Sec-CH-Prefers-Reduced-Motion',
      'Sec-CH-Prefers-Color-Scheme'
    ];

    for (const name of safeHeaderNames) {
      const value = request.headers.get(name);
      if (value) {
        safeHeaders[name] = value;
      }
    }

    return safeHeaders;
  }
}