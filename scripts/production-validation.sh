#!/bin/bash

# Production Performance Validation Script
# 
# This bash script performs the performance validation workflow
# in a production environment.

set -e  # Exit on error

# Parse command line arguments
PRODUCTION_URL=${1:-"https://images.example.com"}
ITERATIONS=${2:-100}
WARMUP=${3:-10}
OUTPUT_DIR=${4:-"reports/production-validation"}

# Create output directory if it doesn't exist
mkdir -p $OUTPUT_DIR

# Set timestamp for reports
TIMESTAMP=$(date +"%Y-%m-%d-%H-%M-%S")
REPORT_FILE="$OUTPUT_DIR/production-validation-$TIMESTAMP.json"
LOG_FILE="$OUTPUT_DIR/production-validation-$TIMESTAMP.log"

# Log function
log() {
  echo "$(date +'%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LOG_FILE"
}

# Check required tools
if ! command -v curl &> /dev/null; then
  log "Error: curl is required but not installed."
  exit 1
fi

if ! command -v jq &> /dev/null; then
  log "Error: jq is required but not installed."
  exit 1
fi

log "Starting production performance validation"
log "Production URL: $PRODUCTION_URL"
log "Iterations: $ITERATIONS"
log "Warmup: $WARMUP"
log "Output directory: $OUTPUT_DIR"

# Create test URLs
TEST_URLS=(
  "${PRODUCTION_URL}/test-image.jpg"
  "${PRODUCTION_URL}/test-image.jpg?width=400&height=300"
  "${PRODUCTION_URL}/test-image.jpg?format=webp"
  "${PRODUCTION_URL}/_width=800/_format=webp/test-image.jpg"
  "${PRODUCTION_URL}/thumbnail/test-image.jpg"
)

# Create results JSON structure
echo '{
  "timestamp": "'$(date -Iseconds)'",
  "url": "'${PRODUCTION_URL}'",
  "iterations": '${ITERATIONS}',
  "warmup": '${WARMUP}',
  "results": {}
}' > $REPORT_FILE

# Perform warmup
log "Performing $WARMUP warmup requests..."
for ((i=1; i<=$WARMUP; i++)); do
  for url in "${TEST_URLS[@]}"; do
    curl -s -o /dev/null -w "%{time_total}\n" "$url" > /dev/null
  done
  echo -n "."
done
echo ""

# Perform benchmarks
log "Starting benchmark measurements..."

for url in "${TEST_URLS[@]}"; do
  TEST_NAME=$(echo "$url" | sed "s|${PRODUCTION_URL}/||g")
  log "Testing URL: $TEST_NAME"
  
  TIMES=()
  TOTAL_TIME=0
  MIN_TIME=999999
  MAX_TIME=0
  
  for ((i=1; i<=$ITERATIONS; i++)); do
    # Measure time
    TIME=$(curl -s -o /dev/null -w "%{time_total}" -H "Cache-Control: no-cache" "$url")
    TIMES+=($TIME)
    
    # Update stats
    TOTAL_TIME=$(echo "$TOTAL_TIME + $TIME" | bc -l)
    MIN_TIME=$(echo "$TIME < $MIN_TIME" | bc -l)
    if [ "$MIN_TIME" -eq 1 ]; then
      MIN_TIME=$TIME
    fi
    MAX_TIME=$(echo "$TIME > $MAX_TIME" | bc -l)
    if [ "$MAX_TIME" -eq 1 ]; then
      MAX_TIME=$TIME
    fi
    
    if [ $((i % 10)) -eq 0 ]; then
      echo -n "$i.."
    fi
  done
  echo ""
  
  # Calculate average
  AVG_TIME=$(echo "scale=6; $TOTAL_TIME / $ITERATIONS" | bc -l)
  
  # Calculate standard deviation
  SUM_SQ_DIFF=0
  for t in "${TIMES[@]}"; do
    DIFF=$(echo "$t - $AVG_TIME" | bc -l)
    SQ_DIFF=$(echo "$DIFF * $DIFF" | bc -l)
    SUM_SQ_DIFF=$(echo "$SUM_SQ_DIFF + $SQ_DIFF" | bc -l)
  done
  STD_DEV=$(echo "scale=6; sqrt($SUM_SQ_DIFF / $ITERATIONS)" | bc -l)
  
  # Calculate 95th percentile
  # Sort times, then take the 95th percentile
  IFS=$'\n' SORTED_TIMES=($(sort -n <<<"${TIMES[*]}"))
  unset IFS
  PERCENTILE_95_INDEX=$(echo "($ITERATIONS * 0.95) / 1" | bc)
  PERCENTILE_95=${SORTED_TIMES[$PERCENTILE_95_INDEX]}
  
  # Log results
  log "Results for $TEST_NAME:"
  log "  Average time: $AVG_TIME seconds"
  log "  Min time: $MIN_TIME seconds"
  log "  Max time: $MAX_TIME seconds"
  log "  95th percentile: $PERCENTILE_95 seconds"
  log "  Standard deviation: $STD_DEV seconds"
  
  # Update JSON report
  TMP_FILE=$(mktemp)
  jq --arg url "$TEST_NAME" \
     --arg avg "$AVG_TIME" \
     --arg min "$MIN_TIME" \
     --arg max "$MAX_TIME" \
     --arg p95 "$PERCENTILE_95" \
     --arg std "$STD_DEV" \
     '.results[$url] = {
       "average": ($avg | tonumber),
       "min": ($min | tonumber),
       "max": ($max | tonumber),
       "p95": ($p95 | tonumber),
       "stdDev": ($std | tonumber)
     }' $REPORT_FILE > "$TMP_FILE"
  mv "$TMP_FILE" $REPORT_FILE
