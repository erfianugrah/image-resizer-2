/**
 * Enhanced debug visualization utilities for the image resizer
 * 
 * This module provides advanced HTML report generation with interactive
 * visualizations, performance metrics, and side-by-side image comparisons.
 */

import { ImageResizerConfig } from '../config';
import { StorageResult, ClientInfo, TransformOptions, PerformanceMetrics } from './interfaces';

/**
 * Interface for visualization data passed to HTML report generation
 */
export interface VisualizationData {
  // Request flow visualization
  requestFlow: {
    steps: Array<{
      name: string;
      duration: number;
      startTime: number;
      endTime: number;
      success: boolean;
      notes?: string;
    }>;
    totalDuration: number;
  };
  
  // Image comparison data
  imageComparison: {
    original: {
      url: string;
      size: number;
      width?: number;
      height?: number;
      contentType: string;
    };
    transformed: {
      url: string;
      estimatedSize?: number;
      width?: number;
      height?: number;
      transformOptions: Record<string, any>;
    };
  };
  
  // Client detection information
  clientInfo?: ClientInfo;
  
  // Cache strategy information
  cacheInfo: {
    method: string;
    ttl: number;
    cacheEverything: boolean;
    cacheTags: string[];
    bypassCache: boolean;
  };
  
  // Storage access information
  storageInfo: {
    sourceType: string;
    path?: string;
    originalUrl?: string;
    storageTime: number;
    priority: string[];
  };
}

/**
 * Generate an enhanced interactive HTML debug report
 */
