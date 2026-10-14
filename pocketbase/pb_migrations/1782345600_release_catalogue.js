// Add catalogue metadata without republishing any working edits or snapshots.
migrate((app) => {
  const releases = app.findCollectionByNameOrId('publishing_releases');
  releases.fields.add(new SelectField({ name: 'category', maxSelect: 1, values: ['graham-van-pelt', 'miracle-fortress', 'think-about-life', 'other-credits'] }));
  for (const name of ['credit', 'display_title', 'youtube_video_id']) {
    releases.fields.add(new TextField({ name, max: 5000 }));
  }
  for (const name of ['album_id', 'art_id', 'player_height']) {
    releases.fields.add(new NumberField({ name, min: 0, onlyInt: true }));
  }
  app.save(releases);
  app.db().newQuery("UPDATE publishing_releases SET category = 'miracle-fortress' WHERE slug = 'watery-grave-ep'").execute();
}, () => { throw new Error('Restore paired backup and code; destructive publishing rollback is disabled.'); });
