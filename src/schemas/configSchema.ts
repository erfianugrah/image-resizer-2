/**
 * Configuration Schema for Image Resizer
 * 
 * This file contains Zod schemas for validating configuration objects used throughout the application.
 * It provides runtime type safety and validation for configuration loading from KV and other sources.
 */

import { z } from 'zod';

// ==========================================================================
// Helper schemas for reusable components
// ==========================================================================

/**
 * Schema for path transformation
 */
const pathTransformSchema = z.object({
  prefix: z.string(),
  removePrefix: z.boolean(),
  // Origin-specific transforms
  r2: z.object({
    prefix: z.string(),
    removePrefix: z.boolean(),
  }).optional(),
  remote: z.object({
    prefix: z.string(),
    removePrefix: z.boolean(),
  }).optional(),
  fallback: z.object({
    prefix: z.string(),
    removePrefix: z.boolean(),
  }).optional(),
});

/**
 * Schema for retry configuration
 */
const retryConfigSchema = z.object({
  maxAttempts: z.number().optional(),
  initialDelayMs: z.number().optional(),
  maxDelayMs: z.number().optional(),
  backoffFactor: z.number().optional(),
  jitterFactor: z.number().optional(),
});

/**
 * Schema for circuit breaker configuration
 */
const circuitBreakerConfigSchema = z.object({
  failureThreshold: z.number().optional(),
  resetTimeoutMs: z.number().optional(),
  successThreshold: z.number().optional(),
});

/**
 * Schema for metadata headers configuration
 */
const metadataHeadersConfigSchema = z.object({
  enabled: z.boolean(),
  headerPrefixes: z.array(z.string()),
  excludeHeaders: z.array(z.string()),
  includeContentType: z.boolean(),
  includeCacheControl: z.boolean(),
});

/**
 * Schema for path normalization for cache tags
 */
const cacheTagsPathNormalizationSchema = z.object({
  leadingSlashPattern: z.string().optional(),
  invalidCharsPattern: z.string().optional(),
  replacementChar: z.string().optional(),
});

/**
 * Schema for cache tags configuration
 */
const cacheTagsConfigSchema = z.object({
  enabled: z.boolean(),
  prefix: z.string().optional(),
  includeImageDimensions: z.boolean(),
  includeFormat: z.boolean(),
  includeQuality: z.boolean(),
  includeDerivative: z.boolean(),
  customTags: z.array(z.string()).optional(),
  pathBasedTags: z.record(z.string(), z.array(z.string())).optional(),
  parseMetadataHeaders: metadataHeadersConfigSchema.optional(),
  pathNormalization: cacheTagsPathNormalizationSchema.optional(),
  maxTags: z.number().optional(),
  simplifiedTags: z.boolean().optional(),
});

/**
 * Schema for cache tier configuration
 */
const cacheTierConfigSchema = z.object({
  name: z.string(),
  ttlMultiplier: z.number(),
  priority: z.number(),
  contentTypes: z.array(z.string()).optional(),
  pathPatterns: z.array(z.string()).optional(),
  minSize: z.number().optional(),
  maxSize: z.number().optional(),
  frequentlyAccessed: z.boolean().optional(),
});

/**
 * Schema for transform cache configuration
 */
const transformCacheConfigSchema = z.object({
  enabled: z.boolean(),
  binding: z.string().optional(),
  prefix: z.string().optional(),
  maxSize: z.number().optional(),
  defaultTtl: z.number().optional(),
  contentTypeTtls: z.record(z.string(), z.number()).optional(),
  indexingEnabled: z.boolean().optional(),
  backgroundIndexing: z.boolean().optional(),
  purgeDelay: z.number().optional(),
  disallowedPaths: z.array(z.string()).optional(),
  optimizedIndexing: z.boolean().optional(),
  smallPurgeThreshold: z.number().optional(),
  indexUpdateFrequency: z.number().optional(),
  skipIndicesForSmallFiles: z.boolean().optional(),
  smallFileThreshold: z.number().optional(),
  useSimpleImplementation: z.boolean().optional(),
});

/**
 * Schema for immutable content configuration
 */
const immutableContentConfigSchema = z.object({
  enabled: z.boolean(),
  contentTypes: z.array(z.string()).optional(),
  paths: z.array(z.string()).optional(),
  derivatives: z.array(z.string()).optional(),
});

