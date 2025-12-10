# Codebase Review (2025-12-10)

## Findings (ordered by severity)
- `src/index.ts:37-69` mutates the incoming `Request` to attach `env`/`ctx` and lazily backfills missing services on each call. Mutating a Cloudflare `Request` is unsupported and can leak state between middlewares; the lazy creation also hides container misconfiguration. Prefer passing `env/ctx` through the service container constructor and fail-fast if required services are absent.
- `src/services/config/configBridge.ts:49-144` merges KV modules with legacy config via `deepMerge` but never re-runs schema validation. A malformed KV payload can reach runtime unchecked. Pipe the merged object through `SchemaValidator.validate` and surface errors early (with environment-tagged logs) before returning config to callers.
- `src/services/cache/PathPatternTTLCalculator.ts:49-198` recompiles regex matchers and revalidates them for every request, logging warnings repeatedly. Precompile and validate at init, cache `RegExp` objects with safe flags, and short-circuit on invalid patterns to reduce hot-path overhead and log noise.
- `src/index.ts:94-104` sets module-level loggers via global setters (`setAkamaiLogger`, detector config). In the Workers single-threaded global, this rebinds shared state per request and could race with concurrent requests. Refactor these helpers to accept a logger instance per invocation or inject through the service container.
- Deployment script `npm run deploy:*` does not gate on lint/typecheck/build success. Add a composite script/CI step (e.g., `npm run verify` → `lint && typecheck && test && build`) to prevent publishing broken bundles.
- `wrangler.jsonc` includes concrete account and KV IDs; no secrets, but the file would block forks. Document override via `.dev.vars` and consider moving IDs to environment-specific sample files to keep the default config cloneable.

## Testing Gaps
- No coverage for HTTP surfaces added in `src/index.ts`: `/debug/transform-cache`, `/api/config/**`, and the performance reset/report handlers. Add end-to-end tests that spin up the worker with fixture KV/R2 bindings and assert status/payload/headers.
- Cache TTL logic lacks regression tests for path-pattern priority, invalid regex handling, and status-class TTL selection. Add cases around `PathPatternTTLCalculator` with overlapping matchers and malformed patterns to lock behavior before refactoring.
- Config bridging is only unit-tested at the service level; add integration that exercises KV-backed config + schema validation to ensure derivatives/path templates stay consistent after merges.

## Documentation & Operations
- Extend `docs/public/configuration` with a short “KV merge + validation” flow chart so operators know which modules are required for a safe boot. Link the new tests once added.
- Add a short “request lifecycle” diagram to `docs/public/core/architecture.md` reflecting the new debug/performance/config routes, ensuring handlers remain discoverable for future contributors.
