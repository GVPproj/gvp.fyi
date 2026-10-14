migrate((app) => {
  for (const name of ['editorial_entries', 'editorial_snapshots']) {
    try { app.findCollectionByNameOrId(name); } catch { continue; }
    throw new Error(`Editorial migration refused existing ${name}`);
  }
  const text = (name, max) => ({ name, type: 'text', required: true, max });
  const assets = { name: 'assets', type: 'file', protected: true, maxSelect: 32, maxSize: 10485760,
    mimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'] };
  app.save(new Collection({ name: 'editorial_entries', type: 'base', fields: [
    { name: 'kind', type: 'select', required: true, maxSelect: 1, values: ['software', 'blog', 'settings'] },
    { ...text('slug', 100), pattern: '^[a-z0-9]+(-[a-z0-9]+)*$' },
    { name: 'data', type: 'json', required: true, maxSize: 262144 }, assets,
    { name: 'published', type: 'bool' },
  ], indexes: ['CREATE UNIQUE INDEX idx_editorial_identity ON editorial_entries (kind, slug)'] }));
  app.save(new Collection({ name: 'editorial_snapshots', type: 'base', fields: [
    text('kind', 20), text('slug', 100),
    { name: 'sequence', type: 'number', required: true, onlyInt: true },
    { name: 'payload', type: 'json', required: true, maxSize: 1048576 }, assets,
  ], indexes: ['CREATE UNIQUE INDEX idx_editorial_sequence ON editorial_snapshots (sequence)'] }));
  // Deliberately no record backfill: rehearse and run editorial-seed-likes explicitly.
}, () => { throw new Error('Restore paired backup and code; destructive editorial rollback is disabled.'); });
