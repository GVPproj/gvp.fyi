import assert from 'node:assert/strict';
import test from 'node:test';
import { realBrowser, browserOptions } from './helpers/real-browser.js';

test('without JavaScript, Home explains the disabled instrument and keeps its content accessible', browserOptions, async t => {
  const { context, base } = await realBrowser(t);
  const native = await context.browser().newContext({ javaScriptEnabled: false });
  t.after(() => native.close());
  const page = await native.newPage();
  await page.goto(base);
  // Playwright text locators skip noscript even when scripting is disabled.
  const fallback = page.locator('#ambient-pad noscript p');
  await fallback.waitFor();
  assert.match(await fallback.textContent(), /This instrument needs JavaScript and Web Audio/);
  assert.equal(await page.locator('[data-pad]:disabled').count(), 12);
  await page.getByText('PadLoop-1000', { exact: true }).waitFor();
});

test('without Web Audio, Home visibly explains the disabled instrument', browserOptions, async t => {
  const { context, page, base } = await realBrowser(t);
  await context.addInitScript(() => { window.AudioContext = undefined; });
  await page.goto(base);
  const status = page.locator('[data-status]');
  await page.waitForFunction(() => /not supported/i.test(document.querySelector('[data-status]')?.textContent ?? ''));
  assert.equal(await status.evaluate(element => element.classList.contains('sr-only')), false);
  assert.equal(await page.locator('#ambient-pad button:enabled, #ambient-pad input:enabled').count(), 0);
  await page.getByText('PadLoop-1000', { exact: true }).waitFor();
});

test('keyboard activation keeps visible focus through automatic unlock, playback and clearing transitions', browserOptions, async t => {
  const { page, base } = await realBrowser(t);
  assert.equal((await fetch(base)).ok, true);
  await page.goto(base);
  await page.waitForLoadState('networkidle');
  const region = page.getByRole('region', { name: 'Ambient playground' });
  await page.waitForFunction(() => document.querySelector('[data-pad]')?.disabled === false);
  const firstPad = region.locator('[data-pad]').first();
  await firstPad.focus();
  await page.keyboard.press('Enter');
  assert.equal(await region.locator('[data-last-pad]').count(), 0);
  assert.equal(await firstPad.evaluate(el => document.activeElement === el), true);
  assert.equal(await firstPad.evaluate(el => getComputedStyle(el).outlineStyle), 'solid');
  const record = region.locator('[data-record]');
  await record.focus();
  await page.keyboard.press('Enter');
  await page.waitForFunction(() => document.querySelector('[data-record]')?.getAttribute('aria-label') === 'Finish loop');
  assert.equal(await record.evaluate(el => document.activeElement === el), true);
  assert.equal(await record.evaluate(el => getComputedStyle(el).outlineStyle), 'solid');
  await page.waitForTimeout(1050);
  await page.keyboard.press('Enter');
  await region.getByRole('button', { name: 'Stop', exact: true }).click();
  const play = region.getByRole('button', { name: 'Play', exact: true });
  await play.focus();
  await page.keyboard.press('Enter');
  const transport = region.locator('[data-play]');
  assert.equal(await transport.evaluate(el => document.activeElement === el), true);
  assert.equal(await transport.getAttribute('aria-label'), 'Stop');
  assert.equal(await transport.locator('[data-play-icon="stop"]').isVisible(), true);
  await page.keyboard.press('Enter');
  assert.equal(await transport.evaluate(el => document.activeElement === el), true);
  assert.equal(await transport.getAttribute('aria-label'), 'Play');
  assert.equal(await transport.locator('[data-play-icon="play"]').isVisible(), true);
  await page.keyboard.press('Enter');
  const clear = region.getByRole('button', { name: 'Clear', exact: true });
  await clear.focus();
  await page.keyboard.press('Enter');
  assert.equal(await region.locator('[data-record]').evaluate(el => document.activeElement === el), true);
});

