import { load, press, release, setPath } from 'button-sounds';

const preset = 'iidx';
const pitchVariation = 0.1;
setPath('/audio/transport');

export function addTransportSounds(deck: HTMLElement, audio: HTMLAudioElement) {
  const controller = new AbortController();
  const { signal } = controller;
  let held: { pointerId: number; key: Element } | undefined;
  load(preset);

  function getUnlatchedKey(event: Event) {
    if (!(event.target instanceof Element)) return;
    const key = event.target.closest('button:enabled:is([data-play], [data-pause], [data-stop], [data-mute]), a[data-download][href]');
    if (deck.dataset.state === 'playing' && key?.hasAttribute('data-play')) return;
    if (deck.dataset.state === 'paused' && key?.hasAttribute('data-pause')) return;
    return key;
  }

  function playSample(trigger: typeof press, key: Element) {
    // The mute switch itself clicks in both directions; all other keys honor it.
    if (signal.aborted || (audio.muted && !key.hasAttribute('data-mute'))) return false;
    trigger(preset, {
      volume: 0.25,
      playbackRate: 1 + (Math.random() * 2 - 1) * pitchVariation,
      lofi: false,
    });
    return true;
  }

  deck.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0) return;
    const key = getUnlatchedKey(event);
    if (key && playSample(press, key)) held = { pointerId: event.pointerId, key };
  }, { signal });
  window.addEventListener('pointerup', event => {
    if (held?.pointerId !== event.pointerId) return;
    playSample(release, held.key);
    held = undefined;
  }, { signal });
  window.addEventListener('pointercancel', event => {
    if (held?.pointerId === event.pointerId) held = undefined;
  }, { signal });
  window.addEventListener('blur', () => { held = undefined; }, { signal });

  // Check the latch before the native keyboard/assistive click changes deck state.
  deck.addEventListener('click', event => {
    if (event.detail !== 0) return;
    const key = getUnlatchedKey(event);
    if (key && playSample(press, key)) window.setTimeout(() => playSample(release, key), 110);
  }, { capture: true, signal });

  return () => controller.abort();
}
