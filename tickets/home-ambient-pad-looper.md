# Home-page ambient pad controller and looper

**What to build:** A playful, playable 4×4 pad controller on the home route, visually connected to a looper pedal so visitors can layer little ambient soundscapes.

**Status:** implemented; real-device audition and Safari/Firefox verification pending

**Implementation notes:** [Behavior, modules and verification](../docs/ambient-playground.md)

**Tracking:** Local ticket requested by the owner; not published to GitHub. The repository normally tracks new work in GitHub Issues.

**Research:** [Home-page pad controller and looper](../docs/research/home-pad-looper.md)

## Agreed direction

- A **4×4 controller with 16 pads**, not the original 8×8 proposal.
- Initially, each pad plays a **sine tone at a different pitch**. These are temporary sounds, not the final sonic identity.
- The owner will generate **16 ambient/soundscape FX samples** later. The pad UI and looper must not need redesigning when samples replace the oscillators.
- Visitors can record and layer repeating performances using a looper-pedal-style interface.
- Take inspiration from the inviting illustrated keyboard on [ky.fyi](https://ky.fyi/), without copying its artwork or audio.
- The destination is an ambient instrument, not a drum machine, step sequencer or full DAW.

## Proposed first version

These are implementation recommendations, not additional confirmed requirements:

- Render a controller and separate stompbox-style control in the site's Nord palette/Gohu typography. Use native buttons and CSS Grid; a decorative cable can connect the two visually.
- Keep Face initially and replace the home page's “Coming soon...” placeholder; confirm composition during visual review.
- Provide an explicit Enable Sound action, master volume/mute, Record/Overdub, Play/Stop and Clear. Show textual loading, recording, playing and error states. Do not depend on double-tap or long-press pedal gestures.
- Start with harmonically compatible sine pitches and gentle gain envelopes, avoiding clicks and harsh transient behavior. Confirm pitch range and note duration by listening.
- Use an **event looper**: record stable sound IDs, timing and relevant voice parameters, then schedule voices against the Web Audio clock. No microphone or mixed-audio recording is needed.
- Let sound tails overlap across loop boundaries rather than automatically truncating every voice when the playhead wraps. Bound polyphony and provide gain headroom so ambient layers cannot grow without limit or clip uncontrollably.
- Keep the first implementation native Web Audio unless the timing prototype demonstrates a need for an audio library. No UI framework or backend is required.
- Stop audio when the page becomes hidden or the visitor leaves Home. Preserve committed events while merely hidden; require explicit resume. Navigation may clear the loop, with that limitation disclosed.

## Sound replacement seam

Keep pad mapping, loop events and voice generation separate. An oscillator voice and a decoded-sample voice should accept the same scheduled trigger contract. If held/gated sounds are chosen, capture duration/release events too; do not assume note-on-only events can reproduce them.

**MP3 works** for future assets: fetch and decode each file into an `AudioBuffer`, then schedule playback from that buffer. Retain WAV masters; WAV is also an option when precise trimming matters. Check decoded attacks/padding and actual browser codec support. Do not concatenate MP3 files to create the musical loop.

Long ambient files require new transfer, decoded-memory and polyphony measurements; the research's short one-shot budgets are not acceptance criteria for the final kit. Load future samples only after intentional activation, with progress, failure and retry handling. The owner must have distribution rights for the shipped recordings.

## Confirmed implementation decisions

Confirmed by the owner during implementation:

- Flat 2D controller to the left of Face on desktop and above it on mobile; replace “Coming soon...”.
- First Record press starts the loop; second press defines its length and starts playback. Free timing, no quantization, count-in or metronome.
- Overlapping fixed-duration sine one-shots by default, plus a generated WAV sample mode to test the replacement seam.
- Continuous overdub until toggled off. Stop preserves committed layers and discards unfinished recording/overdub. Clear removes everything; no undo in this version.
- Current Chrome, Firefox and Safari, including Android Chrome and iOS Safari.
- Tests at the public looper/audio-engine boundary and browser UI (activation, input, navigation and cleanup).

Safety bounds: first-pass length 1–120 seconds, automatically closed at the maximum; 512 recorded events and 32 simultaneous/scheduled voices. These limits are disclosed in the UI.

## Original decisions to resolve before implementation (resolved above)

1. **Looper timing:** fixed duration, fixed musical bars, or first-pass pedal-defined length? Ambient material may benefit from longer, less beat-oriented loops. The earlier two-bar/120 BPM suggestion is not agreed.
2. **Quantization/count-in:** free timing versus optional snapping; audible versus visual count-in. Do not impose a metronomic percussion workflow by default without auditioning it.
3. **Voice behavior:** short one-shots, fixed sustained envelopes, or press/hold/release? How should repeated triggers of the same pad overlap?
4. **Overdub:** continuous until toggled or one pass at a time? Decide cancellation, clearing and undo behavior explicitly.
5. **Browser floor:** confirm supported desktop/mobile browsers before selecting newer platform features.
6. **Hardware:** assume on-screen controller/pedal; actual MIDI controllers or footswitches are optional future scope, not a dependency.

## Acceptance and verification

- [x] Home displays 16 clearly labeled, playable pads and understandable looper controls, including on narrow screens.
- [x] Every pad produces its assigned sine pitch; repeated and simultaneous inputs behave consistently.
- [x] No sound starts on arrival. Unlock failure/interruption has an actionable recovery path.
- [x] Visitors can record, replay, overdub, stop and clear a loop under the agreed timing contract.
- [x] Live monitoring is not doubled by recorded playback; boundary events are neither dropped nor duplicated, and permitted tails cross the wrap cleanly.
- [x] Stop/Clear silences active and already-scheduled voices. Polyphony/event limits prevent unbounded accumulation.
- [x] Keyboard, pointer and multi-touch work without duplicate triggers. Focus is visible, labels/states do not rely on color or audio alone, and reduced motion is respected.
- [x] Audio scheduling uses the audio clock, not animation frames; main-thread load does not cause cumulative loop drift.
- [ ] Astro ClientRouter departure/re-entry, Back/Forward, native page departure, hidden tabs and audio interruption do not leak contexts, voices, timers or listeners, or unexpectedly resume sound.
- [x] Test the sample-voice replacement with a temporary licensed fixture without requiring the owner's final kit.
- [ ] Run relevant automated tests, `pnpm check` and build; record real-device listening/touch checks separately from automated results.

Automated coverage is Chromium-based; touch uses browser emulation, visibility/native page events are synthetic, and listening/physical-touch/true BFCache checks still require real devices. The remaining unchecked lifecycle/verification items intentionally retain that limitation.

## Out of scope initially

Microphone input, physical MIDI integration, sample upload UI, effects rack, tempo automation/time stretching, audio export, shareable loops, saved sessions, accounts and cross-route playback. Ambient character will initially come from voice envelopes and ultimately the owner's samples; it does not imply an unrequested reverb/delay engine.
