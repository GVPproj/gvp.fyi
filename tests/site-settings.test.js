import test from 'node:test';
import assert from 'node:assert/strict';
import settings from '../src/config/site-settings.json' with { type: 'json' };
import { siteSettings, sectionLabel, categorySettings } from '../src/lib/site-settings.ts';

// Direct import deliberately has no Astro virtual modules or publishing backend.
test('site settings are usable independently of published software', () => {
  assert.deepEqual(siteSettings, settings);
  for (const [section, label] of Object.entries(settings.sections)) {
    assert.equal(sectionLabel(section), label);
  }
  for (const [kind, categories] of Object.entries(settings.categories)) {
    assert.deepEqual(categorySettings(kind), categories);
  }
});
