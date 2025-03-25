#!/usr/bin/env node

/**
 * Performance Report Generator
 * 
 * This script generates HTML visualization from benchmark reports.
 * It can compare multiple benchmark runs to see performance improvements.
 */

const fs = require('fs');
const path = require('path');

// Configuration
const REPORT_DIR = path.join(__dirname, '../reports');
const OUTPUT_DIR = path.join(__dirname, '../reports');

// Parse command line arguments
const args = process.argv.slice(2);
const files = args.filter(arg => !arg.startsWith('--'));
const outputFile = args.includes('--output') 
  ? args[args.indexOf('--output') + 1] 
  : path.join(OUTPUT_DIR, `performance-report-${new Date().toISOString().replace(/[:.]/g, '-')}.html`);

// Check if files are provided
if (files.length === 0) {
  console.error('❌ Please provide at least one benchmark report file');
  console.error('Usage: node generate-perf-report.js [--output report.html] report1.json [report2.json ...]');
  process.exit(1);
}

// Load benchmark reports
const reports = [];
files.forEach(file => {
  try {
    const filePath = path.resolve(file);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    reports.push({
      file: path.basename(filePath),
      data
    });
  } catch (error) {
    console.error(`❌ Failed to parse report file: ${file}`);
    console.error(error);
  }
});

if (reports.length === 0) {
  console.error('❌ No valid reports were loaded');
  process.exit(1);
}

console.log(`📊 Loaded ${reports.length} benchmark reports`);

