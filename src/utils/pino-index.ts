/**
 * Pino logger implementation exports
 * 
 * This file provides a single point of entry for importing Pino components.
 * 
 * It exports the following main components:
 * 
 * - createPinoInstance: Creates a basic Pino logger instance
 * - createCompatiblePinoLogger: Creates a Pino logger that implements our Logger interface
 * - createOptimizedPinoLogger: Creates a Pino logger with additional performance optimizations
 * - prepareLogData: Helper function to prepare log data for Pino
 * 
 * For the migration plan, use these exports as follows:
 * 
 * - New code should use the optimized Pino logger directly:
 *   `import { createOptimizedPinoLogger } from './utils/pino-index';`
 * 
 * - Existing code using the `createLogger` factory function will automatically
 *   use the appropriate implementation based on the `usePino` configuration option.
 */

export { createPinoInstance, prepareLogData } from './pino-core';
export { createCompatiblePinoLogger } from './pino-compat';
export { createOptimizedPinoLogger } from './pino-optimized';