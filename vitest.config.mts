import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
	test: {
		poolOptions: {
			workers: {
				wrangler: { configPath: './wrangler.jsonc' },
			},
		},
		setupFiles: ['./test/setup.ts'],
		// Increase test timeout to avoid flaky tests
		testTimeout: 30000,
		environmentOptions: {
			// Mock environment variables needed for tests
			env: {
				AUTH_TOKEN_SECRET_SECURE1: 'test-secret-1',
				AUTH_BASIC_USERNAME_SECURE2: 'testuser',
				AUTH_BASIC_PASSWORD_SECURE2: 'testpass',
				AUTH_API_KEY_SECURE3: 'test-api-key',
				AUTH_SIGNING_SECRET_SECURE4: 'query-secret'
			}
		}
	},
});
