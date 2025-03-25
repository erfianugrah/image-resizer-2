/**
 * Optimized response utilities for the image resizer worker
 * 
 * This module provides performance-optimized response creation and manipulation
 * to reduce object allocations and improve response generation efficiency.
 */

/**
 * Creates a response without creating unnecessary intermediate Response objects
 * 
 * @param body The response body (can be a string, ArrayBuffer, ReadableStream, etc.)
 * @param headers The headers to include (can be a Headers object, Record, or array of [key, value] pairs)
 * @param status The HTTP status code
 * @param statusText The HTTP status text
 * @returns A new Response object with all the specified properties
 */
export function createOptimizedResponse(
  body: BodyInit | null,
  headers?: HeadersInit,
  status: number = 200,
  statusText: string = ''
): Response {
  // Create a single Response object with all properties set at once
  return new Response(body, {
    headers,
    status,
    statusText
  });
}

/**
 * Creates an optimized error response with status code and error details
 * 
 * @param message Error message
 * @param status HTTP status code
 * @param errorCode Optional error code
 * @param details Optional error details
 * @returns A Response object with the error information
 */
export function createErrorResponse(
  message: string,
  status: number = 400,
  errorCode?: string,
  details?: Record<string, unknown>
): Response {
  // Create error object with all properties included
  const errorBody = {
    error: true,
    message,
    code: errorCode || `ERR_${status}`,
    status,
    ...(details || {})
  };

  // Create headers with JSON content type
  const headers = new Headers({
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store, max-age=0'
  });

  // Create response in a single operation
  return new Response(JSON.stringify(errorBody), {
    status,
    headers
  });
}

/**
 * Adds headers to a Response object efficiently
 * 
 * @param response The original Response object
 * @param headers Headers to add (object or array of [key, value] tuples)
 * @returns A new Response with the added headers
 */
export function addResponseHeaders(
  response: Response,
  headers: HeadersInit
): Response {
  // Clone the original headers
  const newHeaders = new Headers(response.headers);
  
  // Add the new headers
  if (headers instanceof Headers) {
    headers.forEach((value, key) => {
      newHeaders.set(key, value);
    });
  } else if (Array.isArray(headers)) {
    for (const [key, value] of headers) {
      newHeaders.set(key, value);
    }
  } else {
    for (const [key, value] of Object.entries(headers)) {
      newHeaders.set(key, value);
    }
  }
  
  // Add processing marker to prevent duplicate processing
  newHeaders.set('x-img-resizer-processed', 'true');
  
  // Add worker identification to help with debugging
  newHeaders.set('cf-worker', 'image-resizer');
  
  // Create a new response with the combined headers
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders
  });
}

/**
 * Batch update response headers without creating multiple response objects
 * 
 * @param response The original Response object
 * @param updates Array of update functions that modify headers
 * @returns A new Response with all header updates applied at once
 */
export function batchUpdateHeaders(
  response: Response,
  updates: ((headers: Headers) => void)[]
): Response {
  // Create a new Headers object from the original response
  const headers = new Headers(response.headers);
  
  // Apply all header updates in sequence to the same Headers object
  for (const update of updates) {
    update(headers);
  }
  
  // Add processing marker to prevent duplicate processing
  headers.set('x-img-resizer-processed', 'true');
  
  // Add worker identification to help with debugging
  headers.set('cf-worker', 'image-resizer');
  
  // Create a single new Response with the updated headers
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

/**
 * Efficiently merges multiple updates into a single Response creation
 * to avoid creating intermediate Response objects
 * 
 * @param response The original Response object
 * @param options Configuration options for the merged response
 * @returns A new Response with all updates applied at once
 */
export interface ResponseMergeOptions {
  headers?: HeadersInit;
  headersToRemove?: string[];
  status?: number;
  statusText?: string;
  cacheControl?: string;
}

export function mergeResponseUpdates(
  response: Response,
  options: ResponseMergeOptions
): Response {
  // Create a new Headers object from the original response
  const headers = new Headers(response.headers);
  
  // Remove any headers specified for removal
  if (options.headersToRemove) {
    for (const header of options.headersToRemove) {
      headers.delete(header);
    }
  }
  
  // Add new headers if provided
  if (options.headers) {
    if (options.headers instanceof Headers) {
      options.headers.forEach((value, key) => {
        headers.set(key, value);
      });
    } else if (Array.isArray(options.headers)) {
      for (const [key, value] of options.headers) {
        headers.set(key, value);
      }
    } else {
      for (const [key, value] of Object.entries(options.headers)) {
        headers.set(key, value);
      }
    }
  }
  
  // Set specific cache control if provided
  if (options.cacheControl) {
    headers.set('Cache-Control', options.cacheControl);
  }
  
  // Add processing marker to prevent duplicate processing
  headers.set('x-img-resizer-processed', 'true');
  
  // Add worker identification to help with debugging
  headers.set('cf-worker', 'image-resizer');
  
  // Create a single new Response with all updates applied at once
  return new Response(response.body, {
    status: options.status || response.status,
    statusText: options.statusText || response.statusText,
    headers
  });
}