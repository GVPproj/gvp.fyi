import assert from 'node:assert/strict';
import test from 'node:test';
import { realBrowser, browserOptions } from './helpers/real-browser.js';

// Observe the browser's audio boundary, not the instrument's private state. All
// contexts, oscillators, sample sources and decoding remain real Chromium APIs.
async function observeAudio(context, { rejectResumes = 0, requireActivation = false } = {}) {
  await context.addInitScript(({ rejectResumes, requireActivation }) => {
    const NativeAudioContext = window.AudioContext;
    const contexts = [];
    const starts = [];
    const lifecycle = [];
    const documentId = crypto.randomUUID();
    window.AudioContext = class extends NativeAudioContext {
      constructor(...args) {
        super(...args);
        const id = contexts.length;
        const entry = { context: this, resumes: 0 };
        contexts.push(entry);
        const resume = this.resume.bind(this);
        this.resume = () => {
          entry.resumes++;
          if (requireActivation && !navigator.userActivation.isActive) {
            return Promise.reject(new DOMException('Trusted activation required', 'NotAllowedError'));
          }
          if (rejectResumes-- > 0) return Promise.reject(new DOMException('Activation denied', 'NotAllowedError'));
          return resume();
        };
        for (const [method, kind] of [['createOscillator', 'sine'], ['createBufferSource', 'sample']]) {
          const create = this[method].bind(this);
          this[method] = (...args) => {
            const source = create(...args);
            const voice = { context: id, kind, frequency: undefined, stoppedAt: null, disconnected: false, ended: false };
            const start = source.start.bind(source);
            source.start = (...args) => {
              const result = start(...args);
              voice.frequency = source.frequency?.value;
              starts.push(voice);
              return result;
            };
            const stop = source.stop.bind(source);
            source.stop = (...args) => {
              const result = stop(...args);
              voice.stoppedAt = args[0] ?? 0;
              return result;
            };
            const disconnect = source.disconnect.bind(source);
            source.disconnect = (...args) => {
              const result = disconnect(...args);
              if (args.length === 0) voice.disconnected = true;
              return result;
            };
            source.addEventListener('ended', () => { voice.ended = true; }, { once: true });
            return source;
          };
        }
      }
    };
    for (const type of ['pagehide', 'pageshow']) {
      window.addEventListener(type, event => lifecycle.push({ type, persisted: event.persisted, trusted: event.isTrusted }));
    }
    window.__ambientBrowserProbe = () => ({
      documentId,
      contexts: contexts.map(({ context, resumes }) => ({ state: context.state, time: context.currentTime, resumes })),
      starts,
      lifecycle,
    });
    window.__interruptAmbientAudio = () => Promise.all(contexts.map(({ context }) => context.suspend()));
  }, { rejectResumes, requireActivation });
}

const snapshot = page => page.evaluate(() => window.__ambientBrowserProbe());
const instrument = page => page.getByRole('region', { name: 'Ambient playground' });
const button = (page, name) => instrument(page).getByRole('button', { name, exact: true });
const pad = (page, number) => instrument(page).getByRole('button', { name: new RegExp(`^Pad ${number},`) });
const blogLink = page => page.getByRole('navigation', { name: 'Main navigation', exact: true }).getByRole('link', { name: 'Blog', exact: true });

async function openHome(page, base) {
  // The shared helper warms an editor route. Compile both instrument navigation
  // destinations too, then let Vite's initial module-loading/reload settle before
  // observing lifetime. Subsequent navigation must preserve the document ID.
  for (const path of ['/', '/blog']) assert.equal((await fetch(`${base}${path}`)).ok, true);
  await page.goto(base);
  await page.waitForLoadState('networkidle');
  await page.waitForFunction(() => document.querySelector('[data-pad]')?.disabled === false);
}

async function assertControlsEnabled(page) {
  assert.equal(await instrument(page).locator('[data-pad]').evaluateAll(pads => pads.every(pad => !pad.disabled)), true);
  for (const selector of ['[data-record]', '[data-volume]', '[data-mute]']) {
    assert.equal(await instrument(page).locator(selector).isEnabled(), true);
  }
}

