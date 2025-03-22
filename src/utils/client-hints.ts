/**
 * Client Hints utilities for image-resizer-2
 * 
 * Provides functions for detecting and utilizing Client Hints for better
 * browser capability detection and responsive image optimization.
 */

import { createLogger, Logger, defaultLogger } from './logging';

// Use default logger until a configured one is provided
let logger: Logger = defaultLogger;

/**
 * Set the logger for the client hints module
 * 
 * @param configuredLogger The logger to use
 */
export function setLogger(configuredLogger: Logger): void {
  logger = configuredLogger;
}

/**
 * Parsed client hints information
 */
export interface ClientHintsData {
  // Device characteristics
  dpr?: number;               // Device Pixel Ratio
  viewportWidth?: number;     // Viewport width in CSS pixels
  viewportHeight?: number;    // Viewport height in CSS pixels
  width?: number;             // Requested resource width
  
  // Browser identification
  uaBrands?: string[];        // Browser brands
  uaMobile?: boolean;         // Whether the device is mobile
  uaPlatform?: string;        // Platform name
  uaArch?: string;            // CPU architecture
  
  // Network conditions
  saveData?: boolean;         // Whether data saving is requested
  ect?: string;               // Effective connection type (4g, 3g, 2g, slow-2g)
  rtt?: number;               // Round-trip time in milliseconds
  downlink?: number;          // Downlink speed in Mbps
  
  // User preferences
  prefersColorScheme?: string;       // User color scheme preference
  prefersReducedMotion?: boolean;    // User motion preference
  
  // Device capabilities
  deviceMemory?: number;             // Device memory in GB
  hardwareConcurrency?: number;      // Number of logical CPU cores
}

/**
 * Parse client hints from request headers
 * 
 * @param request The request to extract client hints from
 * @returns Client hints data object with available values
 */
