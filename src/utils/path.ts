/**
 * Path handling utilities
 */

// Path transformation configuration type
export interface PathTransform {
  prefix: string;
  removePrefix: boolean;
  // Origin-specific transforms
  r2?: {
    prefix: string;
    removePrefix: boolean;
  };
  remote?: {
    prefix: string;
    removePrefix: boolean;
  };
  fallback?: {
    prefix: string;
    removePrefix: boolean;
  };
}

// Path transformations mapping type
export interface PathTransforms {
  [key: string]: PathTransform;
}

/**
 * Extract image path and options from URL path
 */
export function parseImagePath(pathname: string): {
  imagePath: string;
  options: Record<string, string>;
} {
  // Use default console log until we can dynamically import the logger
  // This avoids circular dependencies during initialization
  const logger = {
    breadcrumb: (step: string, duration?: number, data?: Record<string, any>) => {
      console.log(`[INFO] 🔶 BREADCRUMB: ${step}`, data || '');
    }
  };

  logger.breadcrumb('Parsing image path', undefined, { pathname });
  
  // Default result
  const result = {
    imagePath: '',
    options: {}
  };
  
  // Check if pathname is empty
  if (!pathname || pathname === '/') {
    logger.breadcrumb('Empty pathname, returning empty result');
    return result;
  }
  
  // Split pathname into segments
  const segments = pathname.split('/').filter(Boolean);
  
  // Check if there are any segments
  if (segments.length === 0) {
    logger.breadcrumb('No path segments found');
    return result;
  }
  
  // Process options in the path
  // We'll look for options prefixed with underscore, like:
  // /images/_width=300/_quality=80/example.jpg
  
  const optionSegments: string[] = [];
  const pathSegments: string[] = [];
  
  segments.forEach(segment => {
    if (segment.startsWith('_') && segment.includes('=')) {
      optionSegments.push(segment);
    } else {
      pathSegments.push(segment);
    }
  });
  
  // Parse options into a key-value object
  const options: Record<string, string> = {};
  
  optionSegments.forEach(segment => {
    // Remove the leading underscore
    const optionText = segment.substring(1);
    
    // Split by the first equals sign
    const equalsIndex = optionText.indexOf('=');
    
    if (equalsIndex > 0) {
      const key = optionText.substring(0, equalsIndex);
      const value = optionText.substring(equalsIndex + 1);
      
      options[key] = value;
    }
  });
  
  // Reconstruct the image path
  const imagePath = '/' + pathSegments.join('/');
  
  logger.breadcrumb('Finished parsing image path', undefined, { 
    imagePath, 
    optionsCount: Object.keys(options).length 
  });
  
  return {
    imagePath,
    options
  };
}

/**
 * Extract derivative name from path
 * 
 * For example, if the path is /image/product/file.jpg,
 * and the derivative is specified as "product", it will return "product"
 */
export function extractDerivative(
  pathname: string,
  derivatives: string[]
): string | null {
  // Use default console log until we can dynamically import the logger
  // This avoids circular dependencies during initialization
  const logger = {
    breadcrumb: (step: string, duration?: number, data?: Record<string, any>) => {
      console.log(`[INFO] 🔶 BREADCRUMB: ${step}`, data || '');
    }
  };

  logger.breadcrumb('Extracting derivative from path', undefined, { 
    pathname, 
    availableDerivatives: derivatives?.length || 0 
  });
  
  // Default result
  if (!pathname || !derivatives || derivatives.length === 0) {
    logger.breadcrumb('No path or derivatives provided');
    return null;
  }
  
  // Split pathname into segments
  const segments = pathname.split('/').filter(Boolean);
  
  // Check each segment against the list of derivatives
  for (const segment of segments) {
    // Direct match
    if (derivatives.includes(segment)) {
      logger.breadcrumb('Found derivative in path', undefined, { derivative: segment });
      return segment;
    }
    
    // Check for video-specific derivatives
    if (segment.startsWith('video-')) {
      // Check if this matches one of our derivatives
      if (derivatives.includes(segment)) {
        logger.breadcrumb('Found video derivative in path', undefined, { derivative: segment });
        return segment;
      }
      
      // Check for fallback to video-medium if the specific derivative doesn't exist
      if (derivatives.includes('video-medium')) {
        logger.breadcrumb('Video derivative not found, using fallback', undefined, {
          requestedDerivative: segment,
          fallbackDerivative: 'video-medium'
        });
        return 'video-medium';
      }
    }
  }
  
  logger.breadcrumb('No derivative found in path');
  return null;
}

