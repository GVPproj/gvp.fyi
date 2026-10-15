import { pads } from './ambient-kit';
import { AmbientMediaChannel } from './ambient-media-channel';
import { MAX_VOICES } from './ambient-limits.ts';

const DURATION = 2;
const VOICE_GAIN = 0.8 / MAX_VOICES;

type Voice = { source: AudioScheduledSourceNode; gain: GainNode };

/** Owns one explicitly activated audio context; construction is silent. */
export class AmbientAudio {
  private context?: AudioContext;
  private readonly mediaChannel = new AmbientMediaChannel();
  private enabled = false;
  private expectRunning = false;
  private resumeFrom?: AudioContextState;
  private disposed = false;
  private generation = 0;
  private master?: GainNode;
  private volume = 1;
  private readonly voices = new Set<Voice>();

  constructor(private readonly onInterruption: () => void) {}

  get currentTime(): number { return this.context?.currentTime ?? 0; }
  get ready(): boolean { return this.enabled && this.context?.state === 'running'; }

  async enable(): Promise<void> {
    if (this.disposed) throw new Error('Audio engine has been disposed');
    const generation = ++this.generation;
    this.enabled = false;
    this.expectRunning = true;
    try {
      if (!this.context) {
        this.context = new AudioContext();
        this.context.addEventListener('statechange', this.handleStateChange);
        this.master = this.context.createGain();
        this.master.gain.value = this.volume;
        this.master.connect(this.context.destination);
      }
      const context = this.context;
      this.resumeFrom = context.state;
      // Must happen before the first await, inside the visitor's activation.
      await Promise.all([context.resume(), this.mediaChannel.enable()]);
      this.checkGeneration(generation);
      this.resumeFrom = undefined;
      if (context.state !== 'running') throw new Error('Audio context did not resume; enable sound again');
      this.enabled = true;
    } catch (error) {
      if (generation === this.generation) {
        this.enabled = false;
        this.expectRunning = false;
        this.resumeFrom = undefined;
        this.stop();
        this.mediaChannel.stop();
        this.generation++;
      }
      throw error;
    }
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
    this.deactivate();
    this.onInterruption();
  };

  trigger({ soundId, when }: { soundId: string; when: number }): void {
    if (!this.ready || !this.context || !Number.isFinite(when)) return;
    const pad = pads.find(pad => pad.id === soundId);
    if (!pad) return;
    const context = this.context;
    if (this.voices.size >= MAX_VOICES) this.silence(this.voices.values().next().value!);
    const start = Math.max(when, context.currentTime);
    const gain = context.createGain();
    const source = context.createOscillator();
    source.type = 'sine';
    source.frequency.value = pad.frequency;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(VOICE_GAIN, start + 0.08);
    gain.gain.setValueAtTime(VOICE_GAIN, start + 1.4);
    gain.gain.linearRampToValueAtTime(0, start + DURATION);
    source.connect(gain).connect(this.master!);
    const voice = { source, gain };
    this.voices.add(voice);
    source.onended = () => this.releaseVoice(voice);
    source.start(start);
    source.stop(start + DURATION);
  }

  setVolume(value: number): void {
    if (Number.isNaN(value)) return;
    this.volume = Math.min(1, Math.max(0, value));
    this.updateMaster();
  }

  private updateMaster(): void {
    if (!this.master || !this.context) return;
    const gain = this.master.gain;
    const now = this.context.currentTime;
    gain.cancelScheduledValues(now);
    gain.setValueAtTime(gain.value, now);
    gain.linearRampToValueAtTime(this.volume, now + 0.01);
  }

  /** Cancels future starts as well as audible tails, without changing readiness. */
  stop(): void {
    for (const voice of this.voices) this.silence(voice);
  }

  private silence(voice: Voice): void {
    voice.source.onended = null;
    voice.source.stop();
    this.releaseVoice(voice);
  }

  private releaseVoice(voice: Voice): void {
    voice.source.disconnect();
    voice.gain.disconnect();
    this.voices.delete(voice);
  }

  private deactivate(): void {
    this.mediaChannel.stop();
    this.generation++;
    this.expectRunning = false;
    this.enabled = false;
    this.stop();
  }

  /** Never automatically resume after returning. */
  suspend(): void {
    this.deactivate();
    if (this.context && this.context.state !== 'closed') {
      void this.context.suspend().catch(() => {});
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.context?.removeEventListener('statechange', this.handleStateChange);
    this.deactivate();
    this.master?.disconnect();
    if (this.context && this.context.state !== 'closed') {
      void this.context.close().catch(() => {});
    }
    this.master = undefined;
    this.context = undefined;
  }
}
