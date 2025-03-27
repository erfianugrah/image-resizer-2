/**
 * Metadata-driven image transformation handler
 * 
 * This handler provides intelligent image transformations based on
 * analysis of image metadata.
 */

import { Env } from '../types';
import { ServiceContainer, MetadataProcessingOptions } from '../services/interfaces';

/**
 * Handle an image transformation request using metadata-driven optimization
 *
 * @param request Original request
 * @param env Environment variables
 * @param services Service container
 * @returns Response with transformed image
 */
export async function handleMetadataTransformation(
  request: Request,
  env: Env,
  services: ServiceContainer
): Promise<Response> {
  const { 
    logger, 
    metadataService, 
    configurationService
  } = services;
  
  if (!metadataService) {
    logger.error('Metadata service not available');
    return new Response('Metadata service not available', { status: 500 });
  }
  
  try {
    const config = configurationService.getConfig();
    
    // Only proceed if metadata service is enabled
    if (!config.metadata?.enabled) {
      logger.warn('Metadata service is disabled in configuration');
      return new Response('Metadata-driven transformations are disabled', { status: 403 });
    }
    
    const url = new URL(request.url);
    const pathname = url.pathname;
    
    // Extract image path from request
    // This example assumes a path pattern like /smart/path/to/image.jpg
    // You should adapt this to your routing pattern
    const imagePath = pathname.replace(/^\/smart\/?/, '');
    
    if (!imagePath) {
      logger.warn('No image path provided in request');
      return new Response('No image path provided', { status: 400 });
    }
    
    // Parse target aspect ratio if provided in query
    let targetAspect: { width: number, height: number } | undefined;
    const aspectParam = url.searchParams.get('aspect');
    if (aspectParam) {
      // Format can be "16:9" or "16-9"
      const parts = aspectParam.includes(':') 
        ? aspectParam.split(':') 
        : aspectParam.split('-');
      
      if (parts.length === 2) {
        const width = parseFloat(parts[0]);
        const height = parseFloat(parts[1]);
        
        if (!isNaN(width) && !isNaN(height) && width > 0 && height > 0) {
          targetAspect = { width, height };
        }
      }
    }
    
    // Extract processing options from query params and headers
    const options: MetadataProcessingOptions = {};
    
    // Check for platform in query or header
    const platformParam = url.searchParams.get('platform');
    if (platformParam) {
      options.targetPlatform = platformParam;
    } else if (config.metadata?.headerNames?.targetPlatform) {
      const platformHeader = request.headers.get(config.metadata.headerNames.targetPlatform);
      if (platformHeader) {
        options.targetPlatform = platformHeader;
      }
    }
    
    // Check for content type in query or header
    const contentTypeParam = url.searchParams.get('content');
    if (contentTypeParam) {
      options.contentType = contentTypeParam;
    } else if (config.metadata?.headerNames?.contentType) {
      const contentTypeHeader = request.headers.get(config.metadata.headerNames.contentType);
      if (contentTypeHeader) {
        options.contentType = contentTypeHeader;
      }
    }
    
    // Check for focal point in query or header
    const focalPointParam = url.searchParams.get('focal');
    if (focalPointParam) {
      const [x, y] = focalPointParam.split(',').map(parseFloat);
      if (!isNaN(x) && !isNaN(y) && x >= 0 && x <= 1 && y >= 0 && y <= 1) {
        options.focalPoint = { x, y };
      }
    } else if (config.metadata?.headerNames?.focalPoint) {
      const focalPointHeader = request.headers.get(config.metadata.headerNames.focalPoint);
      if (focalPointHeader) {
        const [x, y] = focalPointHeader.split(',').map(parseFloat);
        if (!isNaN(x) && !isNaN(y) && x >= 0 && x <= 1 && y >= 0 && y <= 1) {
          options.focalPoint = { x, y };
        }
      }
    }
    
    // Check for allow expansion param
    const allowExpansionParam = url.searchParams.get('allowExpansion');
    if (allowExpansionParam !== null) {
      options.allowExpansion = allowExpansionParam === 'true';
    }
    
    // Check for device type
    const deviceParam = url.searchParams.get('device');
    if (deviceParam && ['mobile', 'tablet', 'desktop'].includes(deviceParam)) {
      options.deviceType = deviceParam as 'mobile' | 'tablet' | 'desktop';
    }
    
    // Fetch and process metadata to get transform parameters
    logger.debug('Fetching and processing metadata', {
      imagePath,
      targetAspect: targetAspect ? `${targetAspect.width}:${targetAspect.height}` : undefined,
      targetPlatform: options.targetPlatform,
      contentType: options.contentType,
      focalPoint: options.focalPoint ? `${options.focalPoint.x},${options.focalPoint.y}` : undefined
    });
    
    // We need to cast options to any to avoid TypeScript issues with index signatures
    // This is safe because the MetadataProcessingOptions interface matches what's expected
    const transformResult = await metadataService.fetchAndProcessMetadata(
      imagePath,
      config,
      env,
      request,
      targetAspect,
      options
    );
    
    // If no result or error, return error response
    if (!transformResult || Object.keys(transformResult).length === 0) {
      logger.error('Failed to process metadata for image', { imagePath });
      return new Response('Failed to process image metadata', { status: 500 });
    }
    
    // Create a redirect to the optimized URL
    const optimizedUrl = new URL(request.url);
    optimizedUrl.pathname = `/${imagePath}`;
    
    // Clear existing query parameters
    for (const key of Array.from(optimizedUrl.searchParams.keys())) {
      optimizedUrl.searchParams.delete(key);
    }
    
    // Add aspect crop parameters if present
    if (transformResult.aspectCrop) {
      const { width, height, hoffset, voffset, allowExpansion } = transformResult.aspectCrop;
      optimizedUrl.searchParams.set('im.aspectCrop', 
        `width:${width},height:${height},hoffset:${hoffset},voffset:${voffset}` + 
        (allowExpansion ? ',allowExpansion:true' : '')
      );
    }
    
    // Add dimension parameters if present
    if (transformResult.dimensions) {
      if (transformResult.dimensions.width) {
        optimizedUrl.searchParams.set('width', transformResult.dimensions.width.toString());
      }
      if (transformResult.dimensions.height) {
        optimizedUrl.searchParams.set('height', transformResult.dimensions.height.toString());
      }
    }
    
    // Add quality if present
    if (transformResult.quality) {
      optimizedUrl.searchParams.set('quality', transformResult.quality.toString());
    }
    
    // Add format if present
    if (transformResult.format) {
      optimizedUrl.searchParams.set('format', transformResult.format);
    }
    
    // Add DPR if present
    if (transformResult.dpr) {
      optimizedUrl.searchParams.set('dpr', transformResult.dpr.toString());
    }
    
    // Log the optimized URL
    logger.info('Created optimized transformation URL', {
      original: request.url,
      optimized: optimizedUrl.toString()
    });
    
    // Create a new request with smart=true parameter to use the implementation in transformImageCommand
    const smartUrl = new URL(request.url);
    smartUrl.pathname = `/${imagePath}`;
    
    // Clear existing query parameters
    for (const key of Array.from(smartUrl.searchParams.keys())) {
      smartUrl.searchParams.delete(key);
    }
    
    // Add smart parameter to trigger smart processing
    smartUrl.searchParams.set('smart', 'true');
    
    // Add other smart parameters that might be needed
    if (options.targetPlatform) {
      smartUrl.searchParams.set('platform', options.targetPlatform);
    }
    
    if (options.contentType) {
      smartUrl.searchParams.set('content', options.contentType);
    }
    
    if (options.deviceType) {
      smartUrl.searchParams.set('device', options.deviceType);
    }
    
    if (options.focalPoint) {
      smartUrl.searchParams.set('focal', `${options.focalPoint.x},${options.focalPoint.y}`);
    }
    
    if (targetAspect) {
      smartUrl.searchParams.set('aspect', `${targetAspect.width}:${targetAspect.height}`);
    }
    
    if (options.allowExpansion !== undefined) {
      smartUrl.searchParams.set('allowExpansion', options.allowExpansion ? 'true' : 'false');
    }
    
    logger.debug('Created smart URL for processing', { smartUrl: smartUrl.toString() });
    
    // Determine if we should redirect or proxy the request
    const redirectMode = url.searchParams.get('redirect');
    if (redirectMode === 'true') {
      return Response.redirect(smartUrl.toString(), 302);
    }
    
    // If not redirecting, create a new request to fetch the transformed image
    const transformedRequest = new Request(smartUrl, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      redirect: request.redirect
    });
    
    // Forward the request to our image handler pipeline
    // by returning a fetch to the smart URL
    return fetch(transformedRequest);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Error in metadata transformation handler', { error: errorMessage });
    return new Response(`Error processing metadata: ${errorMessage}`, { status: 500 });
  }
}