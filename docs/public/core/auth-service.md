# Authentication Service

The Authentication Service provides a centralized way to handle authentication for protected image origins. This service encapsulates the authentication logic that was previously in the utility functions.

## Features

- Bearer token authentication
- Header-based authentication
- Query parameter authentication
- AWS S3/R2/GCS compatible API authentication
- Wildcard domain matching
- Fallback mechanisms with security level control

## Authentication Types

The AuthService supports the following authentication types:

- **Bearer**: Generate a Bearer token and add it to the Authorization header
- **Header**: Add custom headers to the request
- **Query**: Generate signed URLs with expiration times
- **AWS S3**: Generate AWS signature headers for S3, R2, or GCS

## Usage

```typescript
// Get the AuthService through DI container
const container = createContainerBuilder(env);
const services = container.createServiceContainer();
const { authService } = services;

// Authenticate a request
const authResult = await authService.authenticateRequest(
  'https://my-bucket.s3.amazonaws.com/my-image.jpg', 
  config, 
  env
);

if (authResult.success) {
  // Use the authenticated URL and headers
  const response = await fetch(authResult.url, {
    headers: authResult.headers || {}
  });
}
```

## Security Levels

The AuthService supports different security levels that can be configured in the application config:

- **strict**: Authentication failures will return an error
- **permissive**: Authentication failures will continue without authentication

## Configuration

Authentication can be configured in the application configuration:

```json
{
  "storage": {
    "auth": {
      "enabled": true,
      "securityLevel": "strict",
      "cacheTtl": 86400,
      "useOriginAuth": true,
      "origins": {
        "my-bucket": {
          "domain": "my-bucket.s3.amazonaws.com",
          "type": "aws-s3",
          "region": "us-east-1",
          "service": "s3",
          "accessKeyVar": "AWS_ACCESS_KEY_ID",
          "secretKeyVar": "AWS_SECRET_ACCESS_KEY"
        }
      }
    }
  }
}
```

## Domain Matching

The AuthService supports exact domain matching as well as wildcard patterns:

```json
{
  "storage": {
    "auth": {
      "origins": {
        "example": {
          "domain": "example.com",
          "type": "bearer"
        },
        "s3-buckets": {
          "domain": "*.s3.amazonaws.com",
          "type": "aws-s3"
        }
      }
    }
  }
}
```

## Integration with Storage Service

The AuthService is automatically integrated with the StorageService through dependency injection. When fetching images, the StorageService will use the AuthService to authenticate requests to remote and fallback URLs.