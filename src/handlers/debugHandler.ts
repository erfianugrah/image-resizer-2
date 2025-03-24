/**
 * Debug Handler
 * 
 * Handles requests for debug information and reports
 */

import { ImageResizerConfig } from '../config';
import { PerformanceMetrics } from '../debug';
import { ServiceContainer, StorageResult } from '../services/interfaces';
import { Logger } from '../utils/logging';

/**
 * Handle debug report requests
 */
export async function handleDebugReport(
  request: Request,
  services: ServiceContainer,
  metrics: PerformanceMetrics,
  config: ImageResizerConfig,
  logger: Logger
): Promise<Response | null> {
  const url = new URL(request.url);
  
  // Check if this is a debug report request
  if (url.pathname !== '/debug-report' || !services.debugService.isDebugEnabled(request, config)) {
    return null;
  }
  
  try {
    metrics.detectionStart = Date.now();
    
    // Get client info using the client detection service
    const clientInfo = await services.clientDetectionService.detectClient(request);
    metrics.detectionSource = 'client-detection-service';
    
    logger.debug('Detected client info for debug report', {
      deviceType: clientInfo?.deviceType,
      viewportWidth: clientInfo?.viewportWidth,
      dpr: clientInfo?.devicePixelRatio,
      networkQuality: clientInfo?.networkQuality,
      deviceClassification: clientInfo?.deviceClassification
    });
    
    metrics.detectionEnd = Date.now();
    
    // We need a dummy storage result and transform options for the report
    const storageResult: StorageResult = {
      response: new Response('Debug Mode'),
      sourceType: 'remote',
      contentType: 'text/plain',
      size: 0,
      path: '/debug-sample-image.jpg',
      width: 1920,
      height: 1080
    };
    
    // Create more realistic transform options based on client info
    const transformOptions = {
      width: clientInfo?.viewportWidth || 800,
      format: (clientInfo?.acceptsAvif ? 'avif' : clientInfo?.acceptsWebp ? 'webp' : 'auto'),
      quality: 85,
      fit: 'scale-down'
    };
    
    // Add some sample metadata for demonstration
    const storageResultWithMetadata = storageResult as StorageResult & { metadata?: Record<string, string> };
    storageResultWithMetadata.metadata = {
      'image-type': 'sample',
      'created-for': 'debug report'
    };
    
    // Log the debug report generation
    logger.info('Generating enhanced debug HTML report', {
      clientInfo: {
        deviceType: clientInfo?.deviceType,
        viewportWidth: clientInfo?.viewportWidth,
        dpr: clientInfo?.devicePixelRatio,
        saveData: clientInfo?.saveData,
        webpSupport: clientInfo?.acceptsWebp,
        avifSupport: clientInfo?.acceptsAvif
      },
      transformOptions: transformOptions
    });
    
    // Create the enhanced debug report with client info
    return services.debugService.createDebugHtmlReport(
      request, 
      storageResult, 
      transformOptions, 
      config, 
      metrics,
      clientInfo
    );
  } catch (error) {
    logger.error('Error creating debug report', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });
    
    return new Response(`Error creating debug report: ${error instanceof Error ? error.message : String(error)}`, { 
      status: 500,
      headers: {
        'Content-Type': 'text/plain'
      }
    });
  }
}

/**
 * Handle root path request
 */
export function handleRootPath(request: Request): Response | null {
  const url = new URL(request.url);
  
  // Check if this is a root path request
  if (url.pathname === '/' || url.pathname === '') {
    return new Response('Image Resizer Worker', { 
      status: 200,
      headers: {
        'Content-Type': 'text/plain'
      }
    });
  }
  
  return null;
}