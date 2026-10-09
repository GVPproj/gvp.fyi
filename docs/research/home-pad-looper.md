# Home-page pad controller and looper

## Status and scope

Research only; no implementation or audio/latency measurements. Inspected ky.fyi's rendering and activation in headless Chromium and fetched its delivered HTML/JavaScript on 2026-10-08. Primary documentation was fetched with Python `urllib` (HTTP results below). Recommendations are proposals, not settled product requirements.

Read `docs/agents/domain.md`, `CONTEXT.md`, `package.json`, `src/pages/index.astro`, `src/layouts/Layout.astro`, `src/components/Face.astro`, `src/styles/global.css`, and `docs/research/client-router-lifecycle.md`. Research notes here use descriptive Markdown headings and explicit verification caveats. No `docs/adr/` directory was present.

Local constraints:

- Home currently renders the animated Face and “Coming soon...”. Whether this instrument replaces or accompanies them is undecided.
- Layout enables Astro ClientRouter by default. A page-local script cannot assume document reload on departure.
- Dependencies include Astro `^7.3.5`; no audio library is installed. Native buttons, CSS Grid and a small browser module fit the existing stack; a UI framework is unnecessary.
- Global main padding is 1.5rem; a narrow-screen 8-column instrument needs its own layout treatment. Face already respects reduced motion.
- No supported-browser policy was established by this limited inspection. Ask before committing to a browser floor.

## Updated direction after user feedback

The user selected a **4×4 controller with 16 pads**, replacing the original 8×8 requirement and all four-bank/variation proposals below. Start with **sine tones at different pitches**; the owner will supply **ambient/soundscape FX samples** later. Retain the on-screen looper proposal. Exact pitches, note durations and looper settings remain proposed rather than confirmed. This is an ambient instrument, not necessarily a beat-oriented drum kit: revisit the short one-shot budgets, two-bar default and quantization assumptions below, and allow sound tails to overlap loop boundaries. Track implementation in [the local ticket](../../tickets/home-ambient-pad-looper.md).

For the first version, create a sine `OscillatorNode` and short gain envelope per hit, scheduled on the same audio-context timeline as loop playback. A brief attack/release prevents abrupt amplitude edges; each pad has a stable sound ID. Keep recorded events independent of the sound generator so a later decoded-sample voice can replace the oscillator without changing the looper or pad UI. Web Audio specifies oscillator waveforms/frequency and gain automation [1].

**MP3 samples work:** fetch each file and decode it into an `AudioBuffer`, then schedule fresh buffer-source voices for hits [1]. MP3 is practical for delivery; retain WAV masters and consider WAV for very short percussion or tightly trimmed attacks. Compressed-file size does not determine decoded-buffer memory. Verify decoded leading silence/padding and attack timing in target browsers rather than assuming every MP3 is sample-perfect at its boundaries. These are one-shot assets; the looper repeats scheduled hits, not concatenated MP3 files.

Suggested first pitch layout for audition: 16 ascending notes from C major pentatonic (C, D, E, G, A), starting at C3 and ending at C6, laid out left-to-right, top-to-bottom. This is a suggestion, not a user-selected tuning. No sample downloads are needed for the sine-tone version. A native 4-column CSS grid also removes the original 8-column phone-width compromise.

The research below retains the initial alternatives for context. **Any 8×8 layout, 64-pad mapping, pitch-variation quadrant, or mobile bank recommendation below is superseded by this 4×4 decision.**

## Original mapping research (superseded)

An **8×8 surface is 64 controls, not necessarily 64 samples**. “MIDI-style” can mean only the appearance and interaction; Web MIDI is not needed to make browser sound.

