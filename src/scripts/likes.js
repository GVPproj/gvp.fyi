import { createLikesAPI, renderItem, textItemTitle, webURL } from '../lib/likes.js';
import { getSession, clearSession, RECOVERY_KEY } from '../lib/session.js';

document.addEventListener('astro:page-load', () => {
  const root = document.querySelector('#likes');
  if (!root || root.dataset.bound) return;
  root.dataset.bound = 'true';
  let token = getSession(), editing = null, existingAsset = '', busy = false;
  let publicItems = [], draftItems = [], boardRequest = 0, draftRequest = 0;
  let collections = [], loaded = false, memberships = new Set(), readMessage = '';
  const window = document.defaultView;
  const selectedCollection = () => new URL(window.location.href).searchParams.get('collection') ?? '';
  let sessionGeneration = 0;
  const api = createLikesAPI(root.dataset.endpoint);
  // Guard the authenticated API boundary; public reads and URL helpers are unaffected.
  for (const method of ['duplicates', 'preview', 'fileToken', 'listDrafts', 'remove', 'save', 'saveCollection', 'removeCollection']) {
    const request = api[method];
    api[method] = async (...args) => {
      const session = token, generation = sessionGeneration;
      if (!session) throw new Error('Sign in with the owner account and try again.');
      try {
        const result = await request(...args);
        if (generation !== sessionGeneration) throw new Error('Session changed; request result ignored.');
        return result;
      } catch (error) {
        // Network and validation failures keep both authentication and the editor.
        if (generation === sessionGeneration && session === token && [401, 403].includes(error.status)) clearSession('expired');
        throw error;
      }
    };
  }
  const board = root.querySelector('#likes-board');
  const status = root.querySelector('#read-status');
  const more = root.querySelector('#load-more');
  const retryRead = root.querySelector('#retry-read');
  let cursor = null, reading = false, retryAppend = false, hasAppendedPage = false;
  const save = root.querySelector('#save-link');
  const saveStatus = root.querySelector('#save-status');
  const editorDialog = root.querySelector('#item-editor-dialog');
  const collectionsDialog = root.querySelector('#collections-dialog');
  const openItemEditor = root.querySelector('#open-item-editor');
  const openCollections = root.querySelector('#open-collections');
  openItemEditor.addEventListener('click', () => {
    if (!busy && token) editorDialog.showModal();
  });
  openCollections.addEventListener('click', () => {
    if (!busy && token) collectionsDialog.showModal();
  });
  for (const [dialog, trigger] of [[editorDialog, openItemEditor], [collectionsDialog, openCollections]]) {
    dialog.querySelector('[data-close-dialog]').addEventListener('click', () => {
      if (!busy) dialog.close();
    });
    dialog.addEventListener('cancel', event => {
      if (busy) event.preventDefault();
    });
    dialog.addEventListener('close', () => {
      // Saving can replace the card that originally opened the editor.
      if (token && (!document.activeElement || document.activeElement === document.body || dialog.contains(document.activeElement))) trigger.focus();
    });
  }
  const drafts = root.querySelector('#drafts-board');
  const draftStatus = root.querySelector('#draft-status');
  const draft = save.querySelector('[name=draft]');
  const deleteButton = root.querySelector('#delete-item');
  const confirmation = root.querySelector('#delete-confirmation');
  const fields = ['url', 'title', 'description', 'commentary', 'body', 'attribution'];
  const typeInput = save.querySelector('[name=type]');
  function updateItemType() {
    const textItem = ['quote', 'note'].includes(typeInput.value);
    root.querySelector('#text-fields').hidden = !textItem;
    save.querySelector('[name=body]').required = textItem;
    save.querySelector('[name=title]').required = !textItem;
    root.querySelector('#fetch-preview').hidden = textItem;
    invalidatePreview();
  }
  typeInput.addEventListener('change', updateItemType);
  const previewStatus = root.querySelector('#preview-status');
  const urlInput = save.querySelector('[name=url]');
  const duplicateReview = root.querySelector('#duplicate-review');
  const duplicateItems = root.querySelector('#duplicate-items');
  let duplicateRequest = 0, duplicateURL = '';
  function clearDuplicates() {
    duplicateRequest++;
    duplicateURL = '';
    duplicateItems.replaceChildren();
    duplicateReview.hidden = true;
  }
  function showDuplicates(items, url) {
    duplicateURL = url;
    duplicateItems.replaceChildren(...items.map(item => {
      const row = document.createElement('li');
      const heading = document.createElement('h4');
      heading.textContent = textItemTitle(item);
      const detail = document.createElement('p');
      detail.textContent = [item.published ? 'Published' : 'Draft', item.type || 'Link / image / PDF',
        item.created, `ID: ${item.id}`, item.url, item.body, item.attribution, item.description,
        item.commentary, item.asset, (item.collections ?? []).map(id => collections.find(group => group.id === id)?.name ?? id).join(', ')].filter(Boolean).join('\n');
      const open = document.createElement('button');
      open.type = 'button';
      open.textContent = 'Open existing item';
      open.addEventListener('click', () => openEditor(item));
      row.append(heading, detail, open);
      return row;
    }));
    duplicateReview.hidden = false;
  }
  async function checkPastedURL() {
    clearDuplicates();
    if (editing) return;
    const request = duplicateRequest, session = token, url = urlInput.value;
    const current = () => request === duplicateRequest && session === token && url === urlInput.value;
    saveStatus.textContent = 'Checking for existing items…';
    try {
      const result = await api.duplicates(session, url);
      if (!current()) return;
      if (result.items.length) showDuplicates(result.items, url);
      saveStatus.textContent = result.items.length ? 'Already in Likes. Open an existing item or choose Save another.' : '';
    } catch (error) {
      if (current()) saveStatus.textContent = `${error.message} Could not check existing items. Try Save item to check again; your fields are kept.`;
    }
  }
  root.querySelector('#save-another').addEventListener('click', () => {
    if (!busy && !editing && !duplicateReview.hidden && duplicateURL === urlInput.value && save.reportValidity()) submitItem(true);
  });
  urlInput.addEventListener('input', clearDuplicates);
  const assetInput = save.querySelector('[name=asset]');
  const removeAssetInput = save.querySelector('[name=removeAsset]');
  const previewImage = root.querySelector('#preview-image');
  const imageReview = root.querySelector('#preview-image-review');
  const imageStatus = root.querySelector('#preview-image-status');
  function previewSession(provenance = null, request = 0) {
    return {
      request, candidate: null, selected: null,
      provenance: provenance ? structuredClone(provenance) : null,
      protectedMetadata: new Set(),
      overrides: { title: false, description: false, image: false, ...provenance?.overrides },
    };
  }
  let preview = previewSession();
  function clearCandidateImage() {
    preview.candidate = null;
    previewImage.removeAttribute('src');
    imageReview.hidden = true;
  }
  root.querySelector('#use-preview-image').addEventListener('click', () => {
    if (busy || !preview.candidate) return;
    preview.selected = preview.candidate;
    assetInput.value = '';
    removeAssetInput.checked = false;
    preview.overrides.image = false;
    imageStatus.textContent = 'Fetched image selected. It will upload when you save.';
  });
  root.querySelector('#discard-preview-image').addEventListener('click', () => {
    if (busy) return;
    preview.selected = null;
    clearCandidateImage();
    preview.overrides.image = true;
    imageStatus.textContent = 'Fetched image discarded. Current upload choice kept.';
  });
  assetInput.addEventListener('change', () => {
    preview.selected = null;
    preview.overrides.image = true;
    if (assetInput.files?.length) removeAssetInput.checked = false;
    imageStatus.textContent = 'Your upload choice will be used, not the fetched image.';
  });
  removeAssetInput.addEventListener('change', () => {
    preview.overrides.image = true;
    if (removeAssetInput.checked) {
      preview.selected = null;
      assetInput.value = '';
      imageStatus.textContent = 'Current upload will be removed when you save.';
    } else imageStatus.textContent = '';
  });
  for (const name of ['title', 'description']) {
    save.querySelector(`[name=${name}]`).addEventListener('input', () => { preview.overrides[name] = true; });
  }
  async function fetchPreview() {
    if (busy || !token || typeInput.value) return;
    const request = ++preview.request;
    const url = urlInput.value;
    const session = token;
    const current = () => request === preview.request && url === urlInput.value && session === token;
    previewStatus.textContent = 'Fetching preview… You can still edit and save.';
    try {
      const result = await api.preview(session, url);
      if (!current()) return;
      for (const name of ['title', 'description']) {
        const field = save.querySelector(`[name=${name}]`);
        if (!preview.protectedMetadata.has(name) && !preview.overrides[name] && (!field.value || field.value === preview.provenance?.fetched[name])) field.value = result[name] ?? '';
        else preview.overrides[name] = true;
      }
      root.querySelector('#preview-metadata-review').hidden = !['title', 'description'].some(name => preview.overrides[name]);
      for (const name of ['title', 'description']) root.querySelector(`#preview-${name}`).textContent = result[name] ?? '';
      const { sourceURL, finalURL, fetchedAt, title, description } = result;
      preview.provenance = { assetSource: preview.provenance?.assetSource ?? null,
        fetched: { sourceURL, finalURL, fetchedAt, title, description, image: null } };
      clearCandidateImage();
      if (preview.selected || assetInput.files?.length || existingAsset) preview.overrides.image = true;
      if (result.image) {
        const { sourceURL, finalURL, name, type, base64 } = result.image;
        preview.provenance.fetched.image = { sourceURL, finalURL, name, type };
        // Never load an upstream image URL into the DOM. The backend returns bounded bytes.
        if (!['image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(type)) throw new Error('Preview image type is unsupported.');
        const bytes = Uint8Array.from(atob(base64), character => character.charCodeAt(0));
        preview.candidate = {
          file: new File([bytes], name, { type }),
          source: { sourceURL, finalURL, name, type, fetchedAt, pageURL: result.finalURL },
        };
        previewImage.src = `data:${type};base64,${base64}`;
        imageReview.hidden = false;
        preview.overrides.image = true; // Not adopted until the owner explicitly chooses it.
      }
      if (preview.selected) imageStatus.textContent = preview.candidate
        ? 'Previously selected image is kept. Choose “Use fetched image” to replace it with this preview.'
        : 'Previously selected image is kept; this fetch did not provide a replacement.';
      previewStatus.textContent = `Preview fetched. ${result.warning || 'Review the metadata before saving.'}`;
    } catch (error) {
      if (current()) previewStatus.textContent = `${error.message} You can still enter metadata and save.`;
    }
  }
  function invalidatePreview() {
    preview.request++;
    previewStatus.textContent = '';
  }
  urlInput.addEventListener('input', invalidatePreview);
  urlInput.addEventListener('paste', event => {
    const text = event.clipboardData?.getData('text/plain')?.trim();
    if (busy || !token || !webURL(text)) return;
    event.preventDefault();
    urlInput.value = text;
    invalidatePreview();
    checkPastedURL();
    fetchPreview();
  });
  root.querySelector('#fetch-preview').addEventListener('click', fetchPreview);
  function restoreCardFocus(opener, itemId, selector) {
    const replacement = [...root.querySelectorAll('[data-item-id]')]
      .find(card => card.dataset.itemId === itemId)?.querySelector(selector);
    const target = opener?.isConnected ? opener : replacement ?? root.querySelector('#retry-read');
    target.focus();
  }
  const viewer = root.querySelector('#image-viewer');
  const viewerImage = viewer.querySelector('img');
  const viewerStatus = viewer.querySelector('[role=status]');
  let viewerRequest = 0, viewerOpener, viewerItemId;
  const privateWindows = new Set();
  viewer.querySelector('button').addEventListener('click', () => viewer.close());
  // The close button is the viewer's only focusable control.
  viewer.addEventListener('keydown', event => {
    if (event.key === 'Tab') {
      event.preventDefault();
      viewer.querySelector('button').focus();
    }
  });
  viewer.addEventListener('close', () => {
    viewerRequest++;
    viewerImage.removeAttribute('src');
    viewerImage.alt = '';
    restoreCardFocus(viewerOpener, viewerItemId, '.image-card');
  });
  async function openAsset(item, opener) {
    const pdf = /\.pdf$/i.test(item.asset);
    const session = token;
    const request = ++viewerRequest;
    // Open synchronously to retain the browser's user-gesture permission.
    const tab = pdf ? window.open('about:blank', '_blank') : null;
    if (tab) {
      tab.opener = null;
      if (!item.published) privateWindows.add(tab);
    }
    if (!pdf) {
      viewerOpener = opener;
      viewerItemId = item.id;
      viewerImage.removeAttribute('src');
      viewerImage.alt = item.description || item.title;
      viewerStatus.textContent = 'Loading image…';
      viewer.showModal();
    }
    try {
      const fileToken = item.published ? '' : (await api.fileToken(session)).token;
      if (session !== token || request !== viewerRequest) { tab?.close(); return; }
      const url = api.assetURL(item, fileToken);
      if (pdf) {
        if (!tab) throw new Error('Allow popups to open the PDF in a new tab.');
        // Retain a same-origin shell with no opener. Navigating the window itself
        // cross-origin would prevent reliably closing it during local logout.
        tab.document.title = item.title || 'Private PDF';
        const frame = tab.document.createElement('iframe');
        frame.title = item.title || 'Private PDF';
        frame.src = url;
        frame.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;border:0';
        tab.document.body.replaceChildren(frame);
      } else {
        viewerImage.onload = () => { viewerStatus.textContent = ''; };
        viewerImage.onerror = () => { viewerStatus.textContent = 'Image could not load. Close and reopen to try again.'; };
        viewerImage.src = url;
      }
    } catch (error) {
      tab?.close();
      if (request !== viewerRequest) return;
      if (pdf) draftStatus.textContent = error.message;
      else viewerStatus.textContent = error.message;
    }
  }

  const reader = root.querySelector('#text-reader');
  let readerOpener, readerItemId;
  reader.querySelector('button').addEventListener('click', () => reader.close());
  reader.addEventListener('keydown', event => {
    if (event.key !== 'Tab') return;
    const controls = [...reader.querySelectorAll('button, a[href]')];
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  reader.addEventListener('close', () => {
    for (const node of reader.querySelectorAll('h2, .text-body, .text-attribution')) node.textContent = '';
    reader.querySelector('a').removeAttribute('href');
    reader.querySelector('a').hidden = true;
    restoreCardFocus(readerOpener, readerItemId, '.text-card');
    readerOpener = null;
    readerItemId = null;
  });
  function openText(item, opener) {
    readerOpener = opener;
    readerItemId = item.id;
    reader.querySelector('h2').textContent = textItemTitle(item);
    reader.querySelector('.text-body').textContent = item.body ?? '';
    reader.querySelector('.text-attribution').textContent = item.attribution ?? '';
    const source = reader.querySelector('a');
    const url = webURL(item.url);
    source.hidden = !url;
    if (url) source.href = url;
    else source.removeAttribute('href');
    reader.showModal();
    reader.scrollTop = 0;
  }

  function previewSaveData() {
    const removeAsset = removeAssetInput.checked;
    // Resolve the file and its attribution together; latest metadata is independent.
    const adopted = removeAsset ? null : preview.selected ?? (assetInput.files?.[0]
      ? { file: assetInput.files[0], source: null }
      : { file: undefined, source: existingAsset ? preview.provenance?.assetSource ?? null : null });
    return {
      asset: adopted?.file, removeAsset,
      previewProvenance: preview.provenance ? {
        fetched: preview.provenance.fetched,
        assetSource: adopted?.source ?? null,
        overrides: { ...preview.overrides },
      } : null,
    };
  }
  function resetPreview(provenance = null) {
    invalidatePreview();
    preview = previewSession(provenance, preview.request);
    root.querySelector('#preview-metadata-review').hidden = true;
    for (const name of ['title', 'description']) root.querySelector(`#preview-${name}`).textContent = '';
    clearCandidateImage();
    imageStatus.textContent = '';
  }
  function resetEditor() {
    clearDuplicates();
    resetPreview();
    editing = null;
    existingAsset = '';
    root.querySelector('#current-asset').textContent = '';
    memberships = new Set();
    deleteButton.hidden = true;
    confirmation.hidden = true;
    save.reset();
    typeInput.value = '';
    updateItemType();
    draft.checked = false;
    renderMemberships();
    root.querySelector('#editor-title').textContent = 'Save an item';
  }
  function openEditor(item, recovering = false) {
    if (busy || !token) return;
    if (!recovering) clearRecovery();
    clearDuplicates();
    resetPreview(item.previewProvenance);
    preview.protectedMetadata = new Set(['title', 'description'].filter(name => item[name]));
    editing = item.id;
    existingAsset = item.asset ?? '';
    assetInput.value = '';
    removeAssetInput.checked = false;
    root.querySelector('#current-asset').textContent = existingAsset ? `Current upload: ${existingAsset}` : '';
    deleteButton.hidden = false;
    confirmation.hidden = true;
    for (const field of fields) save.querySelector(`[name=${field}]`).value = item[field] ?? '';
    typeInput.value = item.type ?? '';
    updateItemType();
    draft.checked = !item.published;
    memberships = new Set(item.collections ?? []);
    renderMemberships();
    root.querySelector('#editor-title').textContent = 'Edit item';
    saveStatus.textContent = '';
    if (!editorDialog.open) editorDialog.showModal();
    root.querySelector('#editor-title').focus();
  }
  function itemCard(item) {
    const card = renderItem(document, item, { assetURL: api.assetURL(item), openAsset, openText });
    card.dataset.itemId = item.id;
    if (token) {
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.textContent = 'Edit';
      edit.disabled = busy;
      edit.addEventListener('click', () => openEditor(item));
      card.append(edit);
    }
    return card;
  }
  function renderMemberships() {
    root.querySelector('#item-collections').replaceChildren(...collections.map(collection => {
      const label = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.name = 'collections';
      input.value = collection.id;
      input.checked = memberships.has(collection.id);
      input.disabled = busy;
      input.addEventListener('change', () => {
        if (input.checked) memberships.add(collection.id);
        else memberships.delete(collection.id);
      });
      label.append(input, document.createTextNode(` ${collection.name}`));
      return label;
    }));
  }
  async function mutateCollection(action, success) {
    if (busy || !token) return;
    setBusy(true);
    const session = token, generation = sessionGeneration;
    const message = root.querySelector('#collection-status');
    message.textContent = 'Saving collection…';
    try {
      const result = await action();
      if (session !== token) return;
      boardRequest++;
      draftRequest++;
      success(result);
      collections.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
      renderCollections();
      renderMemberships();
      renderBoard();
      message.textContent = 'Collection saved.';
      await Promise.all([load(), loadDrafts()]);
    } catch (error) { if (generation === sessionGeneration) message.textContent = `${error.message} Your collection changes were not confirmed. Retry or reload to check.`; }
    finally { if (generation === sessionGeneration) setBusy(false); }
  }
  function renderCollections() {
    root.querySelector('#collection-list').replaceChildren(...collections.map(collection => {
      const row = document.createElement('li');
      const form = document.createElement('form');
      const label = document.createElement('label');
      label.textContent = 'Collection name';
      const input = document.createElement('input');
      input.value = collection.name;
      input.required = true;
      input.maxLength = 100;
      label.append(input);
      const rename = document.createElement('button');
      rename.textContent = 'Rename';
      form.append(label, rename);
      form.addEventListener('submit', event => {
        event.preventDefault();
        mutateCollection(() => api.saveCollection(token, input.value, collection.id), updated => {
          collections = collections.map(existing => existing.id === updated.id ? updated : existing);
        });
      });
      const button = (text, key, action) => {
        const control = document.createElement('button');
        control.type = 'button';
        control.textContent = text;
        control.dataset[key] = '';
        control.disabled = busy;
        control.addEventListener('click', action);
        return control;
      };
      const confirmation = document.createElement('div');
      confirmation.hidden = true;
      const warning = document.createElement('p');
      warning.textContent = `Delete “${collection.name}”? Only the grouping will be removed. All items will be kept.`;
      confirmation.append(warning,
        button('Delete collection', 'confirm', () => {
          if (confirmation.hidden) return;
          mutateCollection(() => api.removeCollection(token, collection.id), () => {
            collections = collections.filter(existing => existing.id !== collection.id);
            memberships.delete(collection.id);
            for (const item of [...publicItems, ...draftItems]) item.collections = item.collections?.filter(id => id !== collection.id) ?? [];
          });
        }),
        button('Keep collection', 'cancel', () => { if (!busy) confirmation.hidden = true; }));
      row.append(form, button('Delete collection…', 'delete', () => { if (!busy) confirmation.hidden = false; }), confirmation);
      return row;
    }));
  }
  root.querySelector('#create-collection').addEventListener('submit', event => {
    event.preventDefault();
    const input = root.querySelector('#create-collection input');
    mutateCollection(() => api.saveCollection(token, input.value), collection => {
      collections.push(collection);
      input.value = '';
    });
  });
  function renderBoard() {
    const selected = selectedCollection();
    const known = !selected || collections.some(collection => collection.id === selected);
    const visible = known ? publicItems.filter(item => !selected || item.collections?.includes(selected)) : [];
    board.replaceChildren(...visible.map(itemCard));
    updateReadState();
    const filters = [{ id: '', name: 'All' }, ...collections].map(collection => {
      const link = document.createElement('a');
      const url = new URL(window.location.href);
      if (collection.id) url.searchParams.set('collection', collection.id);
      else url.searchParams.delete('collection');
      link.href = url.href;
      link.dataset.collection = collection.id;
      link.textContent = collection.name;
      if (selected === collection.id) link.setAttribute('aria-current', 'page');
      link.addEventListener('click', event => {
        if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || (event.button && event.button !== 0)) return;
        event.preventDefault();
        window.history.pushState(null, '', link.href);
        changeFilter();
        root.querySelector('#collection-filters [aria-current]')?.focus({ preventScroll: true });
      });
      return link;
    });
    const filterNav = root.querySelector('#collection-filters');
    const focusedFilter = filterNav.contains(document.activeElement) ? document.activeElement.dataset.collection : undefined;
    filterNav.replaceChildren(...filters);
    if (focusedFilter !== undefined) filters.find(link => link.dataset.collection === focusedFilter)?.focus({ preventScroll: true });
  }
  function changeFilter() {
    publicItems = [];
    cursor = null;
    loaded = false;
    hasAppendedPage = false;
    readMessage = '';
    renderBoard();
    load();
  }
  const navigate = () => { if (root.isConnected) changeFilter(); };
  window.addEventListener('popstate', navigate);
  document.addEventListener('astro:before-swap', () => window.removeEventListener('popstate', navigate), { once: true });
  function reconcileItem(id, item) {
    // Apply confirmed writes before refreshing so failed reads cannot revive stale cards.
    boardRequest++;
    draftRequest++;
    publicItems = publicItems.filter(existing => existing.id !== id);
    draftItems = draftItems.filter(existing => existing.id !== id);
    if (item) {
      const items = item.published ? publicItems : draftItems;
      items.push(item);
      items.sort((a, b) => (b.created ?? '').localeCompare(a.created ?? '') || b.id.localeCompare(a.id));
    }
    renderBoard();
    drafts.replaceChildren(...draftItems.map(itemCard));
  }
  function setBusy(value) {
    busy = value;
    if (value) invalidatePreview();
    for (const control of root.querySelectorAll('.owner-tools input, .owner-tools textarea, .owner-tools select, .owner-tools button, #likes-board button')) control.disabled = value;
  }
  function updateAuth() {
    root.querySelector('.owner-tools').hidden = !token;
    save.hidden = !token;
    root.querySelector('#draft-tools').hidden = !token;
    root.querySelector('#collection-tools').hidden = !token;
    renderBoard();
  }
  function updateReadState() {
    const selected = selectedCollection();
    const known = !selected || collections.some(collection => collection.id === selected);
    status.textContent = readMessage || (!loaded ? '' : !known ? 'This collection is unavailable. Choose All to browse Likes.'
      : publicItems.length ? cursor ? '' : 'All likes loaded.' : selected ? 'No likes in this collection.' : 'No likes yet.');
    board.setAttribute('aria-busy', String(reading));
    more.hidden = !known || (!cursor && !hasAppendedPage);
    // Keep the control focusable while loading and after exhaustion.
    more.setAttribute('aria-disabled', String(reading || !cursor));
    more.textContent = reading && loaded ? 'Loading more…' : !cursor && hasAppendedPage ? 'All likes loaded' : 'Load more';
    retryRead.hidden = false;
    retryRead.setAttribute('aria-disabled', String(reading));
    retryRead.textContent = reading ? 'Loading Likes…' : readMessage ? 'Retry' : 'Reload Likes';
  }
  async function load(append = false) {
    if (append && (reading || !cursor)) return;
    const request = ++boardRequest;
    const selected = selectedCollection();
    reading = true;
    retryAppend = append;
    readMessage = append ? 'Loading more Likes…' : 'Loading Likes…';
    updateReadState();
    try {
      const [page, groups] = await Promise.all([
        api.listPage({ collection: selected, cursor: append ? cursor : null }),
        append ? Promise.resolve(collections) : api.listCollections(),
      ]);
      if (request !== boardRequest || !root.isConnected) return;
      collections = groups;
      cursor = page.nextCursor;
      loaded = true;
      reading = false;
      readMessage = '';
      if (append) {
        const seen = new Set(publicItems.map(item => item.id));
        const additions = page.items.filter(item => !seen.has(item.id));
        publicItems.push(...additions);
        board.append(...additions.map(itemCard));
        hasAppendedPage = true;
        updateReadState();
      } else {
        publicItems = page.items;
        hasAppendedPage = false;
        renderCollections();
        renderMemberships();
        renderBoard();
      }
    } catch (error) {
      if (request === boardRequest && root.isConnected) {
        reading = false;
        readMessage = `${error.message} Use Retry to ${append ? 'load more' : 'reload the board'}.`;
        updateReadState();
      }
    }
  }
  async function loadDrafts() {
    const request = ++draftRequest;
    if (!token) return;
    draftStatus.textContent = 'Loading drafts…';
    try {
      const items = await api.listDrafts(token);
      if (request !== draftRequest || !token) return;
      draftItems = items;
      drafts.replaceChildren(...draftItems.map(itemCard));
      draftStatus.textContent = items.length ? '' : 'No drafts.';
    } catch (error) {
      if (request === draftRequest && token) draftStatus.textContent = `${error.message} Use Reload drafts to try again.`;
    }
  }
  retryRead.addEventListener('click', () => { if (!reading) load(readMessage ? retryAppend : false); });
  more.addEventListener('click', () => load(true));
  root.querySelector('#retry-drafts').addEventListener('click', loadDrafts);
  root.querySelector('#new-item').addEventListener('click', () => {
    if (busy) return;
    clearRecovery();
    resetEditor();
    saveStatus.textContent = '';
    editorDialog.close();
  });
  deleteButton.addEventListener('click', () => {
    if (!busy && editing) confirmation.hidden = false;
  });
  root.querySelector('#cancel-delete').addEventListener('click', () => {
    if (!busy) confirmation.hidden = true;
  });
  root.querySelector('#confirm-delete').addEventListener('click', async () => {
    if (busy || !token || !editing || confirmation.hidden) return;
    setBusy(true);
    saveStatus.textContent = 'Deleting…';
    const session = token, id = editing, generation = sessionGeneration;
    try {
      await api.remove(session, id);
      if (session !== token) return;
      reconcileItem(id);
      clearRecovery();
      resetEditor();
      saveStatus.textContent = 'Permanently deleted.';
      await Promise.all([load(), loadDrafts()]);
    } catch (error) { if (generation === sessionGeneration) saveStatus.textContent = `${error.message} Your fields have been kept. Deletion was not confirmed; retry or reload to check.`; }
    finally { if (generation === sessionGeneration) setBusy(false); }
  });
  let recoveryGeneration = 0, recoveryBackup = null, recoveryUpload = null;
  const recoveryStatus = root.querySelector('#recovery-status');
  const downloadRecovery = root.querySelector('#download-recovery');
  downloadRecovery.addEventListener('click', async () => {
    await recoveryWrite;
    if (!recoveryBackup) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(recoveryBackup)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'unsaved-like.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  function clearRecovery() {
    recoveryGeneration++;
    recoveryBackup = null;
    recoveryUpload = null;
    downloadRecovery.hidden = true;
    recoveryStatus.textContent = '';
    try { window.sessionStorage.removeItem(RECOVERY_KEY); } catch { /* Storage may be unavailable. */ }
  }
  let recoveryWrite = Promise.resolve();
  function preserveEditor() {
    if (!token) return;
    const generation = ++recoveryGeneration;
    const data = { id: editing, asset: existingAsset, type: typeInput.value,
      published: !draft.checked, collections: [...memberships], ...Object.fromEntries(fields.map(name => [name, save.querySelector(`[name=${name}]`).value])),
      removeAsset: removeAssetInput.checked, previewProvenance: previewSaveData().previewProvenance };
    const file = previewSaveData().asset;
    if (file && recoveryUpload?.file === file) data.upload = recoveryUpload.data;
    recoveryBackup = data;
    const write = () => {
      try {
        window.sessionStorage.setItem(RECOVERY_KEY, JSON.stringify(data));
        recoveryStatus.textContent = '';
        downloadRecovery.hidden = true;
      } catch {
        recoveryStatus.textContent = 'Browser storage is full or unavailable. Download your unsaved edit backup before leaving; automatic recovery may be incomplete. The backup contains private editor contents.';
        downloadRecovery.hidden = false;
      }
    };
    write();
    if (file && !data.upload) {
      recoveryWrite = file.arrayBuffer().then(buffer => {
        // An explicit logout/discard must not be undone by this asynchronous read.
        if (generation !== recoveryGeneration) return;
        data.upload = { name: file.name, type: file.type, bytes: Array.from(new Uint8Array(buffer)) };
        recoveryUpload = { file, data: data.upload };
        write();
      }).catch(() => {});
    }
  }
  function restoreEditor() {
    if (!token) return;
    try {
      const data = JSON.parse(window.sessionStorage.getItem(RECOVERY_KEY) || 'null');
      if (!data) return;
      openEditor(data, true);
      deleteButton.hidden = !editing;
      removeAssetInput.checked = !!data.removeAsset;
      if (data.upload) {
        const file = new File([new Uint8Array(data.upload.bytes)], data.upload.name, { type: data.upload.type });
        preview.selected = { file, source: data.previewProvenance?.assetSource ?? null };
        recoveryUpload = { file, data: data.upload };
      }
      saveStatus.textContent = 'Unsaved edit restored. Review it before saving.';
    } catch { clearRecovery(); }
  }
  root.querySelector('#session-expired a').addEventListener('click', async event => {
    event.preventDefault();
    await recoveryWrite;
    window.location.assign('/login');
  });
  window.addEventListener('pagehide', () => {
    for (const tab of privateWindows) tab.close();
    privateWindows.clear();
    try { if (root.isConnected && token && window.sessionStorage.getItem(RECOVERY_KEY)) preserveEditor(); } catch { /* Storage may be unavailable. */ }
  });
  document.addEventListener('owner-session-expiring', () => { if (root.isConnected) preserveEditor(); });
  document.addEventListener('owner-session-change', event => {
    if (!root.isConnected) return;
    const next = getSession();
    if (event.detail?.reason === 'reconcile' && next === token) {
      if (!next) {
        try {
          if (!window.sessionStorage.getItem(RECOVERY_KEY)) {
            clearRecovery();
            root.querySelector('#session-expired').hidden = true;
          }
        } catch { clearRecovery(); root.querySelector('#session-expired').hidden = true; }
      }
      return;
    }
    sessionGeneration++;
    if (event.detail?.reason === 'logout' || (event.detail?.reason === 'reconcile' && !next)) clearRecovery();
    token = next;
    if (!token) {
      if (editorDialog.open) editorDialog.close();
      if (collectionsDialog.open) collectionsDialog.close();
      if (viewer.open) viewer.close();
      if (reader.open) reader.close();
      for (const tab of privateWindows) tab.close();
      privateWindows.clear();
      viewerRequest++;
      draftRequest++;
      draftItems = [];
      drafts.replaceChildren();
      draftStatus.textContent = '';
      resetEditor();
      setBusy(false);
      saveStatus.textContent = '';
      root.querySelector('#create-collection').reset();
      root.querySelector('#collection-status').textContent = '';
      renderCollections();
    }
    root.querySelector('#session-expired').hidden = event.detail?.reason !== 'expired';
    updateAuth();
    if (token) { restoreEditor(); loadDrafts(); }
  });
  save.addEventListener('submit', event => {
    event.preventDefault();
    submitItem(false);
  });
  async function submitItem(allowDuplicate) {
    if (busy || !token) return;
    const session = token, generation = sessionGeneration;
    const published = !draft.checked;
    const data = { ...Object.fromEntries(new FormData(save)), published, collections: [...memberships],
      ...previewSaveData(), existingAsset };
    // Any earlier paste lookup must not repaint after this submission.
    duplicateRequest++;
    setBusy(true);
    saveStatus.textContent = 'Saving…';
    try {
      if (!editing && data.url.trim() && !allowDuplicate) {
        clearDuplicates();
        const result = await api.duplicates(session, data.url);
        if (session !== token) return;
        if (result.items.length) {
          showDuplicates(result.items, data.url);
          saveStatus.textContent = 'Already in Likes. Open an existing item or choose Save another.';
          return;
        }
      }
      const item = await api.save(session, data, editing);
      if (session !== token) return;
      reconcileItem(item.id, item);
      clearRecovery();
      resetEditor();
      saveStatus.textContent = published ? 'Published.' : 'Saved as draft.';
      await Promise.all([load(), loadDrafts()]);
    } catch (error) { if (generation === sessionGeneration) saveStatus.textContent = `${error.message} Your fields have been kept. Save was not confirmed; reload the board and drafts before retrying to check for a completed save.`; }
    finally { if (generation === sessionGeneration) setBusy(false); }
  }
  updateAuth();
  restoreEditor();
  load();
  loadDrafts();
});
