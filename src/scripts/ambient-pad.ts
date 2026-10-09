import { AmbientAudio } from '../lib/ambient-audio';
import { AmbientLooper } from '../lib/ambient-looper';

// Keep every transport state's controls and announcement together. The mapped
// type requires presentation for any new state introduced by the looper.
const transportViews: Record<AmbientLooper['state'], {
  running: boolean;
  recordLabel: string;
  recordIcon: 'record' | 'overdub';
  description: string;
}> = {
  empty: {
    running: false, recordLabel: 'Record', recordIcon: 'record',
    description: 'Ready. Play a pad or record a loop.',
  },
  recording: {
    running: true, recordLabel: 'Finish loop', recordIcon: 'record',
    description: 'Recording. Finish loop after 1–8 seconds.',
  },
  playing: {
    running: true, recordLabel: 'Overdub', recordIcon: 'overdub',
    description: 'Playing. Overdub to add a layer.',
  },
  overdubbing: {
    running: true, recordLabel: 'Finish overdub', recordIcon: 'overdub',
    description: 'Overdubbing. Finish overdub to keep this layer.',
  },
  stopped: {
    running: false, recordLabel: 'Overdub', recordIcon: 'overdub',
    description: 'Stopped. Finished layers kept; unfinished takes discarded.',
  },
};

