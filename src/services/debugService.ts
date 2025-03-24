/**
 * Enhanced implementation of the DebugService
 * 
 * Provides detailed debug information, HTML reports with visualizations,
 * and performance metrics for the image resizer.
 */

import { ImageResizerConfig } from '../config';
import { PerformanceMetrics } from '../debug';
import { Logger } from '../utils/logging';
import { DebugService, StorageResult, ClientInfo, TransformOptions } from './interfaces';

// Enhanced interface for debug visualization data
interface DebugVisualizationData {
  // Request flow visualization
  requestFlow: {
    steps: Array<{
      name: string;
      duration: number;
      startTime: number;
      endTime: number;
      success: boolean;
      notes?: string;
    }>;
    totalDuration: number;
  };
  
  // Image comparison data
  imageComparison: {
    original: {
      url: string;
      size: number;
      width?: number;
      height?: number;
      contentType: string;
    };
    transformed: {
      url: string;
      estimatedSize?: number;
      width?: number;
      height?: number;
      transformOptions: Record<string, any>;
    };
  };
  
  // Client detection information
  clientInfo?: ClientInfo;
  
  // Cache strategy information
  cacheInfo: {
    method: string;
    ttl: number;
    cacheEverything: boolean;
    cacheTags: string[];
    bypassCache: boolean;
  };
  
  // Storage access information
  storageInfo: {
    sourceType: string;
    path?: string;
    originalUrl?: string;
    storageTime: number;
    priority: string[];
  };
}

