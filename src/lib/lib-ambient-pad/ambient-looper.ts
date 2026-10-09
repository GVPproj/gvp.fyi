const MIN_LOOP_DURATION = 1;
const MAX_LOOP_DURATION = 8;
const MAX_EVENTS = 512;
const SCHEDULE_AHEAD = 0.1;

type Trigger = { soundId: string; when: number };
type VoiceOutput = { trigger: (voice: Trigger) => void; stop: () => void };
type LoopEvent = { soundId: string; position: number; nextCycle: number };
type State = 'empty' | 'recording' | 'playing' | 'overdubbing' | 'stopped';

/** Free-time event looper. All times, including polling, use the audio clock. */
export class AmbientLooper {
  private output: VoiceOutput;
  private now: () => number;
  private events: LoopEvent[] = [];
  private overdub: LoopEvent[] = [];
  private epoch = 0;
  private length = 0;
  private transport: State = 'empty';

  constructor(output: VoiceOutput, now: () => number) {
    this.output = output;
    this.now = now;
  }

  get state() { return this.transport; }
  get duration() { return this.length; }
  get eventCount() { return this.events.length + this.overdub.length; }
  get full() { return this.eventCount >= MAX_EVENTS; }

  record() {
    if (this.transport === 'stopped') this.play();
    const now = this.now();
    if (this.transport === 'empty') {
      this.epoch = now;
      this.transport = 'recording';
    } else if (this.transport === 'recording') {
      if (now - this.epoch < MIN_LOOP_DURATION) return;
      this.length = Math.min(MAX_LOOP_DURATION, now - this.epoch);
      for (const event of this.events) {
        // A coarse audio clock can give the final hit and pedal press the same
        // timestamp. Wrap its phase, but don't replay that monitored hit now.
        event.nextCycle = 1 + Math.floor(event.position / this.length);
        event.position %= this.length;
      }
      this.transport = 'overdubbing';
      const boundary = this.epoch + this.length;
      // Automatic closure is observed on a polling tick. Recover its opening
      // hits if that tick is within the scheduling horizon, rather than skipping
      // a whole first replay. The audio engine clamps late starts to "now";
      // subsequent cycles still use the original epoch. Longer stalls skip.
      this.scheduleAt(now - boundary < SCHEDULE_AHEAD ? boundary : now);
    } else if (this.transport === 'playing') {
      this.transport = 'overdubbing';
    } else if (this.transport === 'overdubbing') {
      this.events.push(...this.overdub);
      this.overdub = [];
      this.transport = 'playing';
    }
  }

  play() {
    if (this.transport !== 'stopped') return;
    this.epoch = this.now();
    for (const event of this.events) event.nextCycle = 0;
    this.transport = 'playing';
    this.scheduleAt(this.epoch);
  }

  stop() {
    this.output.stop();
    this.overdub = [];
    if (this.transport === 'recording') {
      this.events = [];
      this.length = 0;
    }
    this.transport = this.length ? 'stopped' : 'empty';
  }

  clear() {
    this.stop();
    this.events = [];
    this.length = 0;
    this.transport = 'empty';
  }

  hit(soundId: string) {
    const now = this.now();
    if (this.transport === 'recording' && now - this.epoch >= MAX_LOOP_DURATION) this.record();
    this.output.trigger({ soundId, when: now });
    if (this.full) return;
    if (this.transport === 'recording') {
      this.events.push({ soundId, position: now - this.epoch, nextCycle: 1 });
    } else if (this.transport === 'overdubbing') {
      const elapsed = now - this.epoch;
      this.overdub.push({ soundId, position: elapsed % this.length, nextCycle: Math.floor(elapsed / this.length) + 1 });
    }
  }

  schedule() {
    if (this.transport === 'recording' && this.now() - this.epoch >= MAX_LOOP_DURATION) this.record();
    this.scheduleAt(this.now());
  }

  private scheduleAt(now: number) {
    if (this.transport !== 'playing' && this.transport !== 'overdubbing') return;
    this.scheduleEvents(this.events, now);
    this.scheduleEvents(this.overdub, now);
  }

  private scheduleEvents(events: LoopEvent[], now: number) {
    for (const event of events) {
      event.nextCycle = Math.max(event.nextCycle, Math.floor((now - this.epoch - event.position) / this.length));
      let when = this.epoch + event.nextCycle * this.length + event.position;
      // Compare actual onsets: ceil(cycle) can skip an exact boundary when
      // subtraction/division rounds an integer up (e.g. 1.0000000000000002).
      if (when < now) {
        event.nextCycle++;
        when = this.epoch + event.nextCycle * this.length + event.position;
      }
      if (when < now + SCHEDULE_AHEAD) {
        this.output.trigger({ soundId: event.soundId, when });
        event.nextCycle++;
      }
    }
  }
}
