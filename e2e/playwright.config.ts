import { defineConfig } from '@playwright/test';
import { UI_PORT } from './world.js';

export default defineConfig({
  testDir: './specs',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 60_000,
  globalSetup: './global-setup.ts',
  globalTeardown: './global-teardown.ts',
  use: {
    baseURL: `http://localhost:${UI_PORT}`,
    trace: 'on-first-retry',
  },
});