async function recordLoop(page) {
  await button(page, 'Record').click();
  await page.waitForFunction(() => document.querySelector('[data-record]')?.getAttribute('aria-label') === 'Finish loop');
  assert.equal((await snapshot(page)).contexts.at(-1).state, 'running', 'Record unlocks audio before recording');
  assert.match(await instrument(page).getByRole('status').textContent(), /Recording/);
  await pad(page, 1).click();
  await page.waitForTimeout(1050); // First pass is free-time, with a one-second minimum.
  await button(page, 'Finish loop').click();
  assert.match(await instrument(page).getByRole('status').textContent(), /Overdubbing/);
  await button(page, 'Finish overdub').click();
  assert.match(await instrument(page).getByRole('status').textContent(), /Playing/);
}

function assertSilent(audio) {
  assert.ok(audio.starts.every(voice => {
    const context = audio.contexts[voice.context];
    return context.state !== 'running' || voice.ended || voice.disconnected ||
      (voice.stoppedAt !== null && voice.stoppedAt <= context.time);
  }), 'no active or scheduled source survives in a running context');
}

async function assertNoNewSound(page, milliseconds = 1200) {
  const before = await snapshot(page);
  assertSilent(before);
  await page.waitForTimeout(milliseconds); // Observe idle behavior beyond the scheduling horizon.
  const after = await snapshot(page);
  assertSilent(after);
  assert.equal(after.documentId, before.documentId, 'a document reload must not masquerade as silence');
  assert.equal(after.starts.length, before.starts.length, 'no voices start without an explicit action');
  assert.equal(after.contexts.length, before.contexts.length, 'no context is created in the background');
  assert.deepEqual(after.contexts.map(c => c.resumes), before.contexts.map(c => c.resumes), 'no automatic resume');
}

test('Activation failure offers retry; pointer, native keyboard and simultaneous touch each trigger once', browserOptions, async t => {
  const { base, page, context } = await realBrowser(t);
  await observeAudio(context, { rejectResumes: 1 });
  await openHome(page, base);
  assert.deepEqual((await snapshot(page)).contexts, [], 'arrival must not construct an AudioContext');
  await assertControlsEnabled(page);

  await pad(page, 1).click(); // Real pointerdown + compatibility click, not dispatchEvent.
  await page.waitForFunction(() => /retry/i.test(document.querySelector('[data-status]')?.textContent ?? ''));
  assert.equal(await instrument(page).getByRole('status').textContent(),
    'Could not start sound. Tap a pad or press Record / Play to retry.');
  assert.equal(await instrument(page).getByRole('status').evaluate(element => element.classList.contains('sr-only')), false);
  await assertControlsEnabled(page);
  assert.equal((await snapshot(page)).starts.length, 0);

  await pad(page, 1).click();
  await page.waitForFunction(() => window.__ambientBrowserProbe().starts.length === 1);
  assert.equal((await snapshot(page)).contexts[0].state, 'running');
  assert.equal((await snapshot(page)).starts.length, 1, 'retry unlocks and plays the requested pad exactly once');
  assert.equal(await instrument(page).getByRole('status').evaluate(element => element.classList.contains('sr-only')), true);
  for (const key of ['Enter', 'Space']) {
    await pad(page, 2).focus();
    const before = (await snapshot(page)).starts.length;
    await page.keyboard.down(key);
    await page.keyboard.down(key); // Playwright emits repeat=true for an already-held key.
    await page.keyboard.down(key);
    await page.keyboard.up(key);
    assert.equal((await snapshot(page)).starts.length, before + 1, `${key} repeat cannot retrigger a pad`);
  }

  const pointerBox = await pad(page, 1).boundingBox();
  assert.ok(pointerBox);
  const beforeMixed = (await snapshot(page)).starts.length;
  await page.mouse.move(pointerBox.x + pointerBox.width / 2, pointerBox.y + pointerBox.height / 2);
  await page.mouse.down();
  await pad(page, 2).focus();
  await page.keyboard.press('Enter');
  await page.mouse.up();
  assert.equal((await snapshot(page)).starts.length, beforeMixed + 2, 'a held pointer and keyboard can play together');

  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  const points = await Promise.all([3, 4].map(async (number, id) => {
    const box = await pad(page, number).boundingBox();
    assert.ok(box);
    return { x: box.x + box.width / 2, y: box.y + box.height / 2, id };
  }));
  const beforeTouches = (await snapshot(page)).starts.length;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(150); // Include any generated compatibility click.
  const afterTouches = await snapshot(page);
  assert.equal(afterTouches.starts.length, beforeTouches + 2, 'two simultaneous fingers produce two voices');
  assert.notEqual(afterTouches.starts.at(-1).frequency, afterTouches.starts.at(-2).frequency, 'both touched pads play');
  assert.equal(await instrument(page).locator('[data-held]').count(), 0, 'touch release clears pressed feedback');
  assert.equal(afterTouches.contexts.length, 1, 'retry reuses one context');
  await cdp.detach();
});

