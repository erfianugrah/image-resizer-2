# Development Documentation

This section contains information for developers working on the Image Resizer codebase.

## Key Topics

- [Codebase Refactoring Plan](codebase-refactoring.md) - Plans for refactoring the codebase
- [Contributing Guide](contributing.md) - How to contribute to the project
- [Coding Standards](coding-standards.md) - Code style and practices
- [Testing Guide](testing.md) - How to test the image resizer

## Development Setup

### Prerequisites

- Node.js (version 18 or later)
- Wrangler CLI (version 4.2.0 or later)
- Cloudflare account with Workers and R2 access

### Installation

1. Clone the repository:

```bash
git clone https://github.com/your-org/image-resizer.git
cd image-resizer
```

2. Install dependencies:

```bash
npm install
```

3. Copy the example configuration and customize it:

```bash
cp wrangler.jsonc.example wrangler.jsonc
# Edit wrangler.jsonc with your specific configuration
```

### Development Workflow

1. Start the development server:

```bash
npm run dev
# or
wrangler dev
```

2. Run tests:

```bash
npm test
# or
vitest run
```

3. Run a specific test:

```bash
vitest -t "test name"
# or
vitest path/to/test.spec.ts
```

4. Type check the codebase:

```bash
npm run typecheck
# or
tsc --noEmit
```

5. Generate Cloudflare types:

```bash
npm run cf-typegen
```

## Project Structure

```
/
├── src/                 # Source code
│   ├── config.ts        # Configuration handling
│   ├── index.ts         # Main worker entry point
│   ├── transform.ts     # Image transformation logic
│   ├── storage.ts       # Storage utilities (R2, remote)
│   ├── cache.ts         # Caching utilities
│   ├── debug.ts         # Debug headers
│   ├── types.ts         # TypeScript type definitions
│   └── utils/           # Utility functions
├── test/                # Tests
├── docs/                # Documentation
├── public/              # Static assets
└── wrangler.jsonc       # Cloudflare Workers configuration
```

## Code Style Guidelines

- **Imports**: Use ES modules (`import/export`) syntax
- **Formatting**: Use consistent indentation (2 spaces)
- **TypeScript**: Use strict mode, properly typed interfaces/parameters
- **Error Handling**: Use try/catch blocks with proper error logging
- **Logging**: Use centralized logging utilities (`loggerUtils.ts`)
- **Documentation**: JSDoc comments for functions with @param and @returns
- **Naming**: camelCase for variables/functions, PascalCase for classes
- **File Structure**: Use appropriate folders (handlers, utils, config, domain)
- **Async**: Use async/await for asynchronous code
- **Architecture**: Follow domain-driven design principles

## Testing Strategy

- **Unit Tests**: Test individual functions and components in isolation
- **Integration Tests**: Test interaction between components
- **End-to-End Tests**: Test complete request/response flows
- **Performance Tests**: Test performance characteristics

## Deployment

Deploy to different environments:

```bash
# Development
npm run deploy:dev

# Staging
npm run deploy:staging

# Production
npm run deploy:prod
```

For more details on development, explore the individual topics in this section.