| Mapping | Meaning of 64 pads with 16 assets | Consequence |
| --- | --- | --- |
| 16 logical sample rows × 4 variations | Each sample has four playback variants of the same buffer | Arrange as two side-by-side 8×4 blocks to retain a physical 8×8. A literal 16×4 is not 8×8. Labels and grouping must explain this. |
| Four visible 4×4 banks/quadrants | Each quadrant contains the same 16 samples, with one variation applying across that quadrant | Simple keyboard bank selection; all 64 remain visible. Four banks of 16 *different* samples would require 64 assets, contrary to this scope. |
| Four identical 4×4 banks | Four copies of the same sounds | Useful only for a deliberate ergonomic/performance reason; otherwise misleading redundancy. |
| Pitch grid | 64 notes derived from 16 recordings | A tuned instrument, not automatically a drum-pad kit; needs root pitches and a scale/layout decision. |
| Step grid | Pads represent time steps rather than live sample triggers | A sequencer with different expectations; do not infer this from the visual reference. |

**Proposed MVP:** 16 owner-provided one-shots, four visible 4×4 quadrants, each repeating the kit with a fixed, clearly labeled playback-rate variation. For auditioning only, try semitone offsets −12, −5, 0, +7 (`rate = 2^(semitones/12)`). Rate changes also change duration; this is not time stretching. Alternatively use the two 8×4 blocks if keeping each sample's variations adjacent proves clearer. These particular variations are not requirements and may sound poor on the actual kit.

Ask before building: **does “64 pads / 16 samples” mean four variations, four banks, or a different interaction?** If the answer is simply “16 sounds”, a 4×4 initial instrument may be more honest than filling 64 pads arbitrarily. Validate this with a labeled static layout and sample audition before engineering the looper.

Keep MVP to one-shot polyphonic triggers, master volume/mute, one fixed-length event loop, and explicit pedal-style buttons. No microphone, waveform editor, export, accounts, persistence, hardware requirement, or effects rack.

## Audio engine: native first, Tone if musical scheduling warrants it

### Native Web Audio

Use one lazily created `AudioContext`, 16 decoded reusable `AudioBuffer`s, a fresh `AudioBufferSourceNode` per hit, per-voice gain if needed, and a master gain. The source's `start(when)` uses the audio context timeline; a source cannot be started twice. Buffers can be shared by overlapping voices. `playbackRate`/`detune` affect playback, and `loop`, `loopStart`, `loopEnd` repeat audio-buffer regions—not a sequence of pad events. These are specified in the Web Audio standard [1].

Track active **and future-scheduled** sources so Stop, Clear and disposal can actually silence them. Remove references on `ended`; briefly ramp gains when cutting active voices to avoid abrupt discontinuities. Choose bounded voice allocation (for example 32 voices with oldest-voice stealing), gain headroom and sample normalization after listening, rather than treating simultaneous full-volume samples as safe.

**Autoplay:** show a native “Enable sound” button and invoke `context.resume()` directly in its user-activation handler; verify running state and handle rejection/interruption. Do not await network loading or a dynamic import before attempting the activation-sensitive resume. Load/decode asynchronously, display progress/errors, and enable recording only when the required kit is ready. Never start sound on page arrival. Chrome documents suspended Web Audio contexts under autoplay policy [3]; Tone also explicitly requires user-initiated `Tone.start()` [4]. This is a conservative cross-browser interaction policy, not a claim that all browser autoplay rules are identical.

### Tone.js tradeoffs (current API checked)

The npm registry's `latest` response returned **15.1.22** during this investigation [4]. Pin/recheck a chosen version during implementation; avoid copying old `Tone.Transport` singleton examples uncritically.

