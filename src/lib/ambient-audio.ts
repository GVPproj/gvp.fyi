import { pads } from './ambient-kit';

const DURATION = 2;
const VOICE_GAIN = 0.8 / 32;

export type SoundMode = 'sine' | 'samples';

/** Owns one explicitly activated audio context; construction is silent. */
export class AmbientAudio {
  private context?: AudioContext;
  private enabled = false;
  private expectRunning = false;
  private resumeFrom?: AudioContextState;
  private disposed = false;
  private generation = 0;
  private loading?: AbortController;
  private master?: GainNode;
  private volume = 1;
  private muted = false;
  private mode: SoundMode = 'sine';
  private readonly buffers = new Map<string, AudioBuffer>();
  private readonly voices = new Set<{ source: AudioScheduledSourceNode; gain: GainNode }>();

  constructor(private readonly onInterruption: () => void) {}

  get currentTime(): number { return this.context?.currentTime ?? 0; }
  get ready(): boolean { return this.enabled && this.context?.state === 'running'; }

  async enable(mode: SoundMode, onProgress?: (loaded: number, total: number) => void): Promise<void> {
    if (this.disposed) throw new Error('Audio engine has been disposed');
    this.cancelLoading();
    const generation = this.generation;
    const controller = this.loading = new AbortController();
    this.enabled = false;
    if (mode !== this.mode) this.stop();
    this.mode = mode;
    this.expectRunning = true;
    try {
      if (!this.context) {
        this.context = new AudioContext();
        this.context.addEventListener('statechange', this.handleStateChange);
        this.master = this.context.createGain();
        this.master.gain.value = this.muted ? 0 : this.volume;
        this.master.connect(this.context.destination);
      }
      const context = this.context;
      this.resumeFrom = context.state;
      // Must happen before the first await, inside the visitor's activation.
      await context.resume();
      this.checkGeneration(generation);
      this.resumeFrom = undefined;
      if (mode === 'samples') {
        onProgress?.(this.buffers.size, pads.length);
        for (const pad of pads) {
          this.checkGeneration(generation);
          if (this.buffers.has(pad.id)) continue;
          const response = await fetch(pad.sampleUrl, { signal: controller.signal });
          this.checkGeneration(generation);
          if (!response.ok) throw new Error(`Unable to load ${pad.label}: HTTP ${response.status}`);
          const data = await response.arrayBuffer();
          this.checkGeneration(generation);
          const buffer = await context.decodeAudioData(data);
          // decodeAudioData cannot be aborted: never publish a stale result.
          this.checkGeneration(generation);
          this.buffers.set(pad.id, buffer);
          onProgress?.(this.buffers.size, pads.length);
        }
      }
      this.checkGeneration(generation);
      if (context.state !== 'running') throw new Error('Audio context did not resume; enable sound again');
      this.enabled = true;
    } catch (error) {
      if (generation === this.generation) {
        this.enabled = false;
        this.expectRunning = false;
        this.resumeFrom = undefined;
        this.stop();
        this.cancelLoading();
      }
      throw error;
    } finally {
      if (generation === this.generation) this.loading = undefined;
    }
  }

  private cancelLoading(): void {
    this.generation++;
    this.loading?.abort();
    this.loading = undefined;
  }

  private checkGeneration(generation: number): void {
    if (this.disposed || generation !== this.generation) {
      throw new DOMException('Audio activation cancelled', 'AbortError');
    }
  }

  private readonly handleStateChange = (): void => {
    const state = this.context?.state;
    if (state === 'running') {
      this.resumeFrom = undefined;
      return;
    }
    // A previous suspension's queued event can arrive while resume() is still
    // pending. That unchanged starting state is not a new interruption. Once
    // running is observed (or resume settles), every suspension is actionable.
    if (!this.expectRunning || state === this.resumeFrom) return;
    this.cancelLoading();
    this.expectRunning = false;
    this.enabled = false;
    this.stop();
    this.onInterruption();
  };

  trigger({ soundId, when }: { soundId: string; when: number }): void {
    if (!this.ready || !this.context || !Number.isFinite(when)) return;
    const pad = pads.find(pad => pad.id === soundId);
    if (!pad) return;
    const context = this.context;
    if (this.voices.size >= 32) this.silence(this.voices.values().next().value!);
    const start = Math.max(when, context.currentTime);
    const gain = context.createGain();
    let source: AudioScheduledSourceNode;
    if (this.mode === 'sine') {
      const oscillator = context.createOscillator();
      oscillator.type = 'sine';
      oscillator.frequency.value = pad.frequency;
      source = oscillator;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(VOICE_GAIN, start + 0.08);
      gain.gain.setValueAtTime(VOICE_GAIN, start + 1.4);
      gain.gain.linearRampToValueAtTime(0, start + DURATION);
    } else {
      const sample = context.createBufferSource();
      sample.buffer = this.buffers.get(pad.id)!;
      source = sample;
      // Fixtures contain the same gentle envelope as the oscillator voice.
      gain.gain.value = VOICE_GAIN;
    }
    source.connect(gain).connect(this.master!);
    const voice = { source, gain };
    this.voices.add(voice);
    source.onended = () => {
      source.disconnect();
      gain.disconnect();
      this.voices.delete(voice);
    };
    source.start(start);
    source.stop(start + DURATION);
  }

  setVolume(value: number): void {
    if (Number.isNaN(value)) return;
    this.volume = Math.min(1, Math.max(0, value));
    this.updateMaster();
  }

  setMuted(value: boolean): void {
    this.muted = value;
    this.updateMaster();
  }

  private updateMaster(): void {
    if (!this.master || !this.context) return;
    const gain = this.master.gain;
    const now = this.context.currentTime;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(gain.value, now);
    gain.linearRampToValueAtTime(this.muted ? 0 : this.volume, now + 0.01);
  }

  /** Cancels future starts as well as audible tails, without changing readiness. */
  stop(): void {
    for (const voice of this.voices) this.silence(voice);
  }

  private silence(voice: { source: AudioScheduledSourceNode; gain: GainNode }): void {
    voice.source.onended = null;
    voice.source.stop();
    voice.source.disconnect();
    voice.gain.disconnect();
    this.voices.delete(voice);
  }

  /** Keep decoded samples, but never automatically resume after returning. */
  suspend(): void {
    this.cancelLoading();
    this.expectRunning = false;
    this.enabled = false;
    this.stop();
    if (this.context && this.context.state !== 'closed') {
      void this.context.suspend().catch(() => {});
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.cancelLoading();
    this.expectRunning = false;
    this.enabled = false;
    this.context?.removeEventListener('statechange', this.handleStateChange);
    this.stop();
    this.master?.disconnect();
    this.buffers.clear();
    if (this.context && this.context.state !== 'closed') {
      void this.context.close().catch(() => {});
    }
    this.master = undefined;
    this.context = undefined;
  }
}
