/**
 * Path Service Implementation 
 * 
 * Provides path handling functionality for the image resizer.
 */

import { PathService } from './interfaces';
import { Logger } from '../utils/logging';
import { ImageResizerConfig } from '../config';
import { 
  PathTransform,
  PathTransforms
} from '../utils/path';

/**
 * Default implementation of the PathService
 */
export class PathServiceImpl implements PathService {
  private logger: Logger;
  private config: ImageResizerConfig;

  /**
   * Create a new path service
   * 
   * @param logger Logger for the service
   */
  constructor(logger: Logger) {
    this.logger = logger;
    this.config = {} as ImageResizerConfig;
  }

  /**
   * Configure the path service
   * 
   * @param config Configuration for the service
   */
  configure(config: ImageResizerConfig): void {
    this.config = config;
    this.logger.debug('PathService configured', { 
      hasPathTransforms: config.pathTransforms ? 
        Object.keys(config.pathTransforms).length : 0 
    });
  }

  /**
   * Normalize a path by removing double slashes, trailing slashes, etc.
   * 
   * @param path The path to normalize
   * @returns Normalized path
   */
  normalizePath(path: string): string {
    if (!path) return '/';

    // Ensure path starts with /
    if (!path.startsWith('/')) {
      path = '/' + path;
    }

    // Normalize multiple slashes
    path = path.replace(/\/+/g, '/');

    // Remove trailing slash if not the root path
    if (path.length > 1 && path.endsWith('/')) {
      path = path.slice(0, -1);
    }

    return path;
  }

  /**
   * Parse image path and options from URL path
   * 
   * @param pathname URL pathname
   * @returns Object with image path and options
   */
  parseImagePath(pathname: string): {
    imagePath: string;
    options: Record<string, string>;
  } {
    this.logger.breadcrumb('Parsing image path', undefined, { pathname });
    
    // Default result
    const result = {
      imagePath: '',
      options: {}
    };
    
    // Check if pathname is empty
    if (!pathname || pathname === '/') {
      this.logger.breadcrumb('Empty pathname, returning empty result');
      return result;
    }
    
    // Split pathname into segments
    const segments = pathname.split('/').filter(Boolean);
    
    // Check if there are any segments
    if (segments.length === 0) {
      this.logger.breadcrumb('No path segments found');
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
    
    this.logger.breadcrumb('Finished parsing image path', undefined, { 
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
   * @param pathname URL pathname
   * @param derivatives List of available derivatives
   * @returns Object with derivative name and modified path, or null if no derivative found
   */
  extractDerivative(
    pathname: string,
    derivatives: string[]
  ): { derivative: string; modifiedPath: string } | null {
    this.logger.breadcrumb('Extracting derivative from path', undefined, { 
      pathname, 
      availableDerivatives: derivatives?.length || 0 
    });
    
    // Default result
    if (!pathname || !derivatives || derivatives.length === 0) {
      this.logger.breadcrumb('No path or derivatives provided');
      return null;
    }
    
    // Split pathname into segments
    const segments = pathname.split('/').filter(Boolean);
    
    // Check each segment against the list of derivatives
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      
      // Check if this segment matches any of our derivatives
      if (derivatives.includes(segment)) {
        // Create modified path without the derivative segment
        const pathSegments = [...segments];
        pathSegments.splice(i, 1);
        const modifiedPath = '/' + pathSegments.join('/');
        
        this.logger.breadcrumb('Found derivative in path', undefined, { 
          derivative: segment,
          originalPath: pathname,
          modifiedPath
        });
        
        return { 
          derivative: segment, 
          modifiedPath
        };
      }
    }
    
    this.logger.breadcrumb('No derivative found in path');
    return null;
  }

  /**
   * Parse query parameters for image options
   * 
   * @param searchParams URL search parameters
   * @returns Object with parsed and normalized transformation options
   */
  parseQueryOptions(
    searchParams: URLSearchParams
  ): Record<string, unknown> {
    this.logger.breadcrumb('Parsing query options', undefined, {
      paramCount: Array.from(searchParams.keys()).length
    });
    
    const options: Record<string, unknown> = {};
    
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
          options[param] = 'auto';
          if (param === 'width') {
            this.logger.breadcrumb(`Setting ${param} to auto`);
          }
        } else {
          const numValue = parseInt(paramValue, 10);
          if (!isNaN(numValue)) {
            options[param] = numValue;
            if (param === 'width') {
              this.logger.breadcrumb(`Setting ${param}`, undefined, { [param]: numValue });
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
            this.logger.breadcrumb(`Setting ${param}`, undefined, { [param]: numValue });
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
            this.logger.breadcrumb(`Converted invalid ${param} value to h`, undefined, {
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
        const drawArray = Array.isArray(drawData) ? drawData : [drawData];
        options.draw = drawArray;
        this.logger.breadcrumb('Parsed draw parameter', undefined, { 
          drawItems: drawArray.length
        });
      } catch (e) {
        this.logger.breadcrumb('Failed to parse draw parameter as JSON');
        // If not valid JSON, skip this parameter
      }
    }
    
    this.logger.breadcrumb('Completed parsing query options', undefined, {
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
   * Apply transformations to an image path
   * 
   * @param imagePath The image path to transform
   * @param config Optional configuration override
   * @returns Transformed path
   */
  applyTransformations(
    imagePath: string,
    config?: any
  ): string {
    const pathTransforms = config?.pathTransforms || this.config.pathTransforms || {};
    
    this.logger.breadcrumb('Applying path transforms', undefined, { 
      imagePath,
      transformCount: Object.keys(pathTransforms).length 
    });
    
    // Check if path matches any transform segment
    const segments = imagePath.split('/').filter(Boolean);
    
    if (segments.length === 0) {
      this.logger.breadcrumb('No path segments to transform');
      return imagePath;
    }
    
    // Check if the first segment matches any transform
    const firstSegment = segments[0];
    const transform = pathTransforms[firstSegment];
    
    if (!transform) {
      this.logger.breadcrumb('No matching transform found for segment', undefined, { segment: firstSegment });
      return imagePath;
    }
    
    // Apply the transformation
    let newPath: string;
    
    if (transform.removePrefix) {
      // Remove the prefix segment
      newPath = '/' + segments.slice(1).join('/');
      this.logger.breadcrumb('Removed prefix segment', undefined, { 
        prefix: firstSegment,
        originalPath: imagePath,
        transformedPath: newPath
      });
    } else {
      newPath = imagePath;
      this.logger.breadcrumb('Keeping original path', undefined, { path: imagePath });
    }
    
    // Add a new prefix if specified
    if (transform.prefix && transform.prefix.length > 0) {
      newPath = '/' + transform.prefix + newPath;
      this.logger.breadcrumb('Added new prefix', undefined, { 
        prefix: transform.prefix,
        finalPath: newPath
      });
    }
    
    this.logger.breadcrumb('Path transformation complete', undefined, {
      originalPath: imagePath,
      transformedPath: newPath
    });
    
    return newPath;
  }
}

/**
 * Create a path service
 * 
 * @param logger Logger for the service
 * @param config Optional configuration
 * @returns Configured path service
 */
export function createPathService(logger: Logger, config?: ImageResizerConfig): PathService {
  const service = new PathServiceImpl(logger);
  
  if (config) {
    service.configure(config);
  }
  
  return service;
}