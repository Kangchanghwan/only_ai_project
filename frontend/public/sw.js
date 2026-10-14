// Service Worker
// 1) Web Share Target: /share-target POST를 가로채 앱에 넘긴다
// 2) 비밀번호 잠금 파일 받기: /__locked/<token> 을 가로채 암호문을 받으면서 이 기기에서 풀어 저장한다
//    (레코드 규격은 src/utils/lockCrypto.js와 같다. 서비스워커는 번들되지 않아 복호 부분만 따로 둔다)

let pendingShareData = null;

// 새 서비스워커가 바로 페이지를 맡게 한다 (잠금 파일 스트리밍 다운로드에 필요)
self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (url.pathname === '/share-target' && event.request.method === 'POST') {
    event.respondWith(handleShareTarget(event.request));
    return;
  }

  if (url.pathname.startsWith('/__locked/') && event.request.method === 'GET') {
    event.respondWith(handleLockedDownload(url.pathname.slice('/__locked/'.length)));
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

// === 잠금 파일 받기 ===

const LOCK_RECORD_SIZE = 1024 * 1024;
const LOCK_TAG_SIZE = 16;
const LOCK_AAD_PREFIX = new TextEncoder().encode('cs-lock-v1');
/** 등록 후 이 시간 안에 받지 않으면 버린다 (키를 오래 들고 있지 않는다) */
const LOCKED_JOB_TTL_MS = 2 * 60 * 1000;
const lockedJobs = new Map(); // token -> { url, size, ctSize, dk, np, name, clientId, at }

function lockWriteU64(view, offset, n) {
  view.setUint32(offset, Math.floor(n / 0x100000000));
  view.setUint32(offset + 4, n >>> 0);
}

function lockRecordIv(np, index) {
  const iv = new Uint8Array(12);
  iv.set(np, 0);
  lockWriteU64(new DataView(iv.buffer), 4, index);
  return iv;
}

function lockRecordAad(index, isLast) {
  const aad = new Uint8Array(LOCK_AAD_PREFIX.length + 9);
  aad.set(LOCK_AAD_PREFIX, 0);
  lockWriteU64(new DataView(aad.buffer), LOCK_AAD_PREFIX.length, index);
  aad[aad.length - 1] = isLast ? 1 : 0;
  return aad;
}

/** 레코드 단위 복호기 (lockCrypto.createDecryptor와 같은 동작) */
function createLockedDecryptor(key, np, ptSize) {
  const total = Math.ceil(ptSize / LOCK_RECORD_SIZE);
  let index = 0;
  const chunks = [];
  let pending = 0;
  const recLen = (i) => Math.min(LOCK_RECORD_SIZE, ptSize - i * LOCK_RECORD_SIZE) + LOCK_TAG_SIZE;
  const take = (n) => {
    const out = new Uint8Array(n);
    let o = 0;
    while (o < n) {
      const c = chunks[0];
      const need = n - o;
      if (c.length <= need) {
        out.set(c, o);
        o += c.length;
        chunks.shift();
      } else {
        out.set(c.subarray(0, need), o);
        chunks[0] = c.subarray(need);
        o += need;
      }
    }
    pending -= n;
    return out;
  };
  return {
    async push(chunk) {
      const out = [];
      if (chunk && chunk.length) {
        chunks.push(chunk);
        pending += chunk.length;
      }
      while (index < total && pending >= recLen(index)) {
        const n = recLen(index);
        const isLast = index === total - 1;
        const pt = await crypto.subtle.decrypt(
          { name: 'AES-GCM', iv: lockRecordIv(np, index), additionalData: lockRecordAad(index, isLast) },
          key,
          take(n)
        );
        out.push(new Uint8Array(pt));
        index++;
      }
      if (index >= total && pending > 0) throw new Error('LOCK_TRAILING_DATA');
      return out;
    },
    finish() {
      if (index !== total || pending !== 0) throw new Error('LOCK_TRUNCATED');
    },
  };
}

async function notifyLocked(clientId, payload) {
  try {
    const client = clientId ? await self.clients.get(clientId) : null;
    if (client) client.postMessage({ type: 'LOCKED_PROGRESS', ...payload });
  } catch {
    /* 탭이 닫혔으면 무시 */
  }
}

function lockedContentDisposition(name) {
  const safe = String(name || 'download').replace(/[\r\n"]/g, '_');
  return `attachment; filename="download"; filename*=UTF-8''${encodeURIComponent(safe)}`;
}

async function handleLockedDownload(token) {
  const job = lockedJobs.get(token);
  lockedJobs.delete(token); // 1회용
  if (!job || Date.now() - job.at > LOCKED_JOB_TTL_MS) {
    return new Response('Not found', { status: 404 });
  }
  let upstream;
  let key;
  try {
    key = await crypto.subtle.importKey('raw', job.dk, 'AES-GCM', false, ['decrypt']);
    upstream = await fetch(job.url);
  } catch {
    notifyLocked(job.clientId, { token, error: 'LOCK_DOWNLOAD_FAILED' });
    return new Response('Download failed', { status: 502 });
  }
  if (!upstream.ok || !upstream.body) {
    notifyLocked(job.clientId, { token, error: 'LOCK_DOWNLOAD_FAILED' });
    return new Response('Download failed', { status: 502 });
  }

  const reader = upstream.body.getReader();
  const decryptor = createLockedDecryptor(key, job.np, job.size);
  let loaded = 0;
  let lastReport = 0;

  const body = new ReadableStream({
    async pull(controller) {
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) {
            decryptor.finish();
            controller.close();
            notifyLocked(job.clientId, { token, loaded: job.ctSize, done: true });
            return;
          }
          loaded += value.length;
          const out = await decryptor.push(value);
          if (loaded - lastReport >= 1024 * 1024) {
            lastReport = loaded;
            notifyLocked(job.clientId, { token, loaded });
          }
          if (out.length > 0) {
            for (const pt of out) controller.enqueue(pt);
            return;
          }
        }
      } catch (err) {
        notifyLocked(job.clientId, { token, error: 'LOCK_DECRYPT_FAILED' });
        controller.error(err);
        try { reader.cancel(); } catch { /* ignore */ }
      }
    },
    cancel() {
      try { reader.cancel(); } catch { /* ignore */ }
    },
  });

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': lockedContentDisposition(job.name),
      'Content-Length': String(job.size),
      'Cache-Control': 'no-store',
    },
  });
}

