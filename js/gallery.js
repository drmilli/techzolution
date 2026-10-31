import { getClient, listPhotos, photoUrl, categories } from './gallery-client.js';
import { supabaseConfig } from './supabase-config.js';
function updateCounts() {
  document.querySelectorAll('.filter-btn').forEach(button => {
    const category = button.dataset.filter;
    const section = category === 'all' ? document : document.querySelector(`[data-section="${category}"]`);
    button.querySelector('.count').textContent = section.querySelectorAll('.gallery-item').length;
  });
  document.querySelectorAll('.gallery-section').forEach(section => {
    section.querySelector('.m-num').textContent = section.querySelectorAll('.gallery-item').length;
  });
}
updateCounts();
if (supabaseConfig.url && supabaseConfig.publishableKey) {
  try {
    const client = await getClient();
    const photos = await listPhotos(client);
    // Reverse before prepending so the newest upload stays first in each category.
    for (const photo of photos.reverse()) {
      if (!Object.hasOwn(categories, photo.category)) continue;
      const grid = document.querySelector(`[data-section="${photo.category}"] .masonry-grid`);
      if (!grid) continue;
      const item = document.createElement('div'); item.className = 'gallery-item';
      item.tabIndex = 0; item.setAttribute('role', 'button'); item.setAttribute('aria-label', `View ${photo.title}`);
      const img = document.createElement('img'); img.src = photoUrl(client, photo.storage_path);
      img.alt = photo.description ? `${photo.title} — ${photo.description}` : photo.title; img.loading = 'lazy';
      const overlay = document.createElement('div'); overlay.className = 'gallery-overlay';
      const title = document.createElement('h4'); title.textContent = photo.title;
      const category = document.createElement('span'); category.textContent = categories[photo.category];
      overlay.append(title, category); item.append(img, overlay);
      item.addEventListener('click', () => window.openLightbox(item));
      item.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); window.openLightbox(item); }
      });
      grid.prepend(item);
    }
    updateCounts();
  } catch {
    document.getElementById('gallery-load-status').textContent = 'Recent uploads could not be loaded. You can still explore our portfolio below. Refresh to try again.';
  }
}
