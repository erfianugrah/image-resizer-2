/**
 * Mock implementation of the Logger interface for tests
 */

import { Logger, LogData, LogLevel } from '../../src/utils/logging';
import { OptimizedLogger } from '../../src/utils/optimized-logging';
import { vi } from 'vitest';

export const mockLogger: Logger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  breadcrumb: vi.fn()
};

export const mockOptimizedLogger: OptimizedLogger = {
  ...mockLogger,
  isLevelEnabled: vi.fn(() => true),
  getMinLevel: vi.fn(() => LogLevel.DEBUG),
  trackedBreadcrumb: vi.fn(() => Date.now())
};

export function resetLoggerMock(): void {
  vi.mocked(mockLogger.debug).mockReset();
  vi.mocked(mockLogger.info).mockReset();
  vi.mocked(mockLogger.warn).mockReset();
  vi.mocked(mockLogger.error).mockReset();
  vi.mocked(mockLogger.breadcrumb).mockReset();
  
  // Reset optimized mocks too
  vi.mocked(mockOptimizedLogger.isLevelEnabled).mockReset();
  vi.mocked(mockOptimizedLogger.getMinLevel).mockReset();
  vi.mocked(mockOptimizedLogger.trackedBreadcrumb).mockReset();
}