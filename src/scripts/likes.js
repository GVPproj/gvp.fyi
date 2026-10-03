import { createLikesAPI, renderItem, textItemTitle, webURL } from '../lib/likes.js';

document.addEventListener('astro:page-load', () => {
  const root = document.querySelector('#likes');
  if (!root || root.dataset.bound) return;
  root.dataset.bound = 'true';
  // Tokens and private records stay in this page's memory, never storage.
  let token = '', editing = null, existingAsset = '', busy = false;
  let publicItems = [], draftItems = [], boardRequest = 0, draftRequest = 0;
  let collections = [], loaded = false, memberships = new Set(), readMessage = '';
  const window = document.defaultView;
  const selectedCollection = () => new URL(window.location.href).searchParams.get('collection') ?? '';
  const api = createLikesAPI(root.dataset.endpoint);
  const board = root.querySelector('#likes-board');
  const status = root.querySelector('#read-status');
  const auth = root.querySelector('#owner-login');
  const save = root.querySelector('#save-link');
  const logout = root.querySelector('#sign-out');
  const authStatus = root.querySelector('#auth-status');
  const saveStatus = root.querySelector('#save-status');
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
    if (busy || !token || typeInput.value || !webURL(text)) return;
    event.preventDefault();
    urlInput.value = text;
    invalidatePreview();
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
    if (tab) tab.opener = null;
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
        tab.location.href = url;
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
  function itemCard(item) {
    const card = renderItem(document, item, { assetURL: api.assetURL(item), openAsset, openText });
    card.dataset.itemId = item.id;
    if (token) {
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.textContent = 'Edit';
      edit.disabled = busy;
      edit.addEventListener('click', () => {
        if (busy) return;
        resetPreview(item.previewProvenance);
        preview.protectedMetadata = new Set(['title', 'description'].filter(name => item[name]));
        editing = item.id;
        existingAsset = item.asset ?? '';
        save.querySelector('[name=asset]').value = '';
        save.querySelector('[name=removeAsset]').checked = false;
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
        root.querySelector('.owner-tools').open = true;
        save.querySelector(typeInput.value ? '[name=body]' : '[name=url]').focus();
      });
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
    const message = root.querySelector('#collection-status');
    message.textContent = 'Saving collection…';
    try {
      const result = await action();
      boardRequest++;
      draftRequest++;
      success(result);
      collections.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
      renderCollections();
      renderMemberships();
      renderBoard();
      message.textContent = 'Collection saved.';
      await Promise.all([load(), loadDrafts()]);
    } catch (error) { message.textContent = `${error.message} Your collection changes were not confirmed. Retry or reload to check.`; }
    finally { setBusy(false); }
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
    status.textContent = readMessage || (!loaded ? '' : !known ? 'This collection is unavailable. Choose All to browse Likes.'
      : visible.length ? '' : selected ? 'No likes in this collection.' : 'No likes yet.');
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
        renderBoard();
      });
      return link;
    });
    root.querySelector('#collection-filters').replaceChildren(...filters);
  }
  const navigate = () => { if (root.isConnected) renderBoard(); };
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
    auth.hidden = !!token;
    save.hidden = !token;
    logout.hidden = !token;
    root.querySelector('#reauthenticate').hidden = !token;
    root.querySelector('#draft-tools').hidden = !token;
    root.querySelector('#collection-tools').hidden = !token;
    renderBoard();
  }
  async function load() {
    const request = ++boardRequest;
    readMessage = 'Loading Likes…';
    status.textContent = readMessage;
    try {
      const [items, groups] = await Promise.all([api.list(), api.listCollections()]);
      if (request !== boardRequest) return;
      publicItems = items;
      collections = groups;
      loaded = true;
      readMessage = '';
      renderCollections();
      renderMemberships();
      renderBoard();
    } catch (error) {
      if (request === boardRequest) {
        readMessage = `${error.message} Use Retry to reload the board.`;
        status.textContent = readMessage;
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
  root.querySelector('#retry-read').addEventListener('click', load);
  root.querySelector('#retry-drafts').addEventListener('click', loadDrafts);
  root.querySelector('#new-item').addEventListener('click', () => {
    if (busy) return;
    resetEditor();
    saveStatus.textContent = '';
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
    try {
      await api.remove(token, editing);
      reconcileItem(editing);
      resetEditor();
      saveStatus.textContent = 'Permanently deleted.';
      await Promise.all([load(), loadDrafts()]);
    } catch (error) { saveStatus.textContent = `${error.message} Your fields have been kept. Deletion was not confirmed; retry or reload to check.`; }
    finally { setBusy(false); }
  });
  root.querySelector('#reauthenticate').addEventListener('click', () => {
    if (busy) return;
    auth.hidden = false;
    authStatus.textContent = 'Sign in again. Your item edits will be kept.';
    auth.querySelector('[name=email]').focus();
  });
  auth.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy) return;
    const data = new FormData(auth);
    setBusy(true);
    authStatus.textContent = 'Signing in…';
    try {
      const result = await api.login(data.get('email'), data.get('password'));
      if (result.record?.id !== 'likesowner00001' || result.record?.collectionName !== 'likes_owners') throw new Error('Sign in with the owner account and try again.');
      token = result.token;
      auth.reset();
      authStatus.textContent = 'Signed in.';
      updateAuth();
      await loadDrafts();
    } catch (error) { authStatus.textContent = error.message; }
    finally { setBusy(false); }
  });
  logout.addEventListener('click', () => {
    if (busy) return;
    token = '';
    if (viewer.open) viewer.close();
    if (reader.open) reader.close();
    draftRequest++;
    draftItems = [];
    drafts.replaceChildren();
    draftStatus.textContent = '';
    resetEditor();
    saveStatus.textContent = '';
    authStatus.textContent = 'Signed out.';
    updateAuth();
  });
  save.addEventListener('submit', async event => {
    event.preventDefault();
    if (busy || !token) return;
    const published = !draft.checked;
    const data = { ...Object.fromEntries(new FormData(save)), published, collections: [...memberships],
      ...previewSaveData(), existingAsset };
    setBusy(true);
    saveStatus.textContent = 'Saving…';
    try {
      const item = await api.save(token, data, editing);
      reconcileItem(item.id, item);
      resetEditor();
      saveStatus.textContent = published ? 'Published.' : 'Saved as draft.';
      await Promise.all([load(), loadDrafts()]);
    } catch (error) { saveStatus.textContent = `${error.message} Your fields have been kept. Save was not confirmed; reload the board and drafts before retrying to check for a completed save.`; }
    finally { setBusy(false); }
  });
  updateAuth();
  load();
});
