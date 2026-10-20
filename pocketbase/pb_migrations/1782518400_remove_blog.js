migrate((app) => {
  // PB v0.40: this is a shallow, transaction-preserving clone, not a reset
  // of the running app's hooks. Snapshots have no relations to cascade.
  // Bypass their immutable pre-delete hook ONLY here, while forwarding the
  // post-commit model event to PB's normal FilesManager cleanup (including
  // thumbnails and remote storage). A bare hook-free delete leaks files.
  const snapshotDeleter = app.unsafeWithoutHooks();
  snapshotDeleter.onModelAfterDeleteSuccess().bindFunc((e) => {
    app.onModelAfterDeleteSuccess().trigger(e);
  });

  for (const name of ['editorial_entries', 'editorial_snapshots']) {
    const deleter = name === 'editorial_snapshots' ? snapshotDeleter : app;
    // Always start at offset zero because each batch is removed. Query by
    // kind, not working identity or payload state: withdrawn and orphaned
    // historical revisions must disappear too.
    while (true) {
      const records = app.findRecordsByFilter(name, 'kind = "blog"', 'id', 100, 0);
      if (records.length === 0) break;
      for (const record of records) deleter.delete(record);
    }
  }

  const entries = app.findCollectionByNameOrId('editorial_entries');
  entries.fields.getByName('kind').values = ['software', 'settings'];
  app.save(entries);
}, () => { throw new Error('Restore paired backup and code; destructive blog removal rollback is disabled.'); });
