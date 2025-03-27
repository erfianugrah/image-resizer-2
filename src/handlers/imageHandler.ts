/**
 * Image Handler
 * 
 * Main handler for image transformation requests
 */

import { ServiceContainer, TransformOptions } from '../services/interfaces';
import { parseImagePath, parseQueryOptions, extractDerivative, applyPathTransforms } from '../utils/path';
import { ValidationError } from '../utils/errors';
import { TransformImageCommand } from '../domain/commands';
import { PerformanceMetrics } from '../services/interfaces';

/**
 * Process an image transformation request
 * 
 * @param request The original request
 * @param url The URL to process
 * @param services Service container
 * @param metrics Performance metrics
 * @returns Response with the transformed image
 */
export async function handleImageRequest(
  request: Request,
  url: URL,
  services: ServiceContainer,
  metrics: PerformanceMetrics
): Promise<Response> {
  const { logger, configurationService } = services;
  const config = configurationService.getConfig();
  
  // Validate request method
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    throw new ValidationError(`Method ${request.method} not allowed`, { 
      allowedMethods: ['GET', 'HEAD'] 
    });
  }
  
  // Parse the path to extract image path and options
  const { imagePath: originalPath, options: pathOptions } = parseImagePath(url.pathname);
  
  // Validate path - must have some content
  if (!originalPath || originalPath === '/') {
    throw new ValidationError('Invalid image path', { path: originalPath });
  }
  
  // Apply path transformations if configured
  let imagePath = originalPath;
  if (config.pathTransforms) {
    imagePath = applyPathTransforms(originalPath, config.pathTransforms);
  }
  
  // Parse query parameters
  const queryOptions = parseQueryOptions(url.searchParams);
  
  // Combine options (query parameters take precedence over path options)
  const optionsFromUrl: TransformOptions = {
    ...Object.entries(pathOptions).reduce((acc, [key, value]) => {
      // Convert string values to numbers or booleans when appropriate
      if (value === 'true') {
        acc[key] = true;
      } else if (value === 'false') {
        acc[key] = false;
      } else {
        const numVal = Number(value);
        acc[key] = isNaN(numVal) ? value : numVal;
      }
      return acc;
    }, {} as TransformOptions),
    ...queryOptions
  };
  
  // Check for derivative in path segments
  const derivativeNames = Object.keys(config.derivatives);
  
  logger.debug('Available derivatives', {
    derivatives: derivativeNames.join(', '),
    count: derivativeNames.length,
    pathname: url.pathname
  });
  
  const derivativeResult = extractDerivative(url.pathname, derivativeNames);
  
  // If a derivative was found in the path, use it and modify the image path
  if (derivativeResult && !optionsFromUrl.derivative) {
    optionsFromUrl.derivative = derivativeResult.derivative;
    
    // Update the image path to the modified one (without the derivative segment)
    imagePath = derivativeResult.modifiedPath;
    
    logger.debug('Found and applied derivative from path', {
      pathname: url.pathname,
      derivative: derivativeResult.derivative,
      originalPath: url.pathname,
      modifiedImagePath: imagePath
    });
  }
  
  // Check for named path templates (only if no derivative was found in the path)
  if (!optionsFromUrl.derivative && config.pathTemplates) {
    const segments = url.pathname.split('/').filter(Boolean);
    for (const segment of segments) {
      const templateName = config.pathTemplates[segment];
      if (templateName) {
        optionsFromUrl.derivative = templateName;
        logger.debug('Applied derivative from path template', {
          segment,
          templateName
        });
        break;
      }
    }
  }
  
  // Log derivative application status
  if (optionsFromUrl.derivative) {
    if (config.derivatives[optionsFromUrl.derivative]) {
      logger.debug('Using derivative for transformation', {
        derivative: optionsFromUrl.derivative,
        imagePath,
        templateProperties: Object.keys(config.derivatives[optionsFromUrl.derivative]).join(',')
      });
    } else {
      logger.warn('Derivative not found in configuration', {
        derivative: optionsFromUrl.derivative,
        availableDerivatives: Object.keys(config.derivatives).join(',')
      });
    }
  }
  
  // Create and execute the transform image command
  const transformCommand = new TransformImageCommand(
    request,
    imagePath,
    optionsFromUrl,
    services,
    metrics,
    url
  );
  
  logger.breadcrumb('Executing transform image command');
  return await transformCommand.execute();
}