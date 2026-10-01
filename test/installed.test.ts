// The optional apps a person has installed (src/shell/installed.ts): only real optional apps are kept, a damaged list
// means none, and the list lives in that person's own files.
// Run: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FileSystem } from '../src/fs/fs.ts';
import { MemoryStore } from '../src/store/memory-store.ts';
import { OPTIONAL_APPS } from '../src/release.ts';
import { cleanInstalled, INSTALLED_PATH, readInstalled, writeInstalled } from '../src/shell/installed.ts';

test('Office Printer is an optional app', () => {
  assert.ok(OPTIONAL_APPS.includes('officeprinter'));
});

test('only optional apps are kept, once each; anything else in the file is ignored', () => {
  assert.deepEqual(cleanInstalled({ installed: ['officeprinter', 'officeprinter', 'explorer', 'nonsense', 7, null] }), ['officeprinter']);
  assert.deepEqual(cleanInstalled({ installed: 'officeprinter' }), []);
  assert.deepEqual(cleanInstalled(null), []);
  assert.deepEqual(cleanInstalled([]), []);
});

test('the list is written to and read back from the person\'s files; a missing or damaged file means none', async () => {
  const fs = new FileSystem(new MemoryStore());
  assert.deepEqual(await readInstalled(fs), []);
  await writeInstalled(fs, ['officeprinter', 'settings']);
  assert.deepEqual(JSON.parse(await fs.readText(INSTALLED_PATH)), { installed: ['officeprinter'] });
  assert.deepEqual(await readInstalled(fs), ['officeprinter']);
  await fs.writeText(INSTALLED_PATH, '{not json', { hidden: true });
  assert.deepEqual(await readInstalled(fs), []);
  await writeInstalled(fs, []);
  assert.deepEqual(await readInstalled(fs), []);
});