test('full-height volume fader supports vertical dragging and keyboard limits without losing focus', browserOptions, async t => {
  const { page, base } = await realBrowser(t);
  await page.goto(base);
  const volume = page.getByRole('slider', { name: 'Volume', exact: true });
  await page.waitForFunction(() => document.querySelector('[data-volume]')?.disabled === false);
  assert.equal(await volume.inputValue(), '60');
  assert.equal(await page.locator('[data-volume-up], [data-volume-down]').count(), 0);
  await volume.focus();
  await page.keyboard.press('ArrowUp');
  assert.equal(await volume.inputValue(), '61');
  for (const [key, value] of [['Home', '0'], ['End', '100']]) {
    await page.keyboard.press(key);
    assert.equal(await volume.inputValue(), value);
    assert.equal(await volume.isEnabled(), true);
    assert.equal(await volume.evaluate(el => document.activeElement === el), true);
  }
  const box = await volume.boundingBox();
  const controls = await page.locator('#ambient-pad .controls').boundingBox();
  assert.ok(box.x >= controls.x + controls.width, 'fader sits right of the buttons');
  assert.equal(box.height, controls.height, 'fader fills the controller height');
  assert.equal(await volume.getAttribute('aria-orientation'), 'vertical');
  await page.mouse.move(box.x + box.width / 2, box.y + 8);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height - 8, { steps: 10 });
  await page.mouse.up();
  assert.ok(Number(await volume.inputValue()) < 100);
  assert.equal(await volume.getAttribute('aria-valuetext'), `${await volume.inputValue()} percent`);
});