/**
 * Schema for CDN directives configuration
 */
const cdnDirectivesConfigSchema = z.object({
  enabled: z.boolean(),
  noTransform: z.boolean().optional(),
  staleIfError: z.boolean().optional(),
  staleIfErrorTime: z.number().optional(),
});

/**
 * Schema for resource hints configuration
 */
const resourceHintsConfigSchema = z.object({
  preconnect: z.array(z.string()).optional(),
  preloadPatterns: z.record(z.string(), z.array(z.string())).optional(),
});

/**
 * Schema for origin-specific remote or fallback auth configuration
 */
const originAuthConfigSchema = z.object({
  enabled: z.boolean(),
  type: z.enum(['aws-s3', 'bearer', 'header', 'query']),
  region: z.string().optional(),
  service: z.string().optional(),
  accessKeyVar: z.string().optional(),
  secretKeyVar: z.string().optional(),
  signedUrlExpiration: z.number().optional(),
  tokenHeaderName: z.string().optional(),
  tokenSecret: z.string().optional(),
  headers: z.record(z.string(), z.string()).optional(),
});

/**
 * Schema for path-based origin configuration
 */
const pathBasedOriginSchema = z.object({
  pattern: z.union([z.string(), z.instanceof(RegExp)]),
  priority: z.array(z.enum(['r2', 'remote', 'fallback'])),
  remoteUrl: z.string().optional(),
  fallbackUrl: z.string().optional(),
  r2: z.object({
    enabled: z.boolean(),
    bindingName: z.string(),
  }).optional(),
  auth: z.object({
    useOriginAuth: z.boolean().optional(),
    sharePublicly: z.boolean().optional(),
    securityLevel: z.enum(['strict', 'permissive']).optional(),
  }).optional(),
  remoteAuth: originAuthConfigSchema.optional(),
  fallbackAuth: originAuthConfigSchema.optional(),
  pathTransforms: z.record(z.string(), pathTransformSchema).optional(),
  fetchOptions: z.object({
    userAgent: z.string().optional(),
    headers: z.record(z.string(), z.string()).optional(),
  }).optional(),
});

/**
 * Schema for auth origins configuration
 */
const authOriginSchema = z.object({
  domain: z.string(),
  type: z.enum(['bearer', 'basic', 'header', 'query', 'aws-s3']),
  enabled: z.boolean().optional(),
  tokenHeaderName: z.string().optional(),
  tokenParam: z.string().optional(),
  tokenExpiration: z.number().optional(),
  signedUrlExpiration: z.number().optional(),
  headers: z.record(z.string(), z.string()).optional(),
  region: z.string().optional(),
  service: z.string().optional(),
  accessKeyEnvVar: z.string().optional(),
  secretKeyEnvVar: z.string().optional(),
});

/**
 * Schema for detector cascade configuration for format
 */
const formatCascadeSchema = z.object({
  enabled: z.boolean(),
  acceptHeaderPriority: z.number(),
  clientHintsPriority: z.number(),
  browserDetectionPriority: z.number(),
  fallbackFormat: z.string(),
});

/**
 * Schema for detector cascade configuration for quality
 */
const qualityCascadeSchema = z.object({
  enabled: z.boolean(),
  saveDataPriority: z.number(),
  networkConditionPriority: z.number(),
  deviceCapabilityPriority: z.number(),
  dprAdjustmentEnabled: z.boolean(),
  deviceMemoryThresholds: z.object({
    high: z.number(),
    low: z.number(),
  }),
  processorThresholds: z.object({
    high: z.number(),
    low: z.number(),
  }),
  adjustmentFactors: z.object({
    slowNetwork: z.number(),
    fastNetwork: z.number(),
    dprAdjustment: z.number(),
  }),
});

/**
 * Schema for detector configuration for quality settings
 */
const qualitySettingSchema = z.object({
  min: z.number(),
  max: z.number(),
  target: z.number(),
});

/**
 * Schema for detector dimension settings
 */
const dimensionSettingSchema = z.object({
  low: z.number(),
  medium: z.number(),
  high: z.number(),
});

// ==========================================================================
// Main Configuration Schemas
// ==========================================================================

/**
 * Schema for detector configuration
 */
