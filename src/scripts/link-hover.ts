// CSS cannot size a pseudo-element to text inside a stretched/padded link.
// Keep the CSS-only box-width fallback for icon links and when JS is unavailable.
const selector = 'a:not(.latest-post-card, .content-row a), .site-header .group-toggle, .site-header summary';

function measureText(link: HTMLElement) {
  const walker = document.createTreeWalker(link, NodeFilter.SHOW_TEXT);
  let left = Infinity;
  let right = -Infinity;
  while (walker.nextNode()) {
    const node = walker.currentNode;
    const text = node.textContent ?? '';
    if (!text.trim()) continue;
    const range = document.createRange();
    range.setStart(node, text.search(/\S/));
    range.setEnd(node, text.trimEnd().length);
    for (const rect of range.getClientRects()) {
      if (!rect.width || !rect.height) continue;
      left = Math.min(left, rect.left);
      right = Math.max(right, rect.right);
    }
  }
  if (!Number.isFinite(left)) {
    link.style.removeProperty('--link-text-width');
    link.style.removeProperty('--link-text-center');
    return;
  }
  const center = (left + right) / 2 - link.getBoundingClientRect().left - link.clientLeft;
  link.style.setProperty('--link-text-width', `${right - left}px`);
  link.style.setProperty('--link-text-center', `${center}px`);
}

let cleanup = () => {};

function bind() {
  cleanup();
  const links = [...document.querySelectorAll<HTMLElement>(selector)];
  const controller = new AbortController();
  const observer = new ResizeObserver(entries => {
    for (const entry of entries) measureText(entry.target as HTMLElement);
  });
  const measureAll = () => links.forEach(measureText);
  links.forEach(link => observer.observe(link));
  // Font metrics may change without resizing a stretched navigation link.
  document.fonts.ready.then(() => {
    if (!controller.signal.aborted) measureAll();
  });
  document.fonts.addEventListener('loadingdone', measureAll, { signal: controller.signal });
  cleanup = () => {
    controller.abort();
    observer.disconnect();
  };
}

// Astro emits page-load for the initial page and subsequent client navigations.
document.addEventListener('astro:page-load', bind);
document.addEventListener('astro:before-swap', () => cleanup());
