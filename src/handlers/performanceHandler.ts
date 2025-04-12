/**
 * Performance Handler
 * 
 * Provides performance analysis reports and metrics
 */

import { ServiceContainer } from '../services/interfaces';
import { generatePerformanceReport } from '../utils/performance-integrations';
import { PerformanceBaseline } from '../utils/performance-metrics';

/**
 * Handle request for performance report
 * 
 * This shows performance statistics and analytics based on collected metrics
 * 
 * @param request Original request
 * @param services Service container
 * @param config Application configuration (optional, will be fetched if not provided)
 * @returns Response with performance report, or null if not a performance report request
 */
export async function handlePerformanceReport(
  request: Request,
  services: ServiceContainer,
  config?: any
): Promise<Response | null> {
  const { logger, configurationService } = services;
  
  // Use provided config or get it from the service if not provided
  if (!config) {
    config = configurationService.getConfig();
  }
  const url = new URL(request.url);
  
  // Check if this is a performance report request
  if (url.pathname !== '/performance-report' && !url.searchParams.has('performance')) {
    return null;
  }
  
  // Verify reporting is enabled
  if (!config.performance?.reportingEnabled) {
    logger.warn('Performance reporting is disabled but request received');
    return new Response('Performance reporting is disabled', { status: 403 });
  }
  
  logger.info('Generating performance report');
  
  // Get the performance baseline singleton
  const baseline = PerformanceBaseline.getInstance(logger);
  
  // Generate HTML report
  const reportHtml = generatePerformanceReport(baseline);
  
  // Return HTML response
  return new Response(reportHtml, {
    headers: {
      'Content-Type': 'text/html',
      'Cache-Control': 'no-store'
    }
  });
}

/**
 * Handle request to reset performance metrics
 * 
 * @param request Original request
 * @param services Service container
 * @param config Application configuration (optional, will be fetched if not provided)
 * @returns Response confirming reset, or null if not a reset request
 */
export async function handlePerformanceReset(
  request: Request,
  services: ServiceContainer,
  config?: any
): Promise<Response | null> {
  const { logger, configurationService } = services;
  
  // Use provided config or get it from the service if not provided
  if (!config) {
    config = configurationService.getConfig();
  }
  const url = new URL(request.url);
  
  // Check if this is a performance reset request
  if (url.pathname !== '/performance-reset') {
    return null;
  }
  
  // Verify reporting is enabled
  if (!config.performance?.reportingEnabled) {
    logger.warn('Performance reporting is disabled but reset request received');
    return new Response('Performance reporting is disabled', { status: 403 });
  }
  
  logger.info('Resetting performance baseline');
  
  // Get the performance baseline singleton and reset it
  const baseline = PerformanceBaseline.getInstance(logger);
  baseline.clear();
  
  // Return confirmation
  return new Response(JSON.stringify({ 
    success: true, 
    message: 'Performance baseline reset',
    timestamp: new Date().toISOString()
  }), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    }
  });
}