#!/bin/bash

# Script to post the comprehensive configuration
API_URL="https://images.erfi.dev/api/config"
API_KEY="test"

# Create a temporary file with the request wrapper
cat <<EOF > /tmp/config-wrapper.json
{
  "config": $(cat $(dirname "$0")/../docs/public/configuration/examples/comprehensive-config-runnable.json),
  "comment": "Comprehensive configuration setup",
  "author": "developer"
}
EOF

# Post to the API
curl -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -H "X-Config-API-Key: $API_KEY" \
  -d @/tmp/config-wrapper.json

# Clean up
rm /tmp/config-wrapper.json
