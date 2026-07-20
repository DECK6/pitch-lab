import { expect, test } from '@playwright/test';

test('starts private, Light, Tuning, and without optional network requests', async ({ page }) => {
  const neuralRequests: string[] = [];
  const practiceRequests: string[] = [];
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('request', (request) => {
    if (/onnx|ort-wasm|neural-worker|ai-manifest/i.test(request.url())) neuralRequests.push(request.url());
    if (/practice-workspace|harmony|target-comparator/i.test(request.url())) practiceRequests.push(request.url());
  });
  await page.goto('/');
  await expect(page.getByText('PITCH/LAB 02')).toBeVisible();
  await expect(page.getByRole('button', { name: /MIC START/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /LIGHT DSP/ })).toHaveClass(/is-selected/);
  await expect(page.getByRole('tab', { name: 'TUNING' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText(/PCM IS NOT UPLOADED OR SAVED/)).toBeVisible();
  expect(neuralRequests).toEqual([]);
  expect(practiceRequests).toEqual([]);
  expect(pageErrors).toEqual([]);
});

test('loads Practice on demand and renders key-aware harmony lanes', async ({ page }) => {
  const practiceRequests: string[] = [];
  page.on('request', (request) => {
    if (/practice-workspace/i.test(request.url())) practiceRequests.push(request.url());
  });
  await page.goto('/');
  expect(practiceRequests).toEqual([]);
  await page.getByRole('tab', { name: 'TUNING' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('heading', { name: /KEY & HARMONY/ })).toBeVisible();
  await expect(page.getByText('COLOR / TENSION', { exact: true })).toBeVisible();
  await expect(page.getByText('DIATONIC CORE', { exact: true })).toBeVisible();
  await expect(page.getByText('RELATED / BORROWED', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: /Imaj7 Cmaj7/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /V\/ii A7/ })).toBeVisible();
  expect(practiceRequests.length).toBeGreaterThan(0);

  await page.getByLabel('KEY', { exact: true }).selectOption('5');
  await expect(page.getByRole('button', { name: 'Imaj7 Fmaj7', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'IVmaj7 B♭maj7', exact: true })).toBeVisible();

  await page.getByLabel('KEY', { exact: true }).selectOption('6');
  await expect(page.getByRole('button', { name: 'Imaj7 F♯maj7', exact: true })).toBeVisible();
  await expect(page.locator('#selected-chord-notes')).toContainText('E♯');

  await page.getByRole('button', { name: 'MINOR' }).click();
  await page.getByLabel('KEY', { exact: true }).selectOption('3');
  await expect(page.getByRole('button', { name: 'i7 E♭m7', exact: true })).toBeVisible();
  await expect(page.locator('#selected-chord-notes')).toContainText('G♭');
  await expect(page.locator('.piano-key.is-chord-root')).toHaveCount(3);
  await expect(page.locator('.piano-key')).toHaveCount(36);

  await page.getByRole('tab', { name: 'TUNING' }).click();
  await expect(page.locator('#tuning-workspace')).toBeVisible();
  await expect(page.locator('#practice-workspace')).toBeHidden();
});

test('grades an A-minor tonic target without restarting the microphone', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  await page.goto('/');
  await page.getByRole('button', { name: /MIC START/ }).click();
  await expect(page.getByRole('button', { name: /STOP MIC/ })).toBeVisible({ timeout: 10_000 });
  await expect(page.locator('#note-name')).toHaveText('A', { timeout: 10_000 });
  await page.getByRole('tab', { name: 'PRACTICE' }).click();
  await page.getByRole('button', { name: 'MINOR' }).click();
  await page.getByLabel('KEY', { exact: true }).selectOption('9');
  await page.getByRole('button', { name: /i7 Am7/ }).click();
  await page.getByRole('button', { name: 'TARGET A' }).click();
  await expect(page.locator('#practice-result')).toHaveText('LOCKED', { timeout: 10_000 });
  await expect(page.getByRole('button', { name: /STOP MIC/ })).toBeVisible();
  await page.getByRole('tab', { name: 'TUNING' }).click();
  await expect(page.locator('#note-name')).toHaveText('A', { timeout: 10_000 });
  await expect(page.getByRole('button', { name: /STOP MIC/ })).toBeVisible();
});

test('chord audition gates grading and returns to listening after its release tail', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium');
  await page.goto('/');
  await page.getByRole('tab', { name: 'PRACTICE' }).click();
  const keyboardC4 = page.locator('.piano-key[data-midi="60"]');
  await page.keyboard.down('a');
  await expect(keyboardC4).toHaveClass(/is-active/);
  await page.getByRole('button', { name: '▶ CHORD' }).click();
  await expect(keyboardC4).not.toHaveClass(/is-active/);
  await page.keyboard.up('a');
  await expect(page.locator('#app')).toHaveClass(/is-reference-playing/);
  await expect(page.locator('.piano-key')).toHaveCount(36);
  await expect(page.locator('#app')).not.toHaveClass(/is-reference-playing/, { timeout: 3_000 });
  await expect(page.locator('#practice-result')).toHaveText('MIC OFF');
});

