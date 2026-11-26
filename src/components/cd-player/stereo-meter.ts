export function stereoMeter(audio: HTMLAudioElement, banks: SVGGElement[]) {
  let context: AudioContext | undefined;
  let channels: AnalyserNode[] = [];
  let timer: number | undefined;
  const samples = new Float32Array(2048);
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

  function paint(bank: SVGGElement, count: number) {
    bank.style.clipPath = `inset(0 ${(30 - count) * 100 / 30}% 0 0)`;
  }
  function reset() {
    window.clearTimeout(timer);
    banks.forEach(bank => paint(bank, 0));
  }
  function sample() {
    window.clearTimeout(timer);
    if (audio.paused || !channels.length) return;
    channels.forEach((channel, i) => {
      channel.getFloatTimeDomainData(samples);
      let peak = 0;
      for (const value of samples) peak = Math.max(peak, Math.abs(value));
      const db = 20 * Math.log10(peak);
      paint(banks[i], Math.min(30, Math.max(0, Math.ceil(30 + db))));
    });
    timer = window.setTimeout(sample, reducedMotion.matches ? 250 : 50);
  }
  audio.addEventListener('playing', sample);
  const silent = ['pause', 'waiting', 'emptied', 'ended', 'error'];
  silent.forEach(event => audio.addEventListener(event, reset));

  return {
    activate() {
      if (!window.AudioContext || banks.length !== 2) return;
      if (!context) {
        context = new AudioContext();
        const source = context.createMediaElementSource(audio);
        source.connect(context.destination); // Keep the stereo mix untouched.
        const splitter = context.createChannelSplitter(2);
        source.connect(splitter);
        channels = banks.map((_, i) => {
          const analyser = context!.createAnalyser();
          analyser.fftSize = samples.length;
          splitter.connect(analyser, i);
          return analyser;
        });
      }
      if (context.state !== 'running') void context.resume();
    },
    dispose() {
      reset();
      audio.removeEventListener('playing', sample);
      silent.forEach(event => audio.removeEventListener(event, reset));
      void context?.close();
    },
  };
}
