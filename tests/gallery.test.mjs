import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { validatePhoto, listPhotos, getClient, categories } from '../js/gallery-client.js';

test('rejects unsupported, empty, and oversized images', () => {
  for (const type of ['image/jpeg', 'image/png', 'image/webp']) validatePhoto({ type, size: 1024 });
  for (const file of [{ type: 'image/svg+xml', size: 1 }, { type: 'image/png', size: 0 }, { type: 'image/png', size: 10485761 }]) {
    assert.throws(() => validatePhoto(file));
  }
});

test('unconfigured client fails with setup instructions', () => {
  assert.throws(() => getClient(), /Supabase setup/);
});

test('photo listing loads every page and propagates failures', async () => {
  const calls = [];
  const query = { select() { return this; }, order() { return this; }, async range(start, end) {
    calls.push([start, end]); return { data: Array.from({ length: start === 0 ? 100 : 2 }, (_, n) => ({ id: start + n })) };
  } };
  const rows = await listPhotos({ from: () => query });
  assert.equal(rows.length, 102);
  assert.deepEqual(calls, [[0, 99], [100, 199]]);
  query.range = async () => ({ error: new Error('denied') });
  await assert.rejects(listPhotos({ from: () => query }), /denied/);
});

test('seed creates confirmed uploader and preserves existing credentials on rerun', async () => {
  const source = await readFile(new URL('../scripts/seed-uploader.mjs', import.meta.url), 'utf8');
  for (const exists of [false, true]) {
    const calls = [];
    const context = vm.createContext({ URL, console: { log() {}, error(message) { throw new Error(message); } },
      process: { env: { SUPABASE_URL: 'https://test.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'test-only', UPLOADER_EMAIL: 'team@example.com', UPLOADER_PASSWORD: 'test-only-password' }, exit() { throw new Error('unexpected exit'); } },
      fetch: async (url, options) => {
        calls.push({ url: String(url), ...options });
        return { ok: true, json: async () => options.method === 'GET' ? { users: exists ? [{ id: 'existing', email: 'team@example.com', app_metadata: { other: 'preserved' } }] : [] } : {} };
      },
    });
    const module = new vm.SourceTextModule(source, { context });
    await module.link(() => {}); await module.evaluate();
    const body = JSON.parse(calls[1].body);
    assert.equal(body.app_metadata.gallery_uploader, true);
    assert.equal(calls[1].method, exists ? 'PUT' : 'POST');
    if (exists) { assert.equal(body.password, undefined); assert.equal(body.app_metadata.other, 'preserved'); }
    else { assert.equal(body.email_confirm, true); assert.equal(body.email, 'team@example.com'); }
  }
});

test('all uploader categories have matching gallery sections and database constraints', async () => {
  const html = await readFile(new URL('../gallery.html', import.meta.url), 'utf8');
  const sql = await readFile(new URL('../supabase/setup.sql', import.meta.url), 'utf8');
  for (const category of Object.keys(categories)) {
    assert.ok(html.includes(`data-section="${category}"`));
    assert.ok(sql.includes(`'${category}'`));
  }
  assert.match(sql, /enable row level security/);
  assert.match(sql, /app_metadata/);
});

test('upload flow requires login, publishes photo metadata, and clears on signout', async () => {
  const elements = new Map();
  function element() { return { hidden: false, value: '', files: [], dataset: {}, listeners: {}, children: [],
    addEventListener(name, fn) { this.listeners[name] = fn; }, add() {}, append(...items) { this.children.push(...items); },
    replaceChildren() { this.children = []; }, removeAttribute() {}, reset() {}, querySelectorAll() { return []; },
  }; }
  const get = id => { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); };
  const user = { id: 'uploader-id', email: 'team@example.com', app_metadata: { gallery_uploader: true } };
  const uploaded = [], inserted = [];
  const client = {
    auth: {
      getSession: async () => ({ data: { session: null } }), onAuthStateChange() {},
      signInWithPassword: async () => ({ data: { session: { user } } }),
      getUser: async () => ({ data: { user } }), signOut: async () => ({}),
    },
    storage: { from: () => ({ upload: async (...args) => { uploaded.push(args); return {}; } }) },
    from: () => ({ insert: async data => { inserted.push(data); return {}; } }),
  };
  const context = vm.createContext({ document: { getElementById: get, createElement: element },
    URL: { createObjectURL: () => 'blob:preview', revokeObjectURL() {} },
    Option: function() {}, crypto: { randomUUID: () => 'unique-photo' },
  });
  const mocks = { getClient: async () => client, categories, bucket: 'gallery', imageTypes: { 'image/png': 'png' },
    validatePhoto, listPhotos: async () => [], photoUrl: () => 'https://example.com/image.png' };
  const dependency = new vm.SyntheticModule(Object.keys(mocks), function() {
    for (const [key, value] of Object.entries(mocks)) this.setExport(key, value);
  }, { context });
  const source = await readFile(new URL('../js/upload.js', import.meta.url), 'utf8');
  const module = new vm.SourceTextModule(source, { context });
  await module.link(() => dependency); await module.evaluate();
  assert.equal(get('login-panel').hidden, false);
  assert.equal(get('upload-panel').hidden, true);
  get('email').value = user.email; get('password').value = 'test-password';
  await get('login-form').listeners.submit({ preventDefault() {}, submitter: {} });
  assert.equal(get('upload-panel').hidden, false);
  assert.equal(get('password').value, '');
  get('photo').files = [{ type: 'image/png', size: 100 }];
  get('title').value = '  New project  '; get('category').value = 'interior'; get('description').value = 'Description';
  await get('upload-form').listeners.submit({ preventDefault() {} });
  assert.equal(uploaded.length, 1);
  assert.equal(inserted[0].storage_path, 'uploader-id/unique-photo.png');
  assert.equal(inserted[0].title, 'New project');
  assert.match(get('status').textContent, /Photo published/);
  // A denied storage write must never create a gallery row or show success.
  client.storage.from = () => ({ upload: async () => ({ error: new Error('Upload denied') }) });
  await get('upload-form').listeners.submit({ preventDefault() {} });
  assert.equal(inserted.length, 1);
  assert.equal(get('status').dataset.error, 'true');
  assert.match(get('status').textContent, /Upload denied/);
  await get('logout').listeners.click();
  assert.equal(get('upload-panel').hidden, true);
  assert.equal(get('login-panel').hidden, false);
});