test('reference keyboard spans three octaves, supports polyphonic ASDF controls, and uses keyboard-only octave shifting', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.piano-key')).toHaveCount(36);
  await expect(page.locator('.piano-key[data-midi="83"]')).toBeAttached();
  const keyboardC4 = page.locator('.piano-key[data-midi="60"]');
  const keyboardD4 = page.locator('.piano-key[data-midi="62"]');
  await expect(keyboardC4.locator('kbd')).toHaveText('A');
  await page.keyboard.down('a');
  await page.keyboard.down('s');
  await expect(keyboardC4).toHaveClass(/is-active/);
  await expect(keyboardD4).toHaveClass(/is-active/);
  await page.keyboard.up('a');
  await expect(keyboardC4).not.toHaveClass(/is-active/);
  await expect(keyboardD4).toHaveClass(/is-active/);
  await page.keyboard.up('s');
  await expect(keyboardD4).not.toHaveClass(/is-active/);

  const a4 = page.getByRole('button', { name: /A4, 440\.00 hertz/ });
  await expect(a4).toBeVisible();
  const box = await a4.boundingBox();
  expect(box?.width).toBeGreaterThanOrEqual(40);
  expect(box?.height).toBeGreaterThanOrEqual(44);
  await a4.click();
  await expect(page.locator('#signal-state')).toHaveText('MIC OFF', { timeout: 2_000 });
  await expect(page.locator('#tuning-state')).toHaveText('MIC OFF');
  const octaveStatus = page.getByRole('status', { name: 'Reference keyboard octave' });
  await expect(octaveStatus.getByRole('button')).toHaveCount(0);
  await expect(octaveStatus).toContainText('− / + KEY');
  await page.keyboard.press('Shift+=');
  await expect(page.getByText('C4–B6')).toBeVisible();
  await expect(page.locator('#octave-value')).toHaveText('4–6');
  await page.keyboard.press('NumpadSubtract');
  await expect(page.getByText('C3–B5')).toBeVisible();
  await page.keyboard.press('NumpadAdd');
  await expect(page.getByText('C4–B6')).toBeVisible();

  await page.keyboard.down('a');
  await expect(page.locator('.piano-key[data-midi="72"]')).toHaveClass(/is-active/);
  await page.keyboard.press('-');
  await expect(page.locator('.piano-key.is-active')).toHaveCount(0);
  await page.keyboard.up('a');
  await page.keyboard.press('-');
  await expect(page.getByText('C2–B4')).toBeVisible();
  await page.keyboard.press('-');
  await expect(page.getByText('C2–B4')).toBeVisible();
  await page.keyboard.press('Shift+=');
  await expect(page.getByText('C3–B5')).toBeVisible();

  await page.keyboard.press('-');
  await page.keyboard.down('Shift');
  await page.keyboard.down('=');
  await page.keyboard.down('=');
  await expect(page.getByText('C3–B5')).toBeVisible();
  await page.keyboard.up('=');
  await page.keyboard.up('Shift');
  await page.keyboard.press('Shift+=');
  await page.keyboard.press('Shift+=');
  await expect(page.getByText('C4–B6')).toBeVisible();
  await page.keyboard.press('-');
  await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: '+', code: 'Equal', ctrlKey: true })));
  await expect(page.getByText('C3–B5')).toBeVisible();
  await page.getByRole('tab', { name: 'PRACTICE' }).click();
  await page.getByRole('combobox', { name: 'KEY' }).focus();
  await page.keyboard.press('Shift+=');
  await expect(page.getByText('C3–B5')).toBeVisible();
});

