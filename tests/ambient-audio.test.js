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
      if (path.startsWith('/src/lib/ambient-')) {
        const source = await readFile(new URL(`..${path}.ts`, import.meta.url), 'utf8');
        response.setHeader('Content-Type', 'text/javascript');
        return response.end(ts.transpileModule(source, {
          compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
        }).outputText);
      }
      if (path.startsWith('/audio/ambient-test/')) {
        response.setHeader('Content-Type', 'audio/wav');
        return response.end(await readFile(new URL(`../public${path}`, import.meta.url)));
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
    window.AmbientAudio = (await import('/src/lib/ambient-audio')).AmbientAudio;
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
      createBufferSource() { return this.offline.createBufferSource(); }
      decodeAudioData(data) { return this.offline.decodeAudioData(data); }
      changeState(state) { this.state = state; this.dispatchEvent(new Event('statechange')); }
      async resume() { this.changeState('running'); }
      async suspend() { this.changeState('suspended'); }
      async close() { this.changeState('closed'); }
    };
    window.render = async context => Array.from((await context.offline.startRendering()).getChannelData(0));
  }, seconds);
  return page;
}

test('activation is explicit and resume is invoked synchronously in enable', async t => {
  const page = await pageFor(t);
  const result = await page.evaluate(async () => {
    const NativeContext = window.AudioContext;
    const contexts = [];
    let resumed = false;
    window.AudioContext = class extends NativeContext {
      constructor() { super(); contexts.push(this); }
      resume() { resumed = true; return super.resume(); }
    };
    const audio = new AmbientAudio(() => {});
    const initial = { count: contexts.length, ready: audio.ready, time: audio.currentTime };
    const enabling = audio.enable('sine');
    const synchronousResume = resumed;
    await enabling;
    const enabled = audio.ready;
    const clockMatches = audio.currentTime === contexts[0].currentTime;
    audio.dispose();
    return { initial, synchronousResume, enabled, clockMatches };
  });
  assert.deepEqual(result, {
    initial: { count: 0, ready: false, time: 0 },
    synchronousResume: true, enabled: true, clockMatches: true,
  });
});

