import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['tests/**/*.test.ts'],
    setupFiles: ['./tests/setup.ts'],
    env: {
      TURSO_DATABASE_URL: ':memory:',
      JWT_SECRET: 'test_secret_for_unit_tests_0123456789',
      GRAFICA_DISABLE_WHATSAPP: '1',
    },
    pool: 'forks',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/server.ts', 'src/seed.ts', 'src/types.d.ts'],
      reporter: ['text', 'html'],
    },
  },
});