test('vertical spring pitch wheel is shared by Tuning and Practice with arrow-key control', async ({ page }, testInfo) => {
  await page.goto('/');
  const modulation = page.getByRole('group', { name: 'Pitch modulation' });
  const wheel = page.getByRole('slider', { name: 'Pitch modulation amount' });
  await expect(modulation).toBeVisible();
  await expect(modulation.locator('.pitch-mod-wheel-stage')).toBeVisible();
  await expect(modulation.getByRole('button', { name: 'Center pitch modulation' })).toHaveCount(0);
  const wheelBox = await wheel.boundingBox();
  expect(wheelBox?.height).toBeGreaterThan((wheelBox?.width ?? 0) * 1.5);
  expect(await wheel.evaluate((element) => getComputedStyle(element).touchAction)).toBe('none');
  const modulationBox = await modulation.boundingBox();
  const pianoSurfaceBox = await page.locator('.piano-surface').boundingBox();
  expect(pianoSurfaceBox?.height).toBeGreaterThanOrEqual((modulationBox?.height ?? 0) * 0.9);
  await expect(page.locator('#pitch-mod-value')).toHaveText('±0 cent');

  await page.keyboard.down('ArrowUp');
  await expect(page.locator('#pitch-mod-value')).toHaveText('+20 cent');
  await page.keyboard.up('ArrowUp');
  await expect(page.locator('#pitch-mod-value')).toHaveText('±0 cent');

  await page.keyboard.down('ArrowUp');
  await page.keyboard.down('ArrowDown');
  await expect(page.locator('#pitch-mod-value')).toHaveText('±0 cent');
  await page.keyboard.up('ArrowDown');
  await page.keyboard.up('ArrowUp');

  await wheel.evaluate((element) => {
    const input = element as HTMLInputElement;
    input.value = '50';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(page.locator('#pitch-mod-value')).toHaveText('+100 cent');
  await page.getByRole('button', { name: 'Use twelve semitone pitch modulation range' }).click();
  await expect(page.locator('#pitch-mod-value')).toHaveText('+600 cent');
  await wheel.dispatchEvent('pointerup');
  await expect(page.locator('#pitch-mod-value')).toHaveText('±0 cent');

  for (const releaseEvent of ['pointercancel', 'lostpointercapture'] as const) {
    await wheel.evaluate((element) => {
      const input = element as HTMLInputElement;
      input.value = '40';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await wheel.dispatchEvent(releaseEvent);
    await expect(page.locator('#pitch-mod-value')).toHaveText('±0 cent');
  }

  await wheel.focus();
  await page.keyboard.down('ArrowUp');
  await expect(page.locator('#pitch-mod-value')).toHaveText('+120 cent');
  await page.keyboard.up('ArrowUp');
  await expect(page.locator('#pitch-mod-value')).toHaveText('±0 cent');
  await page.keyboard.press('Shift+=');
  await expect(page.getByText('C4–B6')).toBeVisible();
  await page.keyboard.press('-');
  await expect(page.getByText('C3–B5')).toBeVisible();
  await wheel.evaluate((element) => {
    const input = element as HTMLInputElement;
    input.value = '40';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await wheel.blur();
  await expect(page.locator('#pitch-mod-value')).toHaveText('±0 cent');
  await wheel.evaluate((element) => {
    const input = element as HTMLInputElement;
    input.value = '40';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await expect(page.locator('#pitch-mod-value')).toHaveText('±0 cent');

  if (testInfo.project.name === 'desktop-chromium' && wheelBox) {
    await page.mouse.move(wheelBox.x + wheelBox.width / 2, wheelBox.y + wheelBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(wheelBox.x + wheelBox.width / 2, wheelBox.y + 8);
    await expect(page.locator('#pitch-mod-value')).not.toHaveText('±0 cent');
    await page.mouse.up();
    await expect(page.locator('#pitch-mod-value')).toHaveText('±0 cent');
  }

  await page.getByRole('tab', { name: 'PRACTICE' }).click();
  await expect(modulation).toBeVisible();
  await page.keyboard.down('ArrowDown');
  await expect(page.locator('#pitch-mod-value')).toHaveText('−120 cent');
  await page.keyboard.up('ArrowDown');
  await expect(page.locator('#pitch-mod-value')).toHaveText('±0 cent');
});

test('mobile layout does not overflow the viewport', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.startsWith('mobile-'));
  await page.setViewportSize({ width: 320, height: 760 });
  await page.goto('/');
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  await expect(page.getByRole('button', { name: /MIC START/ })).toBeVisible();
  await page.getByRole('tab', { name: 'PRACTICE' }).click();
  await expect(page.getByRole('heading', { name: /KEY & HARMONY/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
  const lane = page.locator('[data-lane="core"]');
  const dimensions = await lane.evaluate((element) => ({ clientWidth: element.clientWidth, scrollWidth: element.scrollWidth }));
  expect(dimensions.scrollWidth).toBeGreaterThan(dimensions.clientWidth);
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeGreaterThan(760);
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
  await key.scrollIntoViewIfNeeded();
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
  const pageScrollBeforeGesture = await page.evaluate(() => window.scrollY);
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

  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(pageScrollBeforeGesture + 100);
  await expect(piano.locator('.piano-key.is-active')).toHaveCount(0);
});

test('mobile touch controls the vertical pitch wheel without scrolling the page', async ({ page, context }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium');
  await page.goto('/');
  const wheel = page.getByRole('slider', { name: 'Pitch modulation amount' });
  await wheel.scrollIntoViewIfNeeded();
  const box = await wheel.boundingBox();
  expect(box).not.toBeNull();
  const x = Math.round(box!.x + box!.width / 2);
  const startY = Math.round(box!.y + box!.height / 2);
  const pageScrollBeforeGesture = await page.evaluate(() => window.scrollY);
  const client = await context.newCDPSession(page);
  await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: startY }] });
  await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: startY - 28 }] });
  await expect(page.locator('#pitch-mod-value')).not.toHaveText('±0 cent');
  await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect(page.locator('#pitch-mod-value')).toHaveText('±0 cent');
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(pageScrollBeforeGesture);
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
