/**
 * Lifecycle Manager Service
 * 
 * Centralized service for managing lifecycle events (initialization and shutdown)
 * across all services in the application. This service implements dependency-based
 * ordering for initialization and reverse-order for shutdown.
 */

import { ServiceContainer, ConfigurationService, LoggingService } from './interfaces';
import { Logger } from '../utils/logging';

/**
 * Represents the health status of a service
 */
export interface ServiceHealth {
  serviceName: string;
  status: 'initializing' | 'initialized' | 'failed' | 'shutting_down' | 'shutdown' | 'unknown';
  startTime?: number;
  endTime?: number;
  durationMs?: number;
  error?: Error;
  message?: string;
  dependencies?: string[];
}

/**
 * Contains lifecycle statistics and metrics for all services
 */
export interface LifecycleStatistics {
  applicationStartTime: number;
  applicationEndTime?: number;
  totalInitializationTimeMs?: number;
  totalShutdownTimeMs?: number;
  serviceHealths: Record<string, ServiceHealth>;
  initializeOrder: string[];
  shutdownOrder: string[];
  services: {
    total: number;
    initialized: number;
    failed: number;
    shutdown: number;
  };
  errors: Array<{
    serviceName: string;
    phase: 'initialize' | 'shutdown';
    error: Error;
    message: string;
  }>;
}

/**
 * Lifecycle manager service for coordinating service initialization and shutdown
 */
export class LifecycleManager {
  private logger: Logger;
  private serviceContainer: ServiceContainer;
  private configurationService: ConfigurationService;
  private loggingService: LoggingService;
  private statistics: LifecycleStatistics;
  private initialized: boolean = false;
  private shutdownRequested: boolean = false;
  
  // Dependency graph for initialization ordering
  private serviceGraph: Record<string, string[]> = {
    // Configuration service has no dependencies
    'configurationService': [],
    
    // Logging service depends on configuration
    'loggingService': ['configurationService'],
    
    // Auth service depends on configuration and logging
    'authService': ['configurationService', 'loggingService'],
    
    // Storage service depends on configuration, logging, and auth
    'storageService': ['configurationService', 'loggingService', 'authService'],
    
    // Cache service depends on configuration and logging
    'cacheService': ['configurationService', 'loggingService'],
    
    // Client detection depends on configuration and logging
    'clientDetectionService': ['configurationService', 'loggingService'],
    
    // Debug service depends on logging
    'debugService': ['loggingService'],
    
    // Transformation service depends on configuration, logging, cache, and client detection
    'transformationService': ['configurationService', 'loggingService', 'cacheService', 'clientDetectionService'],
    
    // Path service depends on configuration and logging
    'pathService': ['configurationService', 'loggingService'],
    
    // Detector service depends on configuration and logging
    'detectorService': ['configurationService', 'loggingService']
  };

  /**
   * Creates a new lifecycle manager instance
   * 
   * @param serviceContainer Container with all services to manage
   */
  constructor(serviceContainer: ServiceContainer) {
    this.serviceContainer = serviceContainer;
    
    // Get basic services that are required for operation
    this.configurationService = serviceContainer.configurationService;
    this.loggingService = serviceContainer.loggingService;
    this.logger = serviceContainer.logger || this.loggingService.getLogger('LifecycleManager');
    
    // Initialize statistics
    this.statistics = {
      applicationStartTime: Date.now(),
      serviceHealths: {},
      initializeOrder: [],
      shutdownOrder: [],
      services: {
        total: 0,
        initialized: 0,
        failed: 0,
        shutdown: 0
      },
      errors: []
    };
    
    // Initialize health status for all services in the dependency graph
    Object.keys(this.serviceGraph).forEach(serviceName => {
      this.statistics.serviceHealths[serviceName] = {
        serviceName,
        status: 'unknown',
        dependencies: this.serviceGraph[serviceName]
      };
      this.statistics.services.total++;
    });
  }
  
