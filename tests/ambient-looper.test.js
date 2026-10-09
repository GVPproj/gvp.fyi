import assert from 'node:assert/strict';
import test from 'node:test';
import { AmbientLooper } from '../src/lib/ambient-looper.ts';

// The public scheduling port and audio clock are the system boundary.
function instrument() {
  let now = 0;
  const voices = [];
  const looper = new AmbientLooper({
    trigger: voice => voices.push(voice),
    stop: () => { voices.length = 0; },
  }, () => now);
  return { looper, voices, at: time => { now = time; } };
}

test('a first-pass performance defines the free-time loop and repeats without doubling monitoring', () => {
  const { looper, voices, at } = instrument();
  looper.record();
  looper.hit('c3');
  at(0.5);
  looper.hit('e3');
  at(2);
  looper.record();
  assert.equal(looper.state, 'overdubbing');
  assert.equal(looper.duration, 2);
  looper.schedule();
  looper.schedule();
  at(2.45);
  looper.schedule();
  assert.deepEqual(voices, [
    { soundId: 'c3', when: 0 }, { soundId: 'e3', when: 0.5 },
    { soundId: 'c3', when: 2 }, { soundId: 'e3', when: 2.5 },
  ]);
});

test('a hit sharing the closing timestamp wraps to zero without doubled monitoring, including after restart', () => {
  const { looper, voices, at } = instrument();
  looper.record();
  at(2);
  looper.hit('c3');
  looper.record();
  looper.schedule();
  assert.deepEqual(voices, [{ soundId: 'c3', when: 2 }]);
  at(3.95);
  looper.schedule();
  assert.deepEqual(voices.at(-1), { soundId: 'c3', when: 4 });
  looper.stop();
  at(10);
  looper.play();
  assert.deepEqual(voices, [{ soundId: 'c3', when: 10 }]);
});

test('closing or restarting schedules the downbeat immediately, before the next timer wakeup', () => {
  const { looper, voices, at } = instrument();
  looper.record();
  looper.hit('c3');
  at(2);
  looper.record();
  at(2.025);
  looper.schedule();
  assert.deepEqual(voices, [{ soundId: 'c3', when: 0 }, { soundId: 'c3', when: 2 }]);
  looper.stop();
  at(5);
  looper.play();
  at(5.025);
  looper.schedule();
  assert.deepEqual(voices, [{ soundId: 'c3', when: 5 }]);
});

test('late scheduler wakeups skip missed hits without shifting the original loop clock', () => {
  const { looper, voices, at } = instrument();
  looper.record();
  looper.hit('c3');
  looper.hit('e3');
  at(2);
  looper.record();
  at(1000.2);
  looper.schedule();
  assert.equal(voices.length, 4, 'only monitoring and the initial playback; no catch-up burst');
  at(1001.95);
  looper.schedule();
  looper.schedule();
  assert.deepEqual(voices.slice(4), [
    { soundId: 'c3', when: 1002 }, { soundId: 'e3', when: 1002 },
  ]);
});

test('Record from stopped resumes the loop in overdub mode', () => {
  const { looper, voices, at } = instrument();
  looper.record();
  looper.hit('c3');
  at(2);
  looper.record();
  looper.stop();
  at(5);
  looper.record();
  looper.schedule();
  assert.equal(looper.state, 'overdubbing');
  assert.deepEqual(voices, [{ soundId: 'c3', when: 5 }]);
});

test('automatic closure keeps opening hits when the closing tick is slightly late, without dropping or doubling them', () => {
  const { looper, voices, at } = instrument();
  looper.record();
  looper.hit('c3');
  at(0.04);
  looper.hit('e3');
  at(7.99);
  looper.schedule();
  assert.equal(looper.state, 'recording', 'the first pass remains open until its maximum');
  at(8.015);
  looper.schedule();
  looper.schedule();
  assert.equal(looper.state, 'overdubbing');
  assert.equal(looper.duration, 8);
  assert.deepEqual(voices.slice(2), [
    { soundId: 'c3', when: 8 }, { soundId: 'e3', when: 8.04 },
  ], 'the first replay keeps both opening hits, each only once');
  at(15.99);
  looper.schedule();
  assert.deepEqual(voices.slice(4), [
    { soundId: 'c3', when: 16 }, { soundId: 'e3', when: 16.04 },
  ]);
});

test('opening hits survive automatic closure at a nonzero audio epoch', () => {
  const { looper, voices, at } = instrument();
  const epoch = 8.013333333333334;
  at(epoch);
  looper.record();
  looper.hit('c3');
  at(epoch + 8.015);
  looper.schedule();
  looper.schedule();
  assert.deepEqual(voices, [
    { soundId: 'c3', when: epoch },
    { soundId: 'c3', when: epoch + 8 },
  ]);
  at(epoch + 16);
  looper.schedule();
  assert.deepEqual(voices.at(-1), { soundId: 'c3', when: epoch + 16 });
});

test('loops are bounded to 1–8 seconds and 512 events while live pads remain playable', () => {
  const { looper, voices, at } = instrument();
  looper.record();
  at(0.1);
  looper.record();
  assert.equal(looper.state, 'recording', 'accidental double presses cannot create a tiny loop');
  for (let i = 0; i < 513; i++) looper.hit('c3');
  assert.equal(looper.eventCount, 512);
  assert.equal(looper.full, true);
  assert.equal(voices.length, 513);
  at(9);
  looper.schedule();
  assert.equal(looper.state, 'overdubbing');
  assert.equal(looper.duration, 8);
});

test('Stop cancels scheduled voices and unfinished overdubs; Play retains committed layers; Clear removes them', () => {
  const { looper, voices, at } = instrument();
  looper.record();
  looper.hit('c3');
  at(2);
  looper.record();
  looper.schedule();
  looper.hit('e3');
  looper.stop();
  assert.equal(looper.state, 'stopped');
  assert.equal(looper.eventCount, 1);
  assert.deepEqual(voices, []);
  at(10);
  looper.play();
  looper.schedule();
  assert.deepEqual(voices, [{ soundId: 'c3', when: 10 }]);
  looper.clear();
  looper.schedule();
  assert.equal(looper.state, 'empty');
  assert.equal(looper.eventCount, 0);
  assert.equal(looper.duration, 0);
  assert.deepEqual(voices, []);
  looper.record();
  looper.hit('g3');
  looper.stop();
  assert.equal(looper.state, 'empty', 'an unfinished first pass is discarded too');
  assert.equal(looper.eventCount, 0);
});

test('overdub monitoring enters playback only next cycle, even across an already scheduled boundary', () => {
  const { looper, voices, at } = instrument();
  looper.record();
  looper.hit('c3');
  at(2);
  looper.record();
  looper.schedule();
  assert.equal(looper.state, 'overdubbing', 'finishing the first pass enables overdub automatically');
  at(3.95);
  looper.schedule(); // c3 is already queued at 4
  at(4);
  looper.hit('e3'); // exactly at the wrap: monitor once now, repeat at 6
  looper.schedule();
  looper.record(); // commit without duplicating queued events
  looper.schedule();
  at(5.95);
  looper.schedule();
  assert.equal(looper.state, 'playing');
  assert.equal(looper.eventCount, 2);
  assert.deepEqual(voices, [
    { soundId: 'c3', when: 0 }, { soundId: 'c3', when: 2 },
    { soundId: 'c3', when: 4 }, { soundId: 'e3', when: 4 },
    { soundId: 'c3', when: 6 }, { soundId: 'e3', when: 6 },
  ]);
});
