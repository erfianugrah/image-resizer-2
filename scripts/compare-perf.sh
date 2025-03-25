#!/bin/bash

# Performance Comparison Script
#
# This script runs benchmarks on two different git branches and compares the results.
# Usage: ./compare-perf.sh <branch1> <branch2> [iterations] [warmup]

set -e

# Default values
ITERATIONS=${3:-3}
WARMUP=${4:-1}
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)

# Check arguments
if [ "$#" -lt 2 ]; then
    echo "Usage: ./compare-perf.sh <branch1> <branch2> [iterations] [warmup]"
    exit 1
fi

BRANCH1=$1
BRANCH2=$2

# Create reports directory if it doesn't exist
mkdir -p reports

# Function to run benchmark on a specific branch
run_benchmark() {
    local branch=$1
    local report_file="reports/benchmark-$branch-$(date +%Y%m%d%H%M%S).json"
    
    echo "📊 Running benchmark on branch: $branch"
    echo "⏱️  Iterations: $ITERATIONS, Warmup: $WARMUP"
    
    # Checkout the branch
    git checkout "$branch"
    
    # Build the project
    echo "🔨 Building project..."
    npm run build
    
    # Run the benchmark
    echo "🚀 Running benchmark..."
    node scripts/run-benchmarks.js --iterations "$ITERATIONS" --warmup "$WARMUP"
    
    # Get the latest report file
    local latest_report=$(ls -t reports/benchmark-report-*.json | head -1)
    
    # Copy the latest report with a branch-specific name
    cp "$latest_report" "$report_file"
    
    echo "✅ Benchmark completed for branch: $branch"
    echo "📄 Report saved to: $report_file"
    
    # Return the report file path
    echo "$report_file"
}

# Save any uncommitted changes
if git diff-index --quiet HEAD --; then
    HAS_CHANGES=false
else
    HAS_CHANGES=true
    echo "📝 Stashing uncommitted changes..."
    git stash push -m "Automatic stash before performance comparison"
fi

# Run benchmarks on both branches
REPORT1=$(run_benchmark "$BRANCH1")
REPORT2=$(run_benchmark "$BRANCH2")

# Generate HTML comparison report
REPORT_FILE="reports/comparison-$BRANCH1-vs-$BRANCH2-$(date +%Y%m%d%H%M%S).html"
echo "📊 Generating comparison report..."
node scripts/generate-perf-report.js --output "$REPORT_FILE" "$REPORT1" "$REPORT2"

# Return to the original branch
echo "🔄 Returning to original branch: $CURRENT_BRANCH"
git checkout "$CURRENT_BRANCH"

# Restore uncommitted changes if there were any
if [ "$HAS_CHANGES" = true ]; then
    echo "📝 Restoring uncommitted changes..."
    git stash pop
fi

echo "✨ Performance comparison completed"
echo "📄 Comparison report: $REPORT_FILE"
echo "📊 Branch 1: $BRANCH1"
echo "📊 Branch 2: $BRANCH2"