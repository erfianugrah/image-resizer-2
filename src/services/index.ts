/**
 * Services module exports
 */

export * from './interfaces';
export * from './cacheService';
export * from './configurationService';
export * from './debugService';
export * from './storageService';
export * from './transformationService';
export * from './clientDetectionService';
export * from './loggingService';
export * from './serviceContainer';
export * from './optimizedClientDetectionService';
export * from './clientDetectionFactory';
export * from './dependencyInjectionContainer';
export * from './containerFactory';

// Fix circular exports by explicitly re-exporting only what's needed
import { LifecycleManager } from './lifecycleManager';
// Export as LifecycleManagerService to match the interface in interfaces.ts
export { LifecycleManager as LifecycleManagerService };