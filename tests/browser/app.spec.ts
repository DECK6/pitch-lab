import { expect, test } from '@playwright/test';

test('starts private, Light, and without Neural network requests', async ({ page }) => {
  const neuralRequests: string[] = [];
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('request', (request) => {
    if (/onnx|ort-wasm|neural-worker|ai-manifest/i.test(request.url())) neuralRequests.push(request.url());
  });
  await page.goto('/');
  await expect(page.getByText('PITCH/LAB 01')).toBeVisible();
  await expect(page.getByRole('button', { name: /MIC START/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /LIGHT DSP/ })).toHaveClass(/is-selected/);
  await expect(page.getByText(/PCM IS NOT UPLOADED OR SAVED/)).toBeVisible();
  expect(neuralRequests).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test('reference keyboard is touch-sized and updates octave range', async ({ page }) => {
  await page.goto('/');
  const a4 = page.getByRole('button', { name: /A4, 440\.00 hertz/ });
  await expect(a4).toBeVisible();
  const box = await a4.boundingBox();
  expect(box?.width).toBeGreaterThanOrEqual(40);
  expect(box?.height).toBeGreaterThanOrEqual(44);
  await page.getByRole('button', { name: /OCTAVE/ }).click();
  await expect(page.getByText('C4–B5')).toBeVisible();
});

test('mobile layout does not overflow the viewport', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-webkit');
  await page.goto('/');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await expect(page.getByRole('button', { name: /MIC START/ })).toBeVisible();
});

test('detects fake A4 in Light and loads the real Neural engine on demand', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  test.setTimeout(60_000);
  const neuralRequests: string[] = [];
  page.on('request', (request) => {
    if (/onnx|ort-wasm|neural-worker|ai-manifest/i.test(request.url())) neuralRequests.push(request.url());
  });
  await page.goto('/');
  expect(neuralRequests).toEqual([]);
  await page.getByRole('button', { name: /MIC START/ }).click();
  await expect(page.getByRole('button', { name: /STOP MIC/ })).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('#note-name')).toHaveText('A', { timeout: 10_000 });
  await expect(page.locator('#note-octave')).toHaveText('4');

  await page.getByRole('button', { name: /NEURAL/ }).click();
  await expect(page.locator('#neural-stage')).toContainText(/READY/, { timeout: 40_000 });
  await expect(page.getByRole('button', { name: /NEURAL/ })).toHaveClass(/is-selected/);
  expect(neuralRequests.some((url) => url.includes('ai-manifest'))).toBe(true);
  expect(neuralRequests.some((url) => url.includes('.onnx'))).toBe(true);
  expect(neuralRequests.some((url) => url.includes('.wasm'))).toBe(true);
  await expect(page.locator('#note-name')).toHaveText('A', { timeout: 10_000 });
});
