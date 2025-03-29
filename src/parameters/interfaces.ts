/**
 * Parameter parser interfaces
 */

import { TransformParameter } from '../utils/path';

/**
 * Interface for all parameter parsers
 */
export interface ParameterParser {
  /**
   * Determine if this parser can handle the given input
   */
  canParse(input: string | URLSearchParams | Request): boolean;
  
  /**
   * Parse the input and extract parameters
   */
  parse(input: string | URLSearchParams | Request): TransformParameter[];
}

/**
 * Interface for the parameter processor
 */
export interface ParameterProcessor {
  /**
   * Process parameters from multiple sources and generate a normalized options object
   */
  process(parameters: TransformParameter[]): Record<string, any>;
  
  /**
   * Validate all parameters against their definitions
   */
  validate(parameters: Record<string, TransformParameter>): Record<string, TransformParameter>;
  
  /**
   * Format parameters for Cloudflare Image Resizing
   */
  formatForCloudflare(parameters: Record<string, TransformParameter>): Record<string, any>;
}

/**
 * Processing context for parameter processing
 */
export interface ProcessingContext {
  width?: number;
  height?: number;
  aspectRatio?: number;
  format?: string;
  quality?: number | string;
  focal?: { x: number, y: number };
  [key: string]: any;
}