- **Transport:** current examples and tagged source use `Tone.getTransport()`. It supports BPM, looping, `schedule`, `scheduleRepeat`, `clear(id)` and `cancel(after)`. Pass the callback's `time` argument into sound scheduling; calling playback “now” inside the callback throws away accurate timing. Retain owned schedule IDs for cleanup [4, 5].
- **Players / Player:** `Tone.Players` groups named `Player` objects; `players.player(name)` retrieves one, with buffer playback, rate and loop controls. This fits independent unpitched samples better than Sampler. It is not an event recorder or a complete voice-allocation policy. Test repeated same-pad hits and explicitly select retrigger/overlap behavior; do not assume 64 independent voices from a 16-player map. Dispose owned players when leaving [6].
- **Sampler:** maps note names/MIDI pitches to samples, automatically repitches missing notes, and supports attack/release-style polyphony. Good for a tuned instrument, but implicit nearest-note selection is an unwanted abstraction for 16 unrelated percussion sounds with explicit variations. Tone's own API directs non-repitching sample playback toward Player [7].
- `Tone.start()` unlocks audio; `Tone.loaded()` waits for sample loading. Neither substitutes for the other [4]. Tone still needs a state model, permission/error UI, background policy and cleanup. Its transport/context are shared by default; indiscriminate global cancellation can affect future audio features.

**Choose native Web Audio for the proposed bounded MVP.** Its small engine has an explicit mapping and lifecycle without adding a dependency. Consider Tone if tempo automation, musical parts or a pitched Sampler become actual requirements. Compare production bundle and timing behavior before switching; no Tone bundle size was measured.

## Event loop, not recorded audio

An **event loop** stores `{sampleId, variation, gain, positionInBeats}` and replays those triggers. It is cheap to overdub, quantize and change without recording a microphone. Capture resolved sample/variation values rather than pad coordinates, so changing a bank cannot reinterpret a recorded hit.

An **audio loop** stores/render-captures the mixed waveform. It preserves the sound of that performance, but overdub becomes mixing audio, editing individual hits becomes difficult, and tempo changes require rate changes or time stretching. A native buffer source can loop a rendered buffer [1]. MediaRecorder is an encoded media-recording API; its chunk timing is not a sample-accurate musical clock [12]. Do not add it for an event looper. A microphone loop would additionally require a separate capture-permission, monitoring and feedback design.

### Proposed musical contract

Start with **120 BPM, 4/4, two bars (8 beats, 4 seconds)**, one-bar count-in, and optional 1/16-note recording quantization. Offer BPM changes only while stopped, and store positions in beats. Keep loop length fixed for MVP: “first pedal press sets an arbitrary duration” adds unnecessary boundary ambiguity.

| State/control | Proposed behavior |
| --- | --- |
| Empty → Record | Four-beat audible/visible count-in; Cancel available. Ignore count-in pad hits for recording but allow audition. |
| Count-in → Recording | Begin on the scheduled downbeat; record exactly two bars. Monitor pad hits immediately. |
| Recording → Playing | Automatically close the loop at the two-bar boundary and replay. Announce state once. |
| Playing → Overdub | Arm for the next loop boundary; keep old material playing. Capture one additional two-bar pass, then return to Playing. |
| Playing → Stop | Immediate master fade/stop, cancel queued voices, retain event data, reset playhead. |
| Stopped → Play | Restart retained loop at position zero, with a short scheduling lead. |
| Clear | Explicit separate button; stop first, discard loop and pending overdub, return to Empty. Confirm destructive clearing of a nonempty loop or offer undo later. |

Use a large pedal-looking primary Record/Overdub control plus separately labeled Play/Stop and Clear. Do not hide essential functions behind double-click, long-press or an undocumented sequence of pedal taps. Show “Overdub armed”, “Recording”, etc. A product decision remains whether overdub should instead run continuously until toggled.

### Timing contract

