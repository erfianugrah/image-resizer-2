#!/usr/bin/env node

/**
 * Performance Phase Comparison Script
 * 
 * This script compares performance between different optimization phases
 * by controlling which optimizations are enabled in the config.
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Configuration
const REPORT_DIR = path.join(__dirname, '../reports/phases');
const CONFIG_FILE = path.join(__dirname, '../src/config.ts');

// Ensure reports directory exists
if (!fs.existsSync(REPORT_DIR)) {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
}

// Parse command line arguments
const args = process.argv.slice(2);
const iterations = args.includes('--iterations') 
  ? parseInt(args[args.indexOf('--iterations') + 1], 10) 
  : 3;
const warmup = args.includes('--warmup') 
  ? parseInt(args[args.indexOf('--warmup') + 1], 10) 
  : 1;
const verbose = args.includes('--verbose');
const skipRestore = args.includes('--skip-restore');

// Create timestamp for reports
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

// Save the original config file
let originalConfig = '';
try {
  originalConfig = fs.readFileSync(CONFIG_FILE, 'utf-8');
} catch (error) {
  console.error('❌ Failed to read config file');
  console.error(error);
  process.exit(1);
}

// Define the optimization phases
const phases = [
  {
    name: 'baseline',
    description: 'No optimizations',
    settings: {
      optimizedLogging: false,
      optimizedResponseHandling: false,
      lazyServiceInitialization: false,
      optimizedClientDetection: false,
      parallelStorage: false,
      optimizedCaching: false
    }
  },
  {
    name: 'phase1',
    description: 'Phase 1: Non-Invasive Optimizations',
    settings: {
      optimizedLogging: true,
      optimizedResponseHandling: true,
      lazyServiceInitialization: false,
      optimizedClientDetection: false,
      parallelStorage: false,
      optimizedCaching: false
    }
  },
  {
    name: 'phase2',
    description: 'Phase 2: Architecture Optimizations',
    settings: {
      optimizedLogging: true,
      optimizedResponseHandling: true,
      lazyServiceInitialization: true,
      optimizedClientDetection: true,
      parallelStorage: false,
      optimizedCaching: false
    }
  },
  {
    name: 'phase3',
    description: 'Phase 3: Major Performance Enhancements',
    settings: {
      optimizedLogging: true,
      optimizedResponseHandling: true,
      lazyServiceInitialization: true,
      optimizedClientDetection: true,
      parallelStorage: true,
      optimizedCaching: true
    }
  }
];

// Function to update the config file for a specific phase
function updateConfig(phase) {
  const settings = phase.settings;
  let configContent = originalConfig;
  
  // Update the performance settings in the config file
  configContent = configContent.replace(
    /performance:\s*{[^}]*}/gs,
    `performance: {
    optimizedLogging: ${settings.optimizedLogging},
    optimizedResponseHandling: ${settings.optimizedResponseHandling},
    lazyServiceInitialization: ${settings.lazyServiceInitialization},
    optimizedClientDetection: ${settings.optimizedClientDetection},
    parallelStorage: ${settings.parallelStorage},
    optimizedCaching: ${settings.optimizedCaching}
  }`
  );
  
  fs.writeFileSync(CONFIG_FILE, configContent);
  console.log(`✅ Updated config for ${phase.name}: ${phase.description}`);
}

// Function to restore the original config
function restoreConfig() {
  fs.writeFileSync(CONFIG_FILE, originalConfig);
  console.log('✅ Restored original config');
}

// Create cleanup handler
process.on('SIGINT', () => {
  console.log('\n🛑 Process interrupted, restoring config...');
  restoreConfig();
  process.exit(1);
});

// Test each phase
const reportFiles = [];

try {
  for (const phase of phases) {
    console.log(`\n🔍 Testing ${phase.name}: ${phase.description}`);
    
    // Update config for this phase
    updateConfig(phase);
    
    // Create report file for this phase
    const reportFile = path.join(REPORT_DIR, `${phase.name}-${timestamp}.json`);
    reportFiles.push(reportFile);
    
    // Run benchmark with updated config
    console.log(`📊 Running benchmarks for ${phase.name}...`);
    
    // Build the project first to apply config changes
    console.log('🔨 Building project...');
    const buildResult = spawnSync('npm', ['run', 'build'], {
      stdio: verbose ? 'inherit' : 'pipe',
      encoding: 'utf-8'
    });
    
    if (buildResult.status !== 0) {
      console.error(`❌ Build failed for ${phase.name}`);
      if (!verbose) {
        console.error(buildResult.stderr || buildResult.stdout);
      }
      continue;
    }
    
    // Run the benchmark
    const benchmarkResult = spawnSync('node', ['scripts/run-benchmarks.js', 
      '--iterations', iterations.toString(), 
      '--warmup', warmup.toString(),
      '--output', reportFile,
      ...(verbose ? ['--verbose'] : [])
    ], {
      stdio: verbose ? 'inherit' : 'pipe',
      encoding: 'utf-8'
    });
    
    if (benchmarkResult.status !== 0) {
      console.error(`❌ Benchmark failed for ${phase.name}`);
      if (!verbose) {
        console.error(benchmarkResult.stderr || benchmarkResult.stdout);
      }
    } else {
      console.log(`✅ Benchmark completed for ${phase.name}`);
      console.log(`📄 Report saved to ${reportFile}`);
    }
  }
  
  // Generate comparison report
  if (reportFiles.length > 1) {
    console.log('\n📊 Generating phase comparison report...');
    
    const comparisonFile = path.join(REPORT_DIR, `phase-comparison-${timestamp}.html`);
    
    const reportResult = spawnSync('node', [
      'scripts/generate-perf-report.js',
      '--output', comparisonFile,
      ...reportFiles
    ], {
      stdio: verbose ? 'inherit' : 'pipe',
      encoding: 'utf-8'
    });
    
    if (reportResult.status === 0) {
      console.log(`✅ Comparison report generated: ${comparisonFile}`);
    } else {
      console.error('❌ Failed to generate comparison report');
      if (!verbose) {
        console.error(reportResult.stderr || reportResult.stdout);
      }
    }
  }
  
} finally {
  // Restore the original config
  if (!skipRestore) {
    restoreConfig();
  } else {
    console.log('⚠️ Skipping config restoration as requested');
  }
}

console.log('\n✨ Phase comparison completed');

// Generate markdown summary
const summaryFile = path.join(REPORT_DIR, `phase-summary-${timestamp}.md`);
let summaryContent = `# Performance Optimization Phases Comparison\n\n`;
summaryContent += `**Date:** ${new Date().toISOString()}\n\n`;

summaryContent += `## Phases Tested\n\n`;
phases.forEach(phase => {
  const settingsStr = Object.entries(phase.settings)
    .map(([key, value]) => `${key}: ${value}`)
    .join(', ');
  
  summaryContent += `### ${phase.name}: ${phase.description}\n`;
  summaryContent += `Settings: ${settingsStr}\n\n`;
});

summaryContent += `## Results Summary\n\n`;
summaryContent += `A detailed HTML comparison report has been generated at: \`${path.join(REPORT_DIR, `phase-comparison-${timestamp}.html`)}\`\n\n`;
summaryContent += `To view specific performance metrics and comparisons between phases, please open the HTML report in a web browser.\n\n`;

summaryContent += `## Implications\n\n`;
summaryContent += `- **Phase 1 (Non-Invasive Optimizations)**: These optimizations focus on reducing logging overhead and optimizing response handling without architectural changes.\n`;
summaryContent += `- **Phase 2 (Architecture Optimizations)**: These introduce lazy service initialization and optimized client detection to reduce cold start time and improve request processing efficiency.\n`;
summaryContent += `- **Phase 3 (Major Performance Enhancements)**: These implement parallel storage operations and tiered caching to significantly reduce response time and improve resource efficiency.\n\n`;

summaryContent += `## Next Steps\n\n`;
summaryContent += `1. Review the detailed performance results in the HTML report\n`;
summaryContent += `2. Analyze which optimizations provided the most significant improvements\n`;
summaryContent += `3. Document the performance characteristics for different workloads\n`;
summaryContent += `4. Consider further optimizations in areas with the highest impact\n`;

fs.writeFileSync(summaryFile, summaryContent);
console.log(`✅ Phase comparison summary written to: ${summaryFile}`);