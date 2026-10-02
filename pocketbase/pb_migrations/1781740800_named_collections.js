// PocketBase 0.40.4. Named groupings are public; item privacy stays unchanged.
migrate((app) => {
  const existing = new DynamicModel({ count: 0 });
  app.db().newQuery("SELECT COUNT(*) AS count FROM _collections WHERE name = 'likes_collections'")
    .one(existing);
  if (existing.count !== 0) {
    throw new Error('Likes named collections migration refused: likes_collections already exists');
  }

  const owner = '@request.auth.collectionName = "likes_owners" && @request.auth.id = "likesowner00001"';
  const namedCollections = new Collection({
    name: 'likes_collections',
    type: 'base',
    fields: [{ name: 'name', type: 'text', required: true, max: 100 }],
    listRule: '',
    viewRule: '',
    createRule: owner,
    updateRule: owner,
    deleteRule: owner,
  });
  app.save(namedCollections);

  const items = app.findCollectionByNameOrId('likes_items');
  items.fields.add(new RelationField({
    name: 'collections',
    collectionId: namedCollections.id,
    required: false,
    maxSelect: 1000,
    cascadeDelete: false,
  }));
  app.save(items);
}, () => {
  throw new Error('Likes named collections migration is additive only; rollback requires a reviewed backup/restore plan');
});