- Use `AudioContext.currentTime` as the scheduling clock, not `Date.now()`, animation frames or the time a timer callback happened. A timer only feeds the audio scheduler. Google's Web Audio scheduling guide explains why and demonstrates a **25ms wake-up / 100ms horizon** starting point—not a guaranteed budget [2].
- For fixed tempo, schedule each occurrence from an epoch: `epoch + (cycle * loopBeats + eventBeat) * 60 / bpm`. Deriving from epoch rather than the last callback avoids cumulative drift. Track scheduled occurrences to avoid duplicates; skip expired occurrences after a stall rather than bursting catch-up hits.
- Timestamp live input against the audio clock promptly. Monitor immediately (without adding the full scheduling horizon). For recorded playback, optional nearest-1/16 quantization rounds beat position to 0.25-beat steps. A rounded loop-end hit wraps to position zero. Preserve distinct simultaneous hits; define exact-boundary ownership with half-open recording intervals `[start, end)`.
- Immediate monitoring and quantized replay can intentionally differ. Do not quantize the live hit into the past or play it twice. During an overdub, newly captured hits are monitored once and enter repeating playback on the **next** cycle. Test this specifically near the end boundary, where the scheduler may already have queued part of the next pass; incorporate new events without re-queuing existing ones.
- Schedule count-in clicks on the same audio timeline. UI beat indicators merely follow that clock; they never drive sound. Physical output/input latency still varies by hardware, especially Bluetooth; sample-accurate scheduled playback is not a promise of zero touch-to-sound latency.
- Stop/Clear must stop already-created future sources as well as clear timers/events. If using Tone, removing transport callbacks alone does not silence already-triggered sounds.

## Input, accessibility and narrow screens

Use native `<button type="button">` pads with visible names, sample/variation accessible names, focus indicators, and textual state. Use CSS Grid for the surface; do not add `role="grid"` unless also implementing its focus/keyboard contract. Native buttons remain operable with Enter/Space. Optional single-character performance shortcuts should work only while focus is within the instrument (and not within a form field), with instructions and no repeated triggers from key autorepeat. WCAG covers keyboard operation, character shortcuts, visible focus and non-color-only communication [9].

For low-latency multi-touch, Pointer Events provide per-contact `pointerId`, capture, cancellation and `touch-action` [8]. Trigger once on `pointerdown`; track all contacts rather than rejecting non-primary touches. Clear held visuals on up/cancel/lost capture/blur. Keep a click activation path for keyboard and assistive technology, suppressing the pointer-generated duplicate. No requirement to hold a one-shot pad down.

If gesture suppression is necessary, restrict `touch-action: none` to the actual playing surface, not the document; keep scrolling/zooming paths outside it and test accidental scrolling. Do not disable viewport zoom. Down-event triggering is justified for musical immediacy, but is an explicit pointer-cancellation accessibility tradeoff: WCAG's essential down-event exception must be evaluated, not assumed for every button [9]. Looper controls can use ordinary click/up activation.

Aim for 44px touch targets; WCAG 2.2 AA's target-size minimum is 24 CSS px with specified exceptions [9]. Eight 44px columns already require 352px before gaps and page padding, so do not pretend all phones accommodate them. Choose between a compact 4×4 bank view on narrow screens, or a consciously tested denser/scrollable full surface; preserve logical mapping and labels. Ask whether always-visible 8×8 is non-negotiable.

Respect `prefers-reduced-motion`: no traveling playhead/pulsing pad animation in reduced mode; use static state, text and restrained highlights. Avoid rapid high-contrast flashing in all modes. Announce record/play/error changes through a polite status region, not every pad hit or beat. Audio feedback alone and color alone are insufficient [9]. Provide master mute and keep navigation usable while the instrument loads or fails.

## Optional hardware: Web MIDI is not MVP

Web MIDI delivers MIDI messages/ports; it does not synthesize audio [10]. Only offer an explicit “Connect MIDI” enhancement after the touch/keyboard instrument works. Feature-detect `navigator.requestMIDIAccess`, use HTTPS, request without SysEx, handle denial/disconnection, and use a `Permissions-Policy: midi` policy deliberately. Avoid requesting device access on page load. Map incoming notes/velocity through the same trigger function; treat note-on velocity zero as note-off when implementing held notes. Do not assume all 8×8 hardware shares note numbers or LED protocols.

