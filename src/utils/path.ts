/**
 * Path handling utilities
 */

import { defaultLogger } from './logging';

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
 * Parameter interfaces for transform parameter handling
 */

export interface TransformParameter {
  name: string;           // Parameter name (e.g., 'width', 'aspect')
  aliasFor?: string;      // For compact parameters, the standard parameter name
  value: string | number | boolean; // Parameter value
  source: 'url' | 'path' | 'akamai' | 'compact' | 'derivative' | 'derived'; // Parameter source
  priority: number;       // Precedence when conflicting parameters exist
  __explicitWidth?: boolean; // Flag to mark width as explicitly set by user (e.g., imwidth)
  __explicitHeight?: boolean; // Flag to mark height as explicitly set by user (e.g., imheight)
}

export interface TransformParameterDefinition {
  name: string;
  aliases?: string[];     // Alternative names ('r' for 'aspect')
  type: 'number' | 'string' | 'boolean' | 'enum' | 'size-code' | 'coordinate' | 'auto-or-number';
  validator?: (value: any) => boolean;
  formatter?: (value: any) => any; // Convert to Cloudflare format
  defaultValue?: any;
  allowedValues?: any[];
  priority?: number;      // Used for conflict resolution
}

/**
 * Extract image path and options from URL path
 */
export function parseImagePath(pathname: string): {
  imagePath: string;
  options: Record<string, string>;
} {
  // Use defaultLogger from the logging module
  // This avoids circular dependencies during initialization
  defaultLogger.breadcrumb('Parsing image path', undefined, { pathname });

  // Default result
  const result = {
    imagePath: '',
    options: {},
  };

  // Check if pathname is empty
  if (!pathname || pathname === '/') {
    defaultLogger.breadcrumb('Empty pathname, returning empty result');
    return result;
  }

  // Split pathname into segments
  const segments = pathname.split('/').filter(Boolean);

  // Check if there are any segments
  if (segments.length === 0) {
    defaultLogger.breadcrumb('No path segments found');
    return result;
  }

  // Process options in the path
  // We'll look for options prefixed with underscore, like:
  // /images/_width=300/_quality=80/example.jpg

  const optionSegments: string[] = [];
  const pathSegments: string[] = [];

  segments.forEach((segment) => {
    if (segment.startsWith('_') && segment.includes('=')) {
      optionSegments.push(segment);
    } else {
      pathSegments.push(segment);
    }
  });

  // Parse options into a key-value object
  const options: Record<string, string> = {};

  optionSegments.forEach((segment) => {
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

  defaultLogger.breadcrumb('Finished parsing image path', undefined, {
    imagePath,
    optionsCount: Object.keys(options).length,
  });

  return {
    imagePath,
    options,
  };
}

/**
 * Extract derivative name from path and provide a modified path without the derivative
 *
 * For example, if the path is /image/product/file.jpg,
 * and the derivative is specified as "product", it will return
 * { derivative: "product", modifiedPath: "/image/file.jpg" }
 */
export function extractDerivative(
  pathname: string,
  derivatives: string[],
): { derivative: string; modifiedPath: string } | null {
  // Use defaultLogger for breadcrumb
  defaultLogger.breadcrumb('Extracting derivative from path', undefined, {
    pathname,
    availableDerivatives: derivatives?.length || 0,
    derivativeList: Array.isArray(derivatives) ? derivatives.join(',') : 'invalid'
  });

  // More defensive check for derivatives
  if (!pathname) {
    defaultLogger.breadcrumb('No path provided');
    return null;
  }
  
  // Handle case where derivatives might be undefined or null
  if (!derivatives) {
    defaultLogger.breadcrumb('Derivatives array is undefined or null');
    return null;
  }
  
  // Verify derivatives is actually an array
  if (!Array.isArray(derivatives)) {
    defaultLogger.breadcrumb('Derivatives is not an array', undefined, {
      derivativesType: typeof derivatives
    });
    return null;
  }
  
  // Check if there are any derivatives to match against
  if (derivatives.length === 0) {
    defaultLogger.breadcrumb('Derivatives array is empty');
    return null;
  }

  // Split pathname into segments
  const segments = pathname.split('/').filter(Boolean);
  
  if (segments.length === 0) {
    defaultLogger.breadcrumb('No path segments to check');
    return null;
  }

  // Log all segments for debugging
  defaultLogger.breadcrumb('Checking path segments', undefined, {
    segments: segments.join(',')
  });

  // Check each segment against the list of derivatives
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];

    // Check if this segment matches any of our derivatives
    if (derivatives.includes(segment)) {
      // Create modified path without the derivative segment
      const pathSegments = [...segments];
      pathSegments.splice(i, 1);
      const modifiedPath = '/' + pathSegments.join('/');

      defaultLogger.breadcrumb('Found derivative in path', undefined, {
        derivative: segment,
        originalPath: pathname,
        modifiedPath,
        segmentIndex: i
      });

      return {
        derivative: segment,
        modifiedPath,
      };
    }
  }

  // List the first few segments that didn't match for debugging
  defaultLogger.breadcrumb('No derivative found in path', undefined, {
    pathSegments: segments.slice(0, 3).join(','),
    totalSegments: segments.length
  });
  
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
  searchParams: URLSearchParams,
): Record<string, unknown> {
  // Use default console log until we can dynamically import the logger
  // This avoids circular dependencies during initialization
  defaultLogger.breadcrumb('Parsing query options', undefined, {
    paramCount: Array.from(searchParams.keys()).length,
  });

  const options: Record<string, unknown> = {};

  // Define parameter categories for systematic processing

  // Parameters that can be 'auto' or numeric
  const autoOrNumericParams = ['width', 'height', 'quality'];

  // Parameters that should be parsed as numbers
  const numericParams = [
    'blur',
    'brightness',
    'contrast',
    'dpr',
    'gamma',
    'rotate',
    'saturation',
    'sharpen',
  ];

  // Parameters that should be parsed as strings
  const stringParams = [
    'fit',
    'format',
    'gravity',
    'metadata',
    'background',
    'derivative',
    'origin-auth',
    'aspect',
    'focal',
    'platform',
    'content',
    'device',
    'f', // Custom format size parameter
    'r',
    'p', // Short form parameters for aspect ratio and positioning
  ];

  // Parameters that can be boolean or numeric
  const booleanOrNumericParams = ['trim', 'strip', 'sharpen'];

  // Parameters that accept string values or can be parsed as boolean
  const stringOrBooleanParams = ['flip'];

  // Parameters that are boolean only
  const booleanParams = [
    'anim',
    'strip',
    'flop',
    '_needsImageInfo',
    'smart',
    'allowExpansion',
  ];

  // Process 'auto' or numeric parameters
  autoOrNumericParams.forEach((param) => {
    if (searchParams.has(param)) {
      const paramValue = searchParams.get(param) || '';
      if (paramValue.toLowerCase() === 'auto') {
        options[param] = 'auto';
        if (param === 'width') {
          defaultLogger.breadcrumb(`Setting ${param} to auto`);
        }
      } else {
        const numValue = parseInt(paramValue, 10);
        if (!isNaN(numValue)) {
          options[param] = numValue;
          if (param === 'width') {
            defaultLogger.breadcrumb(`Setting ${param}`, undefined, {
              [param]: numValue,
            });
          }
        }
      }
    }
  });

  // Process numeric parameters
  numericParams.forEach((param) => {
    if (searchParams.has(param)) {
      const paramValue = searchParams.get(param) || '';
      const numValue = parseFloat(paramValue);
      if (!isNaN(numValue)) {
        options[param] = numValue;
        if (param === 'blur') {
          defaultLogger.breadcrumb(`Setting ${param}`, undefined, {
            [param]: numValue,
          });
        }
      }
    }
  });

  // Process string parameters
  stringParams.forEach((param) => {
    if (searchParams.has(param)) {
      const value = searchParams.get(param) || '';
      if (value) {
        options[param] = value;
      }
    }
  });

  // Process boolean or numeric parameters
  booleanOrNumericParams.forEach((param) => {
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
  booleanParams.forEach((param) => {
    if (searchParams.has(param)) {
      const value = searchParams.get(param) || '';
      options[param] = value.toLowerCase() !== 'false';
    }
  });

  // Process string or boolean parameters
  stringOrBooleanParams.forEach((param) => {
    if (searchParams.has(param)) {
      const value = searchParams.get(param) || '';

      // For flip parameter, special handling to allow string values
      if (param === 'flip') {
        const lowerValue = value.toLowerCase();
        if (lowerValue === 'true') {
          options[param] = true;
        } else if (lowerValue === 'false') {
          options[param] = false;
        } else if (
          ['h', 'v', 'hv', 'horizontal', 'vertical', 'both'].includes(
            lowerValue,
          )
        ) {
          // Pass through valid string values
          options[param] = lowerValue;
        } else if (lowerValue) {
          // Default invalid values to 'h' (horizontal)
          options[param] = 'h';
          defaultLogger.breadcrumb(
            `Converted invalid ${param} value to h`,
            undefined,
            {
              originalValue: lowerValue,
            },
          );
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
      const drawArray = Array.isArray(drawData) ? drawData : [drawData];
      options.draw = drawArray;
      defaultLogger.breadcrumb('Parsed draw parameter', undefined, {
        drawItems: drawArray.length,
      });
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e) {
      // The error details are intentionally ignored
      // We intentionally ignore the error details
      defaultLogger.breadcrumb('Failed to parse draw parameter as JSON');
      // If not valid JSON, skip this parameter
    }
  }

  // Handle custom format size parameter 'f'
  if (searchParams.has('f') && !options.width) {
    const formatSize = searchParams.get('f') || '';
    // Map predefined size codes to pixel widths
    const sizeMap: Record<string, number> = {
      'xxu': 40,
      'xu': 80,
      'u': 160,
      'xxxs': 300,
      'xxs': 400,
      'xs': 500,
      's': 600,
      'm': 700,
      'l': 750,
      'xl': 900,
      'xxl': 1100,
      'xxxl': 1400,
      'sg': 1600,
      'g': 2000,
      'xg': 3000,
      'xxg': 4000,
    };

    if (sizeMap[formatSize]) {
      options.width = sizeMap[formatSize];
      defaultLogger.breadcrumb('Applied custom format size', undefined, {
        formatCode: formatSize,
        width: options.width as number,
      });
    }

    // Clean up the 'f' parameter as we've translated it to width
    delete options.f;
  }

  // Handle short form aspect ratio parameter 'r' (e.g., r=16:9)
  if (searchParams.has('r') && !options.aspect) {
    const aspectRatio = searchParams.get('r') || '';
    if (aspectRatio.includes(':') || aspectRatio.includes('-')) {
      // Convert to the standard aspect format
      options.aspect = aspectRatio;
      defaultLogger.breadcrumb('Applied compact aspect ratio parameter', undefined, {
        r: aspectRatio,
        aspect: options.aspect as string,
      });
    }
    // Clean up the short parameter as we've translated it
    delete options.r;
  }

  // Handle short form positioning parameter 'p' (e.g., p=0.7,0.5)
  if (searchParams.has('p') && !options.focal) {
    const position = searchParams.get('p') || '';
    if (position.includes(',')) {
      // Check if it's a valid x,y format (two numbers separated by comma)
      const [x, y] = position.split(',').map((v) => parseFloat(v));
      if (!isNaN(x) && !isNaN(y) && x >= 0 && x <= 1 && y >= 0 && y <= 1) {
        options.focal = position;
        defaultLogger.breadcrumb('Applied compact positioning parameter', undefined, {
          p: position,
          focal: options.focal as string,
          x,
          y,
        });
      }
    }
    // Clean up the short parameter as we've translated it
    delete options.p;
  }

  defaultLogger.breadcrumb('Completed parsing query options', undefined, {
    optionCount: Object.keys(options).length,
    hasWidth: options.width !== undefined,
    hasHeight: options.height !== undefined,
    hasFormat: options.format !== undefined,
    hasBlur: options.blur !== undefined,
    hasFlip: options.flip !== undefined,
    flipValue: options.flip !== undefined
      ? (typeof options.flip === 'string' ? options.flip : String(options.flip))
      : 'undefined',
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
  pathTransforms: PathTransforms,
): string {
  // Use defaultLogger to avoid circular dependencies
  defaultLogger.breadcrumb('Applying path transforms', undefined, {
    imagePath,
    transformCount: Object.keys(pathTransforms).length,
  });

  // Check if path matches any transform segment
  const segments = imagePath.split('/').filter(Boolean);

  if (segments.length === 0) {
    defaultLogger.breadcrumb('No path segments to transform');
    return imagePath;
  }

  // Check if the first segment matches any transform
  const firstSegment = segments[0];
  const transform = pathTransforms[firstSegment];

  if (!transform) {
    defaultLogger.breadcrumb('No matching transform found for segment', undefined, {
      segment: firstSegment,
    });
    return imagePath;
  }

  // Apply the transformation
  let newPath: string;

  if (transform.removePrefix) {
    // Remove the prefix segment
    newPath = '/' + segments.slice(1).join('/');
    defaultLogger.breadcrumb('Removed prefix segment', undefined, {
      prefix: firstSegment,
      originalPath: imagePath,
      transformedPath: newPath,
    });
  } else {
    newPath = imagePath;
    defaultLogger.breadcrumb('Keeping original path', undefined, { path: imagePath });
  }

  // Add a new prefix if specified
  if (transform.prefix && transform.prefix.length > 0) {
    newPath = '/' + transform.prefix + newPath;
    defaultLogger.breadcrumb('Added new prefix', undefined, {
      prefix: transform.prefix,
      finalPath: newPath,
    });
  }

  defaultLogger.breadcrumb('Path transformation complete', undefined, {
    originalPath: imagePath,
    transformedPath: newPath,
  });

  return newPath;
}
