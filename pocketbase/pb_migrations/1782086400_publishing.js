migrate((app) => {
  const names = ['publishing_releases', 'publishing_tracks', 'publishing_builds', 'publishing_snapshots'];
  for (const name of names) {
    try { app.findCollectionByNameOrId(name); } catch { continue; }
    throw new Error(`Publishing migration refused existing ${name}`);
  }
  const text = (name, required = false, max = 10000) => ({ name, type: 'text', required, max });
  const artwork = { name: 'artwork', type: 'file', maxSelect: 1, maxSize: 10485760, protected: true, mimeTypes: ['image/png', 'image/jpeg', 'image/webp'] };
  const releases = new Collection({ name: names[0], type: 'base', fields: [
    text('slug', true, 100), text('title', true, 500), text('artist', true, 500), text('release_date', true, 100),
    text('about'), text('url'), text('display_date', false, 500), { name: 'streaming', type: 'json', maxSize: 20000 }, artwork,
    { name: 'publish', type: 'bool' },
  ], indexes: ['CREATE UNIQUE INDEX idx_publishing_slug ON publishing_releases (slug)'] });
  app.save(releases);
  app.save(new Collection({ name: names[1], type: 'base', fields: [
    { name: 'release', type: 'relation', collectionId: releases.id, required: true, maxSelect: 1, cascadeDelete: true },
    text('title', true, 500), { name: 'track_num', type: 'number', required: true, min: 1, onlyInt: true },
    { name: 'duration', type: 'json', maxSize: 100 }, text('audio_url'),
  ], indexes: ['CREATE UNIQUE INDEX idx_publishing_track_order ON publishing_tracks (release, track_num)'] }));
  app.save(new Collection({ name: names[2], type: 'auth', fields: [
    { name: 'email', type: 'email', required: true }, { name: 'password', type: 'password', min: 12 },
  ], passwordAuth: { enabled: true, identityFields: ['email'] } }));
  app.save(new Collection({ name: names[3], type: 'base', fields: [
    { name: 'sequence', type: 'number', required: true, onlyInt: true },
    text('slug', true, 100), { name: 'payload', type: 'json', required: true, maxSize: 1000000 }, artwork,
    { name: 'created', type: 'autodate', onCreate: true },
  ] }));
}, () => { throw new Error('Restore paired backup and code; destructive publishing rollback is disabled.'); });
