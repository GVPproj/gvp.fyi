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
      if (response.status === 413) throw new Error('Upload too large. Maximum file size is 10 MiB.');
      if (response.status === 400) {
        const error = await response.json().catch(() => ({}));
        const details = Object.entries(error.data ?? {}).map(([field, detail]) => `${field}: ${detail.message ?? 'Invalid value.'}`).join(' ');
        throw new Error(`Check your credentials or link fields and try again.${details ? ` ${details}` : ''}`);
      }
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
    assetURL(item, fileToken = '') {
      if (!origin || !item.asset) return null;
      const path = [item.id, item.asset].map(encodeURIComponent).join('/');
      return `${origin}/api/files/likes_items/${path}${fileToken ? `?token=${encodeURIComponent(fileToken)}` : ''}`;
    },
    fileToken(token) {
      return request('files/token', { method: 'POST', headers: { Authorization: token } });
    },
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
    save(token, { url = '', title, description = '', commentary = '', published = true, collections, asset, existingAsset, removeAsset = false }, id) {
      const upload = asset instanceof Blob;
      if (upload && (!asset.size || asset.size > 10 * 1024 * 1024 || !/\.(jpe?g|png|gif|webp|pdf)$/i.test(asset.name))) {
        throw new Error('Choose a non-empty JPEG, PNG, GIF, WebP or PDF, no larger than 10 MiB.');
      }
      const safeURL = url.trim() ? webURL(url) : '';
      if (safeURL === null) throw new Error('Enter a full http:// or https:// URL without credentials.');
      if (!safeURL && !upload && !(existingAsset && !removeAsset)) throw new Error('Enter a URL or choose an image or PDF.');
      if (!title.trim()) throw new Error('Enter a title.');
      const fields = { url: safeURL, title: title.trim(), description: description.trim(), commentary: commentary.trim(), published,
        ...(collections !== undefined && { collections }), ...(removeAsset && !upload && { asset: '' }) };
      let body = JSON.stringify(fields);
      const headers = { Authorization: token };
      if (upload) {
        body = new FormData();
        for (const [key, value] of Object.entries(fields)) body.append(key, Array.isArray(value) ? JSON.stringify(value) : String(value));
        body.append('asset', asset);
      } else headers['Content-Type'] = 'application/json';
      return request(`collections/likes_items/records${id ? `/${encodeURIComponent(id)}` : ''}`, {
        method: id ? 'PATCH' : 'POST', headers, body,
      });
    },
  };
}

export function renderItem(document, item, { assetURL, openAsset } = {}) {
  const card = document.createElement('li');
  const url = webURL(item.url);
  const asset = webURL(assetURL);
  const pdf = asset && /\.pdf$/i.test(item.asset);
  const image = asset && !pdf;
  const interactive = image || (asset && !item.published);
  const destination = asset || url;
  const link = document.createElement(interactive ? 'button' : destination ? 'a' : 'div');
  if (interactive) {
    link.type = 'button';
    link.className = 'image-card';
    link.setAttribute('aria-label', `${image ? 'View image' : 'Open PDF'}: ${item.title}`);
    link.addEventListener('click', () => openAsset?.(item, link));
  } else if (destination) { link.href = destination; link.target = '_blank'; link.rel = 'noopener noreferrer'; }
  const preview = document.createElement('div');
  preview.className = 'like-preview';
  if (image && item.published) {
    const img = document.createElement('img');
    img.src = asset;
    img.alt = '';
    img.loading = 'lazy';
    preview.append(img);
  } else preview.textContent = asset ? pdf ? 'PDF document' : 'Image (private)' : url ? new URL(url).hostname : 'Link unavailable';
  const title = document.createElement('h2');
  title.textContent = item.title;
  const description = document.createElement('p');
  description.textContent = item.description;
  link.append(preview, title, description);
  card.append(link);
  if (asset && url) {
    const source = document.createElement('a');
    source.href = url;
    source.target = '_blank';
    source.rel = 'noopener noreferrer';
    source.textContent = `Source: ${new URL(url).hostname}`;
    card.append(source);
  }
  if (item.commentary) {
    const commentary = document.createElement('p');
    commentary.textContent = item.commentary;
    card.append(commentary);
  }
  return card;
}