  /**
   * Initialize all services in dependency-based order
   * 
   * @param options Optional initialization options
   * @returns Promise that resolves when initialization is complete
   */
  public async initialize(options: { 
    gracefulDegradation?: boolean; 
    timeout?: number;
    critical?: string[];
  } = {}): Promise<LifecycleStatistics> {
    if (this.initialized) {
      this.logger.warn('Application already initialized');
      return this.statistics;
    }
    
    const startTime = Date.now();
    this.statistics.applicationStartTime = startTime;
    
    this.logger.info('Starting application lifecycle initialization', {
      services: this.statistics.services.total,
      gracefulDegradation: options.gracefulDegradation ?? false,
      timeout: options.timeout
    });
    
    // Sort services by dependency order
    const initOrder = this.getInitializationOrder();
    
    // Track critical services (ones that must succeed for the app to work)
    const criticalServices = options.critical || ['configurationService', 'loggingService'];
    
    // Process each service in order
    for (const serviceName of initOrder) {
      const serviceHealth = this.statistics.serviceHealths[serviceName];
      const service = (this.serviceContainer as any)[serviceName];
      const isCritical = criticalServices.includes(serviceName);
      
      if (!service) {
        this.logger.warn(`Service ${serviceName} not found in container, skipping initialization`);
        serviceHealth.status = 'failed';
        serviceHealth.message = 'Service not found in container';
        this.statistics.services.failed++;
        
        if (isCritical && !options.gracefulDegradation) {
          throw new Error(`Critical service ${serviceName} not found in container`);
        }
        continue;
      }
      
      // Check if service has initialize method
      if (!('initialize' in service) || typeof service.initialize !== 'function') {
        this.logger.debug(`Service ${serviceName} doesn't have initialize method, skipping`);
        serviceHealth.status = 'initialized';
        serviceHealth.message = 'No initialize method';
        this.statistics.services.initialized++;
        this.statistics.initializeOrder.push(serviceName);
        continue;
      }
      
      // Initialize the service
      try {
        const serviceStartTime = Date.now();
        serviceHealth.status = 'initializing';
        serviceHealth.startTime = serviceStartTime;
        
        this.logger.debug(`Initializing service: ${serviceName}`);
        
        // Apply timeout if specified
        if (options.timeout) {
          const timeoutPromise = new Promise<void>((_, reject) => {
            setTimeout(() => {
              reject(new Error(`Service ${serviceName} initialization timed out after ${options.timeout}ms`));
            }, options.timeout);
          });
          
          await Promise.race([
            service.initialize(),
            timeoutPromise
          ]);
        } else {
          await service.initialize();
        }
        
        // Update statistics
        const serviceEndTime = Date.now();
        serviceHealth.status = 'initialized';
        serviceHealth.endTime = serviceEndTime;
        serviceHealth.durationMs = serviceEndTime - serviceStartTime;
        this.statistics.services.initialized++;
        this.statistics.initializeOrder.push(serviceName);
        
        this.logger.debug(`Service ${serviceName} initialized successfully`, {
          durationMs: serviceHealth.durationMs
        });
      } catch (error) {
        const serviceEndTime = Date.now();
        serviceHealth.status = 'failed';
        serviceHealth.endTime = serviceEndTime;
        serviceHealth.durationMs = serviceEndTime - (serviceHealth.startTime || startTime);
        serviceHealth.error = error instanceof Error ? error : new Error(String(error));
        serviceHealth.message = error instanceof Error ? error.message : String(error);
        
        this.statistics.services.failed++;
        this.statistics.errors.push({
          serviceName,
          phase: 'initialize',
          error: serviceHealth.error,
          message: serviceHealth.message
        });
        
        this.logger.error(`Failed to initialize service: ${serviceName}`, {
          error: serviceHealth.message,
          stack: serviceHealth.error.stack,
          durationMs: serviceHealth.durationMs
        });
        
        // If critical service failed and graceful degradation is not enabled, throw
        if (isCritical && !options.gracefulDegradation) {
          throw new Error(`Critical service ${serviceName} failed to initialize: ${serviceHealth.message}`);
        }
      }
    }
    
    const endTime = Date.now();
    this.statistics.applicationEndTime = endTime;
    this.statistics.totalInitializationTimeMs = endTime - startTime;
    
    this.initialized = true;
    
    this.logger.info('Application initialization complete', {
      durationMs: this.statistics.totalInitializationTimeMs,
      initialized: this.statistics.services.initialized,
      failed: this.statistics.services.failed,
      total: this.statistics.services.total
    });
    
    // Log detailed initialization statistics at debug level
    this.logger.debug('Initialization order', {
      order: this.statistics.initializeOrder.join(' → ')
    });
    
    // Log failed services at warning level
    if (this.statistics.services.failed > 0) {
      this.logger.warn('Some services failed to initialize', {
        failedServices: this.statistics.errors
          .filter(e => e.phase === 'initialize')
          .map(e => `${e.serviceName}: ${e.message}`)
          .join(', ')
      });
    }
    
    return this.statistics;
  }
  
