# Techzolution gallery uploads

This is a static HTML site. `upload.html` is the team login and photo upload panel.
Existing portfolio images stay in `gallery.html`; uploaded photos appear first in
the selected category, with the existing filters and lightbox. The panel accepts
one JPG, PNG, or WebP at a time (maximum 10 MB), with a title and optional description.
Gallery visitors do not need an account. Uploaded images are public.

## Supabase setup

1. Create a Supabase project. Run `supabase/setup.sql` **once** in its SQL Editor.
   This creates the photo table, public Storage bucket, and row-level policies.
2. Set the project URL and **publishable key** (or legacy anon key) in
   `js/supabase-config.js`. These are public browser settings. Never put the
   service-role/secret key in this file or any HTML/browser JavaScript.
3. In Authentication settings, disable public signups for this staff-only panel.
   Only accounts with server-controlled `app_metadata.gallery_uploader: true`
   can insert photos or upload files, even if another account exists.
4. Copy `.env.seed.example` to `.env.seed` and supply the project URL, legacy
   service-role key, uploader email, and a strong password. Keep this file local.
5. With Node 20.12+ run:

   ```sh
   node scripts/seed-uploader.mjs
   ```

   The script automatically loads `.env.seed` from the project root and creates a confirmed account through Supabase Admin Auth. If the
   email already exists it grants upload access without changing its password.
   Sign out and back in after granting access to refresh the session token.
6. Serve the site over HTTP locally, e.g. `python3 -m http.server 8080`, then open
   `http://localhost:8080/upload.html`. Production hosting should use HTTPS.
   JavaScript modules do not work by double-clicking the HTML file (`file://`).

Deploy the site's HTML, CSS, JS, and image assets. Do not deploy `.env.seed`,
`scripts/`, or administrative credentials. The browser loads the pinned Supabase
JavaScript SDK from jsDelivr, so network access to that CDN is required.

## Behavior and verification

- The login restores sessions on reload and provides sign-out. There is no public signup.
- Photo title/description render as text, not HTML. Filenames use random UUIDs.
- Database and Storage policies enforce uploader access independently of the UI.
- Files have unique paths and cannot overwrite existing images. Bucket policies
  also enforce size and content type; SVG/HTML uploads are not accepted.
- New uploads load when the gallery is opened or refreshed; an already-open
  gallery tab needs a refresh. Reads are paginated so the default API row limit
  does not hide older uploads.
- Failed publication is reported without claiming success. If Storage succeeds
  but saving the row fails, the object may remain unlisted. Check `gallery_photos`
  before retrying; remove unreferenced objects in the Storage dashboard if needed.
- Without configuration the existing gallery works and the upload page explains
  the missing setup. A gallery fetch failure preserves existing images.

After setup, verify: seeded login, rejected incorrect password, image preview,
publication into each category, gallery counts/lightbox, reload persistence,
sign-out, and oversized/unsupported file rejection. Using an anonymous client or
an ordinary account, confirm inserts into `gallery_photos` and Storage uploads
are rejected. Live Auth/Storage tests require your configured Supabase project.

References: [Supabase Storage access control](https://supabase.com/docs/guides/storage/security/access-control)
and [Admin user creation](https://supabase.com/docs/reference/javascript/auth-admin-createuser).

Local regression checks (no credentials needed):

```sh
node --experimental-vm-modules --test tests/gallery.test.mjs
```

These cover validation, pagination, seed creation/reruns, category consistency,
and mocked login/upload/failure/sign-out flows. They do not replace live RLS tests.
