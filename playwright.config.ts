import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './e2e',
    timeout: 30_000,
    fullyParallel: true,
    reporter: [['list']],
    use: { baseURL: 'http://127.0.0.1:5391' },
    webServer: {
        command: 'node scripts/serve.ts',
        env: { PORT: '5391' },
        url: 'http://127.0.0.1:5391/e2e/fixture.html',
        reuseExistingServer: true
    },
    projects: [
        { name: 'chromium', use: { ...devices['Desktop Chrome'] } }
    ]
});
