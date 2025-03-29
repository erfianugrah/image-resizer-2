/**
 * Parameter Service Factory
 * 
 * Creates parameter handling service instances
 */

import { Logger } from '../utils/logging';
import { ParameterHandler } from './ParameterHandler';
import { ParameterParserFactory } from './ParameterParserFactory';
import { DefaultParameterProcessor } from './ParameterProcessor';
import { ProcessorRegistry } from './ProcessorRegistry';
import { CloudflareOptionsBuilder } from './CloudflareOptionsBuilder';

/**
 * Create a parameter handler
 * 
 * @param logger Logger for the parameter handler
 * @returns Parameter handler instance
 */
export function createParameterHandler(logger?: Logger): ParameterHandler {
  return new ParameterHandler(logger);
}

/**
 * Create a parameter parser factory
 * 
 * @param logger Logger for the parser factory
 * @returns Parameter parser factory instance
 */
export function createParameterParserFactory(logger?: Logger): ParameterParserFactory {
  return new ParameterParserFactory(logger);
}

/**
 * Create a parameter processor
 * 
 * @param logger Logger for the processor
 * @returns Parameter processor instance
 */
export function createParameterProcessor(logger?: Logger): DefaultParameterProcessor {
  return new DefaultParameterProcessor(logger);
}

/**
 * Create a processor registry
 * 
 * @param logger Logger for the registry
 * @returns Processor registry instance
 */
export function createProcessorRegistry(logger?: Logger): ProcessorRegistry {
  return new ProcessorRegistry(logger);
}

/**
 * Create a Cloudflare options builder
 * 
 * @param logger Logger for the builder
 * @returns Cloudflare options builder instance
 */
export function createCloudflareOptionsBuilder(logger?: Logger): CloudflareOptionsBuilder {
  return new CloudflareOptionsBuilder(logger);
}