self.addEventListener('message', (event) => {
  const data = event.data;
  if (data && data.type === 'GET_SHARE_DATA') {
    const shared = pendingShareData;
    pendingShareData = null;
    event.ports[0].postMessage({ type: 'SHARE_DATA', data: shared });
    return;
  }

  if (data && data.type === 'LOCKED_REGISTER') {
    const ok =
      typeof data.token === 'string' &&
      /^[A-Za-z0-9]{8,64}$/.test(data.token) &&
      typeof data.url === 'string' &&
      /^https:\/\//.test(data.url) &&
      Number.isInteger(data.size) &&
      data.size > 0 &&
      data.dk instanceof Uint8Array &&
      data.np instanceof Uint8Array;
    if (ok) {
      // 오래된 작업 정리
      const now = Date.now();
      for (const [t, job] of lockedJobs) if (now - job.at > LOCKED_JOB_TTL_MS) lockedJobs.delete(t);
      lockedJobs.set(data.token, {
        url: data.url,
        size: data.size,
        ctSize: data.ctSize,
        dk: data.dk,
        np: data.np,
        name: data.name,
        clientId: event.source && event.source.id,
        at: now,
      });
    }
    if (event.ports && event.ports[0]) event.ports[0].postMessage({ ok });
  }
});

// 테스트에서 레코드 복호기를 검증할 수 있게 노출한다 (서비스워커 동작에는 영향 없음)
self.__lockedTest = { createLockedDecryptor, lockedContentDisposition };