// Generate HTML report
function generateHtml(reports) {
  const benchmarkNames = new Set();
  
  // Collect all benchmark names
  reports.forEach(report => {
    Object.keys(report.data.results).forEach(name => {
      benchmarkNames.add(name);
    });
  });
  
  const benchmarks = Array.from(benchmarkNames);
  
  // Create the HTML content
  let html = `
  <!DOCTYPE html>
  <html lang="en">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Performance Benchmark Report</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
        line-height: 1.6;
        color: #333;
        max-width: 1200px;
        margin: 0 auto;
        padding: 20px;
      }
      h1, h2, h3 {
        color: #2c3e50;
      }
      .report-header {
        text-align: center;
        margin-bottom: 40px;
      }
      .chart-container {
        margin: 30px 0;
        height: 300px;
      }
      table {
        width: 100%;
        border-collapse: collapse;
        margin: 20px 0;
      }
      th, td {
        border: 1px solid #ddd;
        padding: 8px 12px;
        text-align: left;
      }
      th {
        background-color: #f2f2f2;
      }
      tr:nth-child(even) {
        background-color: #f9f9f9;
      }
      .improvement-positive {
        color: green;
        font-weight: bold;
      }
      .improvement-negative {
        color: red;
        font-weight: bold;
      }
      .improvement-neutral {
        color: gray;
      }
      .summary {
        background-color: #f8f9fa;
        border-left: 4px solid #2c3e50;
        padding: 15px;
        margin: 20px 0;
      }
      .report-meta {
        display: flex;
        flex-wrap: wrap;
        justify-content: space-between;
        margin-bottom: 20px;
      }
      .report-meta-item {
        flex: 1;
        min-width: 200px;
        margin: 10px;
        padding: 15px;
        background-color: #f8f9fa;
        border-radius: 5px;
      }
    </style>
  </head>
  <body>
    <div class="report-header">
      <h1>Performance Benchmark Report</h1>
      <p>Generated on ${new Date().toLocaleString()}</p>
    </div>
    
    <div class="report-meta">
      ${reports.map((report, index) => `
        <div class="report-meta-item">
          <h3>Report ${index + 1}: ${report.file}</h3>
          <p><strong>Date:</strong> ${new Date(report.data.timestamp).toLocaleString()}</p>
          <p><strong>Iterations:</strong> ${report.data.iterations}</p>
          <p><strong>Warmup:</strong> ${report.data.warmup}</p>
        </div>
      `).join('')}
    </div>
    
    <h2>Benchmark Results</h2>
    
    <div class="summary">
      <h3>Summary</h3>
      ${reports.length > 1 ? `
        <p>Comparing ${reports.length} benchmark runs.</p>
        <p>From oldest (${new Date(reports[0].data.timestamp).toLocaleDateString()}) 
           to newest (${new Date(reports[reports.length - 1].data.timestamp).toLocaleDateString()}).</p>
      ` : `
        <p>Single benchmark run from ${new Date(reports[0].data.timestamp).toLocaleDateString()}.</p>
      `}
    </div>
    
    <h2>Comparison Charts</h2>
    
    <div class="chart-container">
      <canvas id="averageTimesChart"></canvas>
    </div>
    
    <div class="chart-container">
      <canvas id="minMaxTimesChart"></canvas>
    </div>
    
    <h2>Detailed Results</h2>
    
    ${benchmarks.map(benchmark => `
      <h3>${benchmark}</h3>
      <div class="chart-container">
        <canvas id="chart-${benchmark.replace(/\s+/g, '-')}"></canvas>
      </div>
      
      <table>
        <thead>
          <tr>
            <th>Report</th>
            <th>Average Time (ms)</th>
            <th>Min Time (ms)</th>
            <th>Max Time (ms)</th>
            ${reports.length > 1 ? '<th>Change from Previous</th>' : ''}
          </tr>
        </thead>
        <tbody>
          ${reports.map((report, index) => {
            const result = report.data.results[benchmark];
            if (!result) return '';
            
            let changeText = '';
            if (index > 0 && reports[index - 1].data.results[benchmark]) {
              const prevAvg = reports[index - 1].data.results[benchmark].timings.average;
              const currentAvg = result.timings.average;
              const changePercent = ((currentAvg - prevAvg) / prevAvg * 100).toFixed(2);
              const changeClass = changePercent < 0 ? 'improvement-positive' : 
                                 changePercent > 0 ? 'improvement-negative' : 
                                 'improvement-neutral';
              
              changeText = `<td class="${changeClass}">${changePercent}%</td>`;
            }
            
            return `
              <tr>
                <td>${report.file}</td>
                <td>${result.timings.average ? result.timings.average.toFixed(2) : 'N/A'}</td>
                <td>${result.timings.min ? result.timings.min.toFixed(2) : 'N/A'}</td>
                <td>${result.timings.max ? result.timings.max.toFixed(2) : 'N/A'}</td>
                ${reports.length > 1 ? changeText : ''}
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `).join('')}
    
    <script>
      // Data preparation for charts
      const reports = ${JSON.stringify(reports.map(r => ({ 
        file: r.file, 
        timestamp: r.data.timestamp
      })))};
      
      const benchmarks = ${JSON.stringify(benchmarks)};
      
      const chartData = {
        averageTimes: {
          labels: reports.map(r => r.file),
          datasets: benchmarks.map((benchmark, index) => ({
            label: benchmark,
            data: ${JSON.stringify(reports.map(report => 
              report.data.results[benchmark]?.timings.average || null
            ))},
            borderColor: getColor(index),
            backgroundColor: getColor(index, 0.2),
            borderWidth: 2,
            fill: false
          }))
        },
        minMaxTimes: {
          labels: reports.map(r => r.file),
          datasets: []
        }
      };
      
      // Add min/max datasets
      benchmarks.forEach((benchmark, index) => {
        // Min times
        chartData.minMaxTimes.datasets.push({
          label: \`\${benchmark} (Min)\`,
          data: ${JSON.stringify(reports.map(report => 
            report.data.results[benchmark]?.timings.min || null
          ))},
          borderColor: getColor(index),
          backgroundColor: getColor(index, 0.1),
          borderWidth: 2,
          borderDash: [5, 5],
          fill: false
        });
        
        // Max times
        chartData.minMaxTimes.datasets.push({
          label: \`\${benchmark} (Max)\`,
          data: ${JSON.stringify(reports.map(report => 
            report.data.results[benchmark]?.timings.max || null
          ))},
          borderColor: getColor(index),
          backgroundColor: getColor(index, 0.1),
          borderWidth: 2,
          borderDash: [2, 2],
          fill: false
        });
      });
      
      // Individual benchmark charts
      const benchmarkCharts = {};
      benchmarks.forEach(benchmark => {
        benchmarkCharts[benchmark] = {
          labels: reports.map(r => r.file),
          datasets: [
            {
              label: 'Average Time (ms)',
              data: ${JSON.stringify(reports.map(report => 
                report.data.results[benchmark]?.timings.average || null
              ))},
              borderColor: getColor(0),
              backgroundColor: getColor(0, 0.2),
              borderWidth: 2,
              fill: false
            },
            {
              label: 'Min Time (ms)',
              data: ${JSON.stringify(reports.map(report => 
                report.data.results[benchmark]?.timings.min || null
              ))},
              borderColor: getColor(1),
              backgroundColor: getColor(1, 0.2),
              borderWidth: 2,
              borderDash: [5, 5],
              fill: false
            },
            {
              label: 'Max Time (ms)',
              data: ${JSON.stringify(reports.map(report => 
                report.data.results[benchmark]?.timings.max || null
              ))},
              borderColor: getColor(2),
              backgroundColor: getColor(2, 0.2),
              borderWidth: 2,
              borderDash: [2, 2],
              fill: false
            }
          ]
        };
      });
      
      // Chart creation functions
      function createChart(id, data, options = {}) {
        const ctx = document.getElementById(id).getContext('2d');
        return new Chart(ctx, {
          type: 'line',
          data: data,
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              title: {
                display: options.title ? true : false,
                text: options.title || ''
              }
            },
            scales: {
              y: {
                beginAtZero: true,
                title: {
                  display: true,
                  text: 'Time (ms)'
                }
              }
            }
          }
        });
      }
      
      // Color generator
      function getColor(index, alpha = 1) {
        const colors = [
          \`rgba(54, 162, 235, \${alpha})\`,
          \`rgba(255, 99, 132, \${alpha})\`,
          \`rgba(75, 192, 192, \${alpha})\`,
          \`rgba(255, 159, 64, \${alpha})\`,
          \`rgba(153, 102, 255, \${alpha})\`,
          \`rgba(255, 205, 86, \${alpha})\`,
          \`rgba(201, 203, 207, \${alpha})\`
        ];
        return colors[index % colors.length];
      }
      
      // Initialize charts when the page loads
      window.addEventListener('load', function() {
        // Create average times chart
        createChart('averageTimesChart', chartData.averageTimes, {
          title: 'Average Execution Times Across Benchmarks'
        });
        
        // Create min/max times chart
        createChart('minMaxTimesChart', chartData.minMaxTimes, {
          title: 'Min/Max Execution Times Across Benchmarks'
        });
        
        // Create individual benchmark charts
        benchmarks.forEach(benchmark => {
          const chartId = \`chart-\${benchmark.replace(/\\s+/g, '-')}\`;
          createChart(chartId, benchmarkCharts[benchmark], {
            title: \`\${benchmark} Performance\`
          });
        });
      });
    </script>
  </body>
  </html>
  `;
  
  return html;
}

// Generate and save the HTML report
const html = generateHtml(reports);
fs.writeFileSync(outputFile, html);

console.log(`✅ Performance report generated: ${outputFile}`);