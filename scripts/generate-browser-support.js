/**
 * Build script to generate static browser support data from @mdn/browser-compat-data
 * 
 * This script extracts WebP and AVIF browser support data from MDN's browser compatibility database
 * and generates a static TypeScript file with this data.
 * 
 * Run with: node scripts/generate-browser-support.js
 */

const fs = require('fs');
const path = require('path');
const bcd = require('@mdn/browser-compat-data');

// List of browsers we care about with mapping to our normalized names
const browserMapping = {
  'chrome': 'chrome',
  'firefox': 'firefox',
  'safari': 'safari',
  'edge': 'edge',
  'opera': 'opera',
  'samsung': 'samsung',
  'safari_ios': 'ios_saf',
  'chrome_android': 'and_chr',
  'firefox_android': 'and_ff'
};

// Special case for edge_chromium
const edgeChromiumMinVersion = 79;

// Manual support data for WebP and AVIF - since @mdn/browser-compat-data doesn't have
// direct paths for image format support, we need to maintain this manually
const manualSupportData = {
  webp: {
    chrome: { version_added: "9", release_date: "Jan 2014" },
    firefox: { version_added: "65", release_date: "Jan 2019" },
    safari: { version_added: "14", release_date: "Sep 2020" },
    edge: { version_added: "18", release_date: "Nov 2018" },
    edge_chromium: { version_added: "79", release_date: "Jan 2020" },
    opera: { version_added: "11.1", release_date: "Jan 2014" },
    samsung: { version_added: "4", release_date: "Apr 2016" },
    ios_saf: { version_added: "14", release_date: "Sep 2020" },
    and_chr: { version_added: "133", release_date: "Jan 2014" },
    and_ff: { version_added: "135", release_date: "Jan 2019" }
  },
  avif: {
    chrome: { version_added: "85", release_date: "Aug 2020" },
    firefox: { version_added: "93", release_date: "Oct 2021" },
    safari: { version_added: "16.1", release_date: "Mar 2023" },
    edge: { version_added: null, release_date: "Apr 2021" },
    edge_chromium: { version_added: "121", release_date: "Apr 2021" },
    opera: { version_added: "71", release_date: "Aug 2020" },
    samsung: { version_added: "14", release_date: "Aug 2021" },
    ios_saf: { version_added: "16", release_date: "Mar 2023" },
    and_chr: { version_added: "133", release_date: "Jul 2021" },
    and_ff: { version_added: "135", release_date: "Oct 2021" }
  }
};

// Process the browser data
const supportData = {};
Object.entries(manualSupportData).forEach(([format, browsers]) => {
  supportData[format] = {};
  
  // Process each browser's support data
  Object.entries(browsers).forEach(([browser, data]) => {
    if (data.version_added) {
      const version = parseFloat(data.version_added);
      if (!isNaN(version)) {
        supportData[format][browser] = version;
        
        // Add release date note if available
        if (data.release_date) {
          supportData[format][`${browser}_note`] = data.release_date;
        }
      }
    }
  });
});

// Format the support data as a string with comments
function formatSupportData(data) {
  let result = '{\n';
  
  for (const [feature, browsers] of Object.entries(data)) {
    result += `  // First version with support for ${feature.toUpperCase()} format\n`;
    result += `  ${feature}: {\n`;
    
    // Get regular browser entries (without _note suffix)
    const browserEntries = Object.entries(browsers)
      .filter(([key]) => !key.endsWith('_note'))
      .sort((a, b) => a[0].localeCompare(b[0])); // Sort alphabetically
    
    for (const [browser, version] of browserEntries) {
      const note = browsers[`${browser}_note`] || '';
      const padding = ' '.repeat(Math.max(0, 16 - browser.length));
      result += `    ${browser}:${padding}${version}, ${note ? `// ${note}` : ''}\n`;
    }
    
    result += '  },\n\n';
  }
  
  result = result.slice(0, -2); // Remove last comma and newline
  result += '\n}';
  
  return result;
}

// Calculate dictionary size
const dictSize = Object.values(supportData)
  .reduce((count, feature) => {
    // Count only actual browser entries, not note entries
    const browserCount = Object.keys(feature)
      .filter(key => !key.endsWith('_note')).length;
    return count + browserCount;
  }, 0);

// Generate TypeScript file
const outputFile = path.join(__dirname, '..', 'src', 'utils', 'browser-formats.ts');

const tsContent = `/**
 * Static browser format support detection
 * 
 * This file is auto-generated from browser support data. Do not edit directly.
 * To update, run: node scripts/generate-browser-support.js
 * 
 * Generated on: ${new Date().toISOString()}
 * Using @mdn/browser-compat-data version: ${bcd.__meta?.version || 'unknown'}
 * 
 * Note: WebP and AVIF support data is maintained manually in the script
 * since browser-compat-data doesn't have direct paths for image format support.
 */

/**
 * Browser format support data
 * Key is format name, value is an object mapping browser names to minimum supported versions
 */
export const formatSupport: Record<string, Record<string, number>> = ${formatSupportData(supportData)};

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
`;

fs.writeFileSync(outputFile, tsContent);
console.log(`Generated browser support data in ${outputFile}`);

// Print summary
console.log('\nBrowser support summary:');
Object.entries(supportData).forEach(([feature, browsers]) => {
  console.log(`\n${feature.toUpperCase()} support:`);
  
  // Get regular browser entries (without _note suffix)
  const browserEntries = Object.entries(browsers)
    .filter(([key]) => !key.endsWith('_note'))
    .sort((a, b) => a[0].localeCompare(b[0])); // Sort alphabetically
  
  for (const [browser, version] of browserEntries) {
    const note = browsers[`${browser}_note`] || '';
    console.log(`  ${browser}: ${version}+ ${note ? `(${note})` : ''}`);
  }
});

console.log(`\nTotal entries in dictionary: ${dictSize}`);
console.log(`Using @mdn/browser-compat-data version: ${bcd.__meta?.version || 'unknown'}`);
console.log(`Update date: ${new Date().toISOString()}`);