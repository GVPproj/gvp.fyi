import { getSession } from '../lib/session.js';

function updateManageLink() {
  const link = document.getElementById('manage-likes');
  if (link) link.hidden = !getSession();
}

updateManageLink();
document.addEventListener('owner-session-change', updateManageLink);
document.addEventListener('astro:page-load', updateManageLink);
