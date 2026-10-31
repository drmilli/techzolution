import { supabaseConfig } from './supabase-config.js';
export const categories = {
  interior: 'Interior Design', exterior: 'Exterior Design', cabin: 'Cabin House',
  carwash: 'Car Wash Design', glass: 'Glass House', mold: 'Plastic Mold',
  baseball: 'Sport Complex', penthouse: 'Penthouse',
};
export const bucket = 'gallery';
export const maxFileSize = 10 * 1024 * 1024;
export const imageTypes = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
let clientPromise;
export function getClient() {
  if (!supabaseConfig.url || !supabaseConfig.publishableKey) {
    throw new Error('Gallery uploads are not configured yet. Complete the Supabase setup in README.md.');
  }
  clientPromise ||= import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.8/+esm')
    .then(({ createClient }) => createClient(supabaseConfig.url, supabaseConfig.publishableKey));
  return clientPromise;
}
export async function listPhotos(client) {
  const photos = [];
  for (let offset = 0; ; offset += 100) {
    const { data, error } = await client.from('gallery_photos').select('*')
      .order('created_at', { ascending: false }).order('id').range(offset, offset + 99);
    if (error) throw error;
    photos.push(...data);
    if (data.length < 100) return photos;
  }
}
export function photoUrl(client, path) {
  return client.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}
export function validatePhoto(file) {
  if (!imageTypes[file.type]) throw new Error('Choose a JPG, PNG, or WebP image.');
  if (!file.size || file.size > maxFileSize) throw new Error('Choose an image smaller than 10 MB.');
}
