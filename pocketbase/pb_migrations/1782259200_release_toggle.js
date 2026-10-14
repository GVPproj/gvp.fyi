// Keep historical snapshots untouched: migrating working content is not publication.
migrate((app) => {
  const releases = app.findCollectionByNameOrId('publishing_releases');
  releases.fields.removeByName('publish');
  releases.fields.removeByName('unpublish');
  releases.fields.add(new BoolField({ name: 'published' }));
  releases.fields.add(new JSONField({ name: 'tracks', maxSize: 500000 }));
  app.save(releases);
  for (const release of app.findAllRecords('publishing_releases')) {
    const tracks = app.findRecordsByFilter('publishing_tracks', 'release = {:id}', 'track_num', 0, 0, { id: release.id }).map((track) => {
      const row = { title: track.getString('title'), track_num: track.getInt('track_num') };
      const duration = track.getString('duration');
      if (duration && duration !== 'null') row.duration = JSON.parse(duration);
      if (track.getString('audio_url')) row.audio_url = track.getString('audio_url');
      return row;
    });
    const previous = app.findRecordsByFilter('publishing_snapshots', 'slug = {:slug}', '-sequence', 1, 0, { slug: release.getString('slug') });
    let published = false;
    if (previous.length) {
      const payload = JSON.parse(previous[0].getString('payload'));
      if (payload.state === 'unpublished') published = false;
      else if (payload.release && payload.artwork) published = true;
      else throw new Error('Unrecognized publishing snapshot; migration refused');
    }
    // Bypass publication hooks deliberately: retain edits and existing eligible revision.
    app.db().newQuery('UPDATE publishing_releases SET tracks = {:tracks}, published = {:published} WHERE id = {:id}')
      .bind({ tracks: JSON.stringify(tracks), published: published ? 1 : 0, id: release.id }).execute();
  }
  app.delete(app.findCollectionByNameOrId('publishing_tracks'));
}, () => { throw new Error('Restore paired backup and code; destructive publishing rollback is disabled.'); });
