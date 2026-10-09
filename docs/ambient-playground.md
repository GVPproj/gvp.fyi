# Ambient playground

Home's flat 4×4 instrument sits left of Face, or above it below 761px. It needs JavaScript and Web Audio; the rest of Home remains usable without either. The pads are ready immediately, with sine tones only. The first pad tap or Record/Play press unlocks audio as part of that gesture; arrival stays silent and no samples download. Only pads and a right-hand column of Pixelarticons buttons are visible; there is no separate pedal, last-pad readout, or visible status panel. Buttons retain accessible names and hover titles; transport announcements and loop information remain available to screen readers. Activation errors and missing Web Audio support are also shown visibly.

## Playing

- Pads use C-major pentatonic pitches C3–C6, with two-second, overlapping one-shots. Mouse sounds on pointer-down; cold touch/pen input unlocks and plays on pointer-up, the portable activation gesture. Once audio is running, touch/pen also plays on pointer-down. Cancelled cold touches stay silent. Enter/Space use native button activation. Key autorepeat is ignored. Touch gesture suppression is limited to pads, so scrolling and zooming remain available elsewhere.
- **Record** starts a free-time first pass; **Finish loop** defines its length. No snapping, metronome or count-in. The minimum length is one second; a first pass automatically closes at 8 seconds.
- **Overdub** records continuously against the existing loop. New hits are monitored once and first repeat in the next cycle. **Finish overdub** commits the layer. Overdub while stopped starts playback too.
- **Stop** cancels all voices (including queued starts), discards unfinished first-pass/overdub material, and keeps committed events. **Play** restarts from zero. Live pads still work while stopped.
- **Clear** stops and removes the whole loop, with no undo. Maximum 512 events; live monitoring remains available when full. Maximum 32 voices, replacing the oldest at capacity.
- Master volume/mute applies to monitoring and looping. The native vertical fader supports dragging and arrow keys in one-percentage-point steps, starting at 60%; neither volume nor mute unlocks audio. The record glyph is a circle for the first pass and repeat for overdub. Recording/overdubbing uses a dashed border as well as a red background, so state is not conveyed by color alone.
- Hiding the page or an audio interruption stops playback and discards unfinished material. On return, press Play to unlock audio and restart the loop, or tap a pad for live sound; nothing resumes automatically. Client-side navigation, native departure and restored page instances clear the unsaved loop.

## Modules and clock

- `src/lib/ambient-kit.ts`: stable sound IDs, pad labels, tuning, sample URLs.
- `src/lib/ambient-looper.ts`: first-pass/overdub transactions and event scheduling. Its public port accepts `{ soundId, when }` and `stop()`, with an injected audio clock. Committed and unfinished overdub events track their next occurrence independently, including when a new event enters an already-filled scheduling horizon.
- `src/lib/ambient-audio.ts`: lazy owned AudioContext, oscillator/sample voices, master gain, polyphony, loading and disposal. Both sound modes implement the same scheduled-trigger contract.
- `src/scripts/ambient-pad.ts`: native input, UI state and an idempotent Astro lifecycle coordinator. Page-owned handlers are abortable; timers and voices are disposed on swap/pagehide. BFCache pageshow mounts a fresh silent instance.

The 25ms timer only feeds a 100ms audio scheduling horizon. All event times derive from the original epoch plus an integer cycle number; timer jitter cannot accumulate drift. Cycle selection compares computed onset times rather than rounding a quotient upward, avoiding dropped boundary notes from floating-point cancellation at nonzero epochs. A stall beyond the horizon skips expired occurrences, rather than bursting missed hits. At automatic 8-second closure, opening hits are recovered if the closing tick is less than 100ms late: overdue onsets play immediately, but subsequent cycles retain the original epoch. This avoids losing a whole first replay to normal timer jitter without accumulating drift. This does **not** guarantee uninterrupted playback through arbitrary main-thread stalls or low latency on Bluetooth hardware. Sound tails are independent of loop wrapping.

## Temporary sample kit

The playground no longer exposes the generated sample kit: it always selects sine tones. The audio engine's sample seam and synthesized fixtures remain covered by engine tests. See `public/audio/ambient-test/README.md` for provenance and the reproducible generator.

To replace the temporary kit, keep stable IDs, change the manifest URLs and provide appropriately trimmed, normalized, redistribution-authorized files. MP3 can be decoded through the same seam; retain WAV masters. The fixture kit is deliberately short. Longer sounds require revisiting voice duration/envelopes, transfer and decoded-memory measurements, and polyphony; they are not drop-in acceptance-tested by this version.

## Review

Reviewed against starting commit `57f8628` in separate standards and spec passes. Standards found lost focus when Enable/Play disabled themselves; the follow-up preserves activation focus and sends disabled transport controls to the next relevant action. Spec found dropped opening events on a slightly late maximum-length closure; the follow-up recovers the first replay within the scheduling horizon. Both have regression tests. Real-device/browser verification remains outstanding, not hidden by the automated results.

### Performance and compatibility follow-up

