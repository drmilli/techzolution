import { getClient, categories, bucket, imageTypes, validatePhoto, listPhotos, photoUrl } from './gallery-client.js';
const el = id => document.getElementById(id);
let client, user, previewUrl;
function status(message = '', error = false) {
  el('status').textContent = message;
  el('status').dataset.error = String(error);
}
function clearPreview() {
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  previewUrl = null;
  el('preview').hidden = true;
  el('preview').removeAttribute('src');
}
for (const [value, label] of Object.entries(categories)) el('category').add(new Option(label, value));
function showSession(session) {
  user = session?.user;
  const allowed = user?.app_metadata?.gallery_uploader === true;
  el('login-panel').hidden = !!user;
  el('upload-panel').hidden = !user;
  el('upload-fields').disabled = !allowed;
  el('account').textContent = user?.email || '';
  if (user && !allowed) status('This account does not have gallery upload access. Contact your administrator.', true);
  if (!user) {
    el('uploads').replaceChildren();
    el('upload-form').reset();
    clearPreview();
  }
}
async function refreshUploads() {
  try {
    const photos = await listPhotos(client);
    if (!user) return;
    el('uploads').replaceChildren();
    el('uploads-status').textContent = photos.length ? `${photos.length} published photo${photos.length === 1 ? '' : 's'}` : 'Your first upload starts here.';
    for (const photo of photos) {
      const row = document.createElement('article'); row.className = 'upload-row';
      const img = document.createElement('img'); img.src = photoUrl(client, photo.storage_path); img.alt = photo.title; img.loading = 'lazy';
      const copy = document.createElement('div');
      const title = document.createElement('h3'); title.textContent = photo.title;
      const detail = document.createElement('p'); detail.textContent = categories[photo.category];
      copy.append(title, detail); row.append(img, copy); el('uploads').append(row);
    }
  } catch {
    el('uploads-status').textContent = 'Could not load published photos. Refresh the page to try again.';
  }
}
el('photo').addEventListener('change', () => {
  clearPreview(); status();
  const file = el('photo').files[0];
  if (!file) return;
  try {
    validatePhoto(file);
    previewUrl = URL.createObjectURL(file);
    el('preview').src = previewUrl; el('preview').hidden = false;
  } catch (error) { el('photo').value = ''; status(error.message, true); }
});
el('login-form').addEventListener('submit', async event => {
  event.preventDefault();
  const button = event.submitter; button.disabled = true; status('Signing in…');
  try {
    const { data, error } = await client.auth.signInWithPassword({ email: el('email').value.trim(), password: el('password').value });
    if (error) throw error;
    el('password').value = ''; status(); showSession(data.session); await refreshUploads();
  } catch (error) { status(error.message || 'Unable to sign in. Please try again.', true); }
  finally { button.disabled = false; }
});
el('logout').addEventListener('click', async () => {
  el('logout').disabled = true;
  try {
    const { error } = await client.auth.signOut();
    if (error) throw error;
    showSession(null); status('You have signed out.');
  } catch (error) { status(error.message, true); }
  finally { el('logout').disabled = false; }
});
el('upload-form').addEventListener('submit', async event => {
  event.preventDefault();
  const file = el('photo').files[0];
  const title = el('title').value.trim();
  if (!file || !title) return status('Choose a photo and enter a title.', true);
  el('upload-fields').disabled = true; el('logout').disabled = true;
  try {
    validatePhoto(file);
    const { data, error } = await client.auth.getUser();
    if (error || !data.user?.app_metadata?.gallery_uploader) throw new Error('Please sign in with an authorized gallery account.');
    status('Uploading photo… Please keep this page open.');
    const path = `${data.user.id}/${crypto.randomUUID()}.${imageTypes[file.type]}`;
    const { error: uploadError } = await client.storage.from(bucket).upload(path, file, { contentType: file.type, upsert: false });
    if (uploadError) throw uploadError;
    const { error: saveError } = await client.from('gallery_photos').insert({
      storage_path: path, title, category: el('category').value,
      description: el('description').value.trim(), uploaded_by: data.user.id,
    });
    if (saveError) {
      // A transport failure can have an ambiguous outcome; retain the object so a
      // successfully committed row never points to a deleted image.
      throw new Error('Could not confirm publication. Refresh the published list before retrying. An administrator may need to clean up an unlisted file.');
    }
    el('upload-form').reset(); clearPreview();
    status('Photo published! It is now available in the gallery.');
    await refreshUploads();
  } catch (error) { status(error.message || 'Upload failed. Please try again.', true); }
  finally { el('upload-fields').disabled = !user?.app_metadata?.gallery_uploader; el('logout').disabled = false; }
});
try {
  client = await getClient();
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  status(); showSession(data.session);
  client.auth.onAuthStateChange((_event, session) => { showSession(session); });
  if (data.session) await refreshUploads();
} catch (error) {
  el('login-panel').hidden = false;
  el('login-form').querySelectorAll('input, button').forEach(control => { control.disabled = true; });
  status(error.message || 'Unable to connect. Please refresh to try again.', true);
}
