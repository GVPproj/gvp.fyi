import { createLikesAPI, renderItem } from '../lib/likes.js';

// Tokens deliberately live only in memory, never in the generated site or storage.
let token = '';
document.addEventListener('astro:page-load', () => {
  const root = document.querySelector('#likes');
  if (!root || root.dataset.bound) return;
  root.dataset.bound = 'true';
  const api = createLikesAPI(root.dataset.endpoint);
  const board = root.querySelector('#likes-board');
  const status = root.querySelector('#read-status');
  const auth = root.querySelector('#owner-login');
  const save = root.querySelector('#save-link');
  const logout = root.querySelector('#sign-out');
  const authStatus = root.querySelector('#auth-status');
  const saveStatus = root.querySelector('#save-status');
  function updateAuth() {
    auth.hidden = !!token;
    save.hidden = !token;
    logout.hidden = !token;
  }
  async function load() {
    status.textContent = 'Loading Likes…';
    try {
      const items = await api.list();
      board.replaceChildren(...items.map(item => renderItem(document, item)));
      status.textContent = items.length ? '' : 'No likes yet.';
    } catch (error) { status.textContent = `${error.message} Use Retry to reload the board.`; }
  }
  root.querySelector('#retry-read').addEventListener('click', load);
  auth.addEventListener('submit', async event => {
    event.preventDefault();
    const button = auth.querySelector('button');
    button.disabled = true;
    authStatus.textContent = 'Signing in…';
    const data = new FormData(auth);
    try {
      const result = await api.login(data.get('email'), data.get('password'));
      token = result.token;
      auth.reset();
      authStatus.textContent = 'Signed in.';
      updateAuth();
    } catch (error) { authStatus.textContent = error.message; }
    finally { button.disabled = false; }
  });
  logout.addEventListener('click', () => {
    token = '';
    save.reset();
    saveStatus.textContent = '';
    authStatus.textContent = 'Signed out.';
    updateAuth();
  });
  save.addEventListener('submit', async event => {
    event.preventDefault();
    const button = save.querySelector('button');
    button.disabled = true;
    saveStatus.textContent = 'Saving…';
    try {
      await api.save(token, Object.fromEntries(new FormData(save)));
      save.reset();
      saveStatus.textContent = 'Published.';
      await load();
    } catch (error) { saveStatus.textContent = `${error.message} Your fields have been kept.`; }
    finally { button.disabled = false; }
  });
  updateAuth();
  load();
});