export function parseClientHints(request: Request): ClientHintsData {
  const hints: ClientHintsData = {};
  const headers = request.headers;
  
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
        const brandRegex = /"([^"]+)"/g;
        let match;
        
        while ((match = brandRegex.exec(uaRaw)) !== null) {
          if (match[1] && !match[1].includes('Not') && !match[1].includes('Brand')) {
            brands.push(match[1]);
          }
        }
        
        if (brands.length > 0) {
          hints.uaBrands = brands;
        }
      } catch (e) {
        logger.debug('Error parsing Sec-CH-UA', { 
          error: e instanceof Error ? e.message : String(e),
          raw: uaRaw
        });
      }
    }
    
    const uaMobile = headers.get('Sec-CH-UA-Mobile');
    if (uaMobile) {
      hints.uaMobile = uaMobile === '?1';
    }
    
    const uaPlatform = headers.get('Sec-CH-UA-Platform');
    if (uaPlatform) {
      // Remove quotes if present
      hints.uaPlatform = uaPlatform.replace(/"/g, '');
    }
    
    const uaArch = headers.get('Sec-CH-UA-Arch');
    if (uaArch) {
      hints.uaArch = uaArch.replace(/"/g, '');
    }
    
    // Network conditions
    const saveData = headers.get('Save-Data');
    if (saveData) {
      hints.saveData = saveData === 'on';
    }
    
    const ect = headers.get('ECT');
    if (ect) {
      hints.ect = ect;
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
      hints.prefersColorScheme = prefersColorScheme;
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
  } catch (error) {
    logger.warn('Error parsing client hints', { 
      error: error instanceof Error ? error.message : String(error)
    });
  }
  
  // Log results for debugging
  if (Object.keys(hints).length > 0) {
    logger.debug('Parsed client hints', { 
      hintsFound: Object.keys(hints).length,
      hintsData: JSON.parse(JSON.stringify(hints)) 
    });
  } else {
    logger.debug('No client hints found in request');
  }
  
  return hints;
}

/**
 * Determine if a browser likely supports client hints
 * 
 * @param userAgent User-Agent string
 * @returns True if the browser likely supports client hints
 */
export function browserSupportsClientHints(userAgent: string): boolean {
  if (!userAgent) return false;
  
  // Chrome 84+, Edge 84+, Opera 70+
  if (/Chrome\/(\d+)|Edg\/(\d+)|OPR\/(\d+)/i.test(userAgent)) {
    const chromeMatch = userAgent.match(/Chrome\/(\d+)/i);
    const edgeMatch = userAgent.match(/Edg\/(\d+)/i);
    const operaMatch = userAgent.match(/OPR\/(\d+)/i);
    
    if (chromeMatch && parseInt(chromeMatch[1], 10) >= 84) return true;
    if (edgeMatch && parseInt(edgeMatch[1], 10) >= 84) return true;
    if (operaMatch && parseInt(operaMatch[1], 10) >= 70) return true;
  }
  
  return false;
}

/**
 * Add client hints request headers to a response
 * 
 * @param response Response to modify with client hints headers
 * @param request Original request for user agent detection
 * @returns Modified response with appropriate client hints headers
 */
export function addClientHintsHeaders(response: Response, request: Request): Response {
  const userAgent = request.headers.get('User-Agent') || '';
  
  // Only add headers if the browser likely supports them
  if (!browserSupportsClientHints(userAgent)) {
    return response;
  }
  
  const headers = new Headers(response.headers);
  
  // Request client hints - start with the basics
  headers.set('Accept-CH', 'DPR, Viewport-Width, Width');
  
  // Add more advanced hints for newer browsers
  if (/Chrome\/(\d+)/i.test(userAgent)) {
    const match = userAgent.match(/Chrome\/(\d+)/i);
    if (match && parseInt(match[1], 10) >= 90) {
      // More complete set of hints for newer browsers
      headers.set('Accept-CH', 'DPR, Viewport-Width, Width, Sec-CH-UA, Sec-CH-UA-Mobile, Sec-CH-UA-Platform, Sec-CH-UA-Arch, Device-Memory, Save-Data, ECT, RTT, Downlink');
      
      // Critical hints (ones we really need)
      headers.set('Critical-CH', 'DPR, Viewport-Width, Sec-CH-UA-Mobile');
      
      // Permissions policy for client hints
      headers.set('Permissions-Policy', 'ch-dpr=(self), ch-viewport-width=(self), ch-width=(self), ch-ua=(self), ch-ua-mobile=(self)');
    }
  }
  
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

/**
 * Get connection quality level based on network hints
 * 
 * @param hints Client hints data
 * @returns Connection quality: 'slow', 'medium', 'fast', or 'unknown'
 */
export function getConnectionQuality(hints: ClientHintsData): 'slow' | 'medium' | 'fast' | 'unknown' {
  // If Save-Data is enabled, treat as slow connection
  if (hints.saveData) {
    return 'slow';
  }
  
  // Check Effective Connection Type hint
  if (hints.ect) {
    if (hints.ect === '4g') return 'fast';
    if (hints.ect === '3g') return 'medium';
    if (hints.ect === '2g' || hints.ect === 'slow-2g') return 'slow';
  }
  
  // Check RTT and downlink if available
  if (hints.rtt !== undefined && hints.downlink !== undefined) {
    // Fast: RTT < 100ms and downlink > 5Mbps
    if (hints.rtt < 100 && hints.downlink > 5) return 'fast';
    
    // Slow: RTT > 500ms or downlink < 1Mbps
    if (hints.rtt > 500 || hints.downlink < 1) return 'slow';
    
    // Medium: everything in between
    return 'medium';
  }
  
  // If just RTT is available
  if (hints.rtt !== undefined) {
    if (hints.rtt < 100) return 'fast';
    if (hints.rtt > 500) return 'slow';
    return 'medium';
  }
  
  // If just downlink is available
  if (hints.downlink !== undefined) {
    if (hints.downlink > 5) return 'fast';
    if (hints.downlink < 1) return 'slow';
    return 'medium';
  }
  
  return 'unknown';
}

/**
 * Determine device class based on client hints
 * 
 * @param hints Client hints data
 * @returns Device class: 'high-end', 'mid-range', 'low-end', or 'unknown'
 */
export function getDeviceClass(hints: ClientHintsData): 'high-end' | 'mid-range' | 'low-end' | 'unknown' {
  // If we don't have any useful device capability hints, return unknown
  if (hints.deviceMemory === undefined && 
      hints.hardwareConcurrency === undefined && 
      hints.uaMobile === undefined) {
    return 'unknown';
  }
  
  // Start with assumption of mid-range
  let score = 50;
  
  // Adjust based on available hints
  if (hints.deviceMemory !== undefined) {
    if (hints.deviceMemory >= 8) score += 20;
    else if (hints.deviceMemory >= 4) score += 10;
    else if (hints.deviceMemory <= 2) score -= 10;
    else if (hints.deviceMemory <= 1) score -= 20;
  }
  
  if (hints.hardwareConcurrency !== undefined) {
    if (hints.hardwareConcurrency >= 8) score += 15;
    else if (hints.hardwareConcurrency >= 4) score += 5;
    else if (hints.hardwareConcurrency <= 2) score -= 10;
  }
  
  if (hints.uaMobile === true) {
    score -= 15; // Mobile devices are typically less powerful
  }
  
  // Categorize based on score
  if (score >= 65) return 'high-end';
  if (score >= 35) return 'mid-range';
  if (score >= 0) return 'low-end';
  
  return 'unknown';
}

export interface OptimizationHints {
  format?: string;
  quality?: number;
  dpr?: number;
  optimizedWidth?: number;
}

/**
 * Suggest optimizations based on client hints and transformation options
 * Only makes suggestions when parameters aren't explicitly specified
 * 
 * @param options Current transformation options
 * @param hints Client hints data
 * @returns Suggested optimizations
 */
export function suggestOptimizations(
  options: any,
  hints: ClientHintsData
): OptimizationHints {
  const suggestions: OptimizationHints = {};
  
  // Only make suggestions for parameters that aren't explicitly specified
  
  // Apply DPR if provided and not specified in options
  if (hints.dpr !== undefined && options.dpr === undefined) {
    // Cap DPR between 1 and 3 to prevent excessive scaling
    suggestions.dpr = Math.max(1, Math.min(hints.dpr, 3));
  }
  
  // Optimize width based on viewport if not specified
  if (hints.viewportWidth !== undefined && options.width === undefined) {
    const viewportBasedWidth = hints.viewportWidth * (hints.dpr || 1);
    suggestions.optimizedWidth = Math.min(viewportBasedWidth, 1800); // Cap at 1800px
  }
  
  // Optimize quality based on connection if not specified
  if (options.quality === undefined) {
    const connectionQuality = getConnectionQuality(hints);
    const deviceClass = getDeviceClass(hints);
    
    // Start with middle-tier quality
    let quality = 75;
    
    // Adjust based on connection
    if (connectionQuality === 'fast') quality += 10;
    if (connectionQuality === 'slow') quality -= 15;
    if (hints.saveData) quality -= 20;
    
    // Adjust based on device
    if (deviceClass === 'high-end') quality += 5;
    if (deviceClass === 'low-end') quality -= 5;
    
    // Ensure quality is within reasonable bounds
    suggestions.quality = Math.max(45, Math.min(quality, 90));
  }
  
  // Suggest format if automatic format is requested
  if ((options.format === 'auto' || options.format === undefined) && 
      hints.uaBrands !== undefined) {
    const connectionQuality = getConnectionQuality(hints);
    const deviceClass = getDeviceClass(hints);
    
    // For high-end devices on fast connections, suggest AVIF
    if (deviceClass === 'high-end' && connectionQuality === 'fast') {
      suggestions.format = 'avif';
    }
    // For low-end devices or slow connections, suggest WebP as a balanced option
    else if (deviceClass === 'low-end' || connectionQuality === 'slow') {
      suggestions.format = 'webp';
    }
    // Otherwise, format will be determined by browser support detection
  }
  
  return suggestions;
}