function mount(root: HTMLElement) {
  const status = root.querySelector<HTMLElement>('[data-status]')!;
  if (typeof window.AudioContext !== 'function') {
    status.classList.remove('sr-only');
    status.textContent = 'Web Audio is not supported in this browser. The rest of the site still works.';
    return;
  }
  const listeners = new AbortController();
  const { signal } = listeners;
  const element = <T extends HTMLElement>(selector: string) => root.querySelector<T>(selector)!;
  const volumeControl = element<HTMLInputElement>('[data-volume]');
  let volume = 60;
  const mute = element<HTMLButtonElement>('[data-mute]');
  const record = element<HTMLButtonElement>('[data-record]');
  const play = element<HTMLButtonElement>('[data-play]');
  const clear = element<HTMLButtonElement>('[data-clear]');
  const info = element('[data-loop-info]');
  const recordIcons = record.querySelectorAll<HTMLElement>('[data-record-icon]');
  const playIcons = play.querySelectorAll<HTMLElement>('[data-play-icon]');
  const pads = [...root.querySelectorAll<HTMLButtonElement>('[data-pad]')];
  const contacts = new Map<number, { pad: HTMLButtonElement; playOnRelease: boolean }>();
  let timer: ReturnType<typeof setInterval> | undefined;
  let dead = false;
  let enabling: Promise<void> | undefined;
  let activation = 0;
  let muted = false;
  const audio = new AmbientAudio(() => pause('Sound interrupted. Tap a pad or press Play to resume.'));
  const looper = new AmbientLooper(audio, () => audio.currentTime);
  audio.setVolume(volume / 100);

  function message(text: string, error = false) {
    if (status.textContent !== text) status.textContent = text;
    status.classList.toggle('sr-only', !error);
  }

  function renderVolume() {
    volumeControl.setAttribute('aria-valuetext', `${volume} percent${muted ? ', muted' : ''}`);
    mute.setAttribute('aria-pressed', String(muted));
  }

  function renderLoopInfo() {
    info.textContent = looper.state === 'empty' ? 'No loop yet' : `${looper.duration ? `${looper.duration.toFixed(1)}s · ` : ''}${looper.eventCount} events`;
  }

  function render() {
    const focused = document.activeElement;
    const state = looper.state;
    const { running, recordLabel, recordIcon } = transportViews[state];
    record.setAttribute('aria-label', recordLabel);
    record.title = recordLabel;
    recordIcons.forEach(icon => {
      icon.hidden = icon.dataset.recordIcon !== recordIcon;
    });
    play.disabled = state === 'empty';
    const playLabel = running ? 'Stop' : 'Play';
    play.setAttribute('aria-label', playLabel);
    play.title = playLabel;
    playIcons.forEach(icon => {
      icon.hidden = icon.dataset.playIcon !== playLabel.toLowerCase();
    });
    clear.disabled = state === 'empty';
    root.toggleAttribute('data-recording', state === 'recording' || state === 'overdubbing');
    renderLoopInfo();
    if (!document.hidden && focused instanceof HTMLElement && root.contains(focused) && focused.matches(':disabled')) {
      // Disabled controls hand focus to an available neighbor.
      record.focus();
    }
    if (!running || !audio.ready) {
      clearInterval(timer);
      timer = undefined;
    } else if (timer === undefined) {
      // The timer only fills the scheduling horizon. Web Audio owns event timing.
      timer = setInterval(() => {
        const previous = looper.state;
        looper.schedule();
        if (looper.state !== previous) {
          announceTransport();
          render();
        }
      }, 25);
    }
  }

  function announceTransport() {
    message(looper.full ? 'Loop full (512 events). Live pads still work; Clear to start again.' : transportViews[looper.state].description);
  }

  function releaseContacts() {
    contacts.clear();
    pads.forEach(pad => { pad.removeAttribute('data-held'); });
  }

  function pause(reason: string) {
    if (dead) return;
    activation++;
    enabling = undefined;
    looper.stop();
    audio.suspend();
    releaseContacts();
    message(reason);
    render();
  }

  async function withAudio(action: () => void) {
    if (dead || document.hidden) return;
    if (audio.ready) {
      action();
      return;
    }
    const attempt = activation;
    // Resume within the gesture; concurrent first touches share activation.
    const ready = enabling ??= audio.enable('sine');
    try {
      await ready;
      if (dead || attempt !== activation) return;
      announceTransport();
      action();
    } catch {
      if (!dead && attempt === activation) {
        const reason = 'Could not start sound. Tap a pad or press Record / Play to retry.';
        message(reason, true);
      }
    } finally {
      if (enabling === ready) enabling = undefined;
    }
  }
  volumeControl.addEventListener('input', () => {
    volume = volumeControl.valueAsNumber;
    audio.setVolume(volume / 100);
    renderVolume();
  }, { signal });
  mute.addEventListener('click', () => {
    muted = !muted;
    audio.setMuted(muted);
    renderVolume();
  }, { signal });

  function transport(action: () => void) {
    action();
    announceTransport();
    render();
  }
  record.addEventListener('click', () => { void withAudio(() => transport(() => looper.record())); }, { signal });
  play.addEventListener('click', () => {
    if (transportViews[looper.state].running) {
      if (enabling) pause('Stopped.');
      transport(() => looper.stop());
    } else {
      void withAudio(() => transport(() => looper.play()));
    }
  }, { signal });
  clear.addEventListener('click', () => {
    if (enabling) pause('Stopped.');
    transport(() => looper.clear());
    message('Loop cleared. Ready for a new soundscape.');
  }, { signal });

  function hit(pad: HTMLButtonElement) {
    if (!audio.ready) return;
    const previous = looper.state;
    const count = looper.eventCount;
    looper.hit(pad.dataset.pad!);
    if (looper.full || looper.state !== previous) announceTransport();
    if (looper.state !== previous) render();
    else if (looper.eventCount !== count) renderLoopInfo();
  }
  for (const pad of pads) {
    pad.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      // Touch/pen activation is granted on release, unlike mouse-down. Only
      // the unlock tap waits; once running, every pointer plays on down.
      const playOnRelease = event.pointerType !== 'mouse' && !audio.ready;
      contacts.set(event.pointerId, { pad, playOnRelease });
      pad.setAttribute('data-held', '');
      pad.setPointerCapture(event.pointerId);
      if (!playOnRelease) void withAudio(() => hit(pad));
    }, { signal });
    pad.addEventListener('click', event => {
      // Native keyboard and assistive-technology clicks have no pointer click count.
      if (event.detail === 0) void withAudio(() => hit(pad));
    }, { signal });
    pad.addEventListener('keydown', event => {
      if (event.repeat && (event.key === 'Enter' || event.key === ' ')) event.preventDefault();
    }, { signal });
  }
  function release(event: PointerEvent) {
    const contact = contacts.get(event.pointerId);
    contacts.delete(event.pointerId);
    if (!contact) return;
    for (const held of contacts.values()) {
      if (held.pad === contact.pad) return;
    }
    contact.pad.removeAttribute('data-held');
  }
  root.addEventListener('pointerup', event => {
    const contact = contacts.get(event.pointerId);
    release(event);
    if (contact?.playOnRelease) void withAudio(() => hit(contact.pad));
  }, { signal });
  root.addEventListener('pointercancel', release, { signal });
  root.addEventListener('lostpointercapture', release, { signal });
  window.addEventListener('blur', releaseContacts, { signal });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause('Paused while away. Press Play to resume.');
  }, { signal });

  for (const control of [...pads, record, mute, volumeControl]) control.disabled = false;
  volumeControl.value = String(volume);
  renderVolume();
  announceTransport();
  render();
  return () => {
    dead = true;
    activation++;
    listeners.abort();
    clearInterval(timer);
    releaseContacts();
    looper.clear();
    audio.dispose();
  };
}

let mountedRoot: HTMLElement | null = null;
let dispose: (() => void) | undefined;
function unmount() {
  dispose?.();
  dispose = undefined;
  mountedRoot = null;
}
function mountPage() {
  const root = document.getElementById('ambient-pad');
  if (root === mountedRoot) return;
  unmount();
  if (root) {
    mountedRoot = root;
    dispose = mount(root);
  }
}
document.addEventListener('astro:before-swap', unmount);
document.addEventListener('astro:page-load', mountPage);
window.addEventListener('pagehide', unmount);
window.addEventListener('pageshow', mountPage);
mountPage();