export const detectorConfigSchema = z.object({
  cache: z.object({
    maxSize: z.number(),
    pruneAmount: z.number(),
    enableCache: z.boolean(),
    ttl: z.number().optional(),
  }),
  strategies: z.object({
    clientHints: z.object({
      priority: z.number(),
      enabled: z.boolean(),
    }),
    acceptHeader: z.object({
      priority: z.number(),
      enabled: z.boolean(),
    }),
    userAgent: z.object({
      priority: z.number(),
      enabled: z.boolean(),
      maxUALength: z.number(),
    }),
    staticData: z.object({
      priority: z.number(),
      enabled: z.boolean(),
    }),
    defaults: z.object({
      priority: z.number(),
      enabled: z.boolean(),
    }),
  }),
  performanceBudget: z.object({
    quality: z.object({
      low: qualitySettingSchema,
      medium: qualitySettingSchema,
      high: qualitySettingSchema,
    }),
    dimensions: z.object({
      maxWidth: dimensionSettingSchema,
      maxHeight: dimensionSettingSchema,
    }),
    preferredFormats: z.object({
      low: z.array(z.string()),
      medium: z.array(z.string()),
      high: z.array(z.string()),
    }),
  }),
  cascade: z.object({
    format: formatCascadeSchema,
    quality: qualityCascadeSchema,
  }).optional(),
  deviceClassification: z.object({
    thresholds: z.object({
      lowEnd: z.number(),
      highEnd: z.number(),
    }),
    platformScores: z.record(z.string(), z.number()).optional(),
  }),
  hashAlgorithm: z.enum(['simple', 'fnv1a', 'md5']),
  logLevel: z.enum(['debug', 'info', 'warn', 'error']),
});

/**
 * Schema for debug configuration
 */
export const debugConfigSchema = z.object({
  enabled: z.boolean(),
  headers: z.array(z.string()),
  allowedEnvironments: z.array(z.string()),
  verbose: z.boolean(),
  includePerformance: z.boolean(),
  forceDebugHeaders: z.boolean().optional(),
  prefix: z.string().optional(),
  specialHeaders: z.record(z.string(), z.boolean()).optional(),
  headerNames: z.object({
    debugEnabled: z.string().optional(),
    version: z.string().optional(),
    environment: z.string().optional(),
    processingMode: z.string().optional(),
    storageType: z.string().optional(),
    originalContentType: z.string().optional(),
    originalSize: z.string().optional(),
    originalUrl: z.string().optional(),
    clientDpr: z.string().optional(),
    clientViewport: z.string().optional(),
    deviceType: z.string().optional(),
  }).optional(),
  performanceTracking: z.boolean().optional(),
});

/**
 * Schema for logging configuration
 */
export const loggingConfigSchema = z.object({
  level: z.enum(['DEBUG', 'INFO', 'WARN', 'ERROR']),
  includeTimestamp: z.boolean(),
  enableStructuredLogs: z.boolean(),
  enableBreadcrumbs: z.boolean().optional(),
  enableCacheMetrics: z.boolean().optional(),
  usePino: z.boolean().optional(),
  prettyPrint: z.boolean().optional(),
  colorize: z.boolean().optional(),
});

/**
 * Schema for performance optimization configuration
 */
export const performanceConfigSchema = z.object({
  optimizedLogging: z.boolean().optional(),
  lazyServiceInitialization: z.boolean().optional(),
  parallelStorageOperations: z.boolean().optional(),
  responseOptimization: z.boolean().optional(),
  optimizedClientDetection: z.boolean().optional(),
  optimizedCaching: z.boolean().optional(),
  optimizedMetadataFetching: z.boolean().optional(),
  baselineEnabled: z.boolean().optional(),
  maxBaselineSamples: z.number().optional(),
  reportingEnabled: z.boolean().optional(),
  timeoutMs: z.number().optional(),
});

/**
 * Schema for cache configuration
 */
