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

test('reference keyboard spans three octaves, supports ASDF controls, and updates its range', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.piano-key')).toHaveCount(36);
  await expect(page.locator('.piano-key[data-midi="83"]')).toBeAttached();
  const keyboardC4 = page.locator('.piano-key[data-midi="60"]');
  await expect(keyboardC4.locator('kbd')).toHaveText('A');
  await page.keyboard.down('a');
  await expect(keyboardC4).toHaveClass(/is-active/);
  await page.keyboard.up('a');
  await expect(keyboardC4).not.toHaveClass(/is-active/);

  const a4 = page.getByRole('button', { name: /A4, 440\.00 hertz/ });
  await expect(a4).toBeVisible();
  const box = await a4.boundingBox();
  expect(box?.width).toBeGreaterThanOrEqual(40);
  expect(box?.height).toBeGreaterThanOrEqual(44);
  await a4.click();
  await expect(page.locator('#signal-state')).toHaveText('MIC OFF', { timeout: 2_000 });
  await expect(page.locator('#tuning-state')).toHaveText('MIC OFF');
  await page.getByRole('button', { name: /OCTAVE/ }).click();
  await expect(page.getByText('C4–B6')).toBeVisible();
  await expect(page.getByRole('button', { name: /OCTAVE 4–6/ })).toBeVisible();
});

test('mobile layout does not overflow the viewport', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('mobile-'));
  await page.goto('/');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await expect(page.getByRole('button', { name: /MIC START/ })).toBeVisible();
});

test('mobile keyboard scrolls horizontally when swiping across keys', async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium');
  await page.goto('/');
  const piano = page.locator('#piano-keys');
  const dimensions = await piano.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
    touchAction: getComputedStyle(element.querySelector('.piano-key')!).touchAction,
  }));
  expect(dimensions.scrollWidth).toBeGreaterThan(dimensions.clientWidth);
  expect(dimensions.touchAction).toBe('pan-x pan-y');

  await piano.evaluate((element) => { element.scrollLeft = 0; });
  const key = page.locator('.white-key').nth(3);
  const box = await key.boundingBox();
  expect(box).not.toBeNull();
  const startX = Math.round(box!.x + box!.width / 2);
  const y = Math.round(box!.y + box!.height * 0.65);
  const client = await context.newCDPSession(page);
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: startX, y }] });
  for (let step = 1; step <= 6; step += 1) {
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: startX - step * 35, y }],
    });
  }
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

  await expect.poll(() => piano.evaluate((element) => element.scrollLeft)).toBeGreaterThan(100);
  await expect(piano.locator('.piano-key.is-active')).toHaveCount(0);

  await piano.evaluate((element) => { element.scrollLeft = 0; });
  const verticalKeyBox = await key.boundingBox();
  expect(verticalKeyBox).not.toBeNull();
  const verticalX = Math.round(verticalKeyBox!.x + verticalKeyBox!.width / 2);
  const verticalY = Math.round(verticalKeyBox!.y + verticalKeyBox!.height * 0.65);
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: verticalX, y: verticalY }] });
  for (let step = 1; step <= 6; step += 1) {
    await client.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [{ x: verticalX, y: verticalY - step * 35 }],
    });
  }
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
  await expect(piano.locator('.piano-key.is-active')).toHaveCount(0);
});

test('detects fake A4 in Light and loads the real Neural engine on demand', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  test.setTimeout(60_000);
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      override get onmessage(): ((this: Worker, event: MessageEvent) => unknown) | null {
        return null;
      }

      override set onmessage(listener: ((this: Worker, event: MessageEvent) => unknown) | null) {
        if (!listener) return;
        this.addEventListener('message', (event) => {
          const result = (event.data as { type?: string; result?: { source?: string } } | null)?.result;
          if (event.data?.type === 'processed' && result?.source === 'neural') {
            setTimeout(() => listener.call(this, event), 90);
          } else {
            listener.call(this, event);
          }
        });
      }
    };
  });
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
  await expect(page.locator('#frequency-value')).toContainText('440.0');
  expect(Number((await page.locator('#cents-value').textContent())?.match(/\d+/)?.[0] ?? 99)).toBeLessThanOrEqual(5);

  await page.getByRole('button', { name: /STOP MIC/ }).click();
  await expect(page.getByRole('button', { name: /MIC START/ })).toBeVisible();
  await page.getByRole('button', { name: /MIC START/ }).click();
  await expect(page.getByRole('button', { name: /STOP MIC/ })).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('#note-name')).toHaveText('A', { timeout: 10_000 });

  await page.getByRole('button', { name: /NEURAL/ }).click();
  await expect(page.locator('#neural-stage')).toContainText(/READY/, { timeout: 40_000 });
  await expect(page.getByRole('button', { name: /NEURAL/ })).toHaveClass(/is-selected/);
  expect(neuralRequests.some((url) => url.includes('ai-manifest'))).toBe(true);
  expect(neuralRequests.some((url) => url.includes('.onnx'))).toBe(true);
  expect(neuralRequests.some((url) => url.includes('.wasm'))).toBe(true);
  await expect(page.locator('#note-name')).toHaveText('A', { timeout: 10_000 });
  await expect.poll(async () => Number((await page.locator('#cents-value').textContent())?.match(/\d+/)?.[0] ?? 99), { timeout: 10_000 }).toBeLessThanOrEqual(5);

  const loadedRequestCount = neuralRequests.length;
  await page.getByRole('button', { name: /LIGHT DSP/ }).click();
  await expect(page.getByRole('button', { name: /LIGHT DSP/ })).toHaveClass(/is-selected/);
  await page.getByRole('button', { name: /NEURAL/ }).click();
  await expect(page.getByRole('button', { name: /NEURAL/ })).toHaveClass(/is-selected/);
  await expect(page.locator('#note-name')).toHaveText('A', { timeout: 10_000 });
  expect(neuralRequests).toHaveLength(loadedRequestCount);
});

