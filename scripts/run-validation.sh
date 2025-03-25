#!/bin/bash

# Final Performance Validation Script
# 
# This bash script performs the complete performance validation workflow
# to verify the effectiveness of all optimizations implemented in Phase 1-3.

set -e  # Exit on error

# Create reports directory if it doesn't exist
mkdir -p reports/validation

# Set timestamp for reports
TIMESTAMP=$(date +"%Y-%m-%d-%H-%M-%S")
REPORT_DIR="reports/validation/$TIMESTAMP"
mkdir -p $REPORT_DIR

# Set log file
LOG_FILE="$REPORT_DIR/validation.log"

# Log function
log() {
  echo "$(date +'%Y-%m-%d %H:%M:%S') - $1" | tee -a "$LOG_FILE"
}

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
  log "Error: Node.js is required but not installed."
  exit 1
fi

# Start performance validation
log "Starting performance validation process"

# Build project
log "Building project with optimizations enabled"
npm run build | tee -a "$LOG_FILE"

# Run validation tests
log "Running performance validation tests"
node scripts/run-final-validation.js --iterations 5 --warmup 2 | tee -a "$LOG_FILE"

# Compare optimization phases
log "Running phase comparison tests"
node scripts/compare-phases.js --iterations 3 --warmup 1 | tee -a "$LOG_FILE"

# Copy documentation to report directory
log "Copying validation documentation"
cp docs/PERFORMANCE_VALIDATION_PLAN.md "$REPORT_DIR/"
cp docs/PERFORMANCE_VALIDATION_GUIDE.md "$REPORT_DIR/"
cp docs/PERFORMANCE_OPTIMIZATION.md "$REPORT_DIR/"

# Create validation summary
SUMMARY_FILE="$REPORT_DIR/VALIDATION_SUMMARY.md"
log "Creating validation summary at $SUMMARY_FILE"

cat > "$SUMMARY_FILE" << EOF
# Performance Validation Summary

This document summarizes the results of the performance validation tests conducted on $(date).

## Validation Scope

The validation tested all optimizations implemented in Phases 1-3 of the Performance Optimization Plan:

1. **Phase 1: Non-Invasive Optimizations**
   - Conditional logging implementation
   - Response optimization
   - Performance baseline measurement

2. **Phase 2: Architecture Optimizations**
   - Lazy service container implementation
   - Client detection optimization
   - Mid-implementation performance testing

3. **Phase 3: Major Performance Enhancements**
   - Parallel storage operations
   - Caching strategy improvements

## Validation Results

Detailed results can be found in the HTML reports in this directory. Key findings:

- **Reports Directory**: $REPORT_DIR
- **Phase Comparison Reports**: See phase-comparison-*.html files
- **Final Validation Reports**: See final-validation-*.html files

## Next Steps

1. Review the detailed HTML reports to analyze performance improvements
2. Document key findings in the project documentation
3. Consider additional optimizations based on the validation results
4. Share performance improvements with the team

EOF

log "Validation process completed successfully"
log "Results available in $REPORT_DIR"
echo ""
echo "=============================================="
echo "  Performance Validation Complete"
echo "  Results available in: $REPORT_DIR"
echo "=============================================="