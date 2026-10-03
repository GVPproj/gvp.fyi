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
      if (path === 'likes/preview') {
        if (response.status === 429) throw new Error('Too many preview requests. Wait a minute or save manually.');
        throw new Error('Preview unavailable for this URL. Enter metadata manually or try again.');
      }
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
    duplicates(token, value) {
      const url = webURL(value);
      if (!url) throw new Error('Enter a full http:// or https:// URL without credentials.');
      return request('likes/duplicates', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: token },
        body: JSON.stringify({ url }),
      });
    },
    preview(token, value) {
      const url = webURL(value);
      if (!url) throw new Error('Enter a full http:// or https:// URL without credentials.');
      return request('likes/preview', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: token },
        body: JSON.stringify({ url }),
      });
    },
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
    async listPage({ collection = '', cursor = null } = {}) {
      const quote = value => JSON.stringify(String(value));
      let filter = 'published=true';
      if (collection) filter += ` && collections.id ?= ${quote(collection)}`;
      if (cursor) filter += ` && (created < ${quote(cursor.created)} || (created = ${quote(cursor.created)} && id < ${quote(cursor.id)}))`;
      // Look ahead by one without exposing totals or using shifting page offsets.
      const query = new URLSearchParams({ filter, sort: '-created,-id', perPage: '25', skipTotal: 'true' });
      const result = await request(`collections/likes_items/records?${query}`);
      const items = result.items.slice(0, 24);
      const last = items.at(-1);
      return { items, nextCursor: result.items.length > 24 ? { created: last.created, id: last.id } : null };
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
    save(token, { url = '', title = '', type = '', body: text = '', attribution = '', description = '', commentary = '', published = true, collections, asset, existingAsset, removeAsset = false, previewProvenance }, id) {
      const upload = asset instanceof Blob;
      if (upload && (!asset.size || asset.size > 10 * 1024 * 1024 || !/\.(jpe?g|png|gif|webp|pdf)$/i.test(asset.name))) {
        throw new Error('Choose a non-empty JPEG, PNG, GIF, WebP or PDF, no larger than 10 MiB.');
      }
      const safeURL = url.trim() ? webURL(url) : '';
      if (safeURL === null) throw new Error('Enter a full http:// or https:// URL without credentials.');
      const textItem = type === 'quote' || type === 'note';
      if (type && !textItem) throw new Error('Choose a supported item type.');
      if (textItem && !text.trim()) throw new Error('Enter text for your quote or personal note.');
      if (textItem && (upload || (existingAsset && !removeAsset))) throw new Error('Remove the upload before saving a text item.');
      if (!textItem && !safeURL && !upload && !(existingAsset && !removeAsset)) throw new Error('Enter a URL or choose an image or PDF.');
      if (!textItem && !title.trim()) throw new Error('Enter a title.');
      const fields = { url: safeURL, title: title.trim(), type, body: text.trim(), attribution: attribution.trim(), description: description.trim(), commentary: commentary.trim(), published,
        ...(collections !== undefined && { collections }), ...(previewProvenance !== undefined && { previewProvenance }),
        ...(removeAsset && !upload && { asset: '' }) };
      let body = JSON.stringify(fields);
      const headers = { Authorization: token };
      if (upload) {
        body = new FormData();
        for (const [key, value] of Object.entries(fields)) body.append(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
        body.append('asset', asset);
      } else headers['Content-Type'] = 'application/json';
      return request(`collections/likes_items/records${id ? `/${encodeURIComponent(id)}` : ''}`, {
        method: id ? 'PATCH' : 'POST', headers, body,
      });
    },
  };
}

export function textItemTitle(item) {
  return item.title || (item.type === 'quote' ? 'Quote' : 'Personal note');
}

export function renderItem(document, item, { assetURL, openAsset, openText } = {}) {
  const card = document.createElement('li');
  const url = webURL(item.url);
  const asset = webURL(assetURL);
  const pdf = asset && /\.pdf$/i.test(item.asset);
  const image = asset && !pdf;
  const textItem = item.type === 'quote' || item.type === 'note';
  const label = textItemTitle(item);
  const interactive = textItem || image || (asset && !item.published);
  const destination = asset || url;
  const link = document.createElement(interactive ? 'button' : destination ? 'a' : 'div');
  if (interactive) {
    link.type = 'button';
    link.className = textItem ? 'text-card' : 'image-card';
    const accessibleTitle = item.title || (item.body ?? '').replace(/\s+/g, ' ').trim().slice(0, 80) || label;
    link.setAttribute('aria-label', textItem ? `Read ${item.type}: ${accessibleTitle}` : `${image ? 'View image' : 'Open PDF'}: ${item.title}`);
    link.addEventListener('click', () => textItem ? openText?.(item, link) : openAsset?.(item, link));
  } else if (destination) { link.href = destination; link.target = '_blank'; link.rel = 'noopener noreferrer'; }
  const preview = document.createElement('div');
  preview.className = 'like-preview';
  if (textItem) {
    preview.classList.add('text-preview');
    preview.textContent = (item.body ?? '').slice(0, 400) + ((item.body?.length ?? 0) > 400 ? '…' : '');
  } else if (image && item.published) {
    const img = document.createElement('img');
    img.src = asset;
    img.alt = '';
    img.loading = 'lazy';
    preview.append(img);
  } else preview.textContent = asset ? pdf ? 'PDF document' : 'Image (private)' : url ? new URL(url).hostname : 'Link unavailable';
  const title = document.createElement('h2');
  title.textContent = textItem ? label : item.title;
  const description = document.createElement('p');
  description.textContent = textItem ? item.attribution ?? '' : item.description;
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
