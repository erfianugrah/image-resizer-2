// Mock for the logging module
export const defaultLogger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  fatal: vi.fn(),
  breadcrumb: vi.fn(),
  startTime: vi.fn()
};

export type Logger = typeof defaultLogger;

export const createLogger = vi.fn().mockReturnValue(defaultLogger);

import { vi } from 'vitest';