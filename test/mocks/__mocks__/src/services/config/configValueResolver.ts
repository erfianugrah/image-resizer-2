/**
 * Mock for the ConfigValueResolver
 */
import { vi } from 'vitest';

export class ConfigValueResolver {
  constructor() {}
  
  resolveValue = vi.fn().mockImplementation((val) => val);
}