export const cacheConfigSchema = z.object({
  method: z.enum(['cf', 'cache-api', 'none']),
  ttl: z.object({
    ok: z.number(),
    clientError: z.number(),
    serverError: z.number(),
    remoteFetch: z.number().optional(),
    r2Headers: z.number().optional(),
  }),
  cacheEverything: z.boolean().optional(),
  useTtlByStatus: z.boolean().optional(),
  statusRanges: z.object({
    success: z.string(),
    redirect: z.string(),
    notFound: z.string(),
    serverError: z.string(),
  }).optional(),
  cacheTtlByStatus: z.record(z.string(), z.number()).optional(),
  cacheability: z.boolean(),
  bypassParams: z.array(z.string()).optional(),
  cacheTags: cacheTagsConfigSchema.optional(),
  transformCache: transformCacheConfigSchema.optional(),
  enableStaleWhileRevalidate: z.boolean().optional(),
  staleWhileRevalidatePercentage: z.number().optional(),
  enableBackgroundCaching: z.boolean().optional(),
  minTtl: z.number().optional(),
  maxTtl: z.number().optional(),
  pathBasedTtl: z.record(z.string(), z.number()).optional(),
  immutableContent: immutableContentConfigSchema.optional(),
  bypassPaths: z.array(z.string()).optional(),
  bypassInDevelopment: z.boolean().optional(),
  bypassForAdmin: z.boolean().optional(),
  bypassFormats: z.array(z.string()).optional(),
  versionBypass: z.boolean().optional(),
  cdnDirectives: cdnDirectivesConfigSchema.optional(),
  varyOnClientHints: z.boolean().optional(),
  varyOnUserAgent: z.boolean().optional(),
  varyOnSaveData: z.boolean().optional(),
  useMultipleCacheTagHeaders: z.boolean().optional(),
  enableResourceHints: z.boolean().optional(),
  resourceHints: resourceHintsConfigSchema.optional(),
  enableCacheMetrics: z.boolean().optional(),
  tiers: z.array(cacheTierConfigSchema).optional(),
  bypassThreshold: z.number().optional(),
  maxAccessPatterns: z.number().optional(),
  retry: retryConfigSchema.optional(),
  circuitBreaker: circuitBreakerConfigSchema.optional(),
});

/**
 * Schema for responsive configuration
 */
export const responsiveConfigSchema = z.object({
  breakpoints: z.array(z.number()),
  deviceWidths: z.record(z.string(), z.number()),
  quality: z.number(),
  fit: z.enum(['scale-down', 'contain', 'cover', 'crop', 'pad']),
  format: z.string(),
  metadata: z.enum(['keep', 'copyright', 'none']),
  formatQuality: z.record(z.string(), z.number()).optional(),
  deviceDetection: z.object({
    mobileRegex: z.string().optional(),
    tabletRegex: z.string().optional(),
  }).optional(),
  supportedFormats: z.array(z.string()).optional(),
});

/**
 * Schema for metadata configuration
 */
export const metadataConfigSchema = z.object({
  enabled: z.boolean(),
  cacheTtl: z.number().optional(),
  allowClientSpecifiedTargets: z.boolean().optional(),
  platformPresets: z.record(z.string(), z.object({
    aspectRatio: z.object({
      width: z.number(),
      height: z.number(),
    }),
    focalPoint: z.object({
      x: z.number(),
      y: z.number(),
    }).optional(),
    dimensions: z.object({
      width: z.number().optional(),
      height: z.number().optional(),
    }).optional(),
    format: z.string().optional(),
    quality: z.number().optional(),
  })).optional(),
  contentTypePresets: z.record(z.string(), z.object({
    focalPoint: z.object({
      x: z.number(),
      y: z.number(),
    }),
  })).optional(),
  defaultQuality: z.number().optional(),
  maxCacheItems: z.number().optional(),
  headerNames: z.object({
    targetPlatform: z.string().optional(),
    targetAspect: z.string().optional(),
    contentType: z.string().optional(),
    focalPoint: z.string().optional(),
  }).optional(),
});

/**
 * Schema for storage configuration
 */
