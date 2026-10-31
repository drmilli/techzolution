// Local/server-only script. Requires Node 20+; no dependencies.
// Never deploy .env.seed or this script's administrative credentials.
const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, UPLOADER_EMAIL, UPLOADER_PASSWORD } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !UPLOADER_EMAIL || !UPLOADER_PASSWORD) {
  console.error('Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, UPLOADER_EMAIL, and UPLOADER_PASSWORD in .env.seed.');
  process.exit(1);
}
if (UPLOADER_PASSWORD.length < 12) {
  console.error('Use an uploader password with at least 12 characters.'); process.exit(1);
}
const base = new URL(SUPABASE_URL);
if (base.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(base.hostname)) {
  console.error('Use an HTTPS Supabase project URL.'); process.exit(1);
}
const headers = { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' };
async function admin(path, method = 'GET', body) {
  const response = await fetch(new URL(`/auth/v1/admin/${path}`, base), { method, headers, body: body ? JSON.stringify(body) : undefined });
  if (!response.ok) throw new Error(`Supabase admin request failed (${response.status}). Check your credentials, project, and Auth settings.`);
  return response.json();
}
try {
  // Rerunning is safe: locate the account and preserve its password and metadata.
  let existing;
  for (let page = 1; ; page++) {
    const result = await admin(`users?page=${page}&per_page=100`);
    existing = result.users.find(user => user.email?.toLowerCase() === UPLOADER_EMAIL.trim().toLowerCase());
    if (existing || result.users.length < 100) break;
  }
  if (existing) {
    await admin(`users/${existing.id}`, 'PUT', { app_metadata: { ...existing.app_metadata, gallery_uploader: true } });
    console.log('Existing account granted gallery upload access. Its password was unchanged. Sign in again to refresh access.');
  } else {
    await admin('users', 'POST', { email: UPLOADER_EMAIL.trim(), password: UPLOADER_PASSWORD, email_confirm: true, app_metadata: { gallery_uploader: true } });
    console.log('Gallery uploader account created. Sign in at /upload.html with the supplied credentials.');
  }
} catch (error) { console.error(error.message); process.exitCode = 1; }
