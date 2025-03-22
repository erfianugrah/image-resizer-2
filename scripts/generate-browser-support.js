/**
 * Build script to generate static browser support data from caniuse-db
 * 
 * This script extracts WebP and AVIF browser support data from caniuse-db
 * and generates a static TypeScript file with this data.
 * 
 * Run with: node scripts/generate-browser-support.js
 */

const fs = require('fs');
const path = require('path');
const caniuseDB = require('caniuse-db/data.json');

// List of browsers we care about (matching the ones used in detectFormatSupportFromBrowser)
const browserTargets = [
  'chrome',
  'firefox',
  'safari',
  'edge',
  'opera',
  'samsung',
  'ios_saf',
  'and_chr',
  'and_ff'
];

// Special case for edge_chromium since it's not a standard identifier in caniuse
// We'll map edge versions 79+ to edge_chromium
const edgeChromiumMinVersion = 79;

// Features we care about
const featureTargets = [
  'webp',    // WebP image format
  'avif'     // AVIF image format
];

// Gather all browser support data
const supportData = {};
featureTargets.forEach(feature => {
  supportData[feature] = {};
  
  try {
    // Get feature data from caniuse-db
    const featureData = caniuseDB.data[feature];
    if (!featureData) {
      console.error(`No data found for feature: ${feature}`);
      return;
    }
    
    const browserStats = featureData.stats;
    
    // Process each browser's support data
    for (const [browserName, versions] of Object.entries(browserStats)) {
      // Skip browsers we don't care about
      if (!browserTargets.includes(browserName) && browserName !== 'edge') {
        continue;
      }
      
      // For each version, find the first one with support
      const supportedVersions = [];
      for (const [version, support] of Object.entries(versions)) {
        // y = yes, a = partial support with prefix
        if (support.startsWith('y') || support.startsWith('a')) {
          supportedVersions.push(parseFloat(version));
        }
      }
      
      if (supportedVersions.length > 0) {
        // Sort versions numerically and get the first (earliest) one
        supportedVersions.sort((a, b) => a - b);
        const firstSupportedVersion = supportedVersions[0];
        
        // Handle Edge/Edge Chromium split
        if (browserName === 'edge') {
          if (firstSupportedVersion >= edgeChromiumMinVersion) {
            // This is Edge Chromium (79+)
            supportData[feature]['edge_chromium'] = firstSupportedVersion;
            
            // For WebP, Edge Chromium has support from the beginning (v79)
            if (feature === 'webp') {
              supportData[feature]['edge_chromium'] = edgeChromiumMinVersion;
            }
          } else {
            // This is legacy Edge
            supportData[feature]['edge'] = firstSupportedVersion;
          }
        } else {
          supportData[feature][browserName] = firstSupportedVersion;
        }
      }
    }
    
    // Add release date comments - we'll maintain these manually for better readability
    const releaseNotes = {
      webp: {
        chrome: 'Jan 2014',
        firefox: 'Jan 2019',
        safari: 'Sep 2020',
        edge: 'Nov 2018',
        edge_chromium: 'Jan 2020',
        opera: 'Jan 2014', 
        samsung: 'Apr 2016',
        ios_saf: 'Sep 2020',
        and_chr: 'Jan 2014',
        and_ff: 'Jan 2019'
      },
      avif: {
        chrome: 'Aug 2020',
        firefox: 'Oct 2021',
        safari: 'Mar 2023',
        edge: 'Apr 2021',
        edge_chromium: 'Apr 2021',
        opera: 'Aug 2020',
        samsung: 'Aug 2021', 
        ios_saf: 'Mar 2023',
        and_chr: 'Jul 2021',
        and_ff: 'Oct 2021'
      }
    };
    
    // Add release notes to the data
    for (const browser in supportData[feature]) {
      const date = releaseNotes[feature][browser];
      if (date) {
        supportData[feature][`${browser}_note`] = date;
      }
    }
    
  } catch (error) {
    console.error(`Error getting support data for ${feature}:`, error);
  }
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
 * This file is auto-generated from caniuse-db data. Do not edit directly.
 * To update, run: node scripts/generate-browser-support.js
 * 
 * Generated on: ${new Date().toISOString()}
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
console.log(`Support data extracted from caniuse-db version: ${caniuseDB.version}`);
console.log(`Update date: ${caniuseDB.updated}`);