test('Neural keeps detecting a low C-sharp when model confidence is weak', async ({ page }, testInfo) => {
  test.skip(!['desktop-chromium', 'mobile-webkit'].includes(testInfo.project.name));
  test.setTimeout(60_000);
  await page.addInitScript(() => {
    const NativeWorker = window.Worker;
    window.Worker = class extends NativeWorker {
      override get onmessage(): ((this: Worker, event: MessageEvent) => unknown) | null {
        return null;
      }

      override set onmessage(listener: ((this: Worker, event: MessageEvent) => unknown) | null) {
        if (!listener) return;
        this.addEventListener('message', (event) => {
          const result = (event.data as { type?: string; result?: { source?: string } } | null)?.result;
          if (event.data?.type === 'processed' && result?.source === 'neural') {
            setTimeout(() => listener.call(this, event), 90);
          } else {
            listener.call(this, event);
          }
        });
      }
    };
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: {
        getUserMedia: async () => {
          const context = new AudioContext();
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          const destination = context.createMediaStreamDestination();
          oscillator.frequency.value = 135.2;
          gain.gain.value = 0.25;
          oscillator.connect(gain).connect(destination);
          oscillator.start();
          Object.assign(window, { __pitchLabLowSource: { context, oscillator } });
          return destination.stream;
        },
      },
    });
  });
  await page.goto('/');
  await page.getByRole('button', { name: /MIC START/ }).click();
  await expect(page.locator('#note-name')).toHaveText('C♯', { timeout: 10_000 });
  await page.getByRole('button', { name: /NEURAL/ }).click();
  await expect(page.locator('#neural-stage')).toContainText(/READY/, { timeout: 40_000 });
  await expect(page.locator('#note-name')).toHaveText('C♯', { timeout: 10_000 });
  await expect(page.locator('#frequency-value')).toContainText('135.2');
  await expect(page.locator('#confidence-value')).not.toHaveText('NONE');
});

test('cancelling Neural loading keeps Light live', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  await page.route('**/ai-manifest.json', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    await route.continue().catch(() => undefined);
  });
  await page.goto('/');
  await page.getByRole('button', { name: /MIC START/ }).click();
  await expect(page.locator('#note-name')).toHaveText('A', { timeout: 10_000 });
  await page.getByRole('button', { name: /NEURAL/ }).click();
  await expect(page.getByRole('button', { name: 'CANCEL' })).toBeVisible();
  await page.getByRole('button', { name: 'CANCEL' }).click();
  await expect(page.locator('#neural-progress-text')).toContainText(/cancelled/i, { timeout: 5_000 });
  await expect(page.getByRole('button', { name: /LIGHT DSP/ })).toHaveClass(/is-selected/);
  await expect(page.locator('#note-name')).toHaveText('A', { timeout: 10_000 });
});

test('cancelling microphone startup does not fall through to an error', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.route('**/assets/capture-worklet-*.js', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    await route.continue().catch(() => undefined);
  });
  await page.goto('/');
  await page.getByRole('button', { name: /MIC START/ }).click();
  await expect(page.getByRole('button', { name: /CANCEL/ })).toBeVisible();
  await page.getByRole('button', { name: /CANCEL/ }).click();
  await expect(page.getByRole('button', { name: /MIC START/ })).toBeVisible();
  await page.waitForTimeout(700);
  await expect(page.getByRole('button', { name: /MIC START/ })).toBeVisible();
  expect(pageErrors).toEqual([]);
});

test('restarts cleanly after the microphone track ends', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  await page.addInitScript(() => {
    const original = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async (constraints) => {
      const stream = await original(constraints);
      Object.assign(window, { __pitchLabTestStream: stream });
      return stream;
    };
  });
  await page.goto('/');
  await page.getByRole('button', { name: /MIC START/ }).click();
  await expect(page.locator('#note-name')).toHaveText('A', { timeout: 10_000 });
  await page.evaluate(() => {
    const stream = (window as typeof window & { __pitchLabTestStream?: MediaStream }).__pitchLabTestStream;
    stream?.getTracks().forEach((track) => {
      track.stop();
      track.dispatchEvent(new Event('ended'));
    });
  });
  await expect(page.locator('#app-message')).toContainText(/microphone route ended/i);
  await page.getByRole('button', { name: /MIC START/ }).click();
  await expect(page.getByRole('button', { name: /STOP MIC/ })).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('#note-name')).toHaveText('A', { timeout: 10_000 });
});
