migrate((app) => {
  const releases = app.findCollectionByNameOrId('publishing_releases');
  if (releases.fields.getByName('unpublish')) {
    throw new Error('Publishing migration refused existing unpublish field');
  }
  releases.fields.add(new BoolField({ name: 'unpublish' }));
  app.save(releases);
}, () => { throw new Error('Restore paired backup and code; destructive publishing rollback is disabled.'); });