export class DefaultDebugService implements DebugService {
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  /**
   * Add debug headers to a response
   * 
   * This enhanced version adds more detailed headers including:
   * - Transformation parameters with better categorization
   * - Storage metrics and source information
   * - Cache strategy details
   * - Client detection information
   * - Performance metrics breakdown
   */
  addDebugHeaders(
    response: Response,
    request: Request,
    storageResult: StorageResult,
    options: TransformOptions,
    config: ImageResizerConfig,
    metrics: PerformanceMetrics,
    url: URL
  ): Response {
    // Check if debug is enabled
    if (!this.isDebugEnabled(request, config)) {
      return response;
    }

    this.logger.debug('Adding enhanced debug headers', { 
      url: url.toString(),
      debugEnabled: true,
      headerCategories: config.debug.headers || [],
      transformOptions: Object.keys(options),
      metricsAvailable: !!metrics
    });

    // Create a new response with the same body but new headers
    const newResponse = new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: new Headers(response.headers)
    });
    
    // Get configurable header names or use defaults
    const headerNames = config.debug.headerNames || {};
    
    // Add basic debug headers
    newResponse.headers.set(headerNames.debugEnabled || 'X-Debug-Enabled', 'true');
    newResponse.headers.set(headerNames.version || 'X-Image-Resizer-Version', config.version);
    newResponse.headers.set(headerNames.environment || 'X-Environment', config.environment);
    
    // Add processing mode and source headers
    newResponse.headers.set(headerNames.processingMode || 'X-Processing-Mode', 'cf-transform');
    
    // Add responsive sizing info
    if (options.width) {
      newResponse.headers.set('X-Actual-Width', options.width.toString());
      
      // Was this width determined responsively?
      const isResponsive = request.headers.has('Viewport-Width') || request.headers.has('DPR');
      newResponse.headers.set('X-Responsive-Sizing', isResponsive ? 'true' : 'false');
    }
    
    // Forward Warning headers if any (Cloudflare Image Resizing sends validation warnings here)
    const warningHeader = response.headers.get('Warning');
    if (warningHeader) {
      newResponse.headers.set('Warning', warningHeader);
    }
    
    // Add storage debug headers
    newResponse.headers.set(headerNames.storageType || 'X-Storage-Type', storageResult.sourceType);
    if (storageResult.contentType) {
      newResponse.headers.set(headerNames.originalContentType || 'X-Original-Content-Type', storageResult.contentType);
    }
    if (storageResult.size) {
      newResponse.headers.set(headerNames.originalSize || 'X-Original-Size', storageResult.size.toString());
    }
    if (storageResult.originalUrl) {
      newResponse.headers.set(headerNames.originalUrl || 'X-Original-URL', storageResult.originalUrl);
    }
    
    // Add storage priority information
    newResponse.headers.set('X-Storage-Priority', config.storage.priority.join(','));
    newResponse.headers.set('X-R2-Enabled',
      (config.storage.r2.enabled && config.storage.priority.includes('r2')).toString());
    
    // Add cache tag information if enabled
    if (config.cache.cacheTags?.enabled && storageResult.path) {
      try {
        // Import the CacheService for this instead of directly using the utility
        const cacheTags = this.generateCacheTags(storageResult.path || '', options, config);
        if (cacheTags.length > 0) {
          newResponse.headers.set('X-Cache-Tags', cacheTags.join(', '));
        }
      } catch (error) {
        this.logger.error('Error generating debug cache tags', { 
          error: error instanceof Error ? error.message : String(error),
          path: storageResult.path
        });
      }
    }
    
    // Add transformation debug headers
    if (options) {
      // Clean the transform options for header value (no nested objects)
      const cleanOptions: Record<string, string> = {};
      Object.keys(options).forEach(key => {
        const value = options[key];
        if (value !== undefined && value !== null && typeof value !== 'object') {
          cleanOptions[key] = String(value);
        }
      });
      
      // Add individual headers for each transform option
      Object.keys(cleanOptions).forEach(key => {
        newResponse.headers.set(`X-Transform-${key}`, cleanOptions[key]);
      });
      
      // Add JSON string of all options for convenience
      try {
        newResponse.headers.set('X-Transform-Options', JSON.stringify(cleanOptions));
      } catch (e) {
        // Ignore JSON errors
      }
    }
    
    // Add performance metrics if enabled
    if (config.debug.includePerformance && metrics) {
      const now = Date.now();
      metrics.end = metrics.end || now;
      
      // Calculate time spent in each phase
      const totalTime = metrics.end - metrics.start;
      
      newResponse.headers.set('X-Performance-Total-Ms', totalTime.toString());
      
      if (metrics.storageStart && metrics.storageEnd) {
        const storageTime = metrics.storageEnd - metrics.storageStart;
        newResponse.headers.set('X-Performance-Storage-Ms', storageTime.toString());
      }
      
      if (metrics.transformStart && metrics.transformEnd) {
        const transformTime = metrics.transformEnd - metrics.transformStart;
        newResponse.headers.set('X-Performance-Transform-Ms', transformTime.toString());
      }
      
      if (metrics.detectionStart && metrics.detectionEnd) {
        const detectionTime = metrics.detectionEnd - metrics.detectionStart;
        newResponse.headers.set('X-Performance-Detection-Ms', detectionTime.toString());
        
        // Add detection source if available
        if (metrics.detectionSource) {
          newResponse.headers.set('X-Detection-Source', metrics.detectionSource);
        }
      }
    }
    
    // Add request details if in verbose mode
    if (config.debug.verbose) {
      
      newResponse.headers.set('X-Request-Path', url.pathname);
      newResponse.headers.set('X-Request-Query', url.search);
      
      // Add client hints
      const dpr = request.headers.get('DPR');
      const viewportWidth = request.headers.get('Viewport-Width');
      const viewportHeight = request.headers.get('Viewport-Height');
      
      if (dpr) {
        newResponse.headers.set('X-Client-DPR', dpr);
      }
      
      if (viewportWidth) {
        newResponse.headers.set('X-Client-Viewport-Width', viewportWidth);
      }
      
      if (viewportHeight) {
        newResponse.headers.set('X-Client-Viewport-Height', viewportHeight);
      }
      
      // Add user agent
      const userAgent = request.headers.get('User-Agent');
      if (userAgent) {
        newResponse.headers.set('X-Client-User-Agent', userAgent);
        
        // Add device detection info
        const isMobile = /Mobile|Android|iPhone|iPad|iPod/i.test(userAgent);
        const isTablet = /iPad|Android(?!.*Mobile)/i.test(userAgent);
        
        let deviceType = 'desktop';
        if (isMobile && !isTablet) {
          deviceType = 'mobile';
        } else if (isTablet) {
          deviceType = 'tablet';
        }
        
        newResponse.headers.set('X-Device-Type', deviceType);
      }
      
      // Add original URL path for troubleshooting
      newResponse.headers.set('X-Original-Path', url.pathname);
      
      // Add derivative info if available
      if (options.derivative) {
        newResponse.headers.set('X-Derivative-Template', options.derivative.toString());
      }
    }
    
    return newResponse;
  }

  /**
   * Create an enhanced debug HTML report with visualizations
   * 
   * This version includes:
   * - Interactive performance visualizations
   * - Side-by-side image comparison
   * - Transformation parameter visualization
   * - Request flow diagram
   * - Interactive parameter exploration
   */
  createDebugHtmlReport(
    request: Request,
    storageResult: StorageResult,
    options: TransformOptions,
    config: ImageResizerConfig,
    metrics: PerformanceMetrics,
    clientInfo?: ClientInfo
  ): Response {
    this.logger.debug('Creating enhanced debug HTML report', {
      url: request.url,
      options: Object.keys(options),
      metricsAvailable: !!metrics,
      clientInfoAvailable: !!clientInfo
    });

    // Prepare visualization data for the enhanced report
    const visualizationData = this.prepareVisualizationData(
      request,
      storageResult,
      options,
      config,
      metrics,
      clientInfo
    );

    try {
      // Try to use the enhanced HTML report generator first
      return this.createEnhancedHtmlReport(
        request,
        storageResult,
        options,
        config,
        metrics,
        visualizationData
      );
    } catch (error) {
      // Log the error
      this.logger.error('Error generating enhanced HTML report', {
        error: error instanceof Error ? error.message : String(error),
        url: request.url
      });
      
      // Fall back to the basic HTML generator
      this.logger.debug('Falling back to basic HTML report due to error', {
        url: request.url
      });
      
      // Generate a basic HTML report without the advanced visualizations
      const url = new URL(request.url);
      const now = Date.now();
      metrics.end = metrics.end || now;
      
      // Calculate timing information
      const totalTime = metrics.end - metrics.start;
      let storageTime = 0;
      let transformTime = 0;
      
      if (metrics.storageStart && metrics.storageEnd) {
        storageTime = metrics.storageEnd - metrics.storageStart;
      }
      
      if (metrics.transformStart && metrics.transformEnd) {
        transformTime = metrics.transformEnd - metrics.transformStart;
      }
      
      // Build the HTML content
      const html = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Image Resizer Debug Report</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
              line-height: 1.6;
              color: #333;
              max-width: 800px;
              margin: 0 auto;
              padding: 20px;
            }
            h1 {
              border-bottom: 1px solid #eee;
              padding-bottom: 10px;
              margin-bottom: 20px;
            }
            h2 {
              margin-top: 30px;
              margin-bottom: 10px;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 20px;
            }
            th, td {
              padding: 8px;
              text-align: left;
              border-bottom: 1px solid #ddd;
            }
            th {
              background-color: #f2f2f2;
            }
            .timing {
              font-weight: bold;
            }
            .preview {
              max-width: 400px;
              max-height: 400px;
              display: block;
              margin: 20px 0;
              border: 1px solid #ddd;
            }
            pre {
              background-color: #f5f5f5;
              padding: 10px;
              border-radius: 4px;
              overflow-x: auto;
            }
          </style>
        </head>
        <body>
          <h1>Image Resizer Debug Report</h1>
          
          <h2>Request Details</h2>
          <table>
            <tr>
              <th>Property</th>
              <th>Value</th>
            </tr>
            <tr>
              <td>URL</td>
              <td>${request.url}</td>
            </tr>
            <tr>
              <td>Path</td>
              <td>${url.pathname}</td>
            </tr>
            <tr>
              <td>Method</td>
              <td>${request.method}</td>
            </tr>
            <tr>
              <td>Timestamp</td>
              <td>${new Date().toISOString()}</td>
            </tr>
            <tr>
              <td>Environment</td>
              <td>${config.environment}</td>
            </tr>
            ${config.features?.enableAkamaiCompatibility ? `
            <tr>
              <td>Akamai Compatibility</td>
              <td>Enabled</td>
            </tr>
            ` : ''}
          </table>
          
          <h2>Performance Metrics</h2>
          <table>
            <tr>
              <th>Operation</th>
              <th>Time (ms)</th>
              <th>Percentage</th>
            </tr>
            <tr>
              <td>Storage</td>
              <td class="timing">${storageTime}</td>
              <td>${totalTime ? Math.round((storageTime / totalTime) * 100) : 0}%</td>
            </tr>
            <tr>
              <td>Transformation</td>
              <td class="timing">${transformTime}</td>
              <td>${totalTime ? Math.round((transformTime / totalTime) * 100) : 0}%</td>
            </tr>
            ${metrics.detectionStart && metrics.detectionEnd ? `
            <tr>
              <td>Client Detection${metrics.detectionSource ? ` (${metrics.detectionSource})` : ''}</td>
              <td class="timing">${metrics.detectionEnd - metrics.detectionStart}</td>
              <td>${totalTime ? Math.round(((metrics.detectionEnd - metrics.detectionStart) / totalTime) * 100) : 0}%</td>
            </tr>
            ` : ''}
            <tr>
              <td>Other</td>
              <td class="timing">${totalTime - storageTime - transformTime - (metrics.detectionStart && metrics.detectionEnd ? metrics.detectionEnd - metrics.detectionStart : 0)}</td>
              <td>${totalTime ? Math.round(((totalTime - storageTime - transformTime - (metrics.detectionStart && metrics.detectionEnd ? metrics.detectionEnd - metrics.detectionStart : 0)) / totalTime) * 100) : 0}%</td>
            </tr>
            <tr>
              <td><strong>Total</strong></td>
              <td class="timing"><strong>${totalTime}</strong></td>
              <td>100%</td>
            </tr>
          </table>
          
          <h2>Storage Information</h2>
          <table>
            <tr>
              <th>Property</th>
              <th>Value</th>
            </tr>
            <tr>
              <td>Source Type</td>
              <td>${storageResult.sourceType}</td>
            </tr>
            <tr>
              <td>Storage Priority</td>
              <td>${config.storage.priority.join(', ')}</td>
            </tr>
            <tr>
              <td>R2 Enabled</td>
              <td>${(config.storage.r2.enabled && config.storage.priority.includes('r2')).toString()}</td>
            </tr>
            <tr>
              <td>Content Type</td>
              <td>${storageResult.contentType || 'Unknown'}</td>
            </tr>
            <tr>
              <td>Size</td>
              <td>${storageResult.size ? `${storageResult.size} bytes (${Math.round(storageResult.size / 1024)} KB)` : 'Unknown'}</td>
            </tr>
            ${storageResult.originalUrl ? `
            <tr>
              <td>Original URL</td>
              <td>${storageResult.originalUrl}</td>
            </tr>
            ` : ''}
            ${storageResult.path && config.cache.cacheTags?.enabled ? `
            <tr>
              <td>Cache Tags</td>
              <td>${(() => {
                try {
                  const cacheTags = this.generateCacheTags(storageResult.path || '', options, config);
                  return cacheTags.length > 0 ? cacheTags.join(', ') : 'None';
                } catch (e) {
                  return 'Error generating cache tags';
                }
              })()}</td>
            </tr>
            ` : ''}
          </table>
          
          <h2>Transformation Options</h2>
          <pre>${JSON.stringify(options, null, 2)}</pre>
          
          <h2>Configuration</h2>
          <pre>${JSON.stringify(config, null, 2)}</pre>
          
          <h2>Image Preview</h2>
          <p>This is the transformed image:</p>
          <img src="${request.url}" class="preview" alt="Transformed image">
        </body>
        </html>
      `;
      
      return new Response(html, {
        headers: {
          'Content-Type': 'text/html;charset=UTF-8',
          'Cache-Control': 'no-store'
        }
      });
    }
  }

  /**
   * Check if debug mode is enabled with enhanced logging
   */
  isDebugEnabled(
    request: Request,
    config: ImageResizerConfig
  ): boolean {
    this.logger.breadcrumb('Checking if debug is enabled', undefined, {
      debugEnabledInConfig: config.debug.enabled,
      environment: config.environment,
      forceDebugHeaders: config.debug.forceDebugHeaders === true
    });
    
    // Check if debug is forcefully enabled via config
    if (config.debug.forceDebugHeaders) {
      this.logger.breadcrumb('Debug forcefully enabled via config');
      return true;
    }
    
    // Check if debug is enabled in config
    if (!config.debug.enabled) {
      this.logger.breadcrumb('Debug disabled in config');
      return false;
    }
    
    // Check if debug is allowed in the current environment
    // Skip this check if allowedEnvironments is not defined or is empty
    if (config.debug.allowedEnvironments && 
        config.debug.allowedEnvironments.length > 0 && 
        !config.debug.allowedEnvironments.includes(config.environment)) {
      this.logger.breadcrumb('Debug not allowed in current environment', undefined, {
        environment: config.environment,
        allowedEnvironments: config.debug.allowedEnvironments.join(',')
      });
      return false;
    }
    
    // Check for debug flag in query string or headers
    const url = new URL(request.url);
    const debugParam = url.searchParams.get('debug');
    const debugHeader = request.headers.get('X-Debug');
    
    // If debug is explicitly requested via query or header, enable it
    if (debugParam === 'true' || debugHeader === 'true') {
      return true;
    }
    
    // If debug is explicitly disabled via query or header, disable it
    if (debugParam === 'false' || debugHeader === 'false') {
      return false;
    }
    
    // Otherwise, use the config default
    const enabled = config.debug.enabled;
    
    if (enabled) {
      this.logger.debug('Debug mode enabled for request', {
        url: request.url,
        debugConfig: {
          enabled: config.debug.enabled,
          forceDebugHeaders: config.debug.forceDebugHeaders || false,
          allowedEnvironmentsStr: config.debug.allowedEnvironments ? config.debug.allowedEnvironments.join(',') : '',
          environment: config.environment,
          headersStr: config.debug.headers ? config.debug.headers.join(',') : '',
          verbose: config.debug.verbose,
          isDebugQueryParam: url.searchParams.has('debug')
        }
      });
    }
    
    return enabled;
  }

  /**
   * Get detailed debug information for the current request
   * 
   * @param request Original request
   * @param storageResult Storage result
   * @param options Transformation options
   * @param config Application configuration
   * @param metrics Performance metrics
   * @returns Object with debug information
   */
  getDebugInfo(
    request: Request,
    storageResult: StorageResult,
    options: TransformOptions,
    config: ImageResizerConfig,
    metrics: PerformanceMetrics
  ): Record<string, any> {
    const url = new URL(request.url);
    const now = Date.now();
    metrics.end = metrics.end || now;
    
    // Calculate timing information
    const totalTime = metrics.end - metrics.start;
    let storageTime = 0;
    let transformTime = 0;
    let detectionTime = 0;
    
    if (metrics.storageStart && metrics.storageEnd) {
      storageTime = metrics.storageEnd - metrics.storageStart;
    }
    
    if (metrics.transformStart && metrics.transformEnd) {
      transformTime = metrics.transformEnd - metrics.transformStart;
    }
    
    if (metrics.detectionStart && metrics.detectionEnd) {
      detectionTime = metrics.detectionEnd - metrics.detectionStart;
    }
    
    // Extract transformation values for display
    const transformValues: Record<string, any> = {};
    Object.keys(options).forEach(key => {
      const value = options[key as keyof typeof options];
      if (value !== undefined && value !== null) {
        if (typeof value !== 'object') {
          transformValues[key] = String(value);
        } else {
          // Attempt to JSON stringify objects
          try {
            transformValues[key] = JSON.stringify(value);
          } catch (e) {
            transformValues[key] = '[Complex Object]';
          }
        }
      }
    });
    
    // Calculate estimated output size if the original size is known
    let estimatedOutputSize: number | undefined;
    
    if (storageResult.size) {
      // Make a very rough estimate based on format and quality
      const originalSize = storageResult.size;
      const format = options.format || 'auto';
      const quality = options.quality || config.responsive.quality || 85;
      
      // Basic compression ratio estimates by format
      const compressionRatios: Record<string, number> = {
        'webp': 0.6,    // WebP typically achieves 30-40% reduction
        'avif': 0.4,    // AVIF typically achieves 50-60% reduction
        'jpeg': 0.8,    // JPEG standard compression
        'png': 0.9,     // PNG standard compression
        'auto': 0.6     // Assume WebP as default for auto
      };
      
      // Adjust for quality (simplified linear approach)
      const qualityFactor = quality / 100;
      
      // Apply format ratio and quality adjustment
      const formatRatio = compressionRatios[format] || 0.7;
      estimatedOutputSize = Math.round(originalSize * formatRatio * (0.5 + 0.5 * qualityFactor));
      
      // Adjust for dimensions if resizing
      if (options.width && storageResult.width && options.width < storageResult.width) {
        const dimensionRatio = (options.width * options.width) / (storageResult.width * storageResult.width);
        estimatedOutputSize = Math.round(estimatedOutputSize * dimensionRatio);
      }
    }
    
    return {
      request: {
        url: request.url,
        path: url.pathname,
        method: request.method,
        timestamp: new Date().toISOString(),
        query: Object.fromEntries(url.searchParams.entries()),
        headers: this.getHeadersInfo(request)
      },
      environment: {
        type: config.environment,
        version: config.version,
        features: config.features || {}
      },
      performance: {
        total: {
          time: totalTime,
          percentage: 100
        },
        storage: {
          time: storageTime,
          percentage: totalTime ? Math.round((storageTime / totalTime) * 100) : 0
        },
        transform: {
          time: transformTime,
          percentage: totalTime ? Math.round((transformTime / totalTime) * 100) : 0
        },
        detection: {
          time: detectionTime,
          percentage: totalTime ? Math.round((detectionTime / totalTime) * 100) : 0,
          source: metrics.detectionSource
        },
        other: {
          time: totalTime - storageTime - transformTime - detectionTime,
          percentage: totalTime ? Math.round(((totalTime - storageTime - transformTime - detectionTime) / totalTime) * 100) : 0
        }
      },
      storage: {
        sourceType: storageResult.sourceType,
        priority: config.storage.priority.join(', '),
        r2Enabled: (config.storage.r2.enabled && config.storage.priority.includes('r2')),
        contentType: storageResult.contentType || 'Unknown',
        size: storageResult.size,
        formattedSize: storageResult.size ? `${Math.round(storageResult.size / 1024)} KB` : 'Unknown',
        originalUrl: storageResult.originalUrl,
        path: storageResult.path,
        dimensions: storageResult.width && storageResult.height 
          ? `${storageResult.width}×${storageResult.height}` 
          : 'Unknown'
      },
      transformation: {
        ...transformValues,
        derivative: options.derivative,
        estimatedOutputSize,
        estimatedOutputSizeFormatted: estimatedOutputSize 
          ? `${Math.round(estimatedOutputSize / 1024)} KB` 
          : 'Unknown',
        compressionRatio: estimatedOutputSize && storageResult.size 
          ? Math.round((estimatedOutputSize / storageResult.size) * 100) + '%' 
          : 'Unknown'
      },
      cache: {
        method: config.cache.method,
        ttl: this.getTtlForResponse(new Response(), config),
        cacheEverything: config.cache.cacheEverything,
        useTtlByStatus: config.cache.useTtlByStatus,
        statusRanges: config.cache.statusRanges
      }
    };
  }
  
  /**
   * Create enhanced HTML report with visualizations
   */
  private createEnhancedHtmlReport(
    request: Request,
    storageResult: StorageResult,
    options: TransformOptions,
    config: ImageResizerConfig,
    metrics: PerformanceMetrics,
    visualizationData: DebugVisualizationData
  ): Response {
    // Import our enhanced visualization module
    const { createEnhancedHtmlReport } = require('./debugVisualization');
    
    try {
      // Use the enhanced report generator with our visualization data
      return createEnhancedHtmlReport(
        request,
        storageResult,
        options,
        config,
        metrics,
        visualizationData
      );
    } catch (error) {
      // Log the error
      this.logger.error('Error generating enhanced HTML report', {
        error: error instanceof Error ? error.message : String(error),
        url: request.url
      });
      
      // Fall back to the basic report generator if there's an error
      this.logger.debug('Falling back to basic HTML report due to error', {
        url: request.url
      });
      
      return createDebugHtmlReportUtil(
        request,
        storageResult,
        options,
        config,
        metrics
      );
    }
  }
  
  /**
   * Prepare visualization data for the enhanced debug report
   * 
   * This gathers all data needed for the interactive visualizations
   */
  private prepareVisualizationData(
    request: Request,
    storageResult: StorageResult,
    options: TransformOptions,
    config: ImageResizerConfig,
    metrics: PerformanceMetrics,
    clientInfo?: ClientInfo
  ): DebugVisualizationData {
    const url = new URL(request.url);
    const now = Date.now();
    metrics.end = metrics.end || now;
    
    // Calculate time spent in each phase
    const totalTime = metrics.end - metrics.start;
    let storageTime = 0;
    let transformTime = 0;
    let detectionTime = 0;
    
    if (metrics.storageStart && metrics.storageEnd) {
      storageTime = metrics.storageEnd - metrics.storageStart;
    }
    
    if (metrics.transformStart && metrics.transformEnd) {
      transformTime = metrics.transformEnd - metrics.transformStart;
    }
    
    if (metrics.detectionStart && metrics.detectionEnd) {
      detectionTime = metrics.detectionEnd - metrics.detectionStart;
    }
    
    // Create a normalized request flow timeline
    const requestFlow = {
      steps: [],
      totalDuration: totalTime
    } as DebugVisualizationData['requestFlow'];
    
    // Add steps in sequence
    requestFlow.steps.push({
      name: 'Request Start',
      duration: 0,
      startTime: 0,
      endTime: 0,
      success: true
    });
    
    // Add storage step if metrics exist
    if (metrics.storageStart && metrics.storageEnd) {
      requestFlow.steps.push({
        name: 'Storage Access',
        duration: storageTime,
        startTime: metrics.storageStart - metrics.start,
        endTime: metrics.storageEnd - metrics.start,
        success: storageResult.sourceType !== 'error',
        notes: `Type: ${storageResult.sourceType}`
      });
    }
    
    // Add client detection step if metrics exist
    if (metrics.detectionStart && metrics.detectionEnd) {
      requestFlow.steps.push({
        name: 'Client Detection',
        duration: detectionTime,
        startTime: metrics.detectionStart - metrics.start,
        endTime: metrics.detectionEnd - metrics.start,
        success: true,
        notes: metrics.detectionSource 
          ? `Source: ${metrics.detectionSource}` 
          : undefined
      });
    }
    
    // Add transformation step if metrics exist
    if (metrics.transformStart && metrics.transformEnd) {
      requestFlow.steps.push({
        name: 'Image Transformation',
        duration: transformTime,
        startTime: metrics.transformStart - metrics.start,
        endTime: metrics.transformEnd - metrics.start,
        success: true
      });
    }
    
    // Add final step
    requestFlow.steps.push({
      name: 'Response Complete',
      duration: totalTime - storageTime - transformTime - detectionTime,
      startTime: Math.max(
        metrics.storageEnd || 0,
        metrics.transformEnd || 0,
        metrics.detectionEnd || 0
      ) - metrics.start,
      endTime: totalTime,
      success: true
    });
    
    // Determine cache tags if available
    let cacheTags: string[] = [];
    if (config.cache.cacheTags?.enabled && storageResult.path) {
      try {
        // Import the utility function if needed
        const { generateCacheTags } = require('../cache');
        cacheTags = generateCacheTags(
          storageResult.path,
          options,
          config
        );
      } catch (e) {
        this.logger.error('Error generating cache tags for debug', {
          error: e instanceof Error ? e.message : String(e)
        });
      }
    }
    
    // Create image comparison data
    const imageComparison: DebugVisualizationData['imageComparison'] = {
      original: {
        url: storageResult.originalUrl || request.url,
        size: storageResult.size || 0,
        width: storageResult.width,
        height: storageResult.height,
        contentType: storageResult.contentType || 'unknown'
      },
      transformed: {
        url: request.url,
        width: options.width,
        height: options.height,
        transformOptions: { ...options }
      }
    };
    
    // If size is available, make a rough estimate of output size
    if (storageResult.size) {
      const originalSize = storageResult.size;
      const format = options.format || 'auto';
      const quality = options.quality || config.responsive.quality || 85;
      
      // Basic compression ratio estimates by format
      const compressionRatios: Record<string, number> = {
        'webp': 0.6,
        'avif': 0.4,
        'jpeg': 0.8,
        'png': 0.9,
        'auto': 0.6
      };
      
      // Adjust for quality
      const qualityFactor = quality / 100;
      
      // Apply format ratio and quality adjustment
      const formatRatio = compressionRatios[format] || 0.7;
      let estimatedSize = Math.round(originalSize * formatRatio * (0.5 + 0.5 * qualityFactor));
      
      // Adjust for dimensions if resizing
      if (options.width && storageResult.width && options.width < storageResult.width) {
        const dimensionRatio = (options.width * options.width) / (storageResult.width * storageResult.width);
        estimatedSize = Math.round(estimatedSize * dimensionRatio);
      }
      
      imageComparison.transformed.estimatedSize = estimatedSize;
    }
    
    // Determine if cache should be bypassed
    const shouldBypassCache: boolean = this.shouldBypassCache(request, config);
    
    // Finalize and return the visualization data
    return {
      requestFlow,
      imageComparison,
      clientInfo,
      cacheInfo: {
        method: config.cache.method,
        ttl: this.getTtlForResponse(new Response(), config),
        cacheEverything: config.cache.cacheEverything === true,
        cacheTags,
        bypassCache: shouldBypassCache === true
      },
      storageInfo: {
        sourceType: storageResult.sourceType,
        path: storageResult.path,
        originalUrl: storageResult.originalUrl,
        storageTime,
        priority: config.storage.priority
      }
    };
  }
  
  /**
   * Helper method to get TTL for the response based on config
   */
  private getTtlForResponse(response: Response, config: ImageResizerConfig): number {
    const status = response.status || 200;
    
    if (config.cache.useTtlByStatus && config.cache.cacheTtlByStatus) {
      // Check each status range to find a match
      for (const [statusRange, ttl] of Object.entries(config.cache.cacheTtlByStatus)) {
        if (this.isStatusInRange(status, statusRange)) {
          return ttl;
        }
      }
    }
    
    // Fall back to the simpler ttl configuration
    if (status >= 200 && status < 300) {
      return config.cache.ttl.ok;
    } else if (status >= 400 && status < 500) {
      return config.cache.ttl.clientError;
    } else if (status >= 500) {
      return config.cache.ttl.serverError;
    }
    
    // Default TTL
    return config.cache.ttl.ok;
  }
  
  /**
   * Helper to check if a status code is within a range string (e.g. "200-299")
   */
  private isStatusInRange(status: number, range: string): boolean {
    // Handle single status code
    if (/^\d+$/.test(range)) {
      return status === parseInt(range, 10);
    }
    
    // Handle status range (e.g. "200-299")
    const match = range.match(/^(\d+)-(\d+)$/);
    if (match && match.length >= 3) {
      const min = parseInt(match[1], 10);
      const max = parseInt(match[2], 10);
      return status >= min && status <= max;
    }
    
    return false;
  }
  
  /**
   * Check if cache should be bypassed for the request
   */
  private shouldBypassCache(request: Request, config: ImageResizerConfig): boolean {
    const url = new URL(request.url);
    
    // Check for bypass parameters in query string
    if (config.cache.bypassParams) {
      for (const param of config.cache.bypassParams) {
        if (url.searchParams.has(param)) {
          return true;
        }
      }
    }
    
    // Check for cache control headers
    const cacheControl = request.headers.get('Cache-Control');
    if (cacheControl && (
      cacheControl.includes('no-cache') || 
      cacheControl.includes('no-store') ||
      cacheControl.includes('max-age=0')
    )) {
      return true;
    }
    
    return false;
  }
  
  /**
   * Check if the feature is cacheable based on configuration
   */
  private isCacheable(config: ImageResizerConfig): boolean {
    // This is a helper that simplifies handling undefined values in config
    return config.cache.cacheability !== false;
  }
  
  /**
   * Generate cache tags for the given path and options
   * 
   * @param path Image path
   * @param options Transform options
   * @param config Application configuration
   * @returns Array of cache tags
   */
  private generateCacheTags(
    path: string,
    options: TransformOptions,
    config: ImageResizerConfig
  ): string[] {
    if (!config.cache.cacheTags?.enabled) {
      return [];
    }
    
    const tags: string[] = [];
    const prefix = config.cache.cacheTags.prefix || '';
    
    // Add path-based tags
    const pathParts = path.split('/').filter(Boolean);
    
    // Add tags for each level of the path
    if (pathParts.length > 0) {
      // Add a tag for the entire path
      tags.push(`${prefix}path:${path}`);
      
      // Add tags for each directory level
      let currentPath = '';
      pathParts.forEach((part, index) => {
        if (index < pathParts.length - 1) {
          currentPath += `/${part}`;
          tags.push(`${prefix}dir:${currentPath}`);
        }
      });
      
      // Add a tag for the filename
      const filename = pathParts[pathParts.length - 1];
      tags.push(`${prefix}file:${filename}`);
      
      // If the filename has an extension, add a tag for the extension
      const extension = filename.split('.').pop();
      if (extension && extension !== filename) {
        tags.push(`${prefix}ext:${extension}`);
      }
    }
    
    // Add transformation-based tags
    if (options.width) {
      tags.push(`${prefix}width:${options.width}`);
    }
    
    if (options.height) {
      tags.push(`${prefix}height:${options.height}`);
    }
    
    if (options.format && options.format !== 'auto') {
      tags.push(`${prefix}format:${options.format}`);
    }
    
    if (options.quality) {
      // Group qualities into ranges to avoid too many tags
      const qualityRange = Math.floor(options.quality / 10) * 10;
      tags.push(`${prefix}quality:${qualityRange}-${qualityRange + 9}`);
    }
    
    if (options.fit) {
      tags.push(`${prefix}fit:${options.fit}`);
    }
    
    if (options.derivative) {
      tags.push(`${prefix}derivative:${options.derivative}`);
    }
    
    return tags;
  }

  private getHeadersInfo(request: Request): Record<string, string> {
    const result: Record<string, string> = {};
    const safeHeaders = [
      'Accept',
      'Accept-Encoding',
      'Accept-Language',
      'Cache-Control',
      'CF-IPCountry',
      'CF-Ray',
      'Content-Length',
      'Content-Type',
      'DPR',
      'Host',
      'Referer',
      'Save-Data',
      'User-Agent',
      'Viewport-Width',
      'X-Forwarded-For',
    ];
    
    // Only include safe headers to avoid leaking sensitive information
    safeHeaders.forEach(name => {
      const value = request.headers.get(name);
      if (value) {
        result[name] = value;
      }
    });
    
    return result;
  }
}