test('sixteen C-major pentatonic pads render scheduled, gently enveloped two-second sine notes', async t => {
  const page = await offlineFor(t);
  const result = await page.evaluate(async () => {
    const { pads } = await import('/src/lib/ambient-kit');
    const notes = [];
    for (const pad of pads) {
      const audio = new AmbientAudio(() => {});
      await audio.enable('sine');
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
    ['C3', 'D3', 'E3', 'G3', 'A3', 'C4', 'D4', 'E4', 'G4', 'A4', 'C5', 'D5', 'E5', 'G5', 'A5', 'C6']);
  assert.equal(new Set(result.map(note => note.id)).size, 16);
  const frequencies = [130.813, 146.832, 164.814, 195.998, 220, 261.626, 293.665, 329.628,
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
    await audio.enable('sine');
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
    await audio.enable('sine');
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

test('volume clamps to [0,1], and mute preserves the chosen volume without unlocking audio', async t => {
  const page = await offlineFor(t);
  const peaks = await page.evaluate(async () => {
    const peaks = [];
    for (const [volume, mute, unmute] of [[1, false], [0.5, false], [10, false], [-1, false], [0.5, true], [0.5, true, true]]) {
      const audio = new AmbientAudio(() => {});
      const before = contexts.length;
      audio.setVolume(volume);
      audio.setMuted(mute);
      if (unmute) audio.setMuted(false);
      if (contexts.length !== before) throw Error('Volume must not unlock audio');
      await audio.enable('sine');
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
  assert.equal(peaks[4], 0);
  assert.equal(peaks[5], peaks[1]);
});

test('samples load only on request with progress, and generated WAV voices match sine timing and pitches', async t => {
  const page = await offlineFor(t);
  const result = await page.evaluate(async () => {
    const { pads } = await import('/src/lib/ambient-kit');
    const nativeFetch = window.fetch;
    let requests = 0;
    window.fetch = (...args) => { requests++; return nativeFetch(...args); };
    const audio = new AmbientAudio(() => {});
    await audio.enable('sine');
    const beforeSamples = requests;
    const progress = [];
    await audio.enable('samples', (loaded, total) => progress.push([loaded, total]));
    const loadedReady = audio.ready;
    await audio.enable('samples');
    const cachedRequests = requests;
    audio.dispose();
    const errors = [];
    for (const pad of pads) {
      const outputs = [];
      for (const mode of ['sine', 'samples']) {
        const engine = new AmbientAudio(() => {});
        await engine.enable(mode);
        engine.trigger({ soundId: pad.id, when: 0.25 });
        outputs.push(await render(contexts.at(-1)));
        engine.dispose();
      }
      errors.push(Math.max(...outputs[0].map((value, i) => Math.abs(value - outputs[1][i]))));
    }
    return { beforeSamples, progress, loadedReady, cachedRequests, errors };
  });
  assert.equal(result.beforeSamples, 0);
  assert.equal(result.loadedReady, true);
  assert.equal(result.cachedRequests, 16);
  assert.deepEqual(result.progress, Array.from({ length: 17 }, (_, i) => [i, 16]));
  for (const error of result.errors) assert.ok(error < 0.00001, `PCM sine agreement: ${error}`);
});

test('intentional suspension stops audio, preserves the decoded kit, and needs explicit enable', async t => {
  const page = await offlineFor(t);
  const result = await page.evaluate(async () => {
    let interruptions = 0;
    let requests = 0;
    const nativeFetch = window.fetch;
    window.fetch = (...args) => { requests++; return nativeFetch(...args); };
    const audio = new AmbientAudio(() => { interruptions++; });
    await audio.enable('samples');
    audio.trigger({ soundId: 'a4', when: 0 });
    audio.trigger({ soundId: 'a4', when: 1 });
    audio.suspend();
    const suspendedReady = audio.ready;
    contexts[0].changeState('running'); // An OS resume must not unlock the instrument.
    const unsolicitedReady = audio.ready;
    audio.trigger({ soundId: 'c6', when: 0 });
    await audio.enable('samples');
    const enabledReady = audio.ready;
    const peak = Math.max(...(await render(contexts[0])).map(Math.abs));
    audio.dispose();
    return { interruptions, requests, suspendedReady, unsolicitedReady, enabledReady, peak };
  });
  assert.deepEqual(result, { interruptions: 0, requests: 16, suspendedReady: false,
    unsolicitedReady: false, enabledReady: true, peak: 0 });
});

for (const state of ['suspended', 'interrupted']) {
  test(`unexpected ${state} context notifies once, silences scheduled audio, and cannot auto-resume`, async t => {
    const page = await offlineFor(t);
    const result = await page.evaluate(async state => {
      const callbackReadiness = [];
      const audio = new AmbientAudio(() => callbackReadiness.push(audio.ready));
      await audio.enable('sine');
      audio.trigger({ soundId: 'a4', when: 1 });
      contexts[0].changeState(state);
      contexts[0].changeState(state);
      contexts[0].changeState('running');
      const unsolicitedReady = audio.ready;
      audio.trigger({ soundId: 'a4', when: 0 });
      await audio.enable('sine');
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

test('dispose aborts pending fetch, blocks late progress/readiness, and is terminal and idempotent', async t => {
  const page = await offlineFor(t);
  const result = await page.evaluate(async () => {
    let release;
    let started;
    const gate = new Promise(resolve => { release = resolve; });
    const entered = new Promise(resolve => { started = resolve; });
    let signal;
    let requests = 0;
    const nativeFetch = window.fetch;
    // Deliberately ignore abort: generation checks must also defend against late results.
    window.fetch = async (url, options) => {
      requests++;
      signal = options?.signal;
      started();
      await gate;
      return nativeFetch(url);
    };
    const audio = new AmbientAudio(() => { throw Error('Disposal is intentional'); });
    const progress = [];
    const pending = audio.enable('samples', (...counts) => progress.push(counts)).then(() => 'resolved', error => error.name);
    await entered;
    const loadingReady = audio.ready;
    audio.dispose();
    audio.dispose();
    const aborted = signal?.aborted ?? false;
    release();
    const outcome = await pending;
    const retry = await audio.enable('sine').then(() => 'resolved', () => 'rejected');
    return { aborted, loadingReady, outcome, retry, ready: audio.ready, requests, progress,
      state: contexts[0].state, contexts: contexts.length };
  });
  assert.deepEqual(result, { aborted: true, loadingReady: false, outcome: 'AbortError', retry: 'rejected',
    ready: false, requests: 1, progress: [[0, 16]], state: 'closed', contexts: 1 });
});

for (const action of ['dispose', 'suspend', 'interrupt', 'switch']) {
  test(`${action} invalidates in-flight decoding without late progress or cached stale buffers`, async t => {
    const page = await offlineFor(t);
    const result = await page.evaluate(async action => {
      let release;
      let started;
      const gate = new Promise(resolve => { release = resolve; });
      const entered = new Promise(resolve => { started = resolve; });
      let decodes = 0;
      const originalDecode = AudioContext.prototype.decodeAudioData;
      AudioContext.prototype.decodeAudioData = async function (data) {
        const buffer = await originalDecode.call(this, data);
        if (++decodes === 1) { started(); await gate; }
        return buffer;
      };
      let signal;
      let requests = 0;
      const nativeFetch = window.fetch;
      window.fetch = (url, options) => { requests++; signal = options?.signal; return nativeFetch(url, options); };
      let interruptions = 0;
      const audio = new AmbientAudio(() => { interruptions++; });
      const progress = [];
      const pending = audio.enable('samples', (...counts) => progress.push(counts)).then(() => 'resolved', error => error.name);
      await entered;
      if (action === 'interrupt') contexts[0].changeState('interrupted');
      else if (action === 'switch') await audio.enable('sine');
      else audio[action]();
      const aborted = signal?.aborted ?? false;
      // Even an unsolicited running transition cannot rehabilitate the old enable.
      if (action === 'interrupt') contexts[0].changeState('running');
      release();
      const outcome = await pending;
      const readyAfter = audio.ready;
      if (action !== 'dispose') await audio.enable('samples');
      audio.dispose();
      return { aborted, outcome, readyAfter, progress, requests, interruptions };
    }, action);
    assert.deepEqual(result, { aborted: true, outcome: 'AbortError', readyAfter: action === 'switch',
      progress: [[0, 16]], requests: action === 'dispose' ? 1 : 17, interruptions: action === 'interrupt' ? 1 : 0 });
  });
}

for (const failure of ['network', 'http', 'decode']) {
  test(`sample ${failure} failure leaves the engine unready and can retry without reloading successful samples`, async t => {
    const page = await offlineFor(t);
    const result = await page.evaluate(async failure => {
      let requests = 0;
      const nativeFetch = window.fetch;
      window.fetch = (url, options) => {
        if (++requests === 2) {
          if (failure === 'network') return Promise.reject(new TypeError('Network unavailable'));
          if (failure === 'http') return Promise.resolve(new Response('', { status: 503 }));
          return Promise.resolve(new Response('Not a WAV file'));
        }
        return nativeFetch(url, options);
      };
      const audio = new AmbientAudio(() => {});
      await audio.enable('sine');
      audio.trigger({ soundId: 'a4', when: 1 });
      const outcome = await audio.enable('samples').then(() => 'resolved', () => 'rejected');
      const failedReady = audio.ready;
      audio.trigger({ soundId: 'a4', when: 0 });
      const progress = [];
      await audio.enable('samples', (...counts) => progress.push(counts));
      const retryReady = audio.ready;
      const peak = Math.max(...(await render(contexts[0])).map(Math.abs));
      audio.dispose();
      return { outcome, failedReady, retryReady, requests, progress, peak };
    }, failure);
    assert.deepEqual(result, { outcome: 'rejected', failedReady: false, retryReady: true, requests: 17,
      progress: Array.from({ length: 16 }, (_, i) => [i + 1, 16]), peak: 0 });
  });
}

test('resume rejection can be retried, and suspension during pending resume cannot later unlock sound', async t => {
  const page = await offlineFor(t);
  const result = await page.evaluate(async () => {
    const resume = AudioContext.prototype.resume;
    AudioContext.prototype.resume = () => Promise.reject(new Error('Activation denied'));
    const audio = new AmbientAudio(() => {});
    const failed = await audio.enable('sine').then(() => false, () => true);
    const failedReady = audio.ready;
    let release;
    AudioContext.prototype.resume = function () {
      this.changeState('running');
      return new Promise(resolve => { release = resolve; });
    };
    const pending = audio.enable('sine').then(() => 'resolved', error => error.name);
    const loadingReady = audio.ready;
    audio.suspend();
    release();
    const outcome = await pending;
    const lateReady = audio.ready;
    AudioContext.prototype.resume = resume;
    await audio.enable('sine');
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
    await audio.enable('sine');
    await context.suspend();
    await interrupted;
    const suspendedReady = audio.ready;
    await audio.enable('sine');
    const resumedReady = audio.ready;
    // Rapid explicit re-enables must not mistake queued intentional suspension
    // events for fresh OS interruptions.
    for (let i = 0; i < 3; i++) {
      audio.suspend();
      await audio.enable('sine');
    }
    audio.dispose();
    if (context.state !== 'closed') await new Promise(resolve => context.addEventListener('statechange', resolve, { once: true }));
    return { suspendedReady, resumedReady, disposedReady: audio.ready, count, state: context.state };
  });
  assert.deepEqual(result, { suspendedReady: false, resumedReady: true, disposedReady: false, count: 1, state: 'closed' });
});

test('sample mode uses the same overlap, polyphony, stop and mode-switch contract', async t => {
  const page = await offlineFor(t);
  const result = await page.evaluate(async () => {
    const audio = new AmbientAudio(() => {});
    await audio.enable('samples');
    for (let i = 0; i < 100; i++) audio.trigger({ soundId: 'a4', when: 0 });
    const context = contexts[0];
    const paused = context.offline.suspend(0.5);
    const rendering = render(context);
    await paused;
    audio.stop();
    audio.trigger({ soundId: 'a4', when: 1 });
    await audio.enable('sine'); // Must cancel the scheduled sample voice too.
    await context.offline.resume();
    const data = await rendering;
    audio.dispose();
    return { before: Math.max(...data.slice(2400, 9600).map(Math.abs)),
      after: Math.max(...data.slice(12480).map(Math.abs)) };
  });
  assert.ok(result.before > 0.7 && result.before <= 0.801);
  assert.equal(result.after, 0);
});