The W3C API defines permission/security requirements [10]. Retrieved MDN browser-compat-data reports Chromium support from Chrome 43, desktop Firefox from 108 (with site-permission-add-on restrictions), no Firefox Android support, and no Safari/iOS Safari support. This is compatibility-maintainer data, **not an on-device verification**. WebKit's implementation issue was also fetched as first-party tracking evidence; it is not a shipping guarantee [11]. Hardware MIDI must never be required for the home page. Recheck specific supported browsers/devices before shipping; API presence alone does not establish hardware connectivity.

## Background and Astro lifecycle

Background tabs can throttle timers; Chrome's documented behavior includes conditions/exemptions for audible pages, not an all-browser promise [13]. Mobile interruption, screen lock and context suspension must be tested. A worker or Tone Transport is not a guarantee against OS suspension.

**MVP policy:** on becoming hidden, stop playback, preserve committed event data in memory, discard the incomplete recording/overdub pass, and show “Paused while away”. Require explicit Play on return; do not fast-forward and emit missed hits. Clear held inputs on blur. Watch context state and offer re-enable after interruption. Do not promise background performance.

Astro documents that bundled modules execute once while `astro:page-load` fires across client navigation [14]. Use a persistent, once-registered lifecycle coordinator to mount only when the home instrument root exists, with idempotent page-instance setup.

On `astro:before-swap`, dispose the outgoing instrument; do not rely solely on `pagehide` (also noted in the local lifecycle audit). Disposal must:

1. Mark the instance dead; abort asset fetches and ignore late decode/import continuations using an instance generation guard.
2. Stop/fade all active and future voices, cancel scheduler/timers/animation frames, release input and MIDI handlers, disconnect nodes and remove page-owned listeners.
3. Close a solely owned native context, or dispose only owned Tone nodes/events if using a shared context. Do not tear down unrelated site state.
4. Drop page references/buffers as appropriate. Re-entry creates a fresh silent instance; no cross-route playback or `transition:persist` in MVP.

Also handle native `pagehide` and BFCache `pageshow` restoration idempotently; restoration must not revive a dead scheduler automatically. Clean up at committed swap rather than navigation preparation, since preparation can fail or be superseded. Tell users that navigating away clears this unsaved loop; persistence would be a separate feature.

## Assets, licensing and tentative budgets

Prefer 16 short owner-created recordings with documented authority to distribute the recordings and any underlying composition/performance. Being able to stream an existing release is not evidence that its isolated samples can be redistributed. Public audio files can be downloaded; do not ship assets licensed only for inclusion inside finished music.

Maintain an asset manifest: stable ID, filename, original creator/source, exact license/version and retained license text, attribution, modifications, root pitch if relevant, trim/loop points, gain and duration. Public-domain/CC0 or a license explicitly permitting standalone redistribution are candidates; attribution/share-alike/noncommercial restrictions require review for the actual use. **Creative Commons official license/deed endpoints were unavailable (403), so this investigation does not verify any proposed CC asset or its license terms.** Owner-authorized assets are the safest initial path, not a substitute for checking third-party contributors' rights.

Initial targets to validate, **not measured results or guarantees**:

- No sample download or audio start before intentional activation; lazy-load optional library code.
- At most roughly 2MB total encoded kit transfer, roughly 16MiB decoded audio, and 32 concurrent voices. At 48kHz, 16 stereo two-second Float32 buffers alone consume `16 × 2 × 48000 × 2 × 4 = 12,288,000` bytes (~11.7MiB), excluding decoder/browser overhead [1]. Four rate variants should share those buffers rather than quadruple memory.
- Native instrument-specific JS target under 30KB compressed; compare Tone separately, not against an invented size claim.
- First playable kit within about 2s after activation on an agreed test connection; wired-device touch-to-sound goal under 50ms. Measure instead of advertising these. Define tested devices, cold/warm cache and percentile before turning targets into acceptance gates.
- Default test loop: two bars, with a safety event cap (e.g. 512) and explicit “loop full” feedback rather than unbounded overdub growth.

