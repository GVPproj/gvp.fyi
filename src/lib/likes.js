// Only web destinations are navigable, even if stored records are malformed.
export function webURL(value) {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}

export function createLikesAPI(base, fetcher = fetch) {
  const origin = webURL(base)?.replace(/\/$/, '');
  async function request(path, options = {}) {
    if (!origin) throw new Error('Likes is not configured. Please contact the site owner.');
    let response;
    try { response = await fetcher(`${origin}/api/${path}`, options); }
    catch { throw new Error('Cannot reach Likes. Check your connection and try again.'); }
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) throw new Error('Sign in with the owner account and try again.');
      if (response.status === 400) throw new Error('Check your credentials or link fields and try again.');
      throw new Error('Likes could not complete the request. Please try again.');
    }
    return response.status === 204 ? undefined : response.json();
  }
  async function listRecords(query, options = {}) {
    const items = [];
    let page = 1, result;
    do {
      result = await request(`${query}&perPage=200&page=${page++}`, options);
      items.push(...result.items);
    } while (page <= result.totalPages);
    return items;
  }
  return {
    listCollections() {
      return listRecords('collections/likes_collections/records?sort=name,id');
    },
    saveCollection(token, name, id) {
      if (!name.trim()) throw new Error('Enter a collection name.');
      return request(`collections/likes_collections/records${id ? `/${encodeURIComponent(id)}` : ''}`, {
        method: id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json', Authorization: token },
        body: JSON.stringify({ name: name.trim() }),
      });
    },
    removeCollection(token, id) {
      return request(`collections/likes_collections/records/${encodeURIComponent(id)}`, {
        method: 'DELETE', headers: { Authorization: token },
      });
    },
    list() { return listRecords('collections/likes_items/records?filter=published%3Dtrue&sort=-created,-id'); },
    listDrafts(token) {
      return listRecords('collections/likes_items/records?filter=published%3Dfalse&sort=-created,-id', { headers: { Authorization: token } });
    },
    remove(token, id) {
      return request(`collections/likes_items/records/${encodeURIComponent(id)}`, {
        method: 'DELETE', headers: { Authorization: token },
      });
    },
    login(email, password) {
      return request('collections/likes_owners/auth-with-password', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identity: email, password }),
      });
    },
    save(token, { url, title, description = '', commentary = '', published = true, collections }, id) {
      const safeURL = webURL(url);
      if (!safeURL) throw new Error('Enter a full http:// or https:// URL without credentials.');
      if (!title.trim()) throw new Error('Enter a title.');
      return request(`collections/likes_items/records${id ? `/${encodeURIComponent(id)}` : ''}`, {
        method: id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json', Authorization: token },
        body: JSON.stringify({ url: safeURL, title: title.trim(), description: description.trim(), commentary: commentary.trim(), published, ...(collections !== undefined && { collections }) }),
      });
    },
  };
}

export function renderItem(document, item) {
  const card = document.createElement('li');
  const url = webURL(item.url);
  const link = document.createElement(url ? 'a' : 'div');
  if (url) { link.href = url; link.target = '_blank'; link.rel = 'noopener noreferrer'; }
  const preview = document.createElement('div');
  preview.className = 'like-preview';
  // Preview enrichment is a later ticket; plain links have a square placeholder.
  preview.textContent = url ? new URL(url).hostname : 'Link unavailable';
  const title = document.createElement('h2');
  title.textContent = item.title;
  const description = document.createElement('p');
  description.textContent = item.description;
  link.append(preview, title, description);
  card.append(link);
  if (item.commentary) {
    const commentary = document.createElement('p');
    commentary.textContent = item.commentary;
    card.append(commentary);
  }
  return card;
}
