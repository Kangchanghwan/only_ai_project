// Service Worker for Web Share Target API
// Intercepts /share-target POST requests and passes data to the app

let pendingShareData = null;

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (url.pathname === '/share-target' && event.request.method === 'POST') {
    event.respondWith(handleShareTarget(event.request));
  }
});

async function handleShareTarget(request) {
  try {
    const formData = await request.formData();

    const files = formData.getAll('files');
    const title = formData.get('title') || '';
    const text = formData.get('text') || '';
    const sharedUrl = formData.get('url') || '';

    pendingShareData = {
      files: files.filter((f) => f instanceof File && f.size > 0),
      title,
      text,
      url: sharedUrl,
    };
  } catch (err) {
    console.error('[SW] Failed to process share target:', err);
    pendingShareData = null;
  }

  return Response.redirect('/?share-target=1', 303);
}

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'GET_SHARE_DATA') {
    const data = pendingShareData;
    pendingShareData = null;
    event.ports[0].postMessage({ type: 'SHARE_DATA', data });
  }
});