## Open decisions and phased validation

1. **Resolve product semantics:** sample rights/kit, 64-to-16 mapping, Face placement, mobile bank fallback, pitched vs percussive variations, supported browsers, continuous vs one-pass overdub, quantization default, and whether navigation clearing is acceptable. Assume an on-screen controller and pedal for MVP; confirm whether physical MIDI hardware or a physical footswitch was intended.
2. **Static interaction validation:** labeled 8×8 and narrow-screen treatment, pedal states, keyboard route through controls, touch targets, focus, reduced motion and screen-reader announcements. No sound needed to reject a confusing mapping.
3. **Audio spike:** all 16 assets, unlock/error/retry, rate audition, same-pad overlap, master headroom and memory/transfer measurements. Test real iOS Safari, Android Chrome and desktop engines per the agreed policy, not only simulated touch in Chromium.
4. **Looper tests:** deterministic state/quantization tests plus rendered/scheduled timing checks; exact loop boundary, count-in exclusion, no doubled monitored hits, late callback recovery, repeat/overdub caps, stop of queued sources and interruption mid-recording. Listen on actual devices under UI/main-thread load; automation alone does not establish musical feel.
5. **Integration validation:** repeated Home → Likes → Home, Back/Forward, native departures, BFCache, hidden tab/screen lock, rejected loading and late decode after departure. Verify no duplicate handlers, retained voices or multiplying contexts. Run existing `pnpm check`, build and relevant navigation regressions only after implementation.
6. **Optional follow-up:** hardware MIDI and audio export only after evidence of demand. Avoid turning a playful home-page instrument into a DAW.

## Reference inspection and visual direction

