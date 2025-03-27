/**
 * Akamai Compatibility Handler
 * 
 * Handles conversion of Akamai-style URLs to Cloudflare format
 */

import { ServiceContainer } from '../services/interfaces';
import { isAkamaiFormat, translateAkamaiParams } from '../utils/akamai-compatibility';

/**
 * Handle Akamai compatibility conversion if needed
 * 
 * @param request The original request
 * @param url The URL of the request
 * @param services Services container
 * @returns Modified URL if Akamai format detected, or original URL
 */
export function handleAkamaiCompatibility(
  request: Request,
  url: URL,
  services: ServiceContainer
): URL {
  const { logger, configurationService } = services;
  const config = configurationService.getConfig();
  
  // Use config later in the function
  
  // Check for Akamai compatibility mode using the configuration service
  if (!configurationService.isFeatureEnabled('enableAkamaiCompatibility')) {
    logger.debug('Akamai compatibility is disabled');
    return url;
  }
  
  logger.debug('Akamai compatibility is enabled, checking URL format', { 
    advancedFeatures: configurationService.isFeatureEnabled('enableAkamaiAdvancedFeatures') ? 'enabled' : 'disabled'
  });
  
  // First check for Akamai parameters in the URL
  const isAkamai = isAkamaiFormat(url);
  
  // If Akamai format is detected, convert parameters to Cloudflare format
  if (isAkamai) {
    // Log the original URL for debugging
    logger.info('Detected Akamai URL format', { url: url.toString() });
    
    try {
      // Convert the URL parameters, passing config for advanced feature detection
      const cfParams = translateAkamaiParams(url, config);
      
      // Store config in params for potential downstream use
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (cfParams as any)._config = config;
      
      // Convert to Cloudflare URL with our params
      const convertedUrl = new URL(url.toString());
      
      // Remove all Akamai parameters
      for (const key of Array.from(convertedUrl.searchParams.keys())) {
        if (key.startsWith('im.')) {
          convertedUrl.searchParams.delete(key);
        }
      }
      
      // Add Cloudflare parameters
      for (const [key, value] of Object.entries(cfParams)) {
        if (value !== undefined && value !== null && !key.startsWith('_')) {
          // Special handling for gravity parameter with x,y coordinates
          if (key === 'gravity' && typeof value === 'object' && 'x' in value && 'y' in value) {
            // Use a simpler format: "x,y" for gravity coordinates (e.g., "0.5,0.3")
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const x = (value as any).x;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const y = (value as any).y;
            convertedUrl.searchParams.set(key, `${x},${y}`);
          } else if (typeof value === 'object') {
            convertedUrl.searchParams.set(key, JSON.stringify(value));
          } else {
            convertedUrl.searchParams.set(key, String(value));
          }
        }
      }
      
      // Log the converted URL for debugging
      logger.info('Successfully converted to Cloudflare format', { convertedUrl: convertedUrl.toString() });
      
      return convertedUrl;
    } catch (error) {
      logger.error('Error converting Akamai URL to Cloudflare format', { 
        error: String(error),
        url: url.toString()
      });
      
      // Continue with the original URL if conversion fails
      logger.warn('Continuing with original URL due to conversion error');
      return url;
    }
  }
  
  logger.debug('No Akamai parameters detected in URL');
  return url;
}

/**
 * Add Akamai compatibility header to response if enabled and used
 * 
 * @param response The final response
 * @param isAkamai Whether Akamai format was detected
 * @param services Service container
 * @returns Modified response with header if needed
 */
export function addAkamaiCompatibilityHeader(
  response: Response,
  isAkamai: boolean,
  services: ServiceContainer
): Response {
  const { logger, configurationService } = services;
  
  // Only add header if Akamai compatibility was used
  if (!configurationService.isFeatureEnabled('enableAkamaiCompatibility') || !isAkamai) {
    return response;
  }
  
  logger.debug('Adding Akamai compatibility header');
  
  const debugConfig = configurationService.getSection('debug');
  const debugPrefix = debugConfig.headerNames?.debugEnabled?.replace('Enabled', '') || 'X-Debug-';
  const headerName = `${debugPrefix}Akamai-Compatibility`;
  
  const newHeaders = new Headers(response.headers);
  newHeaders.set(headerName, 'used');
  
  logger.debug('Added Akamai compatibility header', { headerName, value: 'used' });
  
  // Create a new response with the added header
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders
  });
}