test('cold touch unlocks on release; cancelled touches stay silent and warm multi-touch plays on down', browserOptions, async t => {
  const { base, page, context } = await realBrowser(t);
  await observeAudio(context, { requireActivation: true });
  await openHome(page, base);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
  const points = await Promise.all([1, 2].map(async (number, id) => {
    const box = await pad(page, number).boundingBox();
    return { x: box.x + box.width / 2, y: box.y + box.height / 2, id };
  }));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points });
  assert.deepEqual((await snapshot(page)).contexts, [], 'touch-down is not a portable audio activation gesture');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  assert.equal(await instrument(page).locator('[data-held]').count(), 0);
  assert.deepEqual((await snapshot(page)).contexts, [], 'cancelled first touches do not unlock or play');

  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForFunction(() => window.__ambientBrowserProbe().starts.length === 2);
  await page.waitForTimeout(150);
  assert.equal((await snapshot(page)).starts.length, 2, 'both first touches sound once, without compatibility-click doubling');
  assert.equal((await snapshot(page)).contexts.length, 1);

  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points });
  assert.equal((await snapshot(page)).starts.length, 4, 'once unlocked, touch-down has no release delay');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(150);
  assert.equal((await snapshot(page)).starts.length, 4);
  assert.equal(await instrument(page).locator('[data-held]').count(), 0);
});

test('live hits and volume input do not rewrite unrelated transport controls', browserOptions, async t => {
  const { base, page, context } = await realBrowser(t);
  await observeAudio(context);
  await openHome(page, base);
  await pad(page, 1).click();
  await page.waitForFunction(() => window.__ambientBrowserProbe().starts.length === 1);
  await page.evaluate(() => {
    window.__transportMutations = 0;
    const observer = new MutationObserver(records => { window.__transportMutations += records.length; });
    for (const element of document.querySelectorAll('[data-record], [data-play], [data-clear], [data-loop-info]')) {
      observer.observe(element, { attributes: true, childList: true, subtree: true, characterData: true });
    }
  });
  await pad(page, 2).click();
  await pad(page, 3).click();
  await instrument(page).getByRole('slider', { name: 'Volume', exact: true }).fill('45');
  assert.equal(await page.evaluate(() => window.__transportMutations), 0);

  await button(page, 'Record').click();
  await page.evaluate(() => { window.__transportMutations = 0; });
  await pad(page, 2).click();
  await pad(page, 3).click();
  assert.match(await instrument(page).locator('[data-loop-info]').textContent(), /2 events/);
  assert.equal(await page.evaluate(() => window.__transportMutations), 2, 'recorded hits update only their event count, not transport controls');
});

test('Hidden-tab lifecycle preserves committed layers, discards unfinished overdub and resumes with Play', browserOptions, async t => {
  const { base, page, context } = await realBrowser(t);
  await observeAudio(context);
  await openHome(page, base);
  await recordLoop(page);
  await button(page, 'Overdub').click();
  await pad(page, 2).click();
  await button(page, 'Finish overdub').click();
  assert.match(await instrument(page).locator('[data-loop-info]').textContent(), /2 events/);
  await button(page, 'Overdub').click();
  const committedFrequencies = new Set((await snapshot(page)).starts.map(voice => voice.frequency));
  await pad(page, 3).click();
  assert.ok((await snapshot(page)).starts.some(voice => !committedFrequencies.has(voice.frequency)), 'unfinished overdub is live-monitored');
  assert.match(await instrument(page).locator('[data-loop-info]').textContent(), /3 events/);

  // Headless Chromium keeps background tabs visible even after bringToFront().
  // Exercise the visibility API boundary explicitly; this is not OS tab coverage.
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForFunction(() => window.__ambientBrowserProbe().contexts.every(c => c.state === 'suspended'));
  assert.match(await instrument(page).getByRole('status').textContent(), /Play.*resume/i);
  assert.match(await instrument(page).locator('[data-loop-info]').textContent(), /2 events/);
  await assertControlsEnabled(page);
  await assertNoNewSound(page);
  await page.evaluate(() => {
    delete document.hidden;
    delete document.visibilityState;
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await assertNoNewSound(page);
  assert.equal(await button(page, 'Play').isEnabled(), true);

  const beforeResume = await snapshot(page);
  const beforePlay = beforeResume.starts.length;
  await button(page, 'Play').click();
  await page.waitForTimeout(2400);
  const resumed = await snapshot(page);
  assert.equal(resumed.contexts.length, beforeResume.contexts.length, 'Play reuses the suspended context');
  assert.equal(resumed.contexts[0].state, 'running');
  assert.equal(resumed.contexts[0].resumes, beforeResume.contexts[0].resumes + 1, 'Play resumes audio directly');
  const replayed = resumed.starts.slice(beforePlay);
  assert.ok(replayed.length >= 4, 'both committed events replay across loop boundaries');
  assert.equal(committedFrequencies.size, 2);
  assert.deepEqual(new Set(replayed.map(voice => voice.frequency)), committedFrequencies, 'only committed layers return');
  await button(page, 'Stop').click();
  await assertNoNewSound(page);
});

test('Astro Home → Blog → Home and Back/Forward dispose audio and mount silent, empty instruments', browserOptions, async t => {
  const { base, page, context } = await realBrowser(t);
  await observeAudio(context);
  await openHome(page, base);
  const documentId = (await snapshot(page)).documentId;
  await recordLoop(page);

  async function departed() {
    await page.waitForURL(`${base}/blog`);
    await instrument(page).waitFor({ state: 'detached' });
    await page.waitForFunction(() => window.__ambientBrowserProbe().contexts.every(c => c.state === 'closed'));
    assert.equal((await snapshot(page)).documentId, documentId, 'exercise Astro swaps, not full reloads');
    await assertNoNewSound(page);
  }
  async function returned() {
    await page.waitForURL(`${base}/`);
    await page.waitForFunction(() => document.querySelector('[data-pad]')?.disabled === false);
    assert.equal((await snapshot(page)).documentId, documentId);
    await assertControlsEnabled(page);
    assert.equal(await instrument(page).locator('[data-loop-info]').textContent(), 'No loop yet');
    assert.ok((await snapshot(page)).contexts.every(c => c.state === 'closed'));
    await assertNoNewSound(page);
    const before = await snapshot(page);
    await pad(page, 1).click();
    await page.waitForFunction(() => window.__ambientBrowserProbe().contexts.at(-1)?.state === 'running');
    const after = await snapshot(page);
    assert.equal(after.contexts.length, before.contexts.length + 1, 'one new context per intentional reactivation');
    assert.equal(after.starts.length, before.starts.length + 1, 'no stale input listeners or replayed loop');
    assert.equal(after.starts.at(-1).context, after.contexts.length - 1);
  }

  await blogLink(page).click();
  await departed();
  await page.getByRole('link', { name: 'Go back to the homepage', exact: true }).click();
  await returned();
  await page.goBack(); // Second Home → Blog.
  await departed();
  await page.goBack(); // Blog → original Home entry.
  await returned();
  await page.goForward();
  await departed();
  await page.goForward();
  await returned();
});

test('Synthetic pagehide/pageshow (including persisted) clean up and remount once; not a true BFCache test', browserOptions, async t => {
  const { base, page, context } = await realBrowser(t);
  await observeAudio(context);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await openHome(page, base);
  await recordLoop(page);

  for (const persisted of [false, true]) {
    // dispatchEvent exercises handlers only: persisted=true does not freeze or
    // restore a document, and cannot establish real browser BFCache eligibility.
    await page.evaluate(persisted => window.dispatchEvent(new PageTransitionEvent('pagehide', { persisted })), persisted);
    await page.waitForFunction(() => window.__ambientBrowserProbe().contexts.every(c => c.state === 'closed'));
    const before = await snapshot(page);
    await pad(page, 1).evaluate(element => element.click()); // The old root must have no live handlers.
    await assertNoNewSound(page);
    assert.equal((await snapshot(page)).starts.length, before.starts.length);
    await page.evaluate(persisted => {
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted }));
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted }));
    }, persisted);
    await assertControlsEnabled(page);
    assert.equal(await instrument(page).locator('[data-loop-info]').textContent(), 'No loop yet');
    await assertNoNewSound(page);
    await pad(page, 1).click();
    await page.waitForFunction(() => window.__ambientBrowserProbe().contexts.at(-1)?.state === 'running');
    const after = await snapshot(page);
    assert.equal(after.contexts.length, before.contexts.length + 1);
    assert.equal(after.starts.length, before.starts.length + 1, 'duplicate pageshow cannot duplicate pad listeners');
    assert.deepEqual(after.lifecycle.slice(-3), [
      { type: 'pagehide', persisted, trusted: false },
      { type: 'pageshow', persisted, trusted: false },
      { type: 'pageshow', persisted, trusted: false },
    ]);
  }
  assert.deepEqual(errors, []);
});

test('Sine-only audio makes no sample requests; volume and mute do not unlock sound', browserOptions, async t => {
  const { base, page, context } = await realBrowser(t);
  await observeAudio(context);
  const errors = [];
  const requests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => {
    if (/\/audio\/|\.(wav|mp3|ogg)(?:\?|$)/i.test(request.url())) requests.push(request.url());
  });
  await openHome(page, base);
  await assertControlsEnabled(page);
  assert.equal(await button(page, 'Enable sound').count(), 0);
  assert.equal(await instrument(page).getByRole('combobox').count(), 0);
  assert.deepEqual((await snapshot(page)).contexts, [], 'arrival does not construct audio');
  await assertNoNewSound(page);

  const volume = instrument(page).getByRole('slider', { name: 'Volume', exact: true });
  await volume.fill('50');
  assert.equal(await volume.getAttribute('aria-valuetext'), '50 percent');
  await volume.fill('60');
  assert.equal(await volume.getAttribute('aria-valuetext'), '60 percent');
  await button(page, 'Mute').click();
  assert.equal(await instrument(page).locator('[data-mute]').getAttribute('aria-pressed'), 'true');
  await button(page, 'Mute').click();
  assert.equal(await button(page, 'Play').isDisabled(), true);
  await assertNoNewSound(page);
  assert.deepEqual((await snapshot(page)).contexts, [], 'output controls do not unlock audio');

  await pad(page, 1).click();
  await page.waitForFunction(() => window.__ambientBrowserProbe().starts.length === 1);
  assert.equal((await snapshot(page)).contexts[0].state, 'running');
  assert.deepEqual((await snapshot(page)).starts.map(voice => voice.kind), ['sine']);
  await recordLoop(page);
  await button(page, 'Stop').click();
  await assertNoNewSound(page);
  assert.ok((await snapshot(page)).starts.every(voice => voice.kind === 'sine'));

  await blogLink(page).click();
  await page.waitForURL(`${base}/blog`);
  await page.waitForFunction(() => window.__ambientBrowserProbe().contexts.every(c => c.state === 'closed'));
  await page.getByRole('link', { name: 'Go back to the homepage', exact: true }).click();
  await page.waitForURL(`${base}/`);
  await page.waitForFunction(() => document.querySelector('[data-pad]')?.disabled === false);
  await assertNoNewSound(page);
  const before = await snapshot(page);
  await pad(page, 2).click();
  await page.waitForFunction(() => window.__ambientBrowserProbe().contexts.at(-1)?.state === 'running');
  const after = await snapshot(page);
  assert.equal(after.contexts.length, before.contexts.length + 1);
  assert.equal(after.starts.length, before.starts.length + 1);
  assert.equal(after.starts.at(-1).kind, 'sine');
  assert.deepEqual(requests, [], 'arrival, pad hits, looping and remount never fetch samples');
  assert.deepEqual(errors, []);
});

test('Audio interruption stops sound without disabling controls; Play resumes the committed loop', browserOptions, async t => {
  const { base, page, context } = await realBrowser(t);
  await observeAudio(context);
  await openHome(page, base);
  await recordLoop(page);

  // Real context suspension exercises the audio statechange boundary, not an
  // operating-system interruption or a browser-specific interrupted state.
  await page.evaluate(() => window.__interruptAmbientAudio());
  await page.waitForFunction(() => /interrupted/i.test(document.querySelector('[data-status]')?.textContent ?? ''));
  await assertControlsEnabled(page);
  assert.equal(await button(page, 'Play').isEnabled(), true);
  assert.match(await instrument(page).getByRole('status').textContent(), /Play.*resume/i);
  await assertNoNewSound(page);
  const before = await snapshot(page);
  await button(page, 'Play').click();
  await page.waitForFunction(() => /Playing/.test(document.querySelector('[data-status]')?.textContent ?? ''));
  await page.waitForTimeout(1200);
  const after = await snapshot(page);
  assert.equal(after.contexts.length, before.contexts.length);
  assert.equal(after.contexts[0].state, 'running');
  assert.equal(after.contexts[0].resumes, before.contexts[0].resumes + 1);
  assert.ok(after.starts.length > before.starts.length, 'Play resumes loop scheduling after audio resumes');
  await button(page, 'Stop').click();
  await assertNoNewSound(page);
});
