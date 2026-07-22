import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';

const fakeAudio = resolve('.cache/fixtures/a4-440hz.wav');
const testPort = Number(process.env.PITCHLAB_TEST_PORT ?? 4173);
const testOrigin = `http://127.0.0.1:${testPort}`;

export default defineConfig({
  testDir: './tests/browser',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  use: {
    baseURL: testOrigin,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npm run build && vite preview --host 127.0.0.1 --port ${testPort}`,
    url: testOrigin,
    reuseExistingServer: true,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: {
        ...devices['Desktop Chrome'],
        permissions: ['microphone'],
        launchOptions: {
          args: [
            '--use-fake-device-for-media-stream',
            '--use-fake-ui-for-media-stream',
            `--use-file-for-fake-audio-capture=${fakeAudio}`,
          ],
        },
      },
    },
    { name: 'mobile-chromium', use: { ...devices['iPhone 13'], browserName: 'chromium' } },
    { name: 'mobile-webkit', use: { ...devices['iPhone 13'] } },
  ],
});
