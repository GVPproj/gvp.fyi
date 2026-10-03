// PocketBase serializes hook callbacks: keep this shared handler self-contained.
// It otherwise selects the last multipart file for a single-file field.
function validateUploadCount(e) {
  let count = 0;
  for (const key of ['asset', 'asset+']) {
    try { count += e.findUploadedFiles(key).length; } catch (_) { /* No file for this key. */ }
  }
  if (count > 1) {
    throw new BadRequestError('Invalid collection item.', {
      asset: new ValidationError('validation_asset_count', 'Upload one asset per collection item.'),
    });
  }
  e.next();
}
onRecordCreateRequest(validateUploadCount, 'likes_items');
onRecordUpdateRequest(validateUploadCount, 'likes_items');

// Model validation also covers superuser/API writes, not just owner requests.
onRecordValidate((e) => {
  // Do not adopt a pre-existing collection when the guarded migration refuses it.
  if (!e.record.collection().fields.getByName('asset')) {
    e.next();
    return;
  }
  const textItem = ['quote', 'note'].includes(e.record.getString('type'));
  if (textItem && (e.record.getString('asset') || e.record.getUploadedFiles('asset').length > 0)) {
    throw new BadRequestError('Invalid collection item.', {
      asset: new ValidationError('validation_asset', 'Quotes and notes cannot have an asset.'),
    });
  }
  if (textItem && !e.record.getString('body').trim()) {
    throw new BadRequestError('Invalid collection item.', {
      body: new ValidationError('validation_required', 'Provide quote or note text.'),
    });
  }
  if (!textItem && !e.record.getString('title').trim()) {
    throw new BadRequestError('Invalid collection item.', {
      title: new ValidationError('validation_required', 'Provide a title.'),
    });
  }
  if (!textItem && !e.record.getString('url') && !e.record.getString('asset') && e.record.getUploadedFiles('asset').length === 0) {
    throw new BadRequestError('Invalid collection item.', {
      url: new ValidationError('validation_required', 'Provide a destination URL or an asset.'),
    });
  }
  const types = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    gif: 'image/gif', webp: 'image/webp', pdf: 'application/pdf' };
  for (const file of e.record.getUploadedFiles('asset')) {
    const match = /\.(jpg|jpeg|png|gif|webp|pdf)$/i.exec(file.originalName);
    try {
      if (!match) throw new Error('Unsupported extension');
      // Normalize the stored suffix so clients can use a literal .pdf check.
      file.name = file.name.replace(/\.[^.]+$/, '.' + match[1].toLowerCase());
      // Reuse PocketBase's content sniffing rather than trusting Content-Type.
      const validator = new FileField({ name: 'asset', maxSelect: 1,
        maxSize: 10 * 1024 * 1024, mimeTypes: [types[match[1].toLowerCase()]] });
      validator.validateValue(e.context, e.app, e.record);
    } catch (_) {
      throw new BadRequestError('Invalid collection item.', {
        asset: new ValidationError('validation_asset',
          'Upload a JPEG (.jpg/.jpeg), PNG, GIF, WebP or PDF with matching contents, at most 10 MiB.'),
      });
    }
  }
  e.next();
}, 'likes_items');