  /**
   * Shut down all services in reverse dependency order
   * 
   * @param options Optional shutdown options
   * @returns Promise that resolves when shutdown is complete
   */
  public async shutdown(options: {
    force?: boolean;
    timeout?: number;
  } = {}): Promise<LifecycleStatistics> {
    if (this.shutdownRequested) {
      this.logger.warn('Shutdown already in progress');
      return this.statistics;
    }
    
    this.shutdownRequested = true;
    const startTime = Date.now();
    
    this.logger.info('Starting application lifecycle shutdown', {
      force: options.force ?? false,
      timeout: options.timeout
    });
    
    // Get shutdown order (reverse of initialization order)
    const shutdownOrder = this.getInitializationOrder().reverse();
    
    // Process each service in reverse order
    for (const serviceName of shutdownOrder) {
      const serviceHealth = this.statistics.serviceHealths[serviceName];
      const service = (this.serviceContainer as any)[serviceName];
      
      if (!service) {
        this.logger.debug(`Service ${serviceName} not found in container, skipping shutdown`);
        continue;
      }
      
      // Check if service has shutdown method
      if (!('shutdown' in service) || typeof service.shutdown !== 'function') {
        this.logger.debug(`Service ${serviceName} doesn't have shutdown method, skipping`);
        this.statistics.shutdownOrder.push(serviceName);
        continue;
      }
      
      // Shut down the service
      try {
        const serviceStartTime = Date.now();
        serviceHealth.status = 'shutting_down';
        
        this.logger.debug(`Shutting down service: ${serviceName}`);
        
        // Apply timeout if specified
        if (options.timeout) {
          const timeoutPromise = new Promise<void>((_, reject) => {
            setTimeout(() => {
              reject(new Error(`Service ${serviceName} shutdown timed out after ${options.timeout}ms`));
            }, options.timeout);
          });
          
          await Promise.race([
            service.shutdown(),
            timeoutPromise
          ]);
        } else {
          await service.shutdown();
        }
        
        // Update statistics
        const serviceEndTime = Date.now();
        serviceHealth.status = 'shutdown';
        serviceHealth.endTime = serviceEndTime;
        serviceHealth.durationMs = serviceEndTime - serviceStartTime;
        this.statistics.services.shutdown++;
        this.statistics.shutdownOrder.push(serviceName);
        
        this.logger.debug(`Service ${serviceName} shutdown successfully`, {
          durationMs: serviceHealth.durationMs
        });
      } catch (error) {
        const errorObj = error instanceof Error ? error : new Error(String(error));
        const errorMsg = error instanceof Error ? error.message : String(error);
        
        this.statistics.errors.push({
          serviceName,
          phase: 'shutdown',
          error: errorObj,
          message: errorMsg
        });
        
        this.logger.error(`Failed to shut down service: ${serviceName}`, {
          error: errorMsg,
          stack: errorObj.stack
        });
        
        // If force shutdown is enabled, continue with other services
        if (!options.force) {
          throw new Error(`Service ${serviceName} failed to shut down: ${errorMsg}`);
        }
      }
    }
    
    const endTime = Date.now();
    this.statistics.applicationEndTime = endTime;
    this.statistics.totalShutdownTimeMs = endTime - startTime;
    
    this.logger.info('Application shutdown complete', {
      durationMs: this.statistics.totalShutdownTimeMs,
      shutdown: this.statistics.services.shutdown,
      total: this.statistics.services.total
    });
    
    // Log detailed shutdown statistics at debug level
    this.logger.debug('Shutdown order', {
      order: this.statistics.shutdownOrder.join(' → ')
    });
    
    return this.statistics;
  }
  
  /**
   * Create a dependency graph visualization for service initialization
   * 
   * @returns A string representation of the dependency graph
   */
  public createDependencyGraph(): string {
    let graph = 'Service Dependency Graph:\n\n';
    
    // Sort services alphabetically for consistent output
    const services = Object.keys(this.serviceGraph).sort();
    
    for (const service of services) {
      const dependencies = this.serviceGraph[service];
      
      if (dependencies.length === 0) {
        graph += `${service} (no dependencies)\n`;
      } else {
        graph += `${service} depends on: ${dependencies.join(', ')}\n`;
      }
    }
    
    return graph;
  }
  
