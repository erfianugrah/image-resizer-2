# Testing the Configuration API

To post the configuration to your development worker, run the following command:

```bash
curl -X POST "https://image-resizer-2-development.anugrah.workers.dev/api/config" \
  -H "Content-Type: application/json" \
  -d '{
    "config": '"$(cat ./examples/configuration/auth-and-path-origins-config.json)"',
    "comment": "Initial configuration setup",
    "author": "developer"
  }'
```

The API expects a request body with:
- `config`: The configuration object
- `comment`: A description of the change (required)
- `author`: Who made the change (optional)

To verify the configuration was applied correctly, you can then run:

```bash
curl "https://image-resizer-2-development.anugrah.workers.dev/api/config"
```

## Troubleshooting

If you get a validation error, it may be because we need to wrap the configuration file in the proper request format. Try creating a temporary JSON file:

```bash
cat > temp-config-request.json << EOF
{
  "config": $(cat ./examples/configuration/auth-and-path-origins-config.json),
  "comment": "Initial configuration setup",
  "author": "developer"
}
EOF

curl -X POST "https://image-resizer-2-development.anugrah.workers.dev/api/config" \
  -H "Content-Type: application/json" \
  -d @temp-config-request.json
```

## Testing Specific Paths

After applying the configuration, you can test path-based routing with:

```bash
# Test product images path
curl "https://image-resizer-2-development.anugrah.workers.dev/products/test.jpg?width=300"

# Test profile images path
curl "https://image-resizer-2-development.anugrah.workers.dev/profiles/avatar.jpg?width=150"
```