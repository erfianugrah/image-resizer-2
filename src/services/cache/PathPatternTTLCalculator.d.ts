/**
 * Path Pattern TTL Calculator Type Definitions
 */

import { Logger } from '../../utils/logging';
import { ConfigurationService, StorageResult, TransformOptions } from '../interfaces';

/**
 * Interface defining a path pattern rule for TTL determination
 */
export interface PathPattern {
  name: string;         // Pattern name for identification
  matcher: string;      // Regular expression pattern as string
  ttl: {                // TTL configuration for matched paths
    ok: number;         // TTL for successful responses (2xx)
    redirects?: number; // TTL for redirects (3xx)
    clientError?: number; // TTL for client errors (4xx)
    serverError?: number; // TTL for server errors (5xx)
  };
  priority?: number;    // Pattern priority (higher numbers take precedence) 
  description?: string; // Optional description for documentation
}

/**
 * PathPatternTTLCalculator class
 * 
 * Implements advanced path pattern-based TTL determination using regex patterns
 */
export declare class PathPatternTTLCalculator {
  constructor(logger: Logger, configService: ConfigurationService);

  /**
   * Calculate TTL based on path patterns, response status, and content type
   * 
   * @param response The HTTP response
   * @param options Transform options
   * @param storageResult Storage result with path information
   * @returns TTL in seconds
   */
  calculateTtl(
    response: Response,
    options: TransformOptions,
    storageResult?: StorageResult,
  ): number;

  /**
   * Update path patterns from configuration
   * This method allows for hot reloading of TTL patterns
   * 
   * @param patterns New path patterns to use
   */
  updatePatterns(patterns: PathPattern[]): void;
}