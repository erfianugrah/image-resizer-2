/**
 * Client Hints utilities for image-resizer-2
 * 
 * Provides functions for detecting and utilizing Client Hints for better
 * browser capability detection and responsive image optimization.
 */

import { createLogger, Logger, defaultLogger } from './logging';
import { isFormatSupported } from './browser-formats';

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
  uaBitness?: string;         // Architecture bitness (e.g. "64")
  
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
  
  // Accept header information (parsed)
  acceptFormats?: string[];          // Image formats specified in Accept header  

  // Format support information
  supportsWebP?: boolean;            // Whether the browser supports WebP
  supportsAVIF?: boolean;            // Whether the browser supports AVIF
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
    const deviceMemory = headers.get('Device-Memory') || headers.get('Sec-CH-Device-Memory');
    if (deviceMemory) {
      hints.deviceMemory = parseFloat(deviceMemory);
    }
    
    const hardwareConcurrency = headers.get('Hardware-Concurrency');
    if (hardwareConcurrency) {
      hints.hardwareConcurrency = parseInt(hardwareConcurrency, 10);
    }
    
    // Parse Accept header for image format support
    const acceptHeader = headers.get('Accept');
    if (acceptHeader) {
      const imageFormats = parseAcceptHeader(acceptHeader);
      if (imageFormats.length > 0) {
        hints.acceptFormats = imageFormats;
        
        // Set format support flags based on Accept header
        hints.supportsWebP = imageFormats.includes('webp');
        hints.supportsAVIF = imageFormats.includes('avif');
      }
    }

    // Detect format support from browser information if available
    if ((hints.supportsWebP === undefined || hints.supportsAVIF === undefined) && 
        hints.uaBrands && hints.uaBrands.length > 0) {
      
      // Extract browser information from UA brands and other data
      const browserInfo = getBrowserInfoFromClientHints(hints);
      
      if (browserInfo) {
        // Check format support for this browser
        if (hints.supportsWebP === undefined) {
          hints.supportsWebP = isFormatSupported('webp', browserInfo.name, browserInfo.version);
        }
        
        if (hints.supportsAVIF === undefined) {
          hints.supportsAVIF = isFormatSupported('avif', browserInfo.name, browserInfo.version);
        }
      }
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
 * Parse image formats from the Accept header
 * 
 * @param acceptHeader The Accept header value
 * @returns Array of supported image formats
 */
function parseAcceptHeader(acceptHeader: string): string[] {
  const supportedFormats: string[] = [];
  
  try {
    // Split the header on commas and process each part
    const parts = acceptHeader.split(',');
    
    for (const part of parts) {
      // Extract the MIME type and quality factor
      const [mimeType, ...params] = part.trim().split(';');
      
      // Check if this is an image format
      if (mimeType.startsWith('image/')) {
        // Extract the format name (after image/)
        const format = mimeType.substring(6).toLowerCase();
        supportedFormats.push(format);
      }
    }
  } catch (error) {
    logger.debug('Error parsing Accept header', { 
      error: error instanceof Error ? error.message : String(error),
      acceptHeader
    });
  }
  
  return supportedFormats;
}

/**
 * Extract browser information from client hints
 * 
 * @param hints Client hints data
 * @returns Object with browser name and version, or null if not available
 */
function getBrowserInfoFromClientHints(hints: ClientHintsData): { name: string; version: string } | null {
  if (!hints.uaBrands || hints.uaBrands.length === 0) {
    return null;
  }
  
  // Map common brand names to our normalized browser names
  const brandMap: Record<string, string> = {
    'Chrome': 'chrome',
    'Chromium': 'chrome',
    'Microsoft Edge': 'edge_chromium',
    'Firefox': 'firefox',
    'Safari': 'safari',
    'Opera': 'opera',
    'Samsung Browser': 'samsung'
  };

  // Check for common browsers
  for (const brand of hints.uaBrands) {
    for (const [key, value] of Object.entries(brandMap)) {
      if (brand.includes(key)) {
        // Found a match - now determine version
        // Use a default recent version since exact version is not available in client hints
        // This is a limitation of current client hints implementation
        const version = '100'; // Default to a recent version
        
        // For mobile, adjust the browser type
        if (hints.uaMobile === true) {
          if (value === 'chrome') return { name: 'and_chr', version };
          if (value === 'firefox') return { name: 'and_ff', version };
          if (value === 'safari' && hints.uaPlatform === 'iOS') return { name: 'ios_saf', version: '15.0' };
        }
        
        return { name: value, version };
      }
    }
  }
  
  // If no direct browser brand match, try to infer from platform
  if (hints.uaPlatform) {
    if (hints.uaPlatform === 'iOS' || hints.uaPlatform === 'iPadOS') {
      return { name: 'ios_saf', version: '15.0' }; // Assume recent iOS Safari
    }
    
    if (hints.uaPlatform === 'Android' && hints.uaMobile) {
      return { name: 'and_chr', version: '100' }; // Assume Chrome on Android
    }
  }
  
  return null;
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
      headers.set('Accept-CH', 'DPR, Viewport-Width, Width, Sec-CH-UA, Sec-CH-UA-Mobile, Sec-CH-UA-Platform, Sec-CH-UA-Arch, Sec-CH-UA-Bitness, Sec-CH-Prefers-Color-Scheme, Sec-CH-Prefers-Reduced-Motion, Device-Memory, Save-Data, ECT, RTT, Downlink');
      
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
 * Network quality tiers based on measured characteristics
 */
export interface NetworkQuality {
  tier: 'slow' | 'medium' | 'fast' | 'unknown';
  description: string;
  estimated: boolean;
  // Actual values when measured, or null when estimated
  rtt?: number;
  downlink?: number;
  effectiveType?: string;
  saveData?: boolean;
}

/**
 * Get detailed connection quality assessment based on network hints
 * 
 * @param hints Client hints data
 * @returns Detailed network quality assessment
 */
export function getNetworkQuality(hints: ClientHintsData): NetworkQuality {
  // Default result with unknown tier
  const result: NetworkQuality = {
    tier: 'unknown',
    description: 'No network information available',
    estimated: true
  };
  
  // Check if we have any network information at all
  if (Object.keys(hints).filter(key => ['ect', 'rtt', 'downlink', 'saveData'].includes(key)).length === 0) {
    return result;
  }
  
  // Include actual values when available
  if (hints.rtt !== undefined) result.rtt = hints.rtt;
  if (hints.downlink !== undefined) result.downlink = hints.downlink;
  if (hints.ect) result.effectiveType = hints.ect;
  if (hints.saveData !== undefined) result.saveData = hints.saveData;
  
  // If Save-Data is enabled, treat as slow connection
  if (hints.saveData) {
    result.tier = 'slow';
    result.description = 'Save-Data mode enabled';
    result.estimated = false;
    return result;
  }
  
  // Use ECT as the most reliable indicator when available
  if (hints.ect) {
    result.estimated = false;
    
    if (hints.ect === '4g') {
      result.tier = 'fast';
      result.description = '4G connection';
    } else if (hints.ect === '3g') {
      result.tier = 'medium';
      result.description = '3G connection';
    } else if (hints.ect === '2g' || hints.ect === 'slow-2g') {
      result.tier = 'slow';
      result.description = hints.ect === 'slow-2g' ? 'Very slow 2G connection' : '2G connection';
    } else {
      // Unknown ect value
      result.tier = 'unknown';
      result.description = `Unknown connection type: ${hints.ect}`;
      result.estimated = true;
    }
    
    return result;
  }
  
  // Check RTT and downlink in combination if both available
  if (hints.rtt !== undefined && hints.downlink !== undefined) {
    result.estimated = false;
    
    // Fast: RTT < 100ms and downlink > 5Mbps
    if (hints.rtt < 100 && hints.downlink > 5) {
      result.tier = 'fast';
      result.description = `Fast connection (RTT: ${hints.rtt}ms, Downlink: ${hints.downlink}Mbps)`;
    }
    // Slow: RTT > 500ms or downlink < 1Mbps
    else if (hints.rtt > 500 || hints.downlink < 1) {
      result.tier = 'slow';
      result.description = `Slow connection (RTT: ${hints.rtt}ms, Downlink: ${hints.downlink}Mbps)`;
    }
    // Medium: everything in between
    else {
      result.tier = 'medium';
      result.description = `Medium connection (RTT: ${hints.rtt}ms, Downlink: ${hints.downlink}Mbps)`;
    }
    
    return result;
  }
  
  // If just RTT is available
  if (hints.rtt !== undefined) {
    result.estimated = false;
    
    if (hints.rtt < 100) {
      result.tier = 'fast';
      result.description = `Low latency connection (RTT: ${hints.rtt}ms)`;
    } else if (hints.rtt > 500) {
      result.tier = 'slow';
      result.description = `High latency connection (RTT: ${hints.rtt}ms)`;
    } else {
      result.tier = 'medium';
      result.description = `Medium latency connection (RTT: ${hints.rtt}ms)`;
    }
    
    return result;
  }
  
  // If just downlink is available
  if (hints.downlink !== undefined) {
    result.estimated = false;
    
    if (hints.downlink > 5) {
      result.tier = 'fast';
      result.description = `High bandwidth connection (${hints.downlink}Mbps)`;
    } else if (hints.downlink < 1) {
      result.tier = 'slow';
      result.description = `Low bandwidth connection (${hints.downlink}Mbps)`;
    } else {
      result.tier = 'medium';
      result.description = `Medium bandwidth connection (${hints.downlink}Mbps)`;
    }
    
    return result;
  }
  
  return result;
}

/**
 * Simple helper that returns just the connection quality tier
 * For backward compatibility with existing code
 * 
 * @param hints Client hints data
 * @returns Connection quality tier: 'slow', 'medium', 'fast', or 'unknown'
 */
export function getConnectionQuality(hints: ClientHintsData): 'slow' | 'medium' | 'fast' | 'unknown' {
  return getNetworkQuality(hints).tier;
}

/**
 * Device capability assessment based on client hints
 */
export interface DeviceCapabilities {
  memory?: number;       // Device memory in GB
  processors?: number;   // Logical processors available
  mobile?: boolean;      // Whether it's a mobile device
  platform?: string;     // Platform (OS) name
  score?: number;        // Raw capability score (0-100)
  class?: string;        // Device class categorization (high-end, mid-range, low-end)
  description: string;   // Human-readable description
  estimated: boolean;    // Whether the capabilities are estimated
}

/**
 * Get detailed device capabilities assessment based on client hints
 * 
 * @param hints Client hints data
 * @returns Detailed device capabilities assessment
 */
export function getDeviceCapabilities(hints: ClientHintsData): DeviceCapabilities {
  // Default result with minimal information
  const result: DeviceCapabilities = {
    description: 'No device capability information available',
    estimated: true
  };
  
  // Check if we have any capability information at all
  if (hints.deviceMemory === undefined && 
      hints.hardwareConcurrency === undefined && 
      hints.uaMobile === undefined) {
    return result;
  }
  
  // Include actual values when available
  if (hints.deviceMemory !== undefined) result.memory = hints.deviceMemory;
  if (hints.hardwareConcurrency !== undefined) result.processors = hints.hardwareConcurrency;
  if (hints.uaMobile !== undefined) result.mobile = hints.uaMobile;
  if (hints.uaPlatform) result.platform = hints.uaPlatform;
  
  // Start with a base score
  let score = 50;
  
  // Adjust based on available client hints
  // Device memory is the most reliable indicator of device capability
  if (hints.deviceMemory !== undefined) {
    if (hints.deviceMemory >= 8) score += 30;
    else if (hints.deviceMemory >= 4) score += 15;
    else if (hints.deviceMemory <= 2) score -= 15;
    else if (hints.deviceMemory <= 1) score -= 30;
  }
  
  // CPU cores provide good insight into processing power
  if (hints.hardwareConcurrency !== undefined) {
    if (hints.hardwareConcurrency >= 8) score += 20;
    else if (hints.hardwareConcurrency >= 4) score += 10;
    else if (hints.hardwareConcurrency <= 2) score -= 15;
  }
  
  // Network quality is an important factor in device capability assessment
  if (hints.rtt !== undefined || hints.downlink !== undefined || hints.ect) {
    const networkQuality = getNetworkQuality(hints);
    
    // Consider network quality more strongly when we lack other signals
    const networkImpact = (hints.deviceMemory === undefined && hints.hardwareConcurrency === undefined) ? 1.5 : 1;
    
    if (networkQuality.tier === 'fast') {
      score += Math.round(15 * networkImpact); // Better network = better experience
    } else if (networkQuality.tier === 'medium') {
      score += Math.round(5 * networkImpact);  // Medium network = slight boost
    } else if (networkQuality.tier === 'slow') {
      score -= Math.round(10 * networkImpact); // Slow network = worse experience
    }
    
    // If Save-Data is requested, that's an extra strong signal
    if (networkQuality.saveData) {
      score -= 15; // User explicitly wants to save data
    }
  }
  
  // Mobile isn't automatically negative, but affects context
  if (hints.uaMobile === true) {
    // Only adjust if we don't have better indicators
    if (hints.deviceMemory === undefined && hints.hardwareConcurrency === undefined) {
      score -= 10; 
    }
  }
  
  // Record the calculated score
  result.score = score;
  result.estimated = false;
  
  // Create a descriptive string based on the actual metrics
  result.description = createDeviceDescription(hints, score);
  
  return result;
}

/**
 * Helper function to create a device description based on available hints and score
 */
function createDeviceDescription(hints: ClientHintsData, score: number): string {
  const parts: string[] = [];
  
  // Add capability level based on score
  if (score >= 65) {
    parts.push('Capable device');
  } else if (score >= 35) {
    parts.push('Standard device');
  } else if (score >= 0) {
    parts.push('Basic device');
  } else {
    parts.push('Unknown device');
  }
  
  if (hints.uaMobile === true) {
    parts.push('mobile');
  }
  
  if (hints.uaPlatform) {
    parts.push(`${hints.uaPlatform}`);
  }
  
  const specs: string[] = [];
  
  if (hints.deviceMemory !== undefined) {
    specs.push(`${hints.deviceMemory}GB RAM`);
  }
  
  if (hints.hardwareConcurrency !== undefined) {
    specs.push(`${hints.hardwareConcurrency} cores`);
  }
  
  if (specs.length > 0) {
    parts.push(`(${specs.join(', ')})`);
  }
  
  return parts.join(' ');
}

/**
 * Helper function that returns a device class based on score
 * For backward compatibility with existing code
 * 
 * @param hints Client hints data
 * @returns Device class: 'high-end', 'mid-range', 'low-end', or 'unknown'
 */
export function getDeviceClass(hints: ClientHintsData): 'high-end' | 'mid-range' | 'low-end' | 'unknown' {
  const capabilities = getDeviceCapabilities(hints);
  const score = capabilities.score || 0;
  
  // Map score to device class for backward compatibility
  if (score >= 65) {
    return 'high-end';
  } else if (score >= 35) {
    return 'mid-range';
  } else if (score >= 0) {
    return 'low-end';
  } else {
    return 'unknown';
  }
}

/**
 * Performance budget assessment for image processing
 */
export interface PerformanceBudget {
  quality: {
    min: number;
    max: number;
    target: number;
  };
  maxWidth: number;
  maxHeight: number;
  preferredFormat: string;
  dpr: number;
}

/**
 * Extended optimization hints with additional network/device aware parameters
 */
export interface OptimizationHints {
  format?: string;
  quality?: number;
  dpr?: number;
  optimizedWidth?: number;
  optimizedHeight?: number;
  performanceBudget?: PerformanceBudget;
  networkQuality?: NetworkQuality;
  deviceCapabilities?: DeviceCapabilities;
}

/**
 * Calculate a performance budget based on network and device capabilities
 * 
 * @param hints Client hints data
 * @returns Performance budget for image optimization
 */
export function calculatePerformanceBudget(hints: ClientHintsData): PerformanceBudget {
  const network = getNetworkQuality(hints);
  const device = getDeviceCapabilities(hints);
  
  // Default performance budget (mid-range)
  const budget: PerformanceBudget = {
    quality: {
      min: 60,
      max: 85,
      target: 75
    },
    maxWidth: 1500,
    maxHeight: 1500,
    preferredFormat: 'auto', // Let the browser detection decide
    dpr: hints.dpr || 1
  };
  
  // Adjust based on network quality
  if (network.tier === 'slow') {
    budget.quality.min = 40;
    budget.quality.max = 75;
    budget.quality.target = 60;
    budget.maxWidth = 1200;
    budget.maxHeight = 1200;
    budget.preferredFormat = 'webp'; // Always use WebP for slow connections
  } else if (network.tier === 'fast') {
    budget.quality.min = 70;
    budget.quality.max = 90;
    budget.quality.target = 80;
    budget.maxWidth = 1800;
    budget.maxHeight = 1800;
  }
  
  // Further adjust based on device capabilities
  const deviceScore = device.score || 0;
  // Determine class based on score
  if (deviceScore < 35) {
    // Low-end device
    budget.quality.target = Math.max(budget.quality.min, budget.quality.target - 10);
    budget.maxWidth = Math.min(budget.maxWidth, 1000);
    budget.maxHeight = Math.min(budget.maxHeight, 1000);
  } else if (deviceScore >= 65) {
    budget.quality.target = Math.min(budget.quality.max, budget.quality.target + 5);
    // No need to adjust dimensions for high-end devices
  }
  
  // Special case: Save-Data
  if (hints.saveData) {
    budget.quality.target = budget.quality.min;
    budget.maxWidth = Math.min(budget.maxWidth, 800);
    budget.maxHeight = Math.min(budget.maxHeight, 800);
    budget.preferredFormat = 'webp'; // WebP has best compression/quality ratio
  }
  
  // Cap DPR to prevent excessive scaling
  budget.dpr = Math.max(1, Math.min(hints.dpr || 1, 3));
  
  // Set preferred format based on client support
  if (hints.supportsAVIF) {
    budget.preferredFormat = 'avif';
  } else if (hints.supportsWebP) {
    budget.preferredFormat = 'webp';
  }
  
  return budget;
}

/**
 * Calculates responsive image dimensions based on client hints and viewport
 * 
 * @param hints Client hints data
 * @param originalWidth Original image width (if known)
 * @param originalHeight Original image height (if known)
 * @returns Optimized dimensions object with width and height
 */
export function calculateResponsiveDimensions(
  hints: ClientHintsData,
  originalWidth?: number,
  originalHeight?: number
): { width?: number; height?: number } {
  const result: { width?: number; height?: number } = {};
  
  // Use viewport width as baseline if available
  if (hints.viewportWidth) {
    const dpr = hints.dpr || 1;
    
    // Calculate initial width based on viewport and DPR
    let calculatedWidth = Math.round(hints.viewportWidth * dpr);
    
    // Apply performance budget limits
    const budget = calculatePerformanceBudget(hints);
    calculatedWidth = Math.min(calculatedWidth, budget.maxWidth);
    
    // Store calculated width
    result.width = calculatedWidth;
    
    // If we have both original dimensions, calculate height maintaining aspect ratio
    if (originalWidth && originalHeight && calculatedWidth < originalWidth) {
      const aspectRatio = originalHeight / originalWidth;
      result.height = Math.round(calculatedWidth * aspectRatio);
      
      // Cap height at budget maximum
      if (result.height > budget.maxHeight) {
        result.height = budget.maxHeight;
        // Recalculate width to maintain aspect ratio
        result.width = Math.round(result.height / aspectRatio);
      }
    }
    // If we have viewport height as well, use that for additional constraints
    else if (hints.viewportHeight && !originalHeight) {
      const viewportHeight = hints.viewportHeight * dpr;
      // Don't make image taller than viewport in most cases
      result.height = Math.min(viewportHeight, budget.maxHeight);
    }
  }
  
  // Special case for reduced motion preference
  if (hints.prefersReducedMotion && result.width) {
    // For users who prefer reduced motion, we can optimize further
    // by slightly reducing dimensions for static content
    result.width = Math.round(result.width * 0.9);
    if (result.height) {
      result.height = Math.round(result.height * 0.9);
    }
  }
  
  return result;
}

/**
 * Get color scheme preference from client hints
 * 
 * @param hints Client hints data
 * @returns Color scheme preference: 'dark', 'light', or undefined if not specified
 */
export function getColorSchemePreference(hints: ClientHintsData): 'dark' | 'light' | undefined {
  if (hints.prefersColorScheme) {
    if (hints.prefersColorScheme === 'dark') return 'dark';
    if (hints.prefersColorScheme === 'light') return 'light';
  }
  return undefined;
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
  // Get detailed device and network information
  const networkQuality = getNetworkQuality(hints);
  const deviceCapabilities = getDeviceCapabilities(hints);
  
  // Calculate performance budget
  const performanceBudget = calculatePerformanceBudget(hints);
  
  // Prepare suggestions object with detailed context
  const suggestions: OptimizationHints = {
    networkQuality,
    deviceCapabilities,
    performanceBudget
  };
  
  // Only make suggestions for parameters that aren't explicitly specified
  
  // Apply DPR if provided and not specified in options
  if (hints.dpr !== undefined && options.dpr === undefined) {
    suggestions.dpr = performanceBudget.dpr;
  }
  
  // Optimize dimensions based on viewport, device and performance budget
  if (hints.viewportWidth !== undefined && options.width === undefined) {
    // Get responsive dimensions recommendations
    const dimensions = calculateResponsiveDimensions(hints);
    
    if (dimensions.width) {
      suggestions.optimizedWidth = dimensions.width;
    }
    
    if (dimensions.height) {
      suggestions.optimizedHeight = dimensions.height;
    }
  }
  
  // Optimize quality based on the performance budget
  if (options.quality === undefined) {
    suggestions.quality = performanceBudget.quality.target;
  }
  
  // Suggest format if automatic format is requested
  if ((options.format === 'auto' || options.format === undefined) && 
      (performanceBudget.preferredFormat !== 'auto')) {
    suggestions.format = performanceBudget.preferredFormat;
  }
  
  return suggestions;
}