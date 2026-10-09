/**
 * The technique used by ky.fyi's synth: silent HTML media playback lets iOS
 * Web Audio use media volume rather than being muted by the Silent switch.
 * Only explicit activation starts it; the ambient engine owns its lifecycle.
 * The silence asset is generated, not copied from ky.fyi:
 * ffmpeg -f lavfi -i anullsrc=r=44100:cl=stereo -t 0.1 -codec:a libmp3lame
 *   -b:a 256k -map_metadata -1 public/audio/ambient-silence.mp3
 */
export class AmbientMediaChannel {
  private element?: HTMLAudioElement;

  async enable(): Promise<void> {
    const ua = navigator.userAgent;
    const isIOS = /iPhone|iPad|iPod/i.test(ua)
      || (/Mac OS X/i.test(ua) && navigator.maxTouchPoints > 0);
    if (!isIOS) return;
    if (!this.element) {
      const element = document.createElement('audio');
      element.controls = false;
      element.disableRemotePlayback = true;
      element.setAttribute('x-webkit-airplay', 'deny');
      element.preload = 'auto';
      element.src = '/audio/ambient-silence.mp3';
      element.loop = true;
      // This track contains silence; muting the element defeats the workaround.
      element.load();
      this.element = element;
    }
    // Called before any await in AmbientAudio.enable(), within the gesture.
    await this.element.play();
  }

  stop(): void {
    const element = this.element;
    this.element = undefined;
    if (!element) return;
    element.pause();
    // Unload as well as pause so iOS can clear its media playback controls.
    element.removeAttribute('src');
    element.load();
  }
}
