# Configuration Reference

This document provides a comprehensive reference for all configuration options available in the Image Resizer.

## Configuration Structure

The Image Resizer configuration is organized into the following main sections:

```typescript
interface ImageResizerConfig {
  // Core configuration
  environment: 'development' | 'staging' | 'production';
  version: string;
  
  // Feature flags
  features?: {
    enableAkamaiCompatibility?: boolean;
    enableAkamaiAdvancedFeatures?: boolean;
  };
  
  // Client Detector configuration
  detector?: DetectorConfig;
  
  // Debug settings
  debug: { /* ... */ };
  
  // Logging settings
  logging?: { /* ... */ };
  
  // Cache settings
  cache: { /* ... */ };
  
  // Responsive settings
  responsive: { /* ... */ };
  
  // Storage settings
  storage: { /* ... */ };
  
  // Template derivatives
  derivatives: { /* ... */ };
  
  // Path template mapping
  pathTemplates?: { /* ... */ };
  
  // Path transformations
  pathTransforms?: { /* ... */ };
}
```

## Core Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `environment` | `'development' \| 'staging' \| 'production'` | `'development'` | Current environment |
| `version` | `string` | `'1.0.0'` | Version of the image resizer |
| `features.enableAkamaiCompatibility` | `boolean` | `false` | Enable Akamai Image Manager parameter support |
| `features.enableAkamaiAdvancedFeatures` | `boolean` | `false` | Enable advanced Akamai features |

## Detector Configuration

The detector configuration controls client detection and optimization settings:

```typescript
interface DetectorConfig {
  cache: {
    maxSize: number;       // Maximum cache entries
    pruneAmount: number;   // How many to prune when limit reached
    enableCache: boolean;  // Allow disabling cache entirely
    ttl?: number;          // Optional TTL in milliseconds
  };
  strategies: { /* ... */ };
  performanceBudget: { /* ... */ };
  cascade?: { /* ... */ };
  deviceClassification: { /* ... */ };
  hashAlgorithm: 'simple' | 'fnv1a' | 'md5';
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}
```

### Detector Cache Settings

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `detector.cache.maxSize` | `number` | `1000` | Maximum number of cache entries |
| `detector.cache.pruneAmount` | `number` | `100` | Number of entries to remove when cache is full |
| `detector.cache.enableCache` | `boolean` | `true` | Whether to enable caching |
| `detector.cache.ttl` | `number` | `3600000` | Time-to-live in milliseconds (1 hour) |

### Detector Strategies

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `detector.strategies.clientHints.priority` | `number` | `100` | Priority for client hints detection |
| `detector.strategies.clientHints.enabled` | `boolean` | `true` | Enable client hints detection |
| `detector.strategies.acceptHeader.priority` | `number` | `80` | Priority for Accept header detection |
| `detector.strategies.acceptHeader.enabled` | `boolean` | `true` | Enable Accept header detection |
| `detector.strategies.userAgent.priority` | `number` | `60` | Priority for User-Agent detection |
| `detector.strategies.userAgent.enabled` | `boolean` | `true` | Enable User-Agent detection |
| `detector.strategies.userAgent.maxUALength` | `number` | `100` | Maximum User-Agent length to process |
| `detector.strategies.staticData.priority` | `number` | `20` | Priority for static data detection |
| `detector.strategies.staticData.enabled` | `boolean` | `true` | Enable static data detection |
| `detector.strategies.defaults.priority` | `number` | `0` | Priority for default values |
| `detector.strategies.defaults.enabled` | `boolean` | `true` | Enable default values |

