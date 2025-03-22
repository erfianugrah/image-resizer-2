/**
 * Static browser format support detection
 * 
 * This file is auto-generated from browser support data. Do not edit directly.
 * To update, run: node scripts/generate-browser-support.js
 * 
 * Generated on: 2025-03-22T14:45:30.574Z
 * Using @mdn/browser-compat-data version: 5.7.5
 * 
 * Note: WebP and AVIF support data is maintained manually in the script
 * since browser-compat-data doesn't have direct paths for image format support.
 */

/**
 * Browser format support data
 * Key is format name, value is an object mapping browser names to minimum supported versions
 */
export const formatSupport: Record<string, Record<string, number>> = {
  // First version with support for WEBP format
  webp: {
    and_chr:         133, // Jan 2014
    and_ff:          135, // Jan 2019
    chrome:          9, // Jan 2014
    edge:            18, // Nov 2018
    edge_chromium:   79, // Jan 2020
    firefox:         65, // Jan 2019
    ios_saf:         14, // Sep 2020
    opera:           11.1, // Jan 2014
    safari:          14, // Sep 2020
    samsung:         4, // Apr 2016
  },

  // First version with support for AVIF format
  avif: {
    and_chr:         133, // Jul 2021
    and_ff:          135, // Oct 2021
    chrome:          85, // Aug 2020
    edge_chromium:   121, // Apr 2021
    firefox:         93, // Oct 2021
    ios_saf:         16, // Mar 2023
    opera:           71, // Aug 2020
    safari:          16.1, // Mar 2023
    samsung:         14, // Aug 2021
  },
};

/**
 * Normalize browser names to match our dictionary keys
 * 
 * @param browser Browser name to normalize
 * @returns Normalized browser name
 */
export function normalizeBrowserName(browser: string): string {
  // Map from various formats to our dictionary keys
  const browserMap: Record<string, string> = {
    'chrome': 'chrome',
    'firefox': 'firefox',
    'safari': 'safari',
    'edge': 'edge',
    'edge_chromium': 'edge_chromium',
    'ie': 'ie',
    'opera': 'opera',
    'samsung': 'samsung',
    'ios_saf': 'ios_saf',
    'and_chr': 'and_chr',
    'and_ff': 'and_ff',
    // Add any other mappings needed
  };
  
  return browserMap[browser.toLowerCase()] || browser.toLowerCase();
}

/**
 * Determine if a browser supports a specific image format
 * 
 * @param format The format to check support for ('webp' or 'avif')
 * @param browser The browser name
 * @param version The browser version
 * @returns true if the browser supports the format, false otherwise
 */
export function isFormatSupported(format: 'webp' | 'avif', browser: string, version: string): boolean {
  // Normalize browser name to match our dictionary keys
  const normalizedBrowser = normalizeBrowserName(browser);
  
  // Parse version number
  const versionNumber = parseFloat(version);
  if (isNaN(versionNumber)) {
    return false;
  }
  
  // Check support
  const supportData = formatSupport[format];
  if (!supportData || !supportData[normalizedBrowser]) {
    return false;
  }
  
  // Browser supports the format if its version is >= the minimum required version
  return versionNumber >= supportData[normalizedBrowser];
}
