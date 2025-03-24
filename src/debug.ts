/**
 * Debug headers and utilities for the image resizer worker
 * 
 * This module provides functions for adding debug headers to responses,
 * which can be useful for troubleshooting and understanding how the worker is processing requests.
 */

import { ImageResizerConfig } from './config';
import { StorageResult } from './storage';
import { TransformOptions } from './services/interfaces';
import { generateCacheTags } from './cache';
import { createLogger, Logger, defaultLogger } from './utils/logging';

// Use default logger until a configured one is provided
let logger: Logger = defaultLogger;

/**
 * Set the logger for the debug module
 * 
 * @param configuredLogger The logger to use
 */
export function setLogger(configuredLogger: Logger): void {
  logger = configuredLogger;
}

/**
 * Performance timing points
 */
export interface PerformanceMetrics {
  start: number;
  storageStart?: number;
  storageEnd?: number;
  transformStart?: number;
  transformEnd?: number;
  detectionStart?: number;
  detectionEnd?: number;
  end?: number;
  detectionSource?: string;
}

/**
 * Check if debug is enabled for the current request
 */
export function isDebugEnabled(
  request: Request, 
  config: ImageResizerConfig
): boolean {
  logger.breadcrumb('Checking if debug is enabled', undefined, {
    debugEnabledInConfig: config.debug.enabled,
    environment: config.environment,
    forceDebugHeaders: config.debug.forceDebugHeaders === true
  });
  
  // Check if debug is forcefully enabled via config
  if (config.debug.forceDebugHeaders) {
    logger.breadcrumb('Debug forcefully enabled via config');
    return true;
  }
  
  // Check if debug is enabled in config
  if (!config.debug.enabled) {
    logger.breadcrumb('Debug disabled in config');
    return false;
  }
  
  // Check if debug is allowed in the current environment
  // Skip this check if allowedEnvironments is not defined or is empty
  if (config.debug.allowedEnvironments && 
      config.debug.allowedEnvironments.length > 0 && 
      !config.debug.allowedEnvironments.includes(config.environment)) {
    logger.breadcrumb('Debug not allowed in current environment', undefined, {
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
  return config.debug.enabled;
}

/**
 * Add debug headers to a response
 */
export function addDebugHeaders(
  response: Response,
  request: Request,
  storageResult: StorageResult,
  transformOptions: TransformOptions,
  config: ImageResizerConfig,
  metrics: PerformanceMetrics,
  url: URL
): Response {
  // If debug is not enabled, return the response as is
  if (!isDebugEnabled(request, config)) {
    return response;
  }
  
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
  if (transformOptions.width) {
    newResponse.headers.set('X-Actual-Width', transformOptions.width.toString());
    
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
      const cacheTags = generateCacheTags(storageResult.path || '', transformOptions, config);
      if (cacheTags.length > 0) {
        newResponse.headers.set('X-Cache-Tags', cacheTags.join(', '));
      }
    } catch (error) {
      logger.error('Error generating debug cache tags', { 
        error: error instanceof Error ? error.message : String(error),
        path: storageResult.path
      });
    }
  }
  
  // Add transformation debug headers
  if (transformOptions) {
    // Clean the transform options for header value (no nested objects)
    const cleanOptions: Record<string, string> = {};
    Object.keys(transformOptions).forEach(key => {
      const value = transformOptions[key];
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
    if (transformOptions.derivative) {
      newResponse.headers.set('X-Derivative-Template', transformOptions.derivative.toString());
    }
  }
  
  return newResponse;
}

/**
 * Create a detailed debug HTML report
 */
export function createDebugHtmlReport(
  request: Request,
  storageResult: StorageResult,
  transformOptions: TransformOptions,
  config: ImageResizerConfig,
  metrics: PerformanceMetrics
): Response {
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
              const cacheTags = generateCacheTags(storageResult.path || '', transformOptions, config);
              return cacheTags.length > 0 ? cacheTags.join(', ') : 'None';
            } catch (e) {
              return 'Error generating cache tags';
            }
          })()}</td>
        </tr>
        ` : ''}
      </table>
      
      <h2>Transformation Options</h2>
      <pre>${JSON.stringify(transformOptions, null, 2)}</pre>
      
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