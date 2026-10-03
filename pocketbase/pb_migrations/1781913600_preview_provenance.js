// Preview bytes use the existing protected asset field and its atomic lifecycle.
// Keep fetched metadata separate from the editable title/description and overrides.
migrate((app) => {
  const items = app.findCollectionByNameOrId('likes_items');
  items.fields.add(new JSONField({ name: 'previewProvenance', maxSize: 65536 }));
  app.save(items);
}, () => {
  throw new Error('Preview migration is additive only; restore a reviewed backup instead');
});
