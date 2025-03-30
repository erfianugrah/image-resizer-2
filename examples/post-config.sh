#!/bin/bash

# Simple script to post configuration
API_URL="https://image-resizer-2-development.anugrah.workers.dev/api/config"
API_KEY="dev-api-key-for-testing"

# Create a temporary file with the request wrapper
cat <<EOF > /tmp/config-wrapper.json
{
  "config": $(cat ./examples/configuration/auth-and-path-origins-config.json),
  "comment": "Initial configuration setup",
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