  /**
   * Sort services in initialization order based on dependencies
   * 
   * @returns Array of service names in initialization order
   */
  private getInitializationOrder(): string[] {
    // Store the visited set and result array
    const visited = new Set<string>();
    const result: string[] = [];
    
    // Helper function for topological sort (DFS)
    const visit = (serviceName: string) => {
      // If already visited in this DFS call, we have a cycle
      if (visited.has(serviceName)) {
        return;
      }
      
      // Mark as visited
      visited.add(serviceName);
      
      // Visit all dependencies first
      const dependencies = this.serviceGraph[serviceName] || [];
      for (const dependency of dependencies) {
        visit(dependency);
      }
      
      // Add to result after all dependencies have been added
      if (!result.includes(serviceName)) {
        result.push(serviceName);
      }
    };
    
    // Visit each service
    for (const serviceName of Object.keys(this.serviceGraph)) {
      visit(serviceName);
    }
    
    return result;
  }
  
  /**
   * Get current health status of all services
   * 
   * @returns Service health statistics
   */
  public getServiceHealths(): Record<string, ServiceHealth> {
    return this.statistics.serviceHealths;
  }
  
  /**
   * Get detailed lifecycle statistics
   * 
   * @returns Lifecycle statistics
   */
  public getStatistics(): LifecycleStatistics {
    return this.statistics;
  }
  
  /**
   * Check if a specific service is healthy
   * 
   * @param serviceName The name of the service to check
   * @returns True if the service is in a healthy state
   */
  public isServiceHealthy(serviceName: string): boolean {
    const health = this.statistics.serviceHealths[serviceName];
    return health?.status === 'initialized';
  }
  
  /**
   * Check if the application as a whole is healthy
   * 
   * @param criticalServices Array of service names that must be healthy
   * @returns True if all critical services are healthy
   */
  public isApplicationHealthy(criticalServices?: string[]): boolean {
    const services = criticalServices || ['configurationService', 'loggingService'];
    return services.every(service => this.isServiceHealthy(service));
  }
  
  /**
   * Create a health report for services
   * 
   * @returns A formatted health report string
   */
  public createHealthReport(): string {
    const stats = this.statistics;
    let report = `Application Health Report\n\n`;
    
    // Add overall statistics
    report += `Overall Status: ${this.isApplicationHealthy() ? 'Healthy' : 'Unhealthy'}\n`;
    report += `Services: ${stats.services.initialized}/${stats.services.total} initialized`;
    
    if (stats.services.failed > 0) {
      report += `, ${stats.services.failed} failed`;
    }
    
    report += `\nInitialization Time: ${stats.totalInitializationTimeMs || 'N/A'} ms\n\n`;
    
    // Add details for each service
    report += `Service Status:\n`;
    
    // Sort services by initialization order
    const serviceNames = [...this.statistics.initializeOrder];
    
    // Add any services that weren't initialized
    Object.keys(this.statistics.serviceHealths).forEach(name => {
      if (!serviceNames.includes(name)) {
        serviceNames.push(name);
      }
    });
    
    for (const serviceName of serviceNames) {
      const health = this.statistics.serviceHealths[serviceName];
      
      if (!health) {
        report += `- ${serviceName}: Unknown\n`;
        continue;
      }
      
      const status = health.status === 'initialized' ? 'Healthy' : 
                    (health.status === 'failed' ? 'Failed' : health.status);
      
      report += `- ${serviceName}: ${status}`;
      
      if (health.durationMs) {
        report += ` (${health.durationMs} ms)`;
      }
      
      if (health.message) {
        report += ` - ${health.message}`;
      }
      
      report += '\n';
    }
    
    // Add errors if any
    if (stats.errors.length > 0) {
      report += `\nErrors:\n`;
      for (const error of stats.errors) {
        report += `- ${error.serviceName} (${error.phase}): ${error.message}\n`;
      }
    }
    
    return report;
  }
}

/**
 * Create a lifecycle manager for a service container
 * 
 * @param serviceContainer The service container to manage
 * @returns A lifecycle manager instance
 */
export function createLifecycleManager(serviceContainer: ServiceContainer): LifecycleManager {
  return new LifecycleManager(serviceContainer);
}