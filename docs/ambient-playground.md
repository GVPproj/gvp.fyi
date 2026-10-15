# Ambient playground

Home has a silent-on-arrival, 12-pad sine instrument using native Web Audio. Pointer, multi-touch, QWER / ASDF / ZXCV and native Enter/Space activation are supported. Audio unlock happens during an intentional pad or transport gesture.

## Behavior

- Record starts a free-time first pass; Finish loop defines its length. No quantization, count-in or metronome.
- Overdub layers events continuously; new hits monitor once and repeat on the next cycle.
- Stop silences active/queued voices and discards unfinished recording while retaining committed events. Play restarts from zero; Clear removes everything without undo.
- First pass: 1–8 seconds. Maximum 512 events and 32 voices. Master volume affects monitoring and playback.
- Hiding/interruption stops audio and discards unfinished material; resumption is explicit. Navigation clears the unsaved loop.
- Errors are visible; transport state is announced and does not rely on color alone.

## Implementation boundaries

`src/lib/lib-ambient-pad/` owns the kit, shared limits, transactional event looper and audio engine. `src/scripts/ambient-pad.ts` owns input/UI and Astro lifecycle cleanup.

Schedule against the audio clock, not animation frames. Timer callbacks feed a lookahead horizon; stalled callbacks skip expired occurrences rather than burst missed hits. Audio tails may cross loop boundaries. Dispose voices, timers and handlers on departure; restored pages start silent.

The oscillator and sample engines share scheduled `{ soundId, when }` triggers and `stop()`. The UI currently uses sine tones only. Generated sample fixtures and their provenance are in [the fixture README](../public/audio/ambient-test/README.md). Future samples need distribution rights, trimmed/normalized audio, and new transfer, decoded-memory and polyphony checks; long recordings are not a tested drop-in replacement.

## Verification still needed

Automated tests cover engine scheduling/rendering and Chromium UI/lifecycle. Physical-device listening/multi-touch, screen readers, interruptions and true BFCache behavior still need testing, especially Safari/iOS. Current desktop Chrome/Firefox/Safari and mobile Android Chrome/iOS Safari are the target; vertical range controls require Chrome 124+, Firefox 120+ or Safari 17.4+.

See [test execution constraints](../README.md#testing). Instrument tests are `tests/ambient-*.test.js`; browser tests require `PLAYWRIGHT_CHROMIUM_EXECUTABLE`. Automated screenshots and synthetic lifecycle events do not establish musical feel or real-device behavior.
