// PocketBase 0.40.4. Ship with likes_assets.pb.js for conditional validation.
migrate((app) => {
  const items = app.findCollectionByNameOrId('likes_items');
  items.fields.add(new SelectField({ name: 'type', values: ['quote', 'note'], maxSelect: 1 }));
  items.fields.add(new TextField({ name: 'body', max: 100000 }));
  items.fields.add(new TextField({ name: 'attribution', max: 1000 }));
  const title = items.fields.getByName('title');
  title.required = false;
  title.min = 0;
  app.save(items);
}, () => {
  throw new Error('Text item migration is additive only; restore a reviewed backup with matching hooks instead');
});
