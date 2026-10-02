// PocketBase 0.40.4. Additive: never adopt/overwrite existing collections.
// Provision the owner later in the superuser UI with this exact record ID:
// likesowner00001 = 'likes' (5) + 'owner' (5) + '00001' (5) = 15 characters.
// No account or credential is created by this migration.
migrate((app) => {
  const existing = new DynamicModel({ count: 0 });
  app.db().newQuery("SELECT COUNT(*) AS count FROM _collections WHERE name IN ('likes_owners', 'likes_items')")
    .one(existing);
  if (existing.count !== 0) {
    throw new Error('Likes migration refused: likes_owners or likes_items already exists');
  }

  app.save(new Collection({
    name: 'likes_owners',
    type: 'auth',
    fields: [
      { name: 'email', type: 'email', required: true },
      { name: 'password', type: 'password', required: true, min: 12 },
    ],
    listRule: null,
    viewRule: null,
    createRule: null,
    updateRule: null,
    deleteRule: null,
    passwordAuth: { enabled: true, identityFields: ['email'] },
    oauth2: { enabled: false },
    otp: { enabled: false },
    authRule: '',
    manageRule: null,
  }));

  const owner = '@request.auth.collectionName = "likes_owners" && @request.auth.id = "likesowner00001"';
  app.save(new Collection({
    name: 'likes_items',
    type: 'base',
    fields: [
      // Enforce HTTP(S) even for superuser writes, not just client validation.
      { name: 'url', type: 'text', required: true,
        min: 1,
        max: 8192,
        pattern: '^https?://([a-zA-Z0-9]([a-zA-Z0-9.-]*[a-zA-Z0-9])?|\\[[0-9a-fA-F:]+\\])(:[0-9]{1,5})?([/?#][^\\s]*)?$',
      },
      { name: 'title', type: 'text', required: true, min: 1, max: 500 },
      { name: 'description', type: 'text', required: false, max: 10000 },
      { name: 'published', type: 'bool', required: false },
      { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
      { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
    ],
    listRule: `published = true || (${owner})`,
    viewRule: `published = true || (${owner})`,
    createRule: owner,
    updateRule: owner,
    deleteRule: owner,
  }));
}, () => {
  // A destructive automatic rollback could erase saved content or owner accounts.
  throw new Error('Likes migration is additive only; rollback requires a reviewed backup/restore plan');
});