test('Home has a silent, accessible 3×4 instrument centered on desktop and mobile', browserOptions, async t => {
  const { page, base } = await realBrowser(t);
  const samples = [];
  page.on('request', request => { if (request.url().includes('/audio/ambient-test/')) samples.push(request.url()); });
  assert.equal((await fetch(base)).ok, true);
  await page.goto(base);
  await page.waitForLoadState('networkidle');
  const instrument = page.getByRole('region', { name: 'Ambient playground' });
  await instrument.waitFor();
  await page.waitForFunction(() => document.querySelector('[data-pad]')?.disabled === false);
  async function assertTransport(recordLabel, recordIcon, playLabel, empty = false) {
    const record = instrument.locator('[data-record]');
    const play = instrument.locator('[data-play]');
    assert.equal(await record.getAttribute('aria-label'), recordLabel);
    assert.equal(await record.getAttribute('title'), recordLabel);
    assert.deepEqual(await record.locator('[data-record-icon]').evaluateAll(icons =>
      icons.filter(icon => !icon.hidden).map(icon => icon.dataset.recordIcon)
    ), [recordIcon]);
    assert.equal(await play.getAttribute('aria-label'), playLabel);
    assert.equal(await play.getAttribute('title'), playLabel);
    assert.deepEqual(await play.locator('[data-play-icon]').evaluateAll(icons =>
      icons.filter(icon => !icon.hidden).map(icon => icon.dataset.playIcon)
    ), [playLabel.toLowerCase()]);
    assert.equal(await play.isDisabled(), empty);
    assert.equal(await instrument.locator('[data-clear]').isDisabled(), empty);
  }
  await assertTransport('Record', 'record', 'Play', true);
  const pads = instrument.locator('[data-pad]');
  assert.equal(await pads.count(), 12);
  assert.equal(await pads.evaluateAll(buttons => buttons.every(button => !button.disabled)), true);
  for (const selector of ['[data-record]', '[data-volume]']) {
    assert.equal(await instrument.locator(selector).isEnabled(), true);
  }
  assert.equal(await instrument.locator('[data-play]').isDisabled(), true);
  assert.equal(await instrument.locator('[data-stop]').count(), 0);
  assert.equal(await instrument.locator('[data-mute]').count(), 0);
  assert.equal(await instrument.getByRole('button', { name: /mute/i }).count(), 0);
  assert.equal(await instrument.getByRole('button', { name: 'Enable sound', exact: true }).count(), 0);
  assert.equal(await instrument.getByRole('combobox').count(), 0);
  assert.equal(await instrument.getByRole('heading').count(), 0);
  assert.equal(await instrument.evaluate(el => el.tagName), 'SECTION');
  assert.equal(await instrument.getAttribute('aria-label'), 'Ambient playground');
  const status = instrument.getByRole('status');
  assert.equal(await status.getAttribute('aria-atomic'), 'true');
  assert.equal(await status.evaluate(el => {
    const style = getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    return style.position === 'absolute' && style.overflow === 'hidden' &&
      style.clipPath === 'inset(50%)' && rect.width <= 1 && rect.height <= 1;
  }), true, 'status remains accessible but visually hidden');
  assert.deepEqual(samples, []);
  for (const width of [1280, 401, 400, 375, 350, 320]) {
    await page.setViewportSize({ width, height: 900 });
    const controls = instrument.locator('.controls');
    const padGrid = await instrument.locator('.pads').boundingBox();
    const controlsBox = await controls.boundingBox();
    assert.ok(controlsBox.x - (padGrid.x + padGrid.width) >= 2, 'transport stays separated from pads');
    assert.equal(await pads.evaluateAll(buttons => {
      const first = buttons[0].getBoundingClientRect();
      const next = buttons[1].getBoundingClientRect();
      const below = buttons[4].getBoundingClientRect();
      return next.left - first.right >= 2 && below.top - first.bottom >= 2;
    }), true, 'pads retain horizontal and vertical spacing');
    assert.equal(await controls.locator('button').count(), 3);
    assert.deepEqual(await pads.evaluateAll(buttons => {
      const rows = new Map();
      for (const button of buttons) {
        const top = button.getBoundingClientRect().top;
        rows.set(top, (rows.get(top) ?? 0) + 1);
      }
      return [...rows.values()];
    }), [4, 4, 4], 'pads occupy exactly three rows of four');
    assert.equal(await instrument.getByRole('slider', { name: 'Volume', exact: true }).count(), 1);
    assert.equal(await controls.locator('button').evaluateAll(buttons => buttons.every(button =>
      button.getAttribute('aria-label') && button.querySelector('svg') && !button.textContent.trim()
    )), true, 'controls are named, icon-only buttons');
    const shell = await instrument.locator('.controller').boundingBox();
    const fader = await instrument.locator('.volume-fader').boundingBox();
    assert.ok(padGrid.x - shell.x >= 8, 'pads retain their left inset');
    assert.ok(shell.y + shell.height - (padGrid.y + padGrid.height) >= 8, 'pads retain their bottom inset');
    assert.ok(shell.x + shell.width - (fader.x + fader.width) >= 8, 'fader retains its right inset');
    assert.ok(shell.y + shell.height - (controlsBox.y + controlsBox.height) >= 8, 'transport retains its bottom inset');
    const controller = await instrument.boundingBox();
    assert.equal(await page.getByRole('img', { name: 'A one-line portrait of my face' }).count(), 0);
    assert.ok(Math.abs(controller.x + controller.width / 2 - width / 2) < 2, 'instrument stays centered');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await pads.evaluateAll(buttons => buttons.every(button => {
      const rect = button.getBoundingClientRect();
      return rect.width >= 44 && rect.height >= 44;
    })), true);
  }
  await instrument.getByRole('button', { name: 'Record', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('[data-record]')?.getAttribute('aria-label') === 'Finish loop');
  await assertTransport('Finish loop', 'record', 'Stop');
  await pads.first().click();
  await page.waitForTimeout(1050);
  await instrument.getByRole('button', { name: 'Finish loop', exact: true }).click();
  assert.match(await instrument.getByRole('status').textContent(), /Overdubbing/);
  await assertTransport('Finish overdub', 'overdub', 'Stop');
  assert.equal(await instrument.locator('[data-record]').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(191, 97, 106)');
  assert.equal(await instrument.locator('[data-record]').evaluate(el => getComputedStyle(el).borderTopStyle), 'dashed', 'overdub is not distinguished by color alone');
  await pads.nth(1).focus();
  await page.keyboard.press('Enter');
  await instrument.getByRole('button', { name: 'Finish overdub', exact: true }).click();
  assert.equal(await instrument.locator('[data-record]').evaluate(el => getComputedStyle(el).borderTopStyle), 'solid');
  assert.match(await instrument.locator('[data-loop-info]').textContent(), /2 events/);
  await assertTransport('Overdub', 'overdub', 'Stop');
  await instrument.getByRole('button', { name: 'Stop', exact: true }).click();
  assert.match(await instrument.getByRole('status').textContent(), /Stopped/);
  await assertTransport('Overdub', 'overdub', 'Play');
  await instrument.getByRole('button', { name: 'Play', exact: true }).click();
  assert.match(await instrument.getByRole('status').textContent(), /Playing/);
  await instrument.getByRole('button', { name: 'Clear', exact: true }).click();
  assert.match(await instrument.getByRole('status').textContent(), /cleared/i);
  await assertTransport('Record', 'record', 'Play', true);
  assert.deepEqual(samples, [], 'the instrument never downloads samples');
});
