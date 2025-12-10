/**
 * URL Security Utilities
 *
 * Provides validation and security checks for URLs to prevent SSRF and other attacks.
 */

export interface UrlValidationOptions {
  allowedProtocols?: string[];
  allowedDomains?: string[];
  blockedDomains?: string[];
  allowPrivateNetworks?: boolean;
  allowLoopback?: boolean;
  allowLinkLocal?: boolean;
  allowCloudMetadata?: boolean;
  maxLength?: number;
}

export interface UrlValidationResult {
  isValid: boolean;
  error?: string;
  sanitizedUrl?: string;
}

const DEFAULT_OPTIONS: UrlValidationOptions = {
  allowedProtocols: ['http:', 'https:'],
  allowPrivateNetworks: false,
  allowLoopback: false,
  allowLinkLocal: false,
  allowCloudMetadata: false,
  maxLength: 2048
};

/**
 * Private IP ranges (RFC 1918)
 */
const PRIVATE_IP_RANGES = [
  /^10\./,                          // 10.0.0.0/8
  /^172\.(1[6-9]|2[0-9]|3[01])\./,  // 172.16.0.0/12
  /^192\.168\./,                    // 192.168.0.0/16
  /^127\./,                         // Loopback 127.0.0.0/8
  /^169\.254\./,                    // Link-local 169.254.0.0/16
  /^::1$/,                          // IPv6 loopback
  /^fe80:/,                         // IPv6 link-local
  /^fc00:/,                         // IPv6 unique local
  /^fd00:/                          // IPv6 unique local
];

/**
 * Cloud metadata service endpoints
 */
const CLOUD_METADATA_HOSTS = [
  '169.254.169.254',         // AWS, Azure, GCP
  '169.254.170.2',           // AWS ECS
  'metadata.google.internal', // GCP
  'metadata',                 // Kubernetes
  '100.100.100.200'          // Alibaba Cloud
];

/**
 * Localhost patterns
 */
const LOCALHOST_PATTERNS = [
  'localhost',
  '127.0.0.1',
  '::1',
  '0.0.0.0',
  '::'
];

/**
 * Validates a URL for security concerns
 *
 * @param url The URL to validate
 * @param options Validation options
 * @returns Validation result
 */
export function validateUrl(url: string, options: UrlValidationOptions = {}): UrlValidationResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Check length
  if (opts.maxLength && url.length > opts.maxLength) {
    return {
      isValid: false,
      error: `URL exceeds maximum length of ${opts.maxLength} characters`
    };
  }

  // Parse URL
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch (error) {
    return {
      isValid: false,
      error: 'Invalid URL format'
    };
  }

  // Check protocol
  if (opts.allowedProtocols && !opts.allowedProtocols.includes(parsedUrl.protocol)) {
    return {
      isValid: false,
      error: `Protocol ${parsedUrl.protocol} is not allowed. Allowed protocols: ${opts.allowedProtocols.join(', ')}`
    };
  }

  // Special handling for non-http protocols
  if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
    return {
      isValid: false,
      error: `Potentially dangerous protocol: ${parsedUrl.protocol}`
    };
  }

  // Extract hostname
  const hostname = parsedUrl.hostname.toLowerCase();

  // Check localhost
  if (!opts.allowLoopback && LOCALHOST_PATTERNS.some(pattern => hostname === pattern)) {
    return {
      isValid: false,
      error: 'Loopback addresses are not allowed'
    };
  }

  // Check cloud metadata endpoints
  if (!opts.allowCloudMetadata && CLOUD_METADATA_HOSTS.some(host => hostname === host)) {
    return {
      isValid: false,
      error: 'Cloud metadata endpoints are not allowed'
    };
  }

  // Check private IP ranges
  if (!opts.allowPrivateNetworks) {
    if (PRIVATE_IP_RANGES.some(pattern => pattern.test(hostname))) {
      return {
        isValid: false,
        error: 'Private IP addresses are not allowed'
      };
    }
  }

  // Check blocked domains
  if (opts.blockedDomains && opts.blockedDomains.length > 0) {
    const isBlocked = opts.blockedDomains.some(blocked => {
      return hostname === blocked || hostname.endsWith(`.${blocked}`);
    });

    if (isBlocked) {
      return {
        isValid: false,
        error: `Domain ${hostname} is blocked`
      };
    }
  }

  // Check allowed domains (whitelist)
  if (opts.allowedDomains && opts.allowedDomains.length > 0) {
    const isAllowed = opts.allowedDomains.some(allowed => {
      return hostname === allowed || hostname.endsWith(`.${allowed}`);
    });

    if (!isAllowed) {
      return {
        isValid: false,
        error: `Domain ${hostname} is not in the allowed list`
      };
    }
  }

  // Check for DNS rebinding attempts (IP in hostname)
  if (/^\d+\.\d+\.\d+\.\d+$/.test(hostname)) {
    // It's an IP address - check if it's private
    if (!opts.allowPrivateNetworks) {
      if (PRIVATE_IP_RANGES.some(pattern => pattern.test(hostname))) {
        return {
          isValid: false,
          error: 'Private IP addresses are not allowed'
        };
      }
    }
  }

  // All checks passed
  return {
    isValid: true,
    sanitizedUrl: parsedUrl.toString()
  };
}

/**
 * Validates an overlay/watermark URL with strict security settings
 *
 * @param url The overlay URL to validate
 * @returns Validation result
 */
export function validateOverlayUrl(url: string): UrlValidationResult {
  return validateUrl(url, {
    allowedProtocols: ['http:', 'https:'],
    allowPrivateNetworks: false,
    allowLoopback: false,
    allowLinkLocal: false,
    allowCloudMetadata: false,
    maxLength: 2048
  });
}

/**
 * Checks if a hostname appears to be a private/internal address
 *
 * @param hostname The hostname to check
 * @returns True if the hostname appears to be private/internal
 */
export function isPrivateHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase();

  // Check localhost patterns
  if (LOCALHOST_PATTERNS.some(pattern => lower === pattern)) {
    return true;
  }

  // Check cloud metadata
  if (CLOUD_METADATA_HOSTS.some(host => lower === host)) {
    return true;
  }

  // Check private IP patterns
  if (PRIVATE_IP_RANGES.some(pattern => pattern.test(lower))) {
    return true;
  }

  // Check for internal domain indicators
  const internalIndicators = ['.internal', '.local', '.lan', '.corp'];
  if (internalIndicators.some(indicator => lower.endsWith(indicator))) {
    return true;
  }

  return false;
}