export function createEnhancedHtmlReport(
  request: Request,
  storageResult: StorageResult,
  options: TransformOptions,
  config: ImageResizerConfig,
  metrics: PerformanceMetrics,
  visualizationData: VisualizationData
): Response {
  const url = new URL(request.url);
  const now = Date.now();
  metrics.end = metrics.end || now;
  
  // Calculate timing information
  const totalTime = metrics.end - metrics.start;
  let storageTime = 0;
  let transformTime = 0;
  let detectionTime = 0;
  
  if (metrics.storageStart && metrics.storageEnd) {
    storageTime = metrics.storageEnd - metrics.storageStart;
  }
  
  if (metrics.transformStart && metrics.transformEnd) {
    transformTime = metrics.transformEnd - metrics.transformStart;
  }
  
  if (metrics.detectionStart && metrics.detectionEnd) {
    detectionTime = metrics.detectionEnd - metrics.detectionStart;
  }
  
  const otherTime = totalTime - storageTime - transformTime - detectionTime;
  
  // Generate performance timing chart data
  const performanceData = [
    { name: 'Storage', value: storageTime, percent: Math.round((storageTime / totalTime) * 100) },
    { name: 'Transform', value: transformTime, percent: Math.round((transformTime / totalTime) * 100) },
    { name: 'Detection', value: detectionTime, percent: Math.round((detectionTime / totalTime) * 100) },
    { name: 'Other', value: otherTime, percent: Math.round((otherTime / totalTime) * 100) }
  ];
  
  // Format all request flow steps for visualization
  const requestFlowSteps = visualizationData.requestFlow.steps.map(step => ({
    ...step,
    percentStart: Math.round((step.startTime / totalTime) * 100),
    percentEnd: Math.round((step.endTime / totalTime) * 100),
    percentDuration: Math.round((step.duration / totalTime) * 100)
  }));
  
  // Generate formatted client info for display
  let clientInfoDisplay = 'Not available';
  
  if (visualizationData.clientInfo) {
    const clientInfo = visualizationData.clientInfo;
    const clientInfoItems = [];
    
    if (clientInfo.deviceType) {
      clientInfoItems.push(`Device Type: ${clientInfo.deviceType}`);
    }
    
    if (clientInfo.devicePixelRatio) {
      clientInfoItems.push(`Device Pixel Ratio: ${clientInfo.devicePixelRatio}`);
    }
    
    if (clientInfo.viewportWidth) {
      clientInfoItems.push(`Viewport Width: ${clientInfo.viewportWidth}px`);
    }
    
    if (clientInfo.saveData !== undefined) {
      clientInfoItems.push(`Save Data: ${clientInfo.saveData ? 'Enabled' : 'Disabled'}`);
    }
    
    if (clientInfo.acceptsWebp !== undefined) {
      clientInfoItems.push(`WebP Support: ${clientInfo.acceptsWebp ? 'Yes' : 'No'}`);
    }
    
    if (clientInfo.acceptsAvif !== undefined) {
      clientInfoItems.push(`AVIF Support: ${clientInfo.acceptsAvif ? 'Yes' : 'No'}`);
    }
    
    clientInfoDisplay = clientInfoItems.join('<br>');
  }
  
  // Format transformation options for display
  const transformOptions: Record<string, string> = {};
  
  Object.keys(options).forEach(key => {
    const value = options[key as keyof typeof options];
    if (value !== undefined && value !== null) {
      if (typeof value !== 'object') {
        transformOptions[key] = String(value);
      } else {
        try {
          transformOptions[key] = JSON.stringify(value);
        } catch (e) {
          transformOptions[key] = '[Complex Object]';
        }
      }
    }
  });
  
  // Generate interactive HTML content
  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Enhanced Image Resizer Debug Report</title>
      <style>
        :root {
          --color-primary: #3b82f6;
          --color-secondary: #6366f1;
          --color-success: #10b981;
          --color-warning: #f59e0b;
          --color-error: #ef4444;
          --color-gray: #64748b;
          --color-light: #f1f5f9;
          --color-dark: #334155;
          --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
          --radius-sm: 4px;
          --radius-md: 6px;
          --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
          --shadow-md: 0 4px 6px rgba(0, 0, 0, 0.1);
        }
        
        * {
          box-sizing: border-box;
        }
        
        body {
          font-family: var(--font-sans);
          line-height: 1.6;
          color: var(--color-dark);
          background-color: #f8fafc;
          max-width: 1200px;
          margin: 0 auto;
          padding: 20px;
        }
        
        h1, h2, h3, h4 {
          margin-top: 1.5em;
          margin-bottom: 0.5em;
          font-weight: 600;
          line-height: 1.25;
        }
        
        h1 {
          font-size: 2em;
          color: var(--color-primary);
          border-bottom: 1px solid #e2e8f0;
          padding-bottom: 10px;
        }
        
        h2 {
          font-size: 1.5em;
          color: var(--color-secondary);
        }
        
        h3 {
          font-size: 1.25em;
          margin-top: 1.25em;
        }
        
        p {
          margin: 1em 0;
        }
        
        a {
          color: var(--color-primary);
          text-decoration: none;
        }
        
        a:hover {
          text-decoration: underline;
        }
        
        .container {
          background-color: white;
          border-radius: var(--radius-md);
          box-shadow: var(--shadow-md);
          padding: 2rem;
          margin-bottom: 2rem;
        }
        
        .card {
          background-color: white;
          border-radius: var(--radius-md);
          box-shadow: var(--shadow-sm);
          padding: 1.5rem;
          margin-bottom: 1.5rem;
          border: 1px solid #e2e8f0;
        }
        
        .card-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 1rem;
          padding-bottom: 0.5rem;
          border-bottom: 1px solid #e2e8f0;
        }
        
        .card-title {
          font-size: 1.25em;
          font-weight: 600;
          margin: 0;
          color: var(--color-secondary);
        }
        
        .grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: 1.5rem;
        }
        
        /* Request flow visualization */
        .timeline {
          position: relative;
          margin: 2rem 0;
          height: 50px;
          background-color: var(--color-light);
          border-radius: var(--radius-sm);
          overflow: hidden;
        }
        
        .timeline-step {
          position: absolute;
          height: 100%;
          border-radius: var(--radius-sm);
          padding: 4px;
          font-size: 0.75rem;
          color: white;
          text-align: center;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: height 0.2s ease;
        }
        
        .timeline-step:hover {
          height: 120%;
          z-index: 10;
        }
        
        .timeline-step.success {
          background-color: var(--color-success);
        }
        
        .timeline-step.error {
          background-color: var(--color-error);
        }
        
        .timeline-step.warning {
          background-color: var(--color-warning);
        }
        
        /* Performance chart */
        .performance-chart {
          display: flex;
          height: 30px;
          border-radius: var(--radius-sm);
          margin: 1rem 0;
          overflow: hidden;
        }
        
        .performance-segment {
          display: flex;
          align-items: center;
          justify-content: center;
          color: white;
          font-size: 0.75rem;
          position: relative;
        }
        
        .performance-segment span {
          position: relative;
          z-index: 1;
        }
        
        .performance-segment-storage {
          background-color: #3b82f6;
        }
        
        .performance-segment-transform {
          background-color: #8b5cf6;
        }
        
        .performance-segment-detection {
          background-color: #10b981;
        }
        
        .performance-segment-other {
          background-color: #64748b;
        }
        
        /* Image comparison */
        .image-comparison {
          display: flex;
          flex-wrap: wrap;
          gap: 1.5rem;
        }
        
        .image-panel {
          flex: 1;
          min-width: 300px;
          border: 1px solid #e2e8f0;
          border-radius: var(--radius-md);
          overflow: hidden;
        }
        
        .image-panel-header {
          background-color: var(--color-light);
          padding: 0.75rem;
          border-bottom: 1px solid #e2e8f0;
          font-weight: 600;
          display: flex;
          justify-content: space-between;
        }
        
        .image-container {
          padding: 1rem;
          text-align: center;
        }
        
        .image-container img {
          max-width: 100%;
          max-height: 400px;
          border: 1px solid #e2e8f0;
        }
        
        .image-details {
          padding: 0.75rem;
          font-size: 0.875rem;
          border-top: 1px solid #e2e8f0;
        }
        
        .image-details dt {
          font-weight: 600;
          margin-bottom: 0.25rem;
        }
        
        .image-details dd {
          margin-left: 0;
          margin-bottom: 0.5rem;
        }
        
        /* Tables */
        table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 1.5rem;
          font-size: 0.875rem;
        }
        
        th, td {
          padding: 0.75rem;
          text-align: left;
          border-bottom: 1px solid #e2e8f0;
        }
        
        th {
          background-color: var(--color-light);
          font-weight: 600;
          position: sticky;
          top: 0;
        }
        
        tbody tr:nth-child(even) {
          background-color: #f8fafc;
        }
        
        /* Code blocks */
        pre {
          background-color: #1e293b;
          color: #e2e8f0;
          padding: 1rem;
          border-radius: var(--radius-md);
          overflow-x: auto;
          font-family: monospace;
          font-size: 0.875rem;
          margin: 1rem 0;
        }
        
        code {
          font-family: monospace;
        }
        
        /* Custom styles */
        .tag {
          display: inline-block;
          background-color: var(--color-light);
          border-radius: 50px;
          padding: 0.25rem 0.75rem;
          font-size: 0.75rem;
          margin-right: 0.5rem;
          margin-bottom: 0.5rem;
        }
        
        .badge {
          display: inline-block;
          padding: 0.25rem 0.5rem;
          font-size: 0.75rem;
          font-weight: 600;
          border-radius: 50px;
          margin-left: 0.5rem;
        }
        
        .badge-primary {
          background-color: var(--color-primary);
          color: white;
        }
        
        .badge-success {
          background-color: var(--color-success);
          color: white;
        }
        
        .badge-warning {
          background-color: var(--color-warning);
          color: white;
        }
        
        .badge-error {
          background-color: var(--color-error);
          color: white;
        }
        
        .tabs {
          display: flex;
          border-bottom: 1px solid #e2e8f0;
          margin-bottom: 1rem;
        }
        
        .tab {
          padding: 0.5rem 1rem;
          cursor: pointer;
          border-bottom: 2px solid transparent;
        }
        
        .tab.active {
          border-bottom-color: var(--color-primary);
          color: var(--color-primary);
          font-weight: 600;
        }
        
        .tab-content {
          display: none;
        }
        
        .tab-content.active {
          display: block;
        }
        
        .collapsible {
          margin-bottom: 1rem;
        }
        
        .collapsible-header {
          background-color: var(--color-light);
          padding: 0.75rem 1rem;
          border-radius: var(--radius-sm);
          font-weight: 600;
          cursor: pointer;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        
        .collapsible-content {
          padding: 1rem;
          border: 1px solid #e2e8f0;
          border-top: none;
          border-bottom-left-radius: var(--radius-sm);
          border-bottom-right-radius: var(--radius-sm);
          display: none;
        }
        
        .collapsible.open .collapsible-content {
          display: block;
        }
        
        /* Interactive elements */
        .select-wrapper {
          margin-bottom: 1rem;
        }
        
        .select-label {
          display: block;
          margin-bottom: 0.5rem;
          font-weight: 600;
        }
        
        select {
          width: 100%;
          padding: 0.5rem;
          border: 1px solid #e2e8f0;
          border-radius: var(--radius-sm);
          background-color: white;
        }
        
        .parameter-explorer {
          border: 1px solid #e2e8f0;
          border-radius: var(--radius-md);
          margin-bottom: 1.5rem;
        }
        
        .parameter-explorer-header {
          background-color: var(--color-light);
          padding: 0.75rem 1rem;
          font-weight: 600;
          border-bottom: 1px solid #e2e8f0;
        }
        
        .parameter-controls {
          padding: 1rem;
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 1rem;
        }
        
        .control-group {
          margin-bottom: 1rem;
        }
        
        .control-label {
          display: block;
          margin-bottom: 0.5rem;
          font-weight: 600;
          font-size: 0.875rem;
        }
        
        .control-input {
          width: 100%;
          padding: 0.5rem;
          border: 1px solid #e2e8f0;
          border-radius: var(--radius-sm);
        }
        
        .parameter-preview {
          padding: 1rem;
          text-align: center;
          border-top: 1px solid #e2e8f0;
        }
        
        /* Responsive adjustments */
        @media (max-width: 768px) {
          .grid {
            grid-template-columns: 1fr;
          }
          
          .image-comparison {
            flex-direction: column;
          }
          
          .container {
            padding: 1rem;
          }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>Image Resizer Debug Report</h1>
        <p class="lead">
          This report provides detailed information about the image transformation process, performance metrics, 
          and configuration. Use this information for debugging and optimization purposes.
        </p>
        
        <div class="tabs">
          <div class="tab active" data-tab="overview">Overview</div>
          <div class="tab" data-tab="performance">Performance</div>
          <div class="tab" data-tab="image-comparison">Image Comparison</div>
          <div class="tab" data-tab="parameters">Parameters</div>
          <div class="tab" data-tab="configuration">Configuration</div>
        </div>
        
        <!-- Overview Tab -->
        <div class="tab-content active" id="overview">
          <div class="card">
            <div class="card-header">
              <h3 class="card-title">Request Information</h3>
            </div>
            <table>
              <tr>
                <th>URL</th>
                <td>${request.url}</td>
              </tr>
              <tr>
                <th>Path</th>
                <td>${url.pathname}</td>
              </tr>
              <tr>
                <th>Method</th>
                <td>${request.method}</td>
              </tr>
              <tr>
                <th>Timestamp</th>
                <td>${new Date().toISOString()}</td>
              </tr>
              <tr>
                <th>Environment</th>
                <td>${config.environment}</td>
              </tr>
              <tr>
                <th>Client Info</th>
                <td>${clientInfoDisplay}</td>
              </tr>
            </table>
          </div>
          
          <div class="card">
            <div class="card-header">
              <h3 class="card-title">Request Flow</h3>
            </div>
            <div class="timeline">
              ${requestFlowSteps.map(step => `
                <div 
                  class="timeline-step ${step.success ? 'success' : 'error'}" 
                  style="left: ${step.percentStart}%; width: ${step.percentDuration}%;"
                  title="${step.name}: ${step.duration}ms ${step.notes ? `(${step.notes})` : ''}"
                >
                  ${step.percentDuration > 5 ? step.name : ''}
                </div>
              `).join('')}
            </div>
            <table>
              <thead>
                <tr>
                  <th>Operation</th>
                  <th>Duration (ms)</th>
                  <th>Percentage</th>
                  <th>Status</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                ${requestFlowSteps.map(step => `
                  <tr>
                    <td>${step.name}</td>
                    <td>${step.duration}</td>
                    <td>${step.percentDuration}%</td>
                    <td>${step.success ? '<span class="badge badge-success">Success</span>' : '<span class="badge badge-error">Error</span>'}</td>
                    <td>${step.notes || ''}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
          
          <div class="grid">
            <div class="card">
              <div class="card-header">
                <h3 class="card-title">Storage Information</h3>
              </div>
              <table>
                <tr>
                  <th>Source Type</th>
                  <td>${visualizationData.storageInfo.sourceType}</td>
                </tr>
                <tr>
                  <th>Storage Priority</th>
                  <td>${visualizationData.storageInfo.priority.join(', ')}</td>
                </tr>
                <tr>
                  <th>Content Type</th>
                  <td>${visualizationData.imageComparison.original.contentType || 'Unknown'}</td>
                </tr>
                <tr>
                  <th>Original Size</th>
                  <td>${visualizationData.imageComparison.original.size ? 
    `${visualizationData.imageComparison.original.size} bytes (${Math.round(visualizationData.imageComparison.original.size / 1024)} KB)` : 
    'Unknown'}</td>
                </tr>
                <tr>
                  <th>Dimensions</th>
                  <td>${visualizationData.imageComparison.original.width && visualizationData.imageComparison.original.height ? 
    `${visualizationData.imageComparison.original.width}×${visualizationData.imageComparison.original.height}` : 
    'Unknown'}</td>
                </tr>
                ${visualizationData.storageInfo.originalUrl ? `
                <tr>
                  <th>Original URL</th>
                  <td>${visualizationData.storageInfo.originalUrl}</td>
                </tr>
                ` : ''}
                ${visualizationData.storageInfo.path ? `
                <tr>
                  <th>Storage Path</th>
                  <td>${visualizationData.storageInfo.path}</td>
                </tr>
                ` : ''}
              </table>
            </div>
            
            <div class="card">
              <div class="card-header">
                <h3 class="card-title">Cache Information</h3>
              </div>
              <table>
                <tr>
                  <th>Cache Method</th>
                  <td>${visualizationData.cacheInfo.method}</td>
                </tr>
                <tr>
                  <th>TTL</th>
                  <td>${visualizationData.cacheInfo.ttl} seconds</td>
                </tr>
                <tr>
                  <th>Cache Everything</th>
                  <td>${visualizationData.cacheInfo.cacheEverything ? 'Yes' : 'No'}</td>
                </tr>
                <tr>
                  <th>Bypass Cache</th>
                  <td>${visualizationData.cacheInfo.bypassCache ? 'Yes' : 'No'}</td>
                </tr>
                <tr>
                  <th>Cache Tags</th>
                  <td>
                    ${visualizationData.cacheInfo.cacheTags.length > 0 ? 
    visualizationData.cacheInfo.cacheTags.map(tag => `<span class="tag">${tag}</span>`).join('') : 
    'None'}
                  </td>
                </tr>
              </table>
            </div>
          </div>
        </div>
        
        <!-- Performance Tab -->
        <div class="tab-content" id="performance">
          <div class="card">
            <div class="card-header">
              <h3 class="card-title">Performance Metrics</h3>
            </div>
            <div class="performance-chart">
              ${performanceData.map(segment => `
                <div 
                  class="performance-segment performance-segment-${segment.name.toLowerCase()}" 
                  style="width: ${segment.percent}%"
                  title="${segment.name}: ${segment.value}ms (${segment.percent}%)"
                >
                  ${segment.percent > 5 ? `<span>${segment.percent}%</span>` : ''}
                </div>
              `).join('')}
            </div>
            <table>
              <thead>
                <tr>
                  <th>Operation</th>
                  <th>Time (ms)</th>
                  <th>Percentage</th>
                </tr>
              </thead>
              <tbody>
                ${performanceData.map(segment => `
                  <tr>
                    <td>${segment.name}</td>
                    <td>${segment.value}</td>
                    <td>${segment.percent}%</td>
                  </tr>
                `).join('')}
                <tr>
                  <td><strong>Total</strong></td>
                  <td><strong>${totalTime}</strong></td>
                  <td><strong>100%</strong></td>
                </tr>
              </tbody>
            </table>
          </div>
          
          <div class="card">
            <div class="card-header">
              <h3 class="card-title">Timing Breakdown</h3>
            </div>
            <div class="timeline">
              ${requestFlowSteps.map(step => `
                <div 
                  class="timeline-step ${step.success ? 'success' : 'error'}" 
                  style="left: ${step.percentStart}%; width: ${step.percentDuration}%;"
                  title="${step.name}: ${step.duration}ms ${step.notes ? `(${step.notes})` : ''}"
                >
                  ${step.percentDuration > 5 ? step.name : ''}
                </div>
              `).join('')}
            </div>
            <table>
              <thead>
                <tr>
                  <th>Step</th>
                  <th>Start (ms)</th>
                  <th>End (ms)</th>
                  <th>Duration (ms)</th>
                </tr>
              </thead>
              <tbody>
                ${requestFlowSteps.map(step => `
                  <tr>
                    <td>${step.name}</td>
                    <td>${step.startTime}</td>
                    <td>${step.endTime}</td>
                    <td>${step.duration}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
        
        <!-- Image Comparison Tab -->
        <div class="tab-content" id="image-comparison">
          <div class="card">
            <div class="card-header">
              <h3 class="card-title">Side-by-Side Comparison</h3>
            </div>
            <div class="image-comparison">
              <div class="image-panel">
                <div class="image-panel-header">
                  Original Image
                  ${visualizationData.imageComparison.original.size ? 
    `<span class="badge badge-primary">${Math.round(visualizationData.imageComparison.original.size / 1024)} KB</span>` : 
    ''}
                </div>
                <div class="image-container">
                  <img src="${visualizationData.imageComparison.original.url}" alt="Original image" />
                </div>
                <div class="image-details">
                  <dl>
                    <dt>Dimensions</dt>
                    <dd>${visualizationData.imageComparison.original.width && visualizationData.imageComparison.original.height ? 
    `${visualizationData.imageComparison.original.width}×${visualizationData.imageComparison.original.height}` : 
    'Unknown'}</dd>
                    
                    <dt>Content Type</dt>
                    <dd>${visualizationData.imageComparison.original.contentType || 'Unknown'}</dd>
                    
                    <dt>Size</dt>
                    <dd>${visualizationData.imageComparison.original.size ? 
    `${visualizationData.imageComparison.original.size} bytes (${Math.round(visualizationData.imageComparison.original.size / 1024)} KB)` : 
    'Unknown'}</dd>
                  </dl>
                </div>
              </div>
              
              <div class="image-panel">
                <div class="image-panel-header">
                  Transformed Image
                  ${visualizationData.imageComparison.transformed.estimatedSize ? 
    `<span class="badge badge-success">${Math.round(visualizationData.imageComparison.transformed.estimatedSize / 1024)} KB (est.)</span>` : 
    ''}
                </div>
                <div class="image-container">
                  <img src="${visualizationData.imageComparison.transformed.url}" alt="Transformed image" />
                </div>
                <div class="image-details">
                  <dl>
                    <dt>Dimensions</dt>
                    <dd>${visualizationData.imageComparison.transformed.width ? 
    `${visualizationData.imageComparison.transformed.width}${visualizationData.imageComparison.transformed.height ? 
      `×${visualizationData.imageComparison.transformed.height}` : 
      ''
    }` : 
    'Auto'}</dd>
                    
                    <dt>Format</dt>
                    <dd>${transformOptions.format || 'Auto'}</dd>
                    
                    <dt>Quality</dt>
                    <dd>${transformOptions.quality || config.responsive.quality || 'Auto'}</dd>
                    
                    <dt>Estimated Size</dt>
                    <dd>${visualizationData.imageComparison.transformed.estimatedSize ? 
    `${visualizationData.imageComparison.transformed.estimatedSize} bytes (${Math.round(visualizationData.imageComparison.transformed.estimatedSize / 1024)} KB)` : 
    'Unknown'}</dd>
                    
                    ${visualizationData.imageComparison.transformed.estimatedSize && visualizationData.imageComparison.original.size ? `
                    <dt>Compression Ratio</dt>
                    <dd>${Math.round((visualizationData.imageComparison.transformed.estimatedSize / visualizationData.imageComparison.original.size) * 100)}%</dd>
                    
                    <dt>Size Reduction</dt>
                    <dd>${Math.round((1 - (visualizationData.imageComparison.transformed.estimatedSize / visualizationData.imageComparison.original.size)) * 100)}%</dd>
                    ` : ''}
                  </dl>
                </div>
              </div>
            </div>
          </div>
          
          <div class="parameter-explorer">
            <div class="parameter-explorer-header">
              Transform Parameter Explorer
            </div>
            <div class="parameter-controls">
              <div class="control-group">
                <label class="control-label" for="explorer-width">Width</label>
                <input type="number" id="explorer-width" class="control-input" value="${transformOptions.width || ''}" placeholder="Auto" />
              </div>
              
              <div class="control-group">
                <label class="control-label" for="explorer-height">Height</label>
                <input type="number" id="explorer-height" class="control-input" value="${transformOptions.height || ''}" placeholder="Auto" />
              </div>
              
              <div class="control-group">
                <label class="control-label" for="explorer-format">Format</label>
                <select id="explorer-format" class="control-input">
                  <option value="auto" ${!transformOptions.format || transformOptions.format === 'auto' ? 'selected' : ''}>Auto</option>
                  <option value="webp" ${transformOptions.format === 'webp' ? 'selected' : ''}>WebP</option>
                  <option value="avif" ${transformOptions.format === 'avif' ? 'selected' : ''}>AVIF</option>
                  <option value="jpeg" ${transformOptions.format === 'jpeg' ? 'selected' : ''}>JPEG</option>
                  <option value="png" ${transformOptions.format === 'png' ? 'selected' : ''}>PNG</option>
                  <option value="gif" ${transformOptions.format === 'gif' ? 'selected' : ''}>GIF</option>
                </select>
              </div>
              
              <div class="control-group">
                <label class="control-label" for="explorer-quality">Quality</label>
                <input type="range" id="explorer-quality" class="control-input" min="1" max="100" value="${transformOptions.quality || config.responsive.quality || 85}" />
                <span id="explorer-quality-value">${transformOptions.quality || config.responsive.quality || 85}</span>
              </div>
              
              <div class="control-group">
                <label class="control-label" for="explorer-fit">Fit</label>
                <select id="explorer-fit" class="control-input">
                  <option value="scale-down" ${!transformOptions.fit || transformOptions.fit === 'scale-down' ? 'selected' : ''}>Scale Down</option>
                  <option value="contain" ${transformOptions.fit === 'contain' ? 'selected' : ''}>Contain</option>
                  <option value="cover" ${transformOptions.fit === 'cover' ? 'selected' : ''}>Cover</option>
                  <option value="crop" ${transformOptions.fit === 'crop' ? 'selected' : ''}>Crop</option>
                  <option value="pad" ${transformOptions.fit === 'pad' ? 'selected' : ''}>Pad</option>
                </select>
              </div>
            </div>
            <div class="parameter-preview">
              <p>Use the controls above to explore different transformation parameters. The URL below will update as you change parameters.</p>
              <div id="explorer-url" class="code">
                <code>${request.url}</code>
              </div>
              <p><small>Note: This is a visualization only. Parameters are not applied to the image in real-time.</small></p>
            </div>
          </div>
        </div>
        
        <!-- Parameters Tab -->
        <div class="tab-content" id="parameters">
          <div class="card">
            <div class="card-header">
              <h3 class="card-title">Transformation Parameters</h3>
            </div>
            <table>
              <thead>
                <tr>
                  <th>Parameter</th>
                  <th>Value</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                ${Object.entries(transformOptions).map(([key, value]) => `
                  <tr>
                    <td>${key}</td>
                    <td>${value}</td>
                    <td>${getParameterDescription(key)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
          
          <div class="grid">
            <div class="card">
              <div class="card-header">
                <h3 class="card-title">Available Derivatives</h3>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Width</th>
                    <th>Height</th>
                    <th>Quality</th>
                    <th>Format</th>
                  </tr>
                </thead>
                <tbody>
                  ${Object.entries(config.derivatives || {}).map(([name, deriv]) => `
                    <tr>
                      <td>${name}</td>
                      <td>${deriv.width || 'Auto'}</td>
                      <td>${deriv.height || 'Auto'}</td>
                      <td>${deriv.quality || config.responsive.quality || 'Auto'}</td>
                      <td>${deriv.format || 'Auto'}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
            
            <div class="card">
              <div class="card-header">
                <h3 class="card-title">Format Quality Settings</h3>
              </div>
              <table>
                <thead>
                  <tr>
                    <th>Format</th>
                    <th>Quality</th>
                  </tr>
                </thead>
                <tbody>
                  ${Object.entries(config.responsive.formatQuality || {}).map(([format, quality]) => `
                    <tr>
                      <td>${format}</td>
                      <td>${quality}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          </div>
        </div>
        
        <!-- Configuration Tab -->
        <div class="tab-content" id="configuration">
          <div class="collapsible">
            <div class="collapsible-header">
              Debug Configuration
              <span class="badge ${config.debug.enabled ? 'badge-success' : 'badge-error'}">
                ${config.debug.enabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>
            <div class="collapsible-content">
              <table>
                <tr>
                  <th>Enabled</th>
                  <td>${config.debug.enabled ? 'Yes' : 'No'}</td>
                </tr>
                <tr>
                  <th>Verbose</th>
                  <td>${config.debug.verbose ? 'Yes' : 'No'}</td>
                </tr>
                <tr>
                  <th>Allowed Environments</th>
                  <td>${config.debug.allowedEnvironments ? config.debug.allowedEnvironments.join(', ') : 'All'}</td>
                </tr>
                <tr>
                  <th>Force Debug Headers</th>
                  <td>${config.debug.forceDebugHeaders ? 'Yes' : 'No'}</td>
                </tr>
                <tr>
                  <th>Include Performance</th>
                  <td>${config.debug.includePerformance ? 'Yes' : 'No'}</td>
                </tr>
                <tr>
                  <th>Headers</th>
                  <td>${config.debug.headers ? config.debug.headers.join(', ') : 'None'}</td>
                </tr>
              </table>
            </div>
          </div>
          
          <div class="collapsible">
            <div class="collapsible-header">
              Cache Configuration
              <span class="badge badge-primary">${config.cache.method}</span>
            </div>
            <div class="collapsible-content">
              <table>
                <tr>
                  <th>Method</th>
                  <td>${config.cache.method}</td>
                </tr>
                <tr>
                  <th>Cache Everything</th>
                  <td>${config.cache.cacheEverything ? 'Yes' : 'No'}</td>
                </tr>
                <tr>
                  <th>Use TTL By Status</th>
                  <td>${config.cache.useTtlByStatus ? 'Yes' : 'No'}</td>
                </tr>
                <tr>
                  <th>OK TTL</th>
                  <td>${config.cache.ttl.ok} seconds</td>
                </tr>
                <tr>
                  <th>Client Error TTL</th>
                  <td>${config.cache.ttl.clientError} seconds</td>
                </tr>
                <tr>
                  <th>Server Error TTL</th>
                  <td>${config.cache.ttl.serverError} seconds</td>
                </tr>
                <tr>
                  <th>Cache Tags Enabled</th>
                  <td>${config.cache.cacheTags?.enabled ? 'Yes' : 'No'}</td>
                </tr>
                <tr>
                  <th>Cache Tags Prefix</th>
                  <td>${config.cache.cacheTags?.prefix || 'None'}</td>
                </tr>
                <tr>
                  <th>Bypass Parameters</th>
                  <td>${config.cache.bypassParams ? config.cache.bypassParams.join(', ') : 'None'}</td>
                </tr>
              </table>
            </div>
          </div>
          
          <div class="collapsible">
            <div class="collapsible-header">
              Storage Configuration
              <span class="badge badge-primary">${config.storage.priority.join(', ')}</span>
            </div>
            <div class="collapsible-content">
              <table>
                <tr>
                  <th>Priority</th>
                  <td>${config.storage.priority.join(', ')}</td>
                </tr>
                <tr>
                  <th>R2 Enabled</th>
                  <td>${config.storage.r2.enabled ? 'Yes' : 'No'}</td>
                </tr>
                <tr>
                  <th>R2 Binding</th>
                  <td>${config.storage.r2.bindingName}</td>
                </tr>
                <tr>
                  <th>Remote URL</th>
                  <td>${config.storage.remoteUrl || 'Not configured'}</td>
                </tr>
                <tr>
                  <th>Fallback URL</th>
                  <td>${config.storage.fallbackUrl || 'Not configured'}</td>
                </tr>
              </table>
            </div>
          </div>
          
          <div class="collapsible">
            <div class="collapsible-header">
              Responsive Configuration
            </div>
            <div class="collapsible-content">
              <table>
                <tr>
                  <th>Default Quality</th>
                  <td>${config.responsive.quality}</td>
                </tr>
                <tr>
                  <th>Default Fit</th>
                  <td>${config.responsive.fit}</td>
                </tr>
                <tr>
                  <th>Default Format</th>
                  <td>${config.responsive.format}</td>
                </tr>
                <tr>
                  <th>Breakpoints</th>
                  <td>${config.responsive.breakpoints ? config.responsive.breakpoints.join(', ') : 'None'}</td>
                </tr>
                <tr>
                  <th>Device Widths</th>
                  <td>
                    ${config.responsive.deviceWidths ? 
    Object.entries(config.responsive.deviceWidths).map(([device, width]) => 
      `${device}: ${width}px`
    ).join(', ') : 
    'None'}
                  </td>
                </tr>
              </table>
            </div>
          </div>
          
          <div class="collapsible">
            <div class="collapsible-header">
              Full Configuration (JSON)
            </div>
            <div class="collapsible-content">
              <pre>${JSON.stringify(config, null, 2)}</pre>
            </div>
          </div>
        </div>
      </div>
      
      <script>
        // Tab switching functionality
        document.querySelectorAll('.tab').forEach(tab => {
          tab.addEventListener('click', () => {
            const tabId = tab.getAttribute('data-tab');
            
            // Update active tab
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            // Show active content
            document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));
            document.getElementById(tabId).classList.add('active');
          });
        });
        
        // Collapsible functionality
        document.querySelectorAll('.collapsible-header').forEach(header => {
          header.addEventListener('click', () => {
            const collapsible = header.parentElement;
            collapsible.classList.toggle('open');
          });
        });
        
        // Parameter explorer functionality
        const urlParams = new URLSearchParams(window.location.search);
        const baseUrl = window.location.href.split('?')[0];
        
        function updateExplorerUrl() {
          const width = document.getElementById('explorer-width').value;
          const height = document.getElementById('explorer-height').value;
          const format = document.getElementById('explorer-format').value;
          const quality = document.getElementById('explorer-quality').value;
          const fit = document.getElementById('explorer-fit').value;
          
          const params = new URLSearchParams();
          
          if (width) params.set('width', width);
          if (height) params.set('height', height);
          if (format !== 'auto') params.set('format', format);
          params.set('quality', quality);
          if (fit !== 'scale-down') params.set('fit', fit);
          
          const url = baseUrl + '?' + params.toString();
          document.getElementById('explorer-url').innerHTML = '<code>' + url + '</code>';
        }
        
        // Initialize explorer
        document.getElementById('explorer-width').addEventListener('input', updateExplorerUrl);
        document.getElementById('explorer-height').addEventListener('input', updateExplorerUrl);
        document.getElementById('explorer-format').addEventListener('change', updateExplorerUrl);
        document.getElementById('explorer-quality').addEventListener('input', e => {
          document.getElementById('explorer-quality-value').textContent = e.target.value;
          updateExplorerUrl();
        });
        document.getElementById('explorer-fit').addEventListener('change', updateExplorerUrl);
        
        // Initial URL update
        updateExplorerUrl();
      </script>
    </body>
    </html>
  `;
  
  return new Response(html, {
    headers: {
      'Content-Type': 'text/html;charset=UTF-8',
      'Cache-Control': 'no-store'
    }
  });
}

/**
 * Helper function to get parameter descriptions
 */
function getParameterDescription(parameter: string): string {
  const descriptions: Record<string, string> = {
    width: 'The desired width of the output image in pixels',
    height: 'The desired height of the output image in pixels',
    quality: 'The compression quality from 1-100 (higher is better quality)',
    format: 'The output image format (webp, avif, jpeg, png, etc.)',
    fit: 'How the image should be resized to fit the dimensions',
    metadata: 'Metadata handling (keep, copyright, none)',
    gravity: 'Position of the image in the canvas during resize',
    background: 'Background color when fitting results in padding',
    rotate: 'Rotation angle in degrees',
    trim: 'Trim whitespace/transparency from edges',
    sharpen: 'Apply sharpening to the image',
    blur: 'Apply Gaussian blur to the image',
    brightness: 'Adjust image brightness',
    contrast: 'Adjust image contrast',
    gamma: 'Apply a gamma correction',
    derivative: 'A preset template for common transformations'
  };
  
  return descriptions[parameter] || 'Transformation parameter';
}