Review against `main` retained the native Web Audio design and required sample-replacement seam; no dependencies, dynamic-import delay or sample preloading were added.

- **Standards:** one non-color-state finding, addressed with a dashed recording/overdub border while preserving the compact controls.
- **Spec:** fixed cold-touch activation before the trusted gesture, floating-point loss of opening boundary notes, and an obsolete test that clicked Stop while the empty transport is disabled Play.
- **Hot paths:** cache icon queries; initialize enabled controls and master volume once; update output controls independently; avoid transport rendering for pad hits (recorded hits update only the event count); iterate committed and overdub events without copying their arrays on every 25ms tick.
- A browser MutationObserver regression measures **0 unrelated transport mutations**, down from **27**, for two live hits plus a volume adjustment. This measures eliminated work, not a claim of perceptibly faster audio on every device.
- Error text is visible on activation failure; unsupported Web Audio leaves controls disabled with an explanation.

## Verification

Approved public test seams: looper/audio-engine API (timing, cancellation, voice generation) and browser UI (activation, inputs, loading and lifecycle). Tests are in `tests/ambient-*.test.js`.

```sh
node --test tests/ambient-looper.test.js tests/ambient-audio.test.js
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/path/to/chrome node --test --test-concurrency=1 tests/ambient-*-browser.test.js
pnpm check
pnpm build
PLAYWRIGHT_CHROMIUM_EXECUTABLE=/path/to/chrome pnpm exec node --test --test-concurrency=1 tests/*.test.js
```

For instrument UI/lifecycle tests, optionally set `PLAYWRIGHT_BASE_URL` to an already-running dev or production-preview origin (without a trailing slash). This bypasses per-test Astro startup. The follow-up used the built static Home/Blog routes on a local server: development-server dependency reloads, including interference from another running Astro server, can otherwise invalidate lifecycle tests. Do not rebuild during a browser run.

Follow-up validation: **43 instrument tests passed, zero failures or skips** (20 audio-engine, 10 looper, 13 browser UI/lifecycle), with the UI/lifecycle suite exercising the production build in Chromium. `pnpm check` and `pnpm build` passed. New regression checks cover cold/cancelled/warm multi-touch, visible activation errors and unavailable Web Audio, unrelated DOM mutations, nonzero-epoch boundaries, and non-color-only recording state. This follow-up did not rerun the entire repository's test suite.

Current Chrome, Firefox and Safari, including iOS Safari and Android Chrome, are the intended browser floor. The implementation uses Web Audio, Pointer Events, abortable listeners, native buttons/range and CSS Grid/Flexbox. Native vertical range controls require Chrome 124+, Firefox 120+ or Safari/iOS 17.4+; older browsers are not the target. No MIDI, framework or worklet is required. There is no instrument motion to disable.

Implementation verification: real Chromium oscillator/sample rendering (including all 16 pitches, envelopes, overlap, headroom and cancellation), pointer/keyboard/emulated multi-touch, loading failure/retry, Astro swaps and history navigation, and synthetic visibility/pagehide/pageshow checks. Desktop 1280px and mobile 320px screenshots were inspected; the automated layout check also verifies 44px minimum pad targets. Fixture byte verification, `pnpm check` and production build pass. The build's existing blog MDX directive warning and three native-audio test type hints are unrelated.

Measured production instrument chunk: **11,192 bytes raw / 4,000 bytes gzip**, with no runtime dependency added. Before this review it was 10,615 / 3,762 bytes; compatibility/error handling adds a small transfer cost while the hot-path changes reduce runtime work. This review deliberately prioritizes correct touch activation and reduced runtime work over shaving bytes via a second, lazily loaded module; audio unlock must stay inside the gesture. The WAV kit totals 1,536,704 bytes. Decode memory depends on the AudioContext sample rate (about 6.1 MB for 16 mono two-second buffers at 48kHz), not just WAV size.

A targeted **Firefox 146.0.1** smoke test passed: initial silence/no audio requests, pointer/Enter input, Record/Overdub/Stop/Play/Clear, vertical fader keyboard/click behavior and actual master gain/mute, and same-document Home → Blog → Home cleanup. No page/console errors. This cached browser is older than Playwright 1.63's expected Firefox; `viewport: null` avoided its protocol mismatch, and the local PulseAudio socket was required for real audio to resume. This is not a full current-Firefox or physical-device suite.

**WebKit/Safari remains unverified:** the cached engine cannot launch because ICU 74 and other required shared-library ABIs are unavailable. Native vertical-range support and portable activation events were checked at the code level; they do not substitute for testing Safari on an actual device.

Automated Chromium checks and screenshots do not establish real-device musical feel, audible quality, accessibility with an actual screen reader, mobile interruption behavior, or Safari/Firefox correctness. Before release, separately audition all pitches/sample mode and maximum-polyphony headroom; test physical multi-touch, lock/unlock and phone/audio interruptions on iOS Safari and Android Chrome, keyboard/screen-reader use on desktop, and real Back/Forward cache restoration across the supported engines.