The live [ky.fyi home page](https://ky.fyi/) renders a friendly illustrated black keyboard with a rounded enclosure, pale-green LCD-style **PLAY** panel and white/black keys, integrated into the home page. Its SVG markup includes 17 note keys from C3 through E4 and a focusable `#synth` wrapper. Borrow the physical-object invitation and deliberate Play affordance, not its artwork or samples.

The shipped [bootstrap](https://ky.fyi/_astro/Synth.astro_astro_type_script_index_0_lang.A-IEp5T5.js) dynamically imports the engine on clicking Start or pressing Enter/Space and sets a loading state. The [engine](https://ky.fyi/_astro/synth.krTaGQFD.js) embeds Howler (`Howl`/`Howler`) and maps note IDs to offsets/durations inside instrument MP3 audio sprites. It declares piano, harp, xylophone and other sounds, previous/next instrument controls, randomization, pressed-key feedback and a note-staff display. Keyboard performance is gated on ready state and focus within the instrument; mouse/touch handlers are also present. These are observations from delivered code, not claims about private source. Hashed deployment URLs may change. Nothing inspected establishes a looper in the reference; our looping design is an addition.

**Verification limitation:** activation requested the engine and sound assets, but the instrument remained in `loading` after a 45-second wait in this environment. Rendering and activation were browser-inspected; the remaining interaction details above are source-inspected. Audible playback, latency and complete live interaction were not verified. No reference assets were copied into this repository.

### Proposed visual fit

Use this site's Nord colors and Gohu type (`src/styles/global.css`): rounded controller enclosure, 8×8 raised square pads, a small status/tempo display, and a decorative CSS/SVG cable to a separate stompbox-style native button. Show Record/Overdub text on the pedal, with separate Stop and Clear controls. Hide the cable from assistive technology; stack the pedal beneath the controller on narrow screens. Replace `Coming soon...` in `src/pages/index.astro`, leaving Face intact pending a visual decision.

At a 320px viewport, existing main padding leaves approximately 272px before the enclosure. Eight 44px pads require 352px even without gaps. Recommend a selectable enlarged 4×4 bank view on phones while retaining the 8×8 overview; do not silently replace the requested instrument with a 4×4 design. Confirm the compromise in the prototype.

## Sources and retrieval notes

All links below were requested directly with Python; successful fetches returned HTTP 200 unless noted. This is documentary research, not compatibility testing.

1. [W3C Web Audio API](https://www.w3.org/TR/webaudio/): `BaseAudioContext.currentTime`, `AudioBuffer`, `AudioScheduledSourceNode.start`, `AudioBufferSourceNode`, gain and context lifecycle.
2. [Google/web.dev: A tale of two clocks](https://web.dev/articles/audio-scheduling): first-party scheduling guidance, timer jitter and look-ahead examples.
3. [Chrome autoplay policy](https://developer.chrome.com/blog/autoplay/): Web Audio/user activation. [WebKit iOS media policy](https://webkit.org/blog/6784/new-video-policies-for-ios/) also fetched, but video-specific guidance is not treated as a current Web Audio guarantee.
4. [Tone npm latest metadata](https://registry.npmjs.org/tone/latest) and [official README](https://raw.githubusercontent.com/Tonejs/Tone.js/dev/README.md): version, activation/loading and current usage examples. README is a moving dev branch; APIs were cross-checked against 15.1.22 docs/source.
5. [Tone 15.1.22 Transport source](https://github.com/Tonejs/Tone.js/blob/15.1.22/Tone/core/clock/Transport.ts), fetched through [raw GitHub](https://raw.githubusercontent.com/Tonejs/Tone.js/15.1.22/Tone/core/clock/Transport.ts). The attempted generated `/docs/15.1.22/classes/Transport.html` returned **404**; source used instead.
6. [Tone 15.1.22 Players](https://tonejs.github.io/docs/15.1.22/classes/Players.html) and [Player](https://tonejs.github.io/docs/15.1.22/classes/Player.html).
7. [Tone 15.1.22 Sampler](https://tonejs.github.io/docs/15.1.22/classes/Sampler.html).
8. [W3C Pointer Events Level 3](https://www.w3.org/TR/pointerevents3/): pointer identity, capture/cancellation and touch-action.
9. [W3C WCAG 2.2](https://www.w3.org/TR/WCAG22/): Keyboard, Character Key Shortcuts, Pointer Cancellation, Use of Color, Focus Visible, Target Size (Minimum/Enhanced), Animation from Interactions, flashes and Status Messages. Not every cited criterion is AA; 44px and interaction-motion recommendations exceed the AA floor.
10. [W3C Web MIDI API](https://www.w3.org/TR/webmidi/): access, security/permissions, ports and message semantics.
11. [MDN browser-compat-data Navigator](https://raw.githubusercontent.com/mdn/browser-compat-data/main/api/Navigator.json), `requestMIDIAccess` entry; [WebKit Web MIDI implementation tracker](https://bugs.webkit.org/show_bug.cgi?id=107250). Compatibility data is the explicitly identified non-vendor supplement to primary specifications/tracking.
12. [W3C MediaStream Recording](https://www.w3.org/TR/mediastream-recording/): MediaRecorder and timeslice behavior.
13. [Chrome timer throttling](https://developer.chrome.com/blog/timer-throttling-in-chrome-88/): historical documented policy, not a current universal browser contract.
14. [Astro view transitions guide](https://docs.astro.build/en/guides/view-transitions/) returned **403**; its [official repository source](https://raw.githubusercontent.com/withastro/docs/main/src/content/docs/en/guides/view-transitions.mdx) returned **200**, and supplied the lifecycle/script facts.
15. Attempted official [CC0 deed](https://creativecommons.org/publicdomain/zero/1.0/), [CC BY 4.0 deed](https://creativecommons.org/licenses/by/4.0/), and their `legalcode.en` endpoints: **403**. Guessed `cc-legal-tools-data` raw `.txt` fallback paths returned **404**. No retrieved CC legal text or asset-specific licensing evidence.