/**
 * Parse query parameters for image options
 * 
 * Extracts and normalizes parameters for Cloudflare Image Resizing from URL query parameters.
 * Handles all supported Cloudflare Worker image transformation options.
 * 
 * @see https://developers.cloudflare.com/images/image-resizing/resize-with-workers/
 * @param searchParams - URLSearchParams object containing the query parameters
 * @returns Record with parsed and normalized transformation options
 */
export function parseQueryOptions(
  searchParams: URLSearchParams
): Record<string, any> {
  // Use default console log until we can dynamically import the logger
  // This avoids circular dependencies during initialization
  const logger = {
    breadcrumb: (step: string, duration?: number, data?: Record<string, any>) => {
      console.log(`[INFO] 🔶 BREADCRUMB: ${step}`, data || '');
    }
  };

  logger.breadcrumb('Parsing query options', undefined, {
    paramCount: Array.from(searchParams.keys()).length
  });
  
  const options: Record<string, any> = {};
  
  // Define parameter categories for systematic processing
  
  // Parameters that can be 'auto' or numeric
  const autoOrNumericParams = ['width', 'height', 'quality'];
  
  // Parameters that should be parsed as numbers
  const numericParams = [
    'blur', 'brightness', 'contrast', 'dpr', 'gamma', 
    'rotate', 'saturation', 'sharpen'
  ];
  
  // Parameters that should be parsed as strings
  const stringParams = [
    'fit', 'format', 'gravity', 'metadata', 'background',
    'derivative', 'origin-auth'
  ];
  
  // Parameters that can be boolean or numeric
  const booleanOrNumericParams = ['trim', 'strip', 'sharpen'];
  
  // Parameters that accept string values or can be parsed as boolean
  const stringOrBooleanParams = ['flip'];
  
  // Parameters that are boolean only
  const booleanParams = ['anim', 'strip', 'flop'];
  
  // Process 'auto' or numeric parameters
  autoOrNumericParams.forEach(param => {
    if (searchParams.has(param)) {
      const paramValue = searchParams.get(param) || '';
      if (paramValue.toLowerCase() === 'auto') {
        options[param] = 'auto' as any;
        if (param === 'width') {
          logger.breadcrumb(`Setting ${param} to auto`);
        }
      } else {
        const numValue = parseInt(paramValue, 10);
        if (!isNaN(numValue)) {
          options[param] = numValue;
          if (param === 'width') {
            logger.breadcrumb(`Setting ${param}`, undefined, { [param]: numValue });
          }
        }
      }
    }
  });
  
  // Process numeric parameters
  numericParams.forEach(param => {
    if (searchParams.has(param)) {
      const paramValue = searchParams.get(param) || '';
      const numValue = parseFloat(paramValue);
      if (!isNaN(numValue)) {
        options[param] = numValue;
        if (param === 'blur') {
          logger.breadcrumb(`Setting ${param}`, undefined, { [param]: numValue });
        }
      }
    }
  });
  
  // Process string parameters
  stringParams.forEach(param => {
    if (searchParams.has(param)) {
      const value = searchParams.get(param) || '';
      if (value) {
        options[param] = value;
      }
    }
  });
  
  // Process boolean or numeric parameters
  booleanOrNumericParams.forEach(param => {
    if (searchParams.has(param)) {
      const value = searchParams.get(param) || '';
      if (value.toLowerCase() === 'true') {
        options[param] = true;
      } else if (value.toLowerCase() === 'false') {
        options[param] = false;
      } else {
        const numValue = parseFloat(value);
        if (!isNaN(numValue)) {
          options[param] = numValue;
        }
      }
    }
  });
  
  // Process boolean parameters
  booleanParams.forEach(param => {
    if (searchParams.has(param)) {
      const value = searchParams.get(param) || '';
      options[param] = value.toLowerCase() !== 'false';
    }
  });
  
  // Process string or boolean parameters
  stringOrBooleanParams.forEach(param => {
    if (searchParams.has(param)) {
      const value = searchParams.get(param) || '';
      
      // For flip parameter, special handling to allow string values
      if (param === 'flip') {
        const lowerValue = value.toLowerCase();
        if (lowerValue === 'true') {
          options[param] = true;
        } else if (lowerValue === 'false') {
          options[param] = false;
        } else if (['h', 'v', 'hv', 'horizontal', 'vertical', 'both'].includes(lowerValue)) {
          // Pass through valid string values
          options[param] = lowerValue;
        } else if (lowerValue) {
          // Default invalid values to 'h' (horizontal)
          options[param] = 'h';
          logger.breadcrumb(`Converted invalid ${param} value to h`, undefined, {
            originalValue: lowerValue
          });
        }
      }
    }
  });
  
  // Handle special case for draw (overlays/watermarks)
  if (searchParams.has('draw')) {
    try {
      const drawValue = searchParams.get('draw') || '';
      // Attempt to parse as JSON
      const drawData = JSON.parse(drawValue);
      options.draw = Array.isArray(drawData) ? drawData : [drawData];
      logger.breadcrumb('Parsed draw parameter', undefined, { 
        drawItems: options.draw.length
      });
    } catch (e) {
      logger.breadcrumb('Failed to parse draw parameter as JSON');
      // If not valid JSON, skip this parameter
    }
  }
  
  logger.breadcrumb('Completed parsing query options', undefined, {
    optionCount: Object.keys(options).length,
    hasWidth: options.width !== undefined,
    hasHeight: options.height !== undefined,
    hasFormat: options.format !== undefined,
    hasBlur: options.blur !== undefined,
    hasFlip: options.flip !== undefined,
    flipValue: options.flip !== undefined ? 
      (typeof options.flip === 'string' ? options.flip : String(options.flip)) : 'undefined'
  });
  
  return options;
}