### Detector Cascade Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `detector.cascade.format.enabled` | `boolean` | `true` | Enable format cascade |
| `detector.cascade.format.acceptHeaderPriority` | `number` | `100` | Priority for Accept header detection |
| `detector.cascade.format.clientHintsPriority` | `number` | `80` | Priority for client hints detection |
| `detector.cascade.format.browserDetectionPriority` | `number` | `60` | Priority for browser detection |
| `detector.cascade.format.fallbackFormat` | `string` | `'jpeg'` | Default format when no detection works |
| `detector.cascade.quality.enabled` | `boolean` | `true` | Enable quality cascade |
| `detector.cascade.quality.saveDataPriority` | `number` | `100` | Priority for Save-Data header |
| `detector.cascade.quality.networkConditionPriority` | `number` | `80` | Priority for network conditions |
| `detector.cascade.quality.deviceCapabilityPriority` | `number` | `60` | Priority for device capabilities |
| `detector.cascade.quality.dprAdjustmentEnabled` | `boolean` | `true` | Enable DPR-based quality adjustment |
| `detector.cascade.quality.deviceMemoryThresholds.high` | `number` | `8` | Memory threshold for high quality (GB) |
| `detector.cascade.quality.deviceMemoryThresholds.low` | `number` | `2` | Memory threshold for low quality (GB) |
| `detector.cascade.quality.processorThresholds.high` | `number` | `8` | CPU cores threshold for high quality |
| `detector.cascade.quality.processorThresholds.low` | `number` | `2` | CPU cores threshold for low quality |
| `detector.cascade.quality.adjustmentFactors.slowNetwork` | `number` | `0.85` | Quality adjustment for slow networks |
| `detector.cascade.quality.adjustmentFactors.fastNetwork` | `number` | `1.1` | Quality adjustment for fast networks |
| `detector.cascade.quality.adjustmentFactors.dprAdjustment` | `number` | `5` | Quality adjustment per DPR point above 1 |

## Cache Configuration

The cache configuration controls caching behavior:

```typescript
interface CacheConfig {
  method: 'cf' | 'cache-api' | 'none';
  ttl: {
    ok: number;           // TTL for successful responses (seconds)
    clientError: number;  // TTL for client error responses (seconds)
    serverError: number;  // TTL for server error responses (seconds)
    remoteFetch?: number; // TTL for remote fetch requests (seconds)
    r2Headers?: number;   // TTL for R2 headers (seconds)
  };
  cacheEverything?: boolean; // Whether to cache all content types
  useTtlByStatus?: boolean;  // Use status-based TTLs
  statusRanges?: { /* ... */ };
  cacheTtlByStatus?: { /* ... */ };
  cacheability: boolean;
  bypassParams?: string[];   // Query parameters that bypass cache
  cacheTags?: { /* ... */ };
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `cache.method` | `'cf' \| 'cache-api' \| 'none'` | `'cf'` | Caching method to use |
| `cache.ttl.ok` | `number` | `86400` | TTL for 2xx responses (seconds) |
| `cache.ttl.clientError` | `number` | `60` | TTL for 4xx responses (seconds) |
| `cache.ttl.serverError` | `number` | `10` | TTL for 5xx responses (seconds) |
| `cache.ttl.remoteFetch` | `number` | `3600` | TTL for remote fetches (seconds) |
| `cache.ttl.r2Headers` | `number` | `86400` | TTL for R2 headers (seconds) |
| `cache.cacheEverything` | `boolean` | `true` | Cache all content types |
| `cache.useTtlByStatus` | `boolean` | `false` | Use status-based TTLs |
| `cache.cacheability` | `boolean` | `true` | Set public/private cacheability |
| `cache.bypassParams` | `string[]` | `['nocache']` | Parameters that bypass cache |

## Responsive Configuration

The responsive configuration controls responsive behavior:

```typescript
interface ResponsiveConfig {
  breakpoints: number[];
  deviceWidths: Record<string, number>;
  quality: number;
  fit: 'scale-down' | 'contain' | 'cover' | 'crop' | 'pad';
  format: string;
  metadata: 'keep' | 'copyright' | 'none';
  formatQuality?: Record<string, number>;
  deviceDetection?: { /* ... */ };
}
```

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `responsive.breakpoints` | `number[]` | `[320, 640, 768, 1024, 1440, 1920, 2048]` | Responsive breakpoints |
| `responsive.deviceWidths.mobile` | `number` | `480` | Default mobile device width |
| `responsive.deviceWidths.tablet` | `number` | `768` | Default tablet device width |
| `responsive.deviceWidths.desktop` | `number` | `1440` | Default desktop device width |
| `responsive.quality` | `number` | `85` | Default quality setting |
| `responsive.fit` | `string` | `'scale-down'` | Default fit mode |
| `responsive.format` | `string` | `'auto'` | Default format |
| `responsive.metadata` | `string` | `'none'` | Metadata handling |
| `responsive.formatQuality.webp` | `number` | `85` | WebP quality |
| `responsive.formatQuality.avif` | `number` | `80` | AVIF quality |
| `responsive.formatQuality.jpeg` | `number` | `85` | JPEG quality |
| `responsive.formatQuality.png` | `number` | `90` | PNG quality |

## Environment Variables

The configuration can be set through environment variables in wrangler.jsonc:

```jsonc
{
  "vars": {
    "ENVIRONMENT": "development",
    "DEBUG": "true",
    "REMOTE_URL": "https://example.com/images",
    "FALLBACK_URL": "https://placehold.co",
    "STORAGE_PRIORITY": "r2,remote,fallback",
    "ENABLE_AKAMAI_COMPATIBILITY": "true",
    "LOGGING_LEVEL": "DEBUG",
    "LOGGING_STRUCTURED": "true",
    "LOGGING_TIMESTAMP": "true",
    "LOGGING_BREADCRUMBS_ENABLED": "true",
    
    /* Detector Configuration */
    "DETECTOR_CACHE_MAX_SIZE": "5000",
    "DETECTOR_CACHE_PRUNE_AMOUNT": "500",
    "DETECTOR_CACHE_ENABLE": "true",
    "DETECTOR_CACHE_TTL": "3600000",
    
    /* Cascade Configuration */
    "DETECTOR_CASCADE_FORMAT_ENABLED": "true",
    "DETECTOR_CASCADE_FORMAT_ACCEPT_PRIORITY": "100",
    "DETECTOR_CASCADE_FORMAT_CLIENT_HINTS_PRIORITY": "80",
    "DETECTOR_CASCADE_FORMAT_BROWSER_PRIORITY": "60",
    "DETECTOR_CASCADE_FORMAT_FALLBACK": "jpeg",
    "DETECTOR_CASCADE_QUALITY_ENABLED": "true",
    "DETECTOR_CASCADE_QUALITY_SAVEDATA_PRIORITY": "100",
    "DETECTOR_CASCADE_QUALITY_NETWORK_PRIORITY": "80",
    "DETECTOR_CASCADE_QUALITY_DEVICE_PRIORITY": "60",
    "DETECTOR_CASCADE_QUALITY_DPR_ADJUSTMENT": "true",
    "DETECTOR_CASCADE_QUALITY_MEMORY_HIGH": "8",
    "DETECTOR_CASCADE_QUALITY_MEMORY_LOW": "2",
    "DETECTOR_CASCADE_QUALITY_PROCESSORS_HIGH": "8",
    "DETECTOR_CASCADE_QUALITY_PROCESSORS_LOW": "2",
    "DETECTOR_CASCADE_QUALITY_SLOW_NETWORK_FACTOR": "0.85",
    "DETECTOR_CASCADE_QUALITY_FAST_NETWORK_FACTOR": "1.1",
    "DETECTOR_CASCADE_QUALITY_DPR_FACTOR": "5",
    
    /* Cache Configuration */
    "CACHE_TTL_OK": "86400",
    "CACHE_TTL_CLIENT_ERROR": "60",
    "CACHE_TTL_SERVER_ERROR": "10",
    "CACHE_METHOD": "cf",
    "CACHE_EVERYTHING": "true",
    "CACHE_USE_TTL_BY_STATUS": "false",
    
    /* Format Quality Settings */
    "FORMAT_QUALITY_WEBP": "85",
    "FORMAT_QUALITY_AVIF": "80",
    "FORMAT_QUALITY_JPEG": "85",
    "FORMAT_QUALITY_PNG": "90",
    "DEFAULT_QUALITY": "85",
    "DEFAULT_FIT": "scale-down"
  }
}
```

For more details on specific configuration sections, refer to the relevant documentation pages.