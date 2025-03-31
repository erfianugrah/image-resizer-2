/**
 * Mock for the SchemaValidator
 */
import { vi } from 'vitest';

export class SchemaValidator {
  constructor() {}
  
  validateConfigSystem = vi.fn();
  validateConfigModule = vi.fn();
  validateModuleConfig = vi.fn();
}