/**
 * Apply path transformations to the image path
 * 
 * This helps with path normalization when images are stored with different
 * directory structures.
 */
export function applyPathTransforms(
  imagePath: string,
  pathTransforms: PathTransforms
): string {
  // Use default console log until we can dynamically import the logger
  // This avoids circular dependencies during initialization
  const logger = {
    breadcrumb: (step: string, duration?: number, data?: Record<string, any>) => {
      console.log(`[INFO] 🔶 BREADCRUMB: ${step}`, data || '');
    }
  };

  logger.breadcrumb('Applying path transforms', undefined, { 
    imagePath,
    transformCount: Object.keys(pathTransforms).length 
  });
  
  // Check if path matches any transform segment
  const segments = imagePath.split('/').filter(Boolean);
  
  if (segments.length === 0) {
    logger.breadcrumb('No path segments to transform');
    return imagePath;
  }
  
  // Check if the first segment matches any transform
  const firstSegment = segments[0];
  const transform = pathTransforms[firstSegment];
  
  if (!transform) {
    logger.breadcrumb('No matching transform found for segment', undefined, { segment: firstSegment });
    return imagePath;
  }
  
  // Apply the transformation
  let newPath: string;
  
  if (transform.removePrefix) {
    // Remove the prefix segment
    newPath = '/' + segments.slice(1).join('/');
    logger.breadcrumb('Removed prefix segment', undefined, { 
      prefix: firstSegment,
      originalPath: imagePath,
      transformedPath: newPath
    });
  } else {
    newPath = imagePath;
    logger.breadcrumb('Keeping original path', undefined, { path: imagePath });
  }
  
  // Add a new prefix if specified
  if (transform.prefix && transform.prefix.length > 0) {
    newPath = '/' + transform.prefix + newPath;
    logger.breadcrumb('Added new prefix', undefined, { 
      prefix: transform.prefix,
      finalPath: newPath
    });
  }
  
  logger.breadcrumb('Path transformation complete', undefined, {
    originalPath: imagePath,
    transformedPath: newPath
  });
  
  return newPath;
}