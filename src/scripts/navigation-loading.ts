import type { TransitionBeforePreparationEvent } from 'astro:transitions/client';

let finishCurrent: (() => void) | undefined;

document.addEventListener('astro:before-preparation', (event: TransitionBeforePreparationEvent) => {
  finishCurrent?.();
  if (event.defaultPrevented || event.signal.aborted) return;

  const root = document.documentElement;
  const status = document.querySelector('#navigation-status span');
  root.setAttribute('data-navigation-loading', '');
  if (status) status.textContent = 'Loading page…';

  const finish = () => {
    event.signal.removeEventListener('abort', finish);
    // An older request may finish after a newer navigation has started.
    if (finishCurrent !== finish) return;
    root.removeAttribute('data-navigation-loading');
    if (status) status.textContent = '';
    finishCurrent = undefined;
  };
  finishCurrent = finish;
  event.signal.addEventListener('abort', finish, { once: true });

  // Wrapping the loader also clears failed requests, where after-preparation
  // may not fire. Clear before the outgoing view-transition snapshot is taken.
  const loader = event.loader;
  event.loader = async () => {
    try {
      await loader();
    } finally {
      finish();
    }
  };

  // A later listener can cancel preparation, so the loader never runs.
  queueMicrotask(() => {
    if (event.defaultPrevented) finish();
  });
});

// Don't restore a pending indicator when returning from the back/forward cache.
window.addEventListener('pagehide', () => finishCurrent?.());
window.addEventListener('pageshow', (event) => {
  if (event.persisted) finishCurrent?.();
});