export const storageConfigSchema = z.object({
  priority: z.array(z.enum(['r2', 'remote', 'fallback'])),
  pathBasedOrigins: z.record(z.string(), pathBasedOriginSchema).optional(),
  remoteUrl: z.string().optional(),
  remoteAuth: originAuthConfigSchema.optional(),
  fallbackUrl: z.string().optional(),
  fallbackAuth: originAuthConfigSchema.optional(),
  r2: z.object({
    enabled: z.boolean(),
    bindingName: z.string(),
  }),
  fetchOptions: z.object({
    userAgent: z.string().optional(),
    headers: z.record(z.string(), z.string()).optional(),
  }).optional(),
  auth: z.object({
    useOriginAuth: z.boolean().optional(),
    sharePublicly: z.boolean().optional(),
    securityLevel: z.enum(['strict', 'permissive']).optional(),
    cacheTtl: z.number().optional(),
    origins: z.record(z.string(), authOriginSchema).optional(),
  }).optional(),
  retry: retryConfigSchema.optional(),
  circuitBreaker: circuitBreakerConfigSchema.optional(),
});

/**
 * Schema for features flags configuration
 */
export const featuresConfigSchema = z.object({
  enableAkamaiCompatibility: z.boolean().optional(),
  enableAkamaiAdvancedFeatures: z.boolean().optional(),
});

/**
 * Schema for derivative
 */
export const derivativeSchema = z.record(z.string(), z.object({
  width: z.number().optional(),
  height: z.number().optional(),
  quality: z.number().optional(),
  fit: z.string().optional(),
  format: z.string().optional(),
  metadata: z.string().optional(),
  gravity: z.string().optional(),
  background: z.string().optional(),
}).catchall(z.any()));

/**
 * Main image resizer configuration schema
 */
export const imageResizerConfigSchema = z.object({
  environment: z.enum(['development', 'staging', 'production']),
  version: z.string(),
  
  // Optional debug properties
  _derivativesLoaded: z.boolean().optional(),
  _derivativesCount: z.number().optional(),
  
  // Feature flags
  features: featuresConfigSchema.optional(),
  
  // Client Detector configuration
  detector: detectorConfigSchema.optional(),
  
  // Debug settings
  debug: debugConfigSchema,
  
  // Logging settings
  logging: loggingConfigSchema.optional(),
  
  // Performance optimization settings
  performance: performanceConfigSchema.optional(),
  
  // Cache settings
  cache: cacheConfigSchema,
  
  // Responsive settings
  responsive: responsiveConfigSchema,
  
  // Metadata processing settings
  metadata: metadataConfigSchema.optional(),
  
  // Storage settings
  storage: storageConfigSchema,
  
  // Template derivatives for common transformations
  derivatives: derivativeSchema,
  
  // Path template mapping
  pathTemplates: z.record(z.string(), z.string()).optional(),
  
  // Path transformations for directory structure normalization
  pathTransforms: z.record(z.string(), pathTransformSchema).optional(),
});

// ==========================================================================
// Module Configuration System Schema
// ==========================================================================

/**
 * Schema for module metadata
 */
export const configModuleMetadataSchema = z.object({
  name: z.string(),
  version: z.string(),
  description: z.string(),
  schema: z.record(z.string(), z.any()),
  defaults: z.record(z.string(), z.any()),
  moduleDependencies: z.array(z.string()).optional(),
});

/**
 * Schema for a configuration module
 */
export const configModuleSchema = z.object({
  _meta: configModuleMetadataSchema,
  config: z.record(z.string(), z.any()),
});

/**
 * Schema for the configuration system metadata
 */
export const configSystemMetadataSchema = z.object({
  version: z.string(),
  lastUpdated: z.string(),
  activeModules: z.array(z.string()),
});

/**
 * Schema for the overall configuration system
 */
export const configurationSystemSchema = z.object({
  _meta: configSystemMetadataSchema,
  modules: z.record(z.string(), configModuleSchema),
});

/**
 * Schema for configuration version metadata
 */
export const configVersionMetadataSchema = z.object({
  id: z.string(),
  timestamp: z.string(),
  author: z.string(),
  comment: z.string(),
  hash: z.string(),
  parent: z.string().optional(),
  modules: z.array(z.string()),
  changes: z.array(z.string()),
  tags: z.array(z.string()).optional(),
});

// Export types derived from schemas
export type ImageResizerConfig = z.infer<typeof imageResizerConfigSchema>;
export type ConfigurationSystem = z.infer<typeof configurationSystemSchema>;
export type ConfigVersionMetadata = z.infer<typeof configVersionMetadataSchema>;
export type ConfigModule = z.infer<typeof configModuleSchema>;
export type ConfigModuleMetadata = z.infer<typeof configModuleMetadataSchema>;