done

# Generate HTML report
HTML_REPORT="${REPORT_FILE%.json}.html"
log "Generating HTML report: $HTML_REPORT"

cat > "$HTML_REPORT" << EOF
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Production Performance Validation Report</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
    }
    h1, h2, h3 {
      color: #2c3e50;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
    }
    th, td {
      padding: 12px 15px;
      text-align: left;
      border-bottom: 1px solid #ddd;
    }
    th {
      background-color: #f8f9fa;
    }
    .container {
      background-color: #f8f9fa;
      border-radius: 5px;
      padding: 15px;
      margin-bottom: 20px;
    }
    .chart-container {
      height: 300px;
      margin: 20px 0;
    }
  </style>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
</head>
<body>
  <h1>Production Performance Validation Report</h1>
  <div class="container">
    <h2>Test Information</h2>
    <p><strong>Timestamp:</strong> <span id="timestamp"></span></p>
    <p><strong>Production URL:</strong> <span id="prod-url"></span></p>
    <p><strong>Iterations:</strong> <span id="iterations"></span></p>
    <p><strong>Warmup Requests:</strong> <span id="warmup"></span></p>
  </div>

  <div class="chart-container">
    <canvas id="performanceChart"></canvas>
  </div>
  
  <div class="chart-container">
    <canvas id="percentileChart"></canvas>
  </div>

  <h2>Detailed Results</h2>
  <table id="results-table">
    <thead>
      <tr>
        <th>Test Case</th>
        <th>Average (s)</th>
        <th>Min (s)</th>
        <th>Max (s)</th>
        <th>95th Percentile (s)</th>
        <th>Std Dev (s)</th>
      </tr>
    </thead>
    <tbody>
    </tbody>
  </table>

  <script>
    // Load the data
    const data = JSON.parse(\`$(cat $REPORT_FILE | sed 's/\\/\\\\/g')\`);
    
    // Update test information
    document.getElementById('timestamp').textContent = new Date(data.timestamp).toLocaleString();
    document.getElementById('prod-url').textContent = data.url;
    document.getElementById('iterations').textContent = data.iterations;
    document.getElementById('warmup').textContent = data.warmup;
    
    // Fill the results table
    const tableBody = document.getElementById('results-table').getElementsByTagName('tbody')[0];
    const labels = [];
    const avgData = [];
    const minData = [];
    const maxData = [];
    const p95Data = [];
    
    for (const [testName, results] of Object.entries(data.results)) {
      const row = tableBody.insertRow();
      row.insertCell(0).textContent = testName;
      row.insertCell(1).textContent = results.average.toFixed(4);
      row.insertCell(2).textContent = results.min.toFixed(4);
      row.insertCell(3).textContent = results.max.toFixed(4);
      row.insertCell(4).textContent = results.p95.toFixed(4);
      row.insertCell(5).textContent = results.stdDev.toFixed(4);
      
      labels.push(testName);
      avgData.push(results.average);
      minData.push(results.min);
      maxData.push(results.max);
      p95Data.push(results.p95);
    }
    
    // Create performance chart
    const ctx = document.getElementById('performanceChart').getContext('2d');
    new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Average Time (s)',
            data: avgData,
            backgroundColor: 'rgba(54, 162, 235, 0.5)',
            borderColor: 'rgba(54, 162, 235, 1)',
            borderWidth: 1
          },
          {
            label: 'Min Time (s)',
            data: minData,
            backgroundColor: 'rgba(75, 192, 192, 0.5)',
            borderColor: 'rgba(75, 192, 192, 1)',
            borderWidth: 1
          },
          {
            label: 'Max Time (s)',
            data: maxData,
            backgroundColor: 'rgba(255, 99, 132, 0.5)',
            borderColor: 'rgba(255, 99, 132, 1)',
            borderWidth: 1
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: {
            display: true,
            text: 'Request Processing Time'
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: 'Time (seconds)'
            }
          }
        }
      }
    });
    
    // Create percentile chart
    const p95Ctx = document.getElementById('percentileChart').getContext('2d');
    new Chart(p95Ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Average Time (s)',
            data: avgData,
            backgroundColor: 'rgba(54, 162, 235, 0.5)',
            borderColor: 'rgba(54, 162, 235, 1)',
            borderWidth: 1
          },
          {
            label: '95th Percentile (s)',
            data: p95Data,
            backgroundColor: 'rgba(153, 102, 255, 0.5)',
            borderColor: 'rgba(153, 102, 255, 1)',
            borderWidth: 1
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          title: {
            display: true,
            text: 'Average vs 95th Percentile'
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            title: {
              display: true,
              text: 'Time (seconds)'
            }
          }
        }
      }
    });
  </script>
</body>
</html>
EOF

log "Performance validation completed successfully"
log "Results available in:"
log "  - JSON: $REPORT_FILE"
log "  - HTML: $HTML_REPORT"
log "  - Log: $LOG_FILE"

echo ""
echo "=============================================="
echo "  Production Validation Complete"
echo "  Results available in: $HTML_REPORT"
echo "=============================================="