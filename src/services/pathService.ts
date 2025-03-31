/**
 * Path Service Implementation 
 * 
 * Provides path handling functionality for the image resizer.
 */

import { PathService } from './interfaces';
import { Logger } from '../utils/logging';
import { ImageResizerConfig } from '../config';
import { 
  // These types are imported for type documentation and future expansion
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  PathTransform,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  PathTransforms
} from '../utils/path';
import { ParameterHandler } from '../parameters';

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
    
    // Only the path segments go into the image path
    const imagePath = '/' + pathSegments.join('/');
    
    // For the path parameters, we'll use our new parameter handler
    // Make sure to prefix segments with / to create a valid pathname
    const pathParamsString = optionSegments.map(segment => `/${segment}`).join('');
    const parameterHandler = new ParameterHandler(this.logger);
    
    // Create a mock request to use with the parameter handler
    // Be sure to use a path with underscores preserved for PathParser to detect
    const mockUrl = new URL(`https://example.com${pathParamsString}`);
    const mockRequest = new Request(mockUrl);
    
    // Process the request through our parameter handler
    const parsedOptions = parameterHandler.handleRequest(mockRequest);
    
    // Convert the structured options back to string format for compatibility
    const options: Record<string, string> = {};
    Object.entries(parsedOptions).forEach(([key, value]) => {
      options[key] = String(value);
    });
    
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
   * @returns Promise with parsed and normalized transformation options
   */
  async parseQueryOptions(
    searchParams: URLSearchParams
  ): Promise<Record<string, unknown>> {
    this.logger.breadcrumb('Parsing query options', undefined, {
      paramCount: Array.from(searchParams.keys()).length
    });
    
    // Use the new parameter handler to process the parameters
    const parameterHandler = new ParameterHandler(this.logger);
    
    // Create a mock Request to use with the parameter handler
    const mockRequest = new Request(`https://example.com?${searchParams.toString()}`);
    
    // Process the request and get the options
    const options = parameterHandler.handleRequest(mockRequest);
    
    // Note: Our ParameterHandler handles all the parameter processing logic now
    // including auto/numeric params, boolean params, enums, etc.
    
    // We need to resolve the promise since ParameterHandler.handleRequest is now async
    const resolvedOptions = await options;
    
    this.logger.breadcrumb('Completed parsing query options', undefined, {
      optionCount: Object.keys(resolvedOptions).length,
      hasWidth: resolvedOptions.width !== undefined,
      hasHeight: resolvedOptions.height !== undefined,
      hasFormat: resolvedOptions.format !== undefined,
      hasBlur: resolvedOptions.blur !== undefined,
      hasFlip: resolvedOptions.flip !== undefined,
      flipValue: resolvedOptions.flip !== undefined ? 
        (typeof resolvedOptions.flip === 'string' ? resolvedOptions.flip : String(resolvedOptions.flip)) : 'undefined'
    });
    
    return resolvedOptions;
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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