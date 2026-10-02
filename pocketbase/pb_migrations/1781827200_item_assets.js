// PocketBase 0.40.4. Deploy together with pb_hooks/likes_assets.pb.js.
migrate((app) => {
  const items = app.findCollectionByNameOrId('likes_items');
  const url = items.fields.getByName('url');
  url.required = false;
  url.min = 0;
  items.fields.add(new FileField({
    name: 'asset', maxSelect: 1, maxSize: 10 * 1024 * 1024,
    mimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'],
    protected: true, thumbs: ['400x400'],
  }));
  app.save(items);
}, () => {
  throw new Error('Asset migration is additive only; restore a reviewed backup with matching hooks instead');
});
