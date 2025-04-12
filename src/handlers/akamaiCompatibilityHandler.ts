/**
 * Akamai Compatibility Handler
 * 
 * Handles conversion of Akamai-style URLs to Cloudflare format
 */

import { ServiceContainer } from '../services/interfaces';
import { isAkamaiFormat, createTranslatedUrl } from '../utils/akamai-compatibility-refactored';

/**
 * Handle Akamai compatibility conversion if needed
 * 
 * @param request The original request
 * @param url The URL of the request
 * @param services Services container
 * @param config Application configuration (optional, will be fetched if not provided)
 * @returns Modified URL if Akamai format detected, or original URL
 */
export function handleAkamaiCompatibility(
  request: Request,
  url: URL,
  services: ServiceContainer,
  config?: any
): URL {
  const { logger, configurationService } = services;
  
  // Use provided config or get it from the service if not provided
  if (!config) {
    config = configurationService.getConfig();
  }
  
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
      // Use our refactored function to create a translated URL
      const newUrl = createTranslatedUrl(url, config);
      
      // Log the transformed URL
      logger.info('Translated Akamai URL to Cloudflare format', { 
        originalUrl: url.toString(),
        translatedUrl: newUrl.toString()
      });
      
      return newUrl;
    } catch (error) {
      // Log the error but continue with original URL to avoid breaking the request
      logger.error('Failed to translate Akamai parameters', {
        error: error instanceof Error ? error.message : String(error),
        url: url.toString()
      });
    }
  }
  
  // If not Akamai format or translation failed, return the original URL
  return url;
}

/**
 * Add Akamai compatibility header to the response
 * 
 * @param response The original response
 * @param isAkamai Whether the request used Akamai format
 * @param services Services container
 * @returns Modified response with compatibility header
 */
export function addAkamaiCompatibilityHeader(
  response: Response,
  isAkamai: boolean,
  services: ServiceContainer
): Response {
  const { logger } = services;
  
  // If not Akamai format, return original response
  if (!isAkamai) {
    return response;
  }
  
  // Create a new response with the added header
  const newResponse = new Response(response.body, response);
  
  // Add a header to indicate this was processed by our Akamai compatibility layer
  newResponse.headers.set('X-Akamai-Compatibility', 'Enabled');
  
  // Log that we added the header
  logger.debug('Added Akamai compatibility header to response');
  
  return newResponse;
}