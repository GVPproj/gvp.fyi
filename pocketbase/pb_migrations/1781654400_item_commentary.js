// PocketBase 0.40.4. Preserve existing items, timestamps, and access rules.
migrate((app) => {
  const collection = app.findCollectionByNameOrId('likes_items');
  collection.fields.add(new TextField({ name: 'commentary', required: false, max: 10000 }));
  app.save(collection);
}, () => {
  throw new Error('Likes commentary migration is additive only; rollback requires a reviewed backup/restore plan');
});
