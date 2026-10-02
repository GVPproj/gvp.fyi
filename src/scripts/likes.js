import { createLikesAPI, renderItem } from '../lib/likes.js';

document.addEventListener('astro:page-load', () => {
  const root = document.querySelector('#likes');
  if (!root || root.dataset.bound) return;
  root.dataset.bound = 'true';
  // Tokens and private records stay in this page's memory, never storage.
  let token = '', editing = null, busy = false;
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
  const fields = ['url', 'title', 'description', 'commentary'];

  function resetEditor() {
    editing = null;
    memberships = new Set();
    deleteButton.hidden = true;
    confirmation.hidden = true;
    save.reset();
    draft.checked = false;
    renderMemberships();
    root.querySelector('#editor-title').textContent = 'Save a link';
  }
  function itemCard(item) {
    const card = renderItem(document, item);
    if (token) {
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.textContent = 'Edit';
      edit.disabled = busy;
      edit.addEventListener('click', () => {
        if (busy) return;
        editing = item.id;
        deleteButton.hidden = false;
        confirmation.hidden = true;
        for (const field of fields) save.querySelector(`[name=${field}]`).value = item[field] ?? '';
        draft.checked = !item.published;
        memberships = new Set(item.collections ?? []);
        renderMemberships();
        root.querySelector('#editor-title').textContent = 'Edit item';
        saveStatus.textContent = '';
        root.querySelector('.owner-tools').open = true;
        save.querySelector('[name=url]').focus();
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
    for (const control of root.querySelectorAll('.owner-tools input, .owner-tools textarea, .owner-tools button, #likes-board button')) control.disabled = value;
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
    const data = { ...Object.fromEntries(new FormData(save)), published, collections: [...memberships] };
    setBusy(true);
    saveStatus.textContent = 'Saving…';
    try {
      const item = await api.save(token, data, editing);
      reconcileItem(item.id, item);
      resetEditor();
      saveStatus.textContent = published ? 'Published.' : 'Saved as draft.';
      await Promise.all([load(), loadDrafts()]);
    } catch (error) { saveStatus.textContent = `${error.message} Your fields have been kept.`; }
    finally { setBusy(false); }
  });
  updateAuth();
  load();
});
