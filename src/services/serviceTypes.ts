/**
 * Service type identifiers for dependency injection
 */

export enum ServiceTypes {
  STORAGE_SERVICE = 'StorageService',
  TRANSFORMATION_SERVICE = 'TransformationService',
  CACHE_SERVICE = 'CacheService',
  DEBUG_SERVICE = 'DebugService',
  CLIENT_DETECTION_SERVICE = 'ClientDetectionService',
  CONFIGURATION_SERVICE = 'ConfigurationService',
  LOGGING_SERVICE = 'LoggingService',
  AUTH_SERVICE = 'AuthService',
  
  // New services
  DETECTOR_SERVICE = 'DetectorService',
  PATH_SERVICE = 'PathService',
  PARAMETER_HANDLER = 'ParameterHandler',
  LIFECYCLE_MANAGER = 'LifecycleManager',
  METADATA_SERVICE = 'MetadataService',
  CONFIG_STORE = 'ConfigStore',
  CONFIG_API_SERVICE = 'ConfigApiService'
}