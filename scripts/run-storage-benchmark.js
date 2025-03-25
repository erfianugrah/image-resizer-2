#!/usr/bin/env node

/**
 * Storage Performance Benchmark Runner
 * 
 * This script runs storage performance benchmarks specifically and generates a report.
 * It can be used to compare sequential vs. parallel storage operations.
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Configuration
const REPORT_DIR = path.join(__dirname, '../reports');
const DEFAULT_ITERATIONS = 5;
const DEFAULT_WARMUP = 2;

// Ensure reports directory exists
if (!fs.existsSync(REPORT_DIR)) {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
}

// Parse command line arguments
const args = process.argv.slice(2);
const iterations = args.includes('--iterations') 
  ? parseInt(args[args.indexOf('--iterations') + 1], 10) 
  : DEFAULT_ITERATIONS;
const warmup = args.includes('--warmup') 
  ? parseInt(args[args.indexOf('--warmup') + 1], 10) 
  : DEFAULT_WARMUP;
const saveReport = !args.includes('--no-report');
const verbose = args.includes('--verbose');

// Set environment variables for the benchmark
process.env.BENCHMARK_ITERATIONS = iterations.toString();
process.env.BENCHMARK_WARMUP = warmup.toString();

// Create timestamped report filename
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const reportFile = path.join(REPORT_DIR, `storage-benchmark-report-${timestamp}.json`);

console.log('🚀 Starting storage performance benchmark');
console.log(`📊 Iterations: ${iterations}, Warmup: ${warmup}`);

// Run the benchmark using vitest
const result = spawnSync('npx', ['vitest', 'run', 'test/performance/storage-benchmark.ts', '--reporter', 'json'], {
  stdio: verbose ? 'inherit' : 'pipe',
  encoding: 'utf-8'
});

if (result.status !== 0) {
  console.error('❌ Benchmark failed to run');
  console.error(result.stderr || result.stdout);
  process.exit(1);
}

// Parse the test results
let testResults;
try {
  if (!verbose) {
    testResults = JSON.parse(result.stdout);
  } else {
    // If verbose, we need to read the vitest result file
    testResults = JSON.parse(fs.readFileSync(path.join(__dirname, '../vitest.results.json'), 'utf-8'));
  }
} catch (error) {
  console.error('❌ Failed to parse test results');
  console.error(error);
  process.exit(1);
}

// Process and save results to a format we can use in reports
if (saveReport && testResults) {
  const benchmarkResults = {
    timestamp: new Date().toISOString(),
    iterations,
    warmup,
    results: {}
  };
  
  // Extract results from testResults
  // This depends on the structure of Vitest's JSON output
  if (testResults.testResults) {
    testResults.testResults.forEach(testFile => {
      if (testFile.assertionResults) {
        testFile.assertionResults.forEach(assertion => {
          // Only include successful benchmarks
          if (assertion.status === 'passed' && assertion.title.includes('benchmark')) {
            const benchmarkName = assertion.title.replace('should benchmark ', '');
            
            // Extract timing data from console output (since Vitest doesn't expose the custom data directly)
            const consoleOutput = assertion.console || [];
            const timingData = {};
            
            consoleOutput.forEach(log => {
              if (log.message && log.message.includes('Average time:')) {
                timingData.average = parseFloat(log.message.match(/Average time: ([\d.]+)ms/)[1]);
              } else if (log.message && log.message.includes('Min time:')) {
                timingData.min = parseFloat(log.message.match(/Min time: ([\d.]+)ms/)[1]);
              } else if (log.message && log.message.includes('Max time:')) {
                timingData.max = parseFloat(log.message.match(/Max time: ([\d.]+)ms/)[1]);
              } else if (log.message && log.message.includes('Performance improvement')) {
                timingData.improvement = parseFloat(log.message.match(/Performance improvement observed: ([\d.-]+)%/)[1]);
              }
            });
            
            benchmarkResults.results[benchmarkName] = {
              name: benchmarkName,
              timings: timingData,
              duration: assertion.duration
            };
          }
        });
      }
    });
  }
  
  // Save the report
  fs.writeFileSync(reportFile, JSON.stringify(benchmarkResults, null, 2));
  console.log(`✅ Storage benchmark report saved to ${reportFile}`);
  
  // Generate HTML report
  console.log('📊 Generating HTML report...');
  const htmlResult = spawnSync('node', ['scripts/generate-perf-report.js', '--output', reportFile.replace('.json', '.html'), reportFile], {
    stdio: verbose ? 'inherit' : 'pipe',
    encoding: 'utf-8'
  });
  
  if (htmlResult.status === 0) {
    console.log(`✅ HTML report generated: ${reportFile.replace('.json', '.html')}`);
  } else {
    console.error('❌ Failed to generate HTML report');
  }
}

console.log('✨ Storage benchmark completed');