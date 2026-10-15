import assert from 'node:assert/strict';
import { after, before, test as nodeTest } from 'node:test';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import ts from 'typescript';

// Use the project's explicit browser path or Playwright's cached Chromium.
// As with the other browser suites, a checkout without a browser skips these tests.
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ?? chromium.executablePath();
const browserOptions = {
  skip: !existsSync(executablePath) && 'Install Chromium or set PLAYWRIGHT_CHROMIUM_EXECUTABLE',
  timeout: 30000,
};
const test = (name, run) => nodeTest(name, browserOptions, run);
let browser;
let server;
let base;
before(async () => {
  if (browserOptions.skip) return;
  server = createServer(async (request, response) => {
    try {
      const path = new URL(request.url, 'http://localhost').pathname;
      if (path === '/') return response.end('<!doctype html><title>Audio seam tests</title>');
      if (path.startsWith('/src/lib/lib-ambient-pad/ambient-')) {
        const sourcePath = path.endsWith('.ts') ? path : `${path}.ts`;
        const source = await readFile(new URL(`..${sourcePath}`, import.meta.url), 'utf8');
        response.setHeader('Content-Type', 'text/javascript');
        return response.end(ts.transpileModule(source, {
          compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
        }).outputText);
      }
      response.writeHead(404).end();
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ executablePath, headless: true });
});
after(async () => {
  await browser?.close();
  if (server) await new Promise(resolve => server.close(resolve));
});

async function pageFor(t) {
  const page = await browser.newPage();
  t.after(() => page.close());
  await page.goto(base);
  await page.evaluate(async () => {
    window.AmbientAudio = (await import('/src/lib/lib-ambient-pad/ambient-audio')).AmbientAudio;
  });
  return page;
}

// The lifecycle adapter controls suspension/races, but every audio node and
// rendered sample comes from Chromium's genuine OfflineAudioContext.
async function offlineFor(t, seconds = 3) {
  const page = await pageFor(t);
  await page.evaluate(seconds => {
    window.contexts = [];
    window.AudioContext = class extends EventTarget {
      state = 'suspended';
      offline = new OfflineAudioContext(1, 24000 * seconds, 24000);
      constructor() { super(); contexts.push(this); }
      get currentTime() { return this.offline.currentTime; }
      get destination() { return this.offline.destination; }
      createGain() { return this.offline.createGain(); }
      createOscillator() { return this.offline.createOscillator(); }
      changeState(state) { this.state = state; this.dispatchEvent(new Event('statechange')); }
      async resume() { this.changeState('running'); }
      async suspend() { this.changeState('suspended'); }
      async close() { this.changeState('closed'); }
    };
    window.render = async context => Array.from((await context.offline.startRendering()).getChannelData(0));
  }, seconds);
  return page;
}

// These tests verify the workaround's activation/lifecycle, not the physical
// iPhone Silent switch. Audibility with that switch on still needs device QA.
for (const device of ['iPhone', 'iPad-desktop']) {
  test(`iOS media channel starts within activation and unloads on pause/disposal (${device})`, async t => {
    const page = await offlineFor(t);
    const result = await page.evaluate(async device => {
      Object.defineProperty(navigator, 'userAgent', { value: device === 'iPhone'
        ? 'Mozilla/5.0 (iPhone)' : 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)' });
      Object.defineProperty(navigator, 'maxTouchPoints', { value: 5 });
      const elements = [];
      HTMLMediaElement.prototype.load = function () {};
      HTMLMediaElement.prototype.play = function () { elements.push(this); return Promise.resolve(); };
      HTMLMediaElement.prototype.pause = function () {};
      const audio = new AmbientAudio(() => {});
      const initial = elements.length;
      const enabling = audio.enable();
      const synchronous = elements.length === 1;
      await enabling;
      const first = elements[0];
      const settings = { loop: first.loop, muted: first.muted,
        remote: first.disableRemotePlayback, src: first.getAttribute('src') };
      audio.suspend();
      const unloaded = !first.hasAttribute('src');
      window.dispatchEvent(new Event('click'));
      const noAutoResume = elements.length === 1 && !audio.ready;
      await audio.enable();
      const recreated = elements.length === 2 && elements[1] !== first;
      contexts[0].changeState('interrupted');
      const interrupted = !audio.ready && !elements[1].hasAttribute('src');
      await audio.enable();
      audio.dispose();
      return { initial, synchronous, settings, unloaded, noAutoResume, recreated, interrupted,
        disposed: !elements[2].hasAttribute('src') };
    }, device);
    assert.deepEqual(result, { initial: 0, synchronous: true,
      settings: { loop: true, muted: false, remote: true, src: '/audio/ambient-silence.mp3' },
      unloaded: true, noAutoResume: true, recreated: true, interrupted: true, disposed: true });
  });
}

test('failed iOS media activation unloads the element and can be retried', async t => {
  const page = await offlineFor(t);
  const result = await page.evaluate(async () => {
    Object.defineProperty(navigator, 'userAgent', { value: 'Mozilla/5.0 (iPhone)' });
    const elements = [];
    HTMLMediaElement.prototype.load = function () {};
    HTMLMediaElement.prototype.pause = function () {};
    HTMLMediaElement.prototype.play = function () {
      elements.push(this);
      return elements.length === 1 ? Promise.reject(new Error('Playback blocked')) : Promise.resolve();
    };
    const audio = new AmbientAudio(() => {});
    let error;
    try { await audio.enable(); } catch (e) { error = e.message; }
    const failedReady = audio.ready;
    const unloaded = !elements[0].hasAttribute('src');
    await audio.enable();
    const ready = audio.ready;
    audio.dispose();
    return { error, failedReady, unloaded, ready, attempts: elements.length };
  });
  assert.deepEqual(result, { error: 'Playback blocked', failedReady: false, unloaded: true,
    ready: true, attempts: 2 });
});

test('activation is explicit and resume is invoked synchronously in enable', async t => {
  const page = await pageFor(t);
  const result = await page.evaluate(async () => {
    const NativeContext = window.AudioContext;
    const contexts = [];
    let resumed = false;
    let mediaPlays = 0;
    HTMLMediaElement.prototype.play = function () {
      mediaPlays++;
      return Promise.reject(new Error('Desktop should not need silent media'));
    };
    window.AudioContext = class extends NativeContext {
      constructor() { super(); contexts.push(this); }
      resume() { resumed = true; return super.resume(); }
    };
    const audio = new AmbientAudio(() => {});
    const initial = { count: contexts.length, ready: audio.ready, time: audio.currentTime };
    const enabling = audio.enable();
    const synchronousResume = resumed;
    await enabling;
    const enabled = audio.ready;
    const clockMatches = audio.currentTime === contexts[0].currentTime;
    audio.dispose();
    return { initial, synchronousResume, enabled, clockMatches, mediaPlays };
  });
  assert.deepEqual(result, {
    initial: { count: 0, ready: false, time: 0 },
    synchronousResume: true, enabled: true, clockMatches: true, mediaPlays: 0,
  });
});

test('twelve A3–C6 C-major pentatonic pads render scheduled, gently enveloped two-second sine notes', async t => {
  const page = await offlineFor(t);
  const result = await page.evaluate(async () => {
    const { pads } = await import('/src/lib/lib-ambient-pad/ambient-kit');
    const notes = [];
    for (const pad of pads) {
      const audio = new AmbientAudio(() => {});
      await audio.enable();
      audio.trigger({ soundId: pad.id, when: 0.25 });
      const data = await render(contexts.at(-1));
      const peak = (from, to) => Math.max(...data.slice(from * 24000, to * 24000).map(Math.abs));
      let crossings = 0;
      for (let i = 12001; i < 36000; i++) if (data[i - 1] <= 0 && data[i] > 0) crossings++;
      notes.push({ label: pad.label, id: pad.id, frequency: pad.frequency, crossings,
        before: peak(0, 0.25), attack: peak(0.25, 0.255), peak: peak(0.5, 1.5),
        release: peak(2.245, 2.25), after: peak(2.25, 3) });
      audio.dispose();
    }
    return notes;
  });
  assert.deepEqual(result.map(note => note.label),
    ['A3', 'C4', 'D4', 'E4', 'G4', 'A4', 'C5', 'D5', 'E5', 'G5', 'A5', 'C6']);
  assert.equal(new Set(result.map(note => note.id)).size, 12);
  const frequencies = [220, 261.626, 293.665, 329.628,
    391.995, 440, 523.251, 587.33, 659.255, 783.991, 880, 1046.502];
  result.forEach((note, index) => {
    assert.ok(Math.abs(note.frequency - frequencies[index]) < 0.001, note.label);
    assert.ok(Math.abs(note.crossings - frequencies[index]) < 2, note.label);
    assert.equal(note.before, 0);
    assert.ok(note.peak > 0.001 && note.peak <= 1 / 32);
    assert.ok(note.attack < note.peak / 8);
    assert.ok(note.release < note.peak / 8);
    assert.equal(note.after, 0);
  });
});

test('overlapping voices include future starts in the 32-voice headroom budget', async t => {
  const page = await offlineFor(t);
  const result = await page.evaluate(async () => {
    const audio = new AmbientAudio(() => {});
    await audio.enable();
    for (let i = 0; i < 100; i++) audio.trigger({ soundId: 'a4', when: 0.25 });
    const data = await render(contexts[0]);
    audio.dispose();
    return Math.max(...data.map(Math.abs));
  });
  assert.ok(result > 0.7, 'Repeated triggers overlap rather than replacing the same pad');
  assert.ok(result <= 0.801, 'Even scheduled voices stay below full scale at volume 1');
});

test('stop silences both active and scheduled voices without disabling live playing', async t => {
  const page = await offlineFor(t);
  const result = await page.evaluate(async () => {
    const audio = new AmbientAudio(() => {});
    await audio.enable();
    audio.trigger({ soundId: 'a4', when: 0 });
    audio.trigger({ soundId: 'c6', when: 1 });
    const context = contexts[0];
    const paused = context.offline.suspend(0.5);
    const rendering = render(context);
    await paused;
    audio.stop();
    const ready = audio.ready;
    await context.offline.resume();
    const data = await rendering;
    audio.dispose();
    return { ready, before: Math.max(...data.slice(2400, 9600).map(Math.abs)),
      after: Math.max(...data.slice(12480).map(Math.abs)) };
  });
  assert.equal(result.ready, true);
  assert.ok(result.before > 0.01);
  assert.equal(result.after, 0);
});

for (const ending of ['natural', 'stop', 'steal']) {
  test(`sine voices disconnect and leave the active set after ${ending} cleanup`, async t => {
    const page = await offlineFor(t);
    const result = await page.evaluate(async ending => {
      const audio = new AmbientAudio(() => {});
      await audio.enable();
      const context = contexts[0];
      const sources = [];
      const gains = [];
      const ended = [];
      // Observe real nodes without reaching into the engine's private voice set.
      for (const method of ['createGain', 'createOscillator']) {
        const create = context[method].bind(context);
        context[method] = () => {
          const node = create();
          const counts = { disconnects: 0, stops: 0 };
          const disconnect = node.disconnect.bind(node);
          node.disconnect = (...args) => { counts.disconnects++; return disconnect(...args); };
          if (method === 'createGain') gains.push(counts);
          else {
            sources.push(counts);
            const stop = node.stop.bind(node);
            node.stop = (...args) => { counts.stops++; return stop(...args); };
            ended.push(new Promise(resolve => node.addEventListener('ended', resolve, { once: true })));
          }
          return node;
        };
      }
      const count = ending === 'steal' ? 33 : 2;
      for (let i = 0; i < count; i++) audio.trigger({ soundId: 'a4', when: 0.25 });
      if (ending === 'stop') {
        audio.stop();
        audio.stop();
      }
      const immediate = sources.map((source, i) => [source.disconnects, gains[i].disconnects, source.stops]);
      await render(context);
      await Promise.all(ended);
      // Neither stop nor disposal should revisit voices already released.
      audio.stop();
      const ready = audio.ready;
      audio.dispose();
      return { immediate, ready,
        final: sources.map((source, i) => [source.disconnects, gains[i].disconnects, source.stops]) };
    }, ending);
    const count = ending === 'steal' ? 33 : 2;
    const silenced = i => ending === 'stop' || (ending === 'steal' && i === 0);
    assert.deepEqual(result.immediate, Array.from({ length: count }, (_, i) =>
      silenced(i) ? [1, 1, 2] : [0, 0, 1]));
    assert.deepEqual(result.final, Array.from({ length: count }, (_, i) =>
      [1, 1, silenced(i) ? 2 : 1]));
    assert.equal(result.ready, true);
  });
}

test('volume clamps to [0,1] without unlocking audio', async t => {
  const page = await offlineFor(t);
  const peaks = await page.evaluate(async () => {
    const peaks = [];
    for (const volume of [1, 0.5, 10, -1]) {
      const audio = new AmbientAudio(() => {});
      const before = contexts.length;
      audio.setVolume(volume);
      if (contexts.length !== before) throw Error('Volume must not unlock audio');
      await audio.enable();
      audio.trigger({ soundId: 'a4', when: 0 });
      const data = await render(contexts.at(-1));
      peaks.push(Math.max(...data.map(Math.abs)));
      audio.dispose();
    }
    return peaks;
  });
  assert.ok(peaks[0] > 0);
  assert.equal(peaks[1], peaks[0] / 2);
  assert.equal(peaks[2], peaks[0]);
  assert.equal(peaks[3], 0);
});

test('intentional suspension stops audio and needs explicit enable', async t => {
  const page = await offlineFor(t);
  const result = await page.evaluate(async () => {
    let interruptions = 0;
    const audio = new AmbientAudio(() => { interruptions++; });
    await audio.enable();
    audio.trigger({ soundId: 'a4', when: 0 });
    audio.trigger({ soundId: 'a4', when: 1 });
    audio.suspend();
    const suspendedReady = audio.ready;
    contexts[0].changeState('running'); // An OS resume must not unlock the instrument.
    const unsolicitedReady = audio.ready;
    audio.trigger({ soundId: 'c6', when: 0 });
    await audio.enable();
    const enabledReady = audio.ready;
    const peak = Math.max(...(await render(contexts[0])).map(Math.abs));
    audio.dispose();
    return { interruptions, suspendedReady, unsolicitedReady, enabledReady, peak };
  });
  assert.deepEqual(result, { interruptions: 0, suspendedReady: false,
    unsolicitedReady: false, enabledReady: true, peak: 0 });
});

for (const state of ['suspended', 'interrupted']) {
  test(`unexpected ${state} context notifies once, silences scheduled audio, and cannot auto-resume`, async t => {
    const page = await offlineFor(t);
    const result = await page.evaluate(async state => {
      const callbackReadiness = [];
      const audio = new AmbientAudio(() => callbackReadiness.push(audio.ready));
      await audio.enable();
      audio.trigger({ soundId: 'a4', when: 1 });
      contexts[0].changeState(state);
      contexts[0].changeState(state);
      contexts[0].changeState('running');
      const unsolicitedReady = audio.ready;
      audio.trigger({ soundId: 'a4', when: 0 });
      await audio.enable();
      const enabledReady = audio.ready;
      const peak = Math.max(...(await render(contexts[0])).map(Math.abs));
      audio.suspend();
      audio.dispose();
      contexts[0].changeState(state);
      return { callbackReadiness, unsolicitedReady, enabledReady, peak };
    }, state);
    assert.deepEqual(result, { callbackReadiness: [false], unsolicitedReady: false, enabledReady: true, peak: 0 });
  });
}

for (const action of ['dispose', 'suspend', 'interrupt', 'reenable']) {
  test(`${action} invalidates pending activation without late readiness`, async t => {
    const page = await offlineFor(t);
    const result = await page.evaluate(async action => {
      const resume = AudioContext.prototype.resume;
      let release;
      AudioContext.prototype.resume = function () {
        this.changeState('running');
        return new Promise(resolve => { release = resolve; });
      };
      let interruptions = 0;
      const audio = new AmbientAudio(() => { interruptions++; });
      const pending = audio.enable().then(() => 'resolved', error => error.name);
      const pendingReady = audio.ready;
      AudioContext.prototype.resume = resume;
      if (action === 'interrupt') contexts[0].changeState('interrupted');
      else if (action === 'reenable') await audio.enable();
      else audio[action]();
      // Even an unsolicited running transition cannot rehabilitate the old enable.
      if (action === 'interrupt') contexts[0].changeState('running');
      release();
      const outcome = await pending;
      const readyAfter = audio.ready;
      const retry = await audio.enable().then(() => 'resolved', () => 'rejected');
      audio.dispose();
      audio.dispose();
      return { pendingReady, outcome, readyAfter, retry, interruptions,
        ready: audio.ready, state: contexts[0].state, contexts: contexts.length };
    }, action);
    assert.deepEqual(result, { pendingReady: false, outcome: 'AbortError', readyAfter: action === 'reenable',
      retry: action === 'dispose' ? 'rejected' : 'resolved', interruptions: action === 'interrupt' ? 1 : 0,
      ready: false, state: 'closed', contexts: 1 });
  });
}

test('resume rejection can be retried, and suspension during pending resume cannot later unlock sound', async t => {
  const page = await offlineFor(t);
  const result = await page.evaluate(async () => {
    const resume = AudioContext.prototype.resume;
    AudioContext.prototype.resume = () => Promise.reject(new Error('Activation denied'));
    const audio = new AmbientAudio(() => {});
    const failed = await audio.enable().then(() => false, () => true);
    const failedReady = audio.ready;
    let release;
    AudioContext.prototype.resume = function () {
      this.changeState('running');
      return new Promise(resolve => { release = resolve; });
    };
    const pending = audio.enable().then(() => 'resolved', error => error.name);
    const loadingReady = audio.ready;
    audio.suspend();
    release();
    const outcome = await pending;
    const lateReady = audio.ready;
    AudioContext.prototype.resume = resume;
    await audio.enable();
    const retryReady = audio.ready;
    audio.dispose();
    return { failed, failedReady, loadingReady, outcome, lateReady, retryReady, contexts: contexts.length };
  });
  assert.deepEqual(result, { failed: true, failedReady: false, loadingReady: false, outcome: 'AbortError',
    lateReady: false, retryReady: true, contexts: 1 });
});

test('real AudioContext suspension notifies and disposal closes the owned context', async t => {
  const page = await pageFor(t);
  const result = await page.evaluate(async () => {
    const NativeContext = AudioContext;
    let context;
    window.AudioContext = class extends NativeContext {
      constructor() { super(); context = this; }
    };
    let notify;
    const interrupted = new Promise(resolve => { notify = resolve; });
    let count = 0;
    const audio = new AmbientAudio(() => { count++; notify(); });
    await audio.enable();
    await context.suspend();
    await interrupted;
    const suspendedReady = audio.ready;
    await audio.enable();
    const resumedReady = audio.ready;
    // Rapid explicit re-enables must not mistake queued intentional suspension
    // events for fresh OS interruptions.
    for (let i = 0; i < 3; i++) {
      audio.suspend();
      await audio.enable();
    }
    audio.dispose();
    if (context.state !== 'closed') await new Promise(resolve => context.addEventListener('statechange', resolve, { once: true }));
    return { suspendedReady, resumedReady, disposedReady: audio.ready, count, state: context.state };
  });
  assert.deepEqual(result, { suspendedReady: false, resumedReady: true, disposedReady: false, count: 1, state: 'closed' });
});
