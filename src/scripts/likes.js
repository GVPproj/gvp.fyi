import { createLikesAPI, renderItem } from '../lib/likes.js';

document.addEventListener('astro:page-load', () => {
  const root = document.querySelector('#likes');
  if (!root || root.dataset.bound) return;
  root.dataset.bound = 'true';
  // Tokens and private records stay in this page's memory, never storage.
  let token = '', editing = null, busy = false;
  let publicItems = [], draftItems = [], boardRequest = 0, draftRequest = 0;
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
    deleteButton.hidden = true;
    confirmation.hidden = true;
    save.reset();
    draft.checked = false;
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
        root.querySelector('#editor-title').textContent = 'Edit item';
        saveStatus.textContent = '';
        root.querySelector('.owner-tools').open = true;
        save.querySelector('[name=url]').focus();
      });
      card.append(edit);
    }
    return card;
  }
  function renderBoard() {
    board.replaceChildren(...publicItems.map(itemCard));
  }
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
    renderBoard();
  }
  async function load() {
    const request = ++boardRequest;
    status.textContent = 'Loading Likes…';
    try {
      const items = await api.list();
      if (request !== boardRequest) return;
      publicItems = items;
      renderBoard();
      status.textContent = items.length ? '' : 'No likes yet.';
    } catch (error) {
      if (request === boardRequest) status.textContent = `${error.message} Use Retry to reload the board.`;
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
    const data = { ...Object.fromEntries(new FormData(save)), published };
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
