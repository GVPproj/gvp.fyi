#!/usr/bin/env node
// Read-only replay of issue 35's public capture and two independently built trees.
// No servers, credentials, network fetches, source rewrites, or screenshot tolerances.
import { readFile, writeFile, mkdir, readdir, access } from 'node:fs/promises';
import { resolve, join, extname, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright-core';
import sharp from 'sharp';

const evidence = resolve(process.argv[2] || '/home/gvp/.local/state/gvp-fyi-migration-35');
const output = resolve(process.argv[3] || join(evidence, 'parity'));
const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
if (!executablePath) throw new Error('Set PLAYWRIGHT_CHROMIUM_EXECUTABLE to the working Chromium binary.');
const roots = { old: join(evidence, 'old-source/dist'), native: join(evidence, 'native-build') };
await Promise.all(Object.values(roots).map(root => access(join(root, '_redirects'))));
await mkdir(output, { recursive: true });
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const json = async path => JSON.parse(await readFile(path, 'utf8'));
const baseline = await json(join(evidence, 'baseline.json'));
const manifestPath = resolve('docs/migrations/35/manifest.json');
const manifest = await json(manifestPath);
const entries = new Map([...baseline.routes, ...baseline.assets].map(entry => [entry.path, entry]));
const writeJSON = (path, value) => writeFile(path, JSON.stringify(value, null, 2) + '\n');
async function files(root) {
  const result = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    result.push(...(entry.isDirectory() ? await files(path) : [path]));
  }
  return result.sort();
}
const treeFiles = Object.fromEntries(await Promise.all(Object.entries(roots).map(async ([name, root]) => [name, await files(root)])));
const treeHashes = async () => Object.fromEntries(await Promise.all(Object.entries(treeFiles).map(async ([name, paths]) => [name, sha((await Promise.all(paths.map(async path => `${relative(roots[name], path)} ${sha(await readFile(path))}`))).join('\n'))])));
const initialTreeHashes = await treeHashes();
const reuse = process.argv[4] === '--reuse';
const previous = reuse ? await json(join(output, 'results.json')) : null;
if (reuse && (JSON.stringify(previous.inputs.initialTreeHashes) !== JSON.stringify(initialTreeHashes) || previous.inputs.baselineSha256 !== sha(await readFile(join(evidence, 'baseline.json'))) || previous.inputs.treeChangedDuringRun.length)) throw new Error('Cannot reuse screenshots: input trees/capture changed or previous run was unstable.');
const htmlRoute = path => '/' + path.replace(/index\.html$/, '').replace(/\\/g, '/');
const refresh = html => html.match(/http-equiv=["']refresh["'][^>]*content=["'][^"']*url=([^"']+)/i)?.[1] || null;
const inventory = {};
for (const [name, root] of Object.entries(roots)) {
  inventory[name] = [];
  for (const path of treeFiles[name].filter(path => path.endsWith('.html'))) {
    inventory[name].push({ route: htmlRoute(relative(root, path)), redirect: refresh(await readFile(path, 'utf8')) });
  }
}
inventory.deployed = [];
for (const entry of baseline.routes.filter(entry => entry.file && entry.type.includes('text/html'))) {
  inventory.deployed.push({ route: entry.path, redirect: refresh(await readFile(join(evidence, entry.file), 'utf8')) });
}
function difference(a, b, path = '') {
  if (JSON.stringify(a) === JSON.stringify(b)) return [];
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return [{ path, before: a ?? null, after: b ?? null }];
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].flatMap(key => difference(a[key], b[key], path + '/' + key));
}
const checks = { inventory: {}, compatibility: {}, capturedBytes: { checked: 0, failures: [] }, nativeImages: { checked: 0, failures: [] }, audio: { checked: 0, failures: [] }, fonts: { checked: 0, failures: [] } };
checks.inventory.oldToNative = difference(inventory.old, inventory.native);
checks.inventory.capturedToOld = inventory.deployed.flatMap(entry => difference(entry, inventory.old.find(other => other.route === entry.route), entry.route));
checks.inventory.uncapturedOldRoutes = inventory.old.filter(entry => !inventory.deployed.some(other => other.route === entry.route));
checks.inventory.hostRedirects = difference(await readFile(join(roots.old, '_redirects'), 'utf8'), await readFile(join(roots.native, '_redirects'), 'utf8'));
checks.inventory.manifestRedirects = Object.fromEntries(['old', 'native'].map(name => [name, [...manifest.items.map(item => ({ route: item.legacyRoute + '/', redirect: item.redirectHops.find(hop => hop.mechanism === 'meta-refresh').location })), { route: manifest.linksRedirect.via, redirect: manifest.linksRedirect.to }].flatMap(expected => difference(expected, inventory[name].find(entry => entry.route === expected.route), expected.route))]));
checks.inventory.capturedHTTPRedirects = baseline.routes.filter(entry => entry.location).map(({ path, status, location }) => ({ path, status, location }));
// Static output can prove redirect documents and hosting-rule equality, not a host's implicit slash redirect behavior.
for (const entry of [...baseline.routes, ...baseline.assets].filter(entry => entry.file)) {
  checks.capturedBytes.checked++;
  if (sha(await readFile(join(evidence, entry.file))) !== entry.sha256) checks.capturedBytes.failures.push(entry.path);
}
for (const [name, root] of Object.entries(roots)) {
  checks.compatibility[name] = { checked: 0, failures: [] };
  for (const asset of manifest.compatibilityAssets) {
    checks.compatibility[name].checked++;
    try {
      if (sha(await readFile(join(root, asset.path))) !== asset.sha256) checks.compatibility[name].failures.push(asset.path);
    } catch { checks.compatibility[name].failures.push(asset.path); }
  }
}
for (const path of treeFiles.native.filter(path => path.includes('/_astro/') && /\.(webp|png|jpe?g|gif|avif)$/i.test(path))) {
  checks.nativeImages.checked++;
  try { await sharp(path).raw().toBuffer(); } catch (error) { checks.nativeImages.failures.push({ path: relative(roots.native, path), error: error.message }); }
}
for (const path of treeFiles.old.filter(path => path.includes('/audio/'))) {
  checks.audio.checked++;
  const rel = relative(roots.old, path);
  try { if (sha(await readFile(path)) !== sha(await readFile(join(roots.native, rel)))) checks.audio.failures.push(rel); }
  catch { checks.audio.failures.push(rel); }
}
for (const entry of baseline.assets.filter(entry => entry.path.startsWith('/fonts/'))) {
  for (const [name, root] of Object.entries(roots)) {
    checks.fonts.checked++;
    try { if (sha(await readFile(join(root, entry.path))) !== entry.sha256) checks.fonts.failures.push({ name, path: entry.path }); }
    catch { checks.fonts.failures.push({ name, path: entry.path }); }
  }
}
await writeJSON(join(output, 'inventory.json'), inventory);
await writeJSON(join(output, 'checks.json'), checks);
const routes = inventory.deployed.filter(entry => !entry.redirect && (/^\/(likes|music)(\/|$)/.test(entry.route) || ['/', '/software/'].includes(entry.route))).map(entry => entry.route).sort();
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.woff': 'font/woff', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg', '.pdf': 'application/pdf', '.json': 'application/json' };
const screenshots = [], comparisons = [], requests = { missing: [], external: [], errors: [] }, frozenGIFs = new Map();
const imagePairs = new Map();
const browser = await chromium.launch({ executablePath, headless: true });
const browserVersion = browser.version();
async function capture(page) {
  return page.evaluate(() => {
    const clean = value => value.replace(/\s+/g, ' ').trim();
    const url = value => {
      if (!value) return value;
      const parsed = new URL(value, location.href);
      if (parsed.origin === location.origin) { parsed.searchParams.delete('dpl'); return parsed.pathname + parsed.search + parsed.hash; }
      return parsed.href;
    };
    const rect = element => { const r = element.getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map(n => Math.round(n * 64) / 64); };
    const text = [], textGeometry = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.parentElement.closest('script,style,noscript')) continue;
      const value = clean(node.textContent);
      if (!value) continue;
      text.push(value);
      const range = document.createRange(); range.selectNodeContents(node);
      textGeometry.push({ text: value, rects: [...range.getClientRects()].map(r => [r.x, r.y, r.width, r.height].map(n => Math.round(n * 64) / 64)) });
    }
    const images = [...document.images];
    return {
      semantic: {
        title: document.title, text,
        metadata: [...document.head.querySelectorAll('meta:not([name="generator"]),link[rel="canonical"]')].map(el => Object.fromEntries([...el.attributes].map(a => [a.name, a.name === 'href' ? url(a.value) : a.value]))),
        links: [...document.querySelectorAll('a[href]')].map(el => ({ text: clean(el.textContent), href: url(el.getAttribute('href')), target: el.getAttribute('target'), rel: el.getAttribute('rel'), label: el.getAttribute('aria-label') })),
        media: images.map(el => ({ alt: el.alt, width: el.getAttribute('width'), height: el.getAttribute('height'), sizes: el.getAttribute('sizes'), descriptors: (el.getAttribute('srcset') || '').split(',').filter(Boolean).map(s => s.trim().split(/\s+/).slice(1).join(' ')) })),
        audio: [...document.querySelectorAll('audio, audio source')].map(el => ({ tag: el.tagName, src: url(el.getAttribute('src')), controls: el.hasAttribute('controls'), preload: el.getAttribute('preload'), type: el.getAttribute('type') })),
        embeds: [...document.querySelectorAll('iframe')].map(el => ({ src: el.src, title: el.title, width: el.getAttribute('width'), height: el.getAttribute('height') })),
      },
      geometry: { text: textGeometry, elements: [...document.querySelectorAll('header,main,footer,section,h1,h2,h3,p,li,img,audio,iframe')].map(el => ({ tag: el.tagName, rect: rect(el) })), scroll: [document.documentElement.scrollWidth, document.documentElement.scrollHeight] },
      images: images.map(el => ({ src: url(el.getAttribute('src')), currentSrc: url(el.currentSrc), srcset: el.getAttribute('srcset'), natural: [el.naturalWidth, el.naturalHeight], decoded: el.complete && el.naturalWidth > 0, rect: rect(el) })),
      fonts: [...document.fonts].map(font => ({ family: font.family, status: font.status })),
    };
  });
}
async function pixelDiff(beforePath, afterPath, diffPath, imageRects) {
  const a = await sharp(beforePath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const b = await sharp(afterPath).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const width = Math.max(a.info.width, b.info.width), height = Math.max(a.info.height, b.info.height);
  let changed = 0, over8 = 0, outsideImages = 0, absolute = 0, max = 0, left = width, top = height, right = -1, bottom = -1;
  const diff = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    let delta = 0;
    for (let c = 0; c < 3; c++) {
      const av = x < a.info.width && y < a.info.height ? a.data[(y * a.info.width + x) * 4 + c] : 0;
      const bv = x < b.info.width && y < b.info.height ? b.data[(y * b.info.width + x) * 4 + c] : 0;
      const d = Math.abs(av - bv); delta = Math.max(delta, d); absolute += d;
      diff[i + c] = Math.round(av * 0.25);
    }
    diff[i + 3] = 255;
    if (delta) {
      changed++; if (delta > 8) over8++; max = Math.max(max, delta);
      if (!imageRects.some(([rx, ry, rw, rh]) => x >= Math.floor(rx) && y >= Math.floor(ry) && x < Math.ceil(rx + rw) && y < Math.ceil(ry + rh))) outsideImages++;
      left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y);
      diff[i] = 255; diff[i + 1] = 0; diff[i + 2] = 80;
    }
  }
  if (changed) await sharp(diff, { raw: { width, height, channels: 4 } }).png().toFile(diffPath);
  return { beforeSize: [a.info.width, a.info.height], afterSize: [b.info.width, b.info.height], changed, pixels: width * height, changedPercent: changed * 100 / (width * height), over8, outsideImages, meanAbsoluteChannelError: absolute / (width * height * 3), maxChannelError: max, bounds: changed ? [left, top, right + 1, bottom + 1] : null, diff: changed ? relative(output, diffPath) : null };
}
try {
  for (const [viewportName, viewport] of [['desktop', { width: 1280, height: 800 }], ['mobile', { width: 390, height: 844 }]]) {
    const snapshots = {};
    for (const name of ['deployed', 'old', 'native']) {
      snapshots[name] = {};
      const context = await browser.newContext({ viewport, deviceScaleFactor: 1, reducedMotion: 'reduce', serviceWorkers: 'block', locale: 'en-US', timezoneId: 'UTC', colorScheme: 'light' });
      await context.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.origin !== 'https://gvp.fyi') {
          requests.external.push({ name, viewport: viewportName, url: url.href });
          return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><body style="background:#2e3440"></body>' });
        }
        try {
          let bytes, type;
          if (name === 'deployed') {
            const entry = entries.get(url.pathname);
            if (!entry) throw new Error('Not in public capture');
            if (entry.location) return route.fulfill({ status: entry.status, headers: { location: entry.location }, body: '' });
            bytes = await readFile(join(evidence, entry.file)); type = entry.type;
          } else {
            const path = join(roots[name], decodeURIComponent(url.pathname), url.pathname.endsWith('/') ? 'index.html' : '');
            bytes = await readFile(path); type = mime[extname(path)] || 'application/octet-stream';
          }
          // Freeze each source GIF's own first frame: no shared replacement or masked pixels.
          if (type.includes('image/gif')) {
            const key = sha(bytes);
            if (!frozenGIFs.has(key)) frozenGIFs.set(key, { path: url.pathname, bytes: await sharp(bytes, { page: 0, pages: 1 }).png().toBuffer() });
            bytes = frozenGIFs.get(key).bytes; type = 'image/png';
          }
          return route.fulfill({ status: 200, contentType: type, body: bytes });
        } catch (error) {
          requests.missing.push({ name, viewport: viewportName, path: url.pathname, error: error.message });
          return route.abort();
        }
      });
      const page = await context.newPage();
      page.on('pageerror', error => requests.errors.push({ name, viewport: viewportName, route: new URL(page.url()).pathname, error: error.message }));
      const dir = join(output, viewportName, name);
      await mkdir(dir, { recursive: true });
      for (const route of routes) {
        if (reuse) {
          const prior = previous.screenshots.find(row => row.name === name && row.viewport === viewportName && row.route === route);
          if (!prior || sha(await readFile(join(output, prior.path))) !== prior.sha256) throw new Error(`Cannot reuse missing/changed screenshot: ${name} ${viewportName} ${route}`);
          snapshots[name][route] = await json(join(output, prior.path.replace(/\.png$/, '.json')));
          screenshots.push(prior);
          continue;
        }
        await page.goto('https://gvp.fyi' + route, { waitUntil: 'networkidle' });
        await page.evaluate(async () => {
          for (const image of document.images) image.loading = 'eager';
          await document.fonts.ready;
          await Promise.all([...document.images].map(image => image.decode().catch(() => {})));
          await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        });
        const slug = route.replace(/^\/+|\/+$/g, '').replaceAll('/', '--') || 'home';
        const path = join(dir, slug + '.png');
        const snapshot = await capture(page);
        const bytes = await page.screenshot({ path, fullPage: true, animations: 'disabled' });
        snapshots[name][route] = snapshot;
        await writeJSON(join(dir, slug + '.json'), snapshot);
        screenshots.push({ name, viewport: viewportName, route, path: relative(output, path), sha256: sha(bytes), missingImages: snapshot.images.filter(image => !image.decoded) });
      }
      await context.close();
      console.log(`${viewportName} ${name}: ${routes.length} pages ${reuse ? 'reused (PNG checksums verified)' : 'captured'}`);
    }
    for (const [before, after] of [['deployed', 'old'], ['old', 'native'], ['deployed', 'native']]) {
      const dir = join(output, viewportName, `${before}-to-${after}`);
      await mkdir(dir, { recursive: true });
      for (const route of routes) {
        const slug = route.replace(/^\/+|\/+$/g, '').replaceAll('/', '--') || 'home';
        const a = snapshots[before][route], b = snapshots[after][route];
        const semantic = difference(a.semantic, b.semantic), geometry = difference(a.geometry, b.geometry);
        const mediaURLs = difference(a.images.map(({ src, currentSrc, srcset }) => ({ src, currentSrc, srcset })), b.images.map(({ src, currentSrc, srcset }) => ({ src, currentSrc, srcset })));
        for (let i = 0; i < a.images.length; i++) {
          if (!b.images[i]) continue;
          const pair = { before, after, beforePath: a.images[i].currentSrc, afterPath: b.images[i].currentSrc };
          const key = JSON.stringify(pair);
          if (!imagePairs.has(key)) imagePairs.set(key, { ...pair, appearances: [] });
          imagePairs.get(key).appearances.push({ route, viewport: viewportName, imageIndex: i });
        }
        const pixels = await pixelDiff(join(output, viewportName, before, slug + '.png'), join(output, viewportName, after, slug + '.png'), join(dir, slug + '.png'), a.images.map(image => image.rect));
        const detailPath = join(dir, slug + '.json');
        await writeJSON(detailPath, { route, semantic, geometry, mediaURLs, naturalDimensions: difference(a.images.map(image => image.natural), b.images.map(image => image.natural)), fonts: difference(a.fonts, b.fonts), pixels });
        comparisons.push({ before, after, viewport: viewportName, route, semanticDifferences: semantic.length, geometryDifferences: geometry.length, mediaURLDifferences: mediaURLs.length, pixels, detail: relative(output, detailPath) });
      }
    }
  }
} finally { await browser.close(); }
// Decode selected image pairs as well: horizontal scroll rows include images outside screenshots.
const mediaComparisons = [];
const imageBytes = async (name, path) => readFile(name === 'deployed' ? join(evidence, entries.get(path).file) : join(roots[name], path));
for (const pair of imagePairs.values()) {
  const ab = await imageBytes(pair.before, pair.beforePath), bb = await imageBytes(pair.after, pair.afterPath);
  const hashes = [sha(ab), sha(bb)];
  if (hashes[0] === hashes[1]) continue;
  const a = await sharp(ab, { page: 0, pages: 1 }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const b = await sharp(bb, { page: 0, pages: 1 }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let changed = 0, max = 0, sum = 0;
  const sameDimensions = a.info.width === b.info.width && a.info.height === b.info.height;
  if (sameDimensions) for (let i = 0; i < a.data.length; i += 4) {
    let delta = 0;
    for (let c = 0; c < 3; c++) { const d = Math.abs(a.data[i + c] - b.data[i + c]); delta = Math.max(delta, d); sum += d; }
    if (delta) changed++; max = Math.max(max, delta);
  }
  mediaComparisons.push({ ...pair, sha256: hashes, dimensions: [[a.info.width, a.info.height], [b.info.width, b.info.height]], sameDimensions, changedPixels: sameDimensions ? changed : null, maxChannelError: sameDimensions ? max : null, meanAbsoluteChannelError: sameDimensions ? sum / (a.info.width * a.info.height * 3) : null });
}
await writeJSON(join(output, 'media-comparisons.json'), mediaComparisons);
// Reproduce the width-only versus rounded-two-dimension resize boundary without altering either build.
const resizeProbes = [];
for (const pair of mediaComparisons.filter(pair => pair.before === 'old' && pair.after === 'native')) {
  const appearance = pair.appearances[0];
  let contentRoute = appearance.route.replace(/\/$/, '');
  if (['/likes', '/music'].includes(contentRoute)) {
    const snapshot = await json(join(output, appearance.viewport, 'old', contentRoute.slice(1) + '.json'));
    contentRoute = snapshot.semantic.links.filter(link => link.href.startsWith(contentRoute + '/'))[appearance.imageIndex].href;
  }
  const item = [...manifest.items, ...manifest.releases].find(item => item.route === contentRoute);
  if (!item) continue;
  const source = await readFile(join(evidence, item.original.sourcePath));
  if (sha(source) !== item.original.sha256) throw new Error(`Original checksum mismatch: ${item.slug}`);
  const width = pair.dimensions[1][0];
  const row = { slug: item.slug, width, sourceSha256: sha(source), old: { path: pair.beforePath, sha256: pair.sha256[0] }, native: { path: pair.afterPath, sha256: pair.sha256[1] } };
  for (const [name, options] of [['widthOnly', { width }], ['widthAndHeight', { width, height: Math.round(width * item.original.height / item.original.width), withoutEnlargement: true }]]) {
    const hash = sha(await sharp(source).rotate().resize(options).webp({ quality: 80 }).toBuffer());
    row[name] = { sha256: hash, matchesOld: hash === row.old.sha256, matchesNative: hash === row.native.sha256 };
  }
  resizeProbes.push(row);
}
await writeJSON(join(output, 'resize-probes.json'), resizeProbes);
const finalTreeHashes = await treeHashes();
const result = {
  issue: 35, capturedAt: new Date().toISOString(), evidence, output,
  reusedCaptureAt: previous?.capturedAt ?? null,
  command: 'TMPDIR="$EVIDENCE/tmp" PLAYWRIGHT_CHROMIUM_EXECUTABLE="$CHROMIUM" node scripts/verify-migration-parity.mjs "$EVIDENCE" "$EVIDENCE/parity"' + (reuse ? ' --reuse' : ''),
  verifierSha256: sha(await readFile(new URL(import.meta.url))),
  browser: browserVersion, executablePath, node: process.version, sharp: sharp.versions,
  controls: { origin: 'https://gvp.fyi', viewports: ['1280x800', '390x844'], deviceScaleFactor: 1, reducedMotion: 'reduce', locale: 'en-US', timezone: 'UTC', thirdParty: 'Fixed #2e3440 HTML; no outgoing network requests', gifs: 'Each source GIF decoded to its own first frame; no masks', normalization: 'Ignore Astro generator metadata, remove only same-origin dpl query params, compare native image URLs separately', pixelPolicy: 'All differing RGB pixels counted, including antialiasing. over8 is diagnostic only, not a pass threshold.' },
  inputs: { baselineSha256: sha(await readFile(join(evidence, 'baseline.json'))), manifestSha256: sha(await readFile(manifestPath)), initialTreeHashes, finalTreeHashes, treeChangedDuringRun: difference(initialTreeHashes, finalTreeHashes) },
  frozenGIFs: previous?.frozenGIFs ?? [...frozenGIFs].map(([sourceSha256, { path, bytes }]) => ({ path, sourceSha256, frozenSha256: sha(bytes) })),
  checks, requests: previous?.requests ?? requests, screenshots, comparisons, mediaComparisons, resizeProbes,
  summary: Object.fromEntries(['deployed-to-old', 'old-to-native', 'deployed-to-native'].map(pair => {
    const rows = comparisons.filter(row => `${row.before}-to-${row.after}` === pair);
    return [pair, { comparisons: rows.length, semanticMismatchPages: rows.filter(row => row.semanticDifferences).length, geometryMismatchPages: rows.filter(row => row.geometryDifferences).length, pixelMismatchPages: rows.filter(row => row.pixels.changed).length, outsideImageMismatchPages: rows.filter(row => row.pixels.outsideImages).length }];
  })),
};
await writeJSON(join(output, 'results.json'), result);
console.log(JSON.stringify({ summary: result.summary, missingRequests: requests.missing.length, pageErrors: requests.errors.length, treeChangedDuringRun: result.inputs.treeChangedDuringRun }, null, 2));
// Differences are findings, never an implicit approval. Nonzero exit makes incomplete parity explicit.
if (mediaComparisons.some(pair => !pair.sameDimensions || pair.changedPixels) || result.inputs.treeChangedDuringRun.length || result.requests.missing.length || result.requests.errors.length || screenshots.some(row => row.missingImages.length) || checks.inventory.oldToNative.length || checks.inventory.capturedToOld.length || checks.inventory.hostRedirects.length || Object.values(checks.inventory.manifestRedirects).some(rows => rows.length) || checks.capturedBytes.failures.length || checks.nativeImages.failures.length || checks.audio.failures.length || checks.fonts.failures.length || Object.values(checks.compatibility).some(row => row.failures.length) || comparisons.some(row => row.semanticDifferences || row.geometryDifferences || row.pixels.changed)) process.exitCode = 1;
