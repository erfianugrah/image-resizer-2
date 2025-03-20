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
    if (derivatives.includes(segment)) {
      logger.breadcrumb('Found derivative in path', undefined, { derivative: segment });
      return segment;
    }
  }
  
  logger.breadcrumb('No derivative found in path');
  return null;
}

/**
 * Parse query parameters for image options
 */
export function parseQueryOptions(
  searchParams: URLSearchParams
): Record<string, string | number | boolean> {
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
  
  const options: Record<string, string | number | boolean> = {};
  
  // Process common transformation parameters
  if (searchParams.has('width')) {
    const widthParam = searchParams.get('width') || '';
    if (widthParam === 'auto') {
      options.width = 'auto' as any; // Cast to any to handle 'auto' string
      logger.breadcrumb('Setting width to auto');
    } else {
      const width = parseInt(widthParam, 10);
      if (!isNaN(width)) {
        options.width = width;
        logger.breadcrumb('Setting width', undefined, { width });
      }
    }
  }
  
  if (searchParams.has('height')) {
    const heightParam = searchParams.get('height') || '';
    if (heightParam === 'auto') {
      options.height = 'auto' as any; // Cast to any to handle 'auto' string
    } else {
      const height = parseInt(heightParam, 10);
      if (!isNaN(height)) {
        options.height = height;
      }
    }
  }
  
  if (searchParams.has('quality')) {
    const qualityParam = searchParams.get('quality') || '';
    if (qualityParam === 'auto') {
      options.quality = 'auto' as any; // Cast to any to handle 'auto' string
    } else {
      const quality = parseInt(qualityParam, 10);
      if (!isNaN(quality)) {
        options.quality = quality;
      }
    }
  }
  
  if (searchParams.has('fit')) {
    options.fit = searchParams.get('fit') || '';
  }
  
  if (searchParams.has('format')) {
    options.format = searchParams.get('format') || '';
  }
  
  if (searchParams.has('derivative')) {
    options.derivative = searchParams.get('derivative') || '';
  }
  
  if (searchParams.has('background')) {
    options.background = searchParams.get('background') || '';
  }
  
  if (searchParams.has('metadata')) {
    options.metadata = searchParams.get('metadata') || '';
  }
  
  if (searchParams.has('gravity')) {
    options.gravity = searchParams.get('gravity') || '';
  }
  
  if (searchParams.has('dpr')) {
    const dpr = parseFloat(searchParams.get('dpr') || '');
    if (!isNaN(dpr)) {
      options.dpr = dpr;
    }
  }
  
  // Process boolean parameters
  ['trim', 'sharpen'].forEach(param => {
    if (searchParams.has(param)) {
      const value = searchParams.get(param);
      if (value === 'true') {
        options[param] = true;
      } else if (value === 'false') {
        options[param] = false;
      } else {
        const numValue = parseFloat(value || '');
        if (!isNaN(numValue)) {
          options[param] = numValue;
        }
      }
    }
  });
  
  logger.breadcrumb('Completed parsing query options', undefined, {
    optionCount: Object.keys(options).length,
    hasWidth: options.width !== undefined,
    hasHeight: options.height !== undefined,
    hasFormat: options.format !== undefined
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