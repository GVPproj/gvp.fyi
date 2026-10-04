import { getSession, establishSession, clearSession } from '../lib/session.js';
import { createLikesAPI } from '../lib/likes.js';

function renderSession() {
  const token = getSession();
  const indicator = document.querySelector('#owner-session');
  if (indicator) {
    const menu = indicator.querySelector('[popover]');
    if (!token && menu?.matches(':popover-open')) menu.hidePopover();
    indicator.hidden = !token;
  }
}

function initialize() {
  renderSession();
  const logout = document.querySelector('#owner-logout');
  if (logout && !logout.dataset.initialized) {
    logout.dataset.initialized = 'true';
    logout.addEventListener('click', () => clearSession());
  }
  const page = document.querySelector('#login-page');
  const form = page?.querySelector('#owner-login');
  if (!form) return;
  const status = page.querySelector('#auth-status');
  const password = form.querySelector('[name=password]');
  const submit = form.querySelector('button[type=submit]');
  const api = createLikesAPI(page.dataset.endpoint);
  const existing = getSession();
  if (existing && !submit.disabled) {
    submit.disabled = true;
    status.textContent = 'Checking session…';
    api.refresh(existing).then(result => {
      if (getSession() !== existing) return;
      establishSession(result);
      window.location.replace('/');
    }).catch(error => {
      if (getSession() !== existing) return;
      if ([401, 403].includes(error.status)) clearSession('expired');
      status.textContent = error.message;
    }).finally(() => { submit.disabled = false; });
  }
  if (form.dataset.initialized) return;
  form.dataset.initialized = 'true';
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (submit.disabled) return;
    const data = new FormData(form);
    submit.disabled = true;
    status.textContent = 'Signing in…';
    try {
      const request = api.login(String(data.get('email')), String(data.get('password')));
      password.value = '';
      const result = await request;
      establishSession(result);
      form.reset();
      window.location.replace('/');
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : 'Sign in failed. Please try again.';
      status.focus();
    } finally {
      password.value = '';
      submit.disabled = false;
    }
  });
}

document.addEventListener('owner-session-change', renderSession);
document.addEventListener('astro:page-load', initialize);
window.addEventListener('pageshow', initialize);
initialize();
