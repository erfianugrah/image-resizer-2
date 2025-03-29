/**
 * Refactored Akamai Image Manager Compatibility Module
 * 
 * This module provides translation functions to convert Akamai Image Manager
 * URL parameters to Cloudflare Image Resizing parameters, using the new modular
 * parameter handling system.
 */

import type { TransformOptions } from '../services/interfaces';
import { Logger, defaultLogger } from './logging';
import { ImageResizerConfig } from '../config';
import { AkamaiParser } from '../parameters/parsers/AkamaiParser';
import { DefaultParameterProcessor } from '../parameters/ParameterProcessor';
import { TransformParameter } from './path';

// Use default logger until a configured one is provided
let logger: Logger = defaultLogger;

/**
 * Set the logger for the Akamai compatibility module
 * 
 * @param configuredLogger The logger to use
 */
export function setLogger(configuredLogger: Logger): void {
  logger = configuredLogger;
}

/**
 * Check if a URL has Akamai-style parameters
 * 
 * @param url The URL to check
 * @returns true if Akamai-style parameters are detected
 */
export function isAkamaiFormat(url: URL): boolean {
  // Check for im= parameter
  if (url.searchParams.has('im')) {
    logger.debug('Detected Akamai im= parameter');
    return true;
  }
  
  // Check for im.* parameters (dot notation)
  for (const key of url.searchParams.keys()) {
    if (key.startsWith('im.')) {
      logger.debug('Detected Akamai im.* parameter', { param: key });
      return true;
    }
  }
  
  // Check for specific Akamai parameters
  const akamaiSpecificParams = [
    'imwidth', 'imheight', 'impolicy', 'imcolor', 'imquality',
    'imformat', 'imbypass', 'imcrop', 'imrotate', 'imdensity'
  ];
  
  for (const param of akamaiSpecificParams) {
    if (url.searchParams.has(param)) {
      logger.debug(`Detected Akamai specific parameter: ${param}`);
      return true;
    }
  }
  
  return false;
}

/**
 * Translate Akamai-style parameters to Cloudflare Image Resizing format
 * 
 * @param url The URL with Akamai parameters
 * @param config Optional configuration with advanced features flag
 * @returns Object with Cloudflare Image Resizing parameters
 */
export function translateAkamaiParams(url: URL, config?: ImageResizerConfig): TransformOptions {
  logger.breadcrumb('Translating Akamai parameters');
  
  try {
    // Create the parser and processor
    const akamaiParser = new AkamaiParser(logger);
    const processor = new DefaultParameterProcessor(logger);
    
    // Create a mock Request to use with the parser
    const mockRequest = new Request(`${url.toString()}`);
    
    // Parse the parameters
    const parameters: TransformParameter[] = akamaiParser.parse(mockRequest);
    
    // Process the parameters to get the normalized options
    const options = processor.process(parameters);
    
    logger.debug('Translated Akamai parameters', {
      paramCount: Object.keys(options).length,
      params: Object.keys(options).join(',')
    });
    
    // Apply any advanced features if the flag is enabled
    if (config?.features?.enableAkamaiAdvancedFeatures) {
      applyAdvancedFeatures(options, config);
    }
    
    return options;
  } catch (error) {
    logger.error('Failed to translate Akamai parameters', { 
      error: error instanceof Error ? error.message : String(error),
      url: url.toString()
    });
    
    // Return empty options on error
    return {};
  }
}

/**
 * Apply advanced features specific to Akamai compatibility
 * 
 * @param options The translation options
 * @param config The application configuration
 */
function applyAdvancedFeatures(options: TransformOptions, config: ImageResizerConfig): void {
  // Example of advanced feature: special handling for Akamai's smart crop
  if (options.aspect && !options.gravity) {
    options.gravity = 'auto';
    logger.debug('Applied advanced feature: auto gravity for aspect ratio');
  }
  
  // Enable additional features based on configuration
  if (config.derivatives && options.derivative) {
    const derivative = config.derivatives[options.derivative];
    if (derivative) {
      logger.debug('Applied derivative from config', { derivative: options.derivative });
      // Apply derivative (preserving existing options)
      Object.entries(derivative).forEach(([key, value]) => {
        if (options[key] === undefined) {
          options[key] = value;
        }
      });
    }
  }
}

/**
 * Create a new URL with translated parameters
 * 
 * @param url The original URL with Akamai parameters
 * @param config Optional configuration with advanced features flag
 * @returns A new URL with Cloudflare Image Resizing parameters
 */
export function createTranslatedUrl(url: URL, config?: ImageResizerConfig): URL {
  const newUrl = new URL(url.toString());
  
  // Translate parameters
  const cfParams = translateAkamaiParams(url, config);
  
  // Remove Akamai parameters
  for (const key of [...newUrl.searchParams.keys()]) {
    if (key === 'im' || key.startsWith('im.')) {
      newUrl.searchParams.delete(key);
    }
  }
  
  // Add Cloudflare parameters
  Object.entries(cfParams).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      newUrl.searchParams.set(key, String(value));
    }
  });
  
  return newUrl;
}