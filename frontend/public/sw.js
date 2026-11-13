// Service Worker
// 1) Web Share Target: /share-target POST를 가로채 앱에 넘긴다
// 2) 비밀번호 잠금 파일 받기: /__locked/<token> 을 가로채 암호문을 받으면서 이 기기에서 풀어 저장한다
//    (레코드 규격은 src/utils/lockCrypto.js와 같다. 서비스워커는 번들되지 않아 복호 부분만 따로 둔다)
// 3) 여러 파일 ZIP 받기: /__zip/<token> 을 가로채 파일을 차례로 받으면서 바로 ZIP(압축 없음)으로 내보낸다
//    (머리글 규격은 src/utils/zipWriter.js와 같다. 바이트 일치는 sw.zip.test.js가 검사한다)

let pendingShareData = null;

// 새 서비스워커가 바로 페이지를 맡게 한다 (잠금 파일 스트리밍 다운로드에 필요)
// 오프라인 폴백: 페이지 이동(navigate) 요청이 네트워크 실패할 때만 /offline.html을 보여 준다
const OFFLINE_CACHE = 'cs-offline-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(OFFLINE_CACHE).then((cache) => cache.add('/offline.html')).catch(() => {})
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const keys = await caches.keys();
        await Promise.all(
          keys.filter((k) => k.startsWith('cs-offline-') && k !== OFFLINE_CACHE).map((k) => caches.delete(k))
        );
      } catch {
        /* 캐시를 쓸 수 없으면 무시 */
      }
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  if (url.pathname === '/share-target' && event.request.method === 'POST') {
    event.respondWith(handleShareTarget(event.request));
    return;
  }

  if (url.pathname.startsWith('/__locked/') && event.request.method === 'GET') {
    event.respondWith(handleLockedDownload(url.pathname.slice('/__locked/'.length)));
    return;
  }

  if (url.pathname.startsWith('/__zip/') && event.request.method === 'GET') {
    event.respondWith(handleZipDownload(url.pathname.slice('/__zip/'.length)));
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).catch(() => caches.match('/offline.html')));
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

// === 여러 파일 ZIP 받기 ===
// 압축 없이 묶기만 한다(stored). 항목마다 데이터 서술자를 써서 받으면서 바로 내보낸다. Zip64 없음(묶음 한도 500MB).
const ZIP_JOB_TTL_MS = 2 * 60 * 1000;
const ZIP_MAX_BYTES = 0xffffffff - 1024 * 1024;
const zipJobs = new Map(); // token -> { apiUrl, zipName, exact, entries:[{roomId,file,name,size}], clientId, at }

const ZIP_CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function zipCrc32(bytes, crc) {
  let c = ((crc || 0) ^ 0xffffffff) >>> 0;
  for (let i = 0; i < bytes.length; i++) c = ZIP_CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function zipDos(date) {
  const y = date.getFullYear();
  if (y < 1980) return { time: 0, date: (1 << 5) | 1 };
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((y - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

const ZIP_FLAGS = 0x0008 | 0x0800;

function zipLocalHeader(nameBytes, dos) {
  const b = new Uint8Array(30 + nameBytes.length);
  const v = new DataView(b.buffer);
  v.setUint32(0, 0x04034b50, true);
  v.setUint16(4, 20, true);
  v.setUint16(6, ZIP_FLAGS, true);
  v.setUint16(8, 0, true);
  v.setUint16(10, dos.time, true);
  v.setUint16(12, dos.date, true);
  v.setUint16(26, nameBytes.length, true);
  v.setUint16(28, 0, true);
  b.set(nameBytes, 30);
  return b;
}

function zipDescriptor(crc, size) {
  const b = new Uint8Array(16);
  const v = new DataView(b.buffer);
  v.setUint32(0, 0x08074b50, true);
  v.setUint32(4, crc, true);
  v.setUint32(8, size, true);
  v.setUint32(12, size, true);
  return b;
}

function zipCentralHeader(nameBytes, dos, crc, size, offset) {
  const b = new Uint8Array(46 + nameBytes.length);
  const v = new DataView(b.buffer);
  v.setUint32(0, 0x02014b50, true);
  v.setUint16(4, 20, true);
  v.setUint16(6, 20, true);
  v.setUint16(8, ZIP_FLAGS, true);
  v.setUint16(10, 0, true);
  v.setUint16(12, dos.time, true);
  v.setUint16(14, dos.date, true);
  v.setUint32(16, crc, true);
  v.setUint32(20, size, true);
  v.setUint32(24, size, true);
  v.setUint16(28, nameBytes.length, true);
  v.setUint32(38, 0, true);
  v.setUint32(42, offset, true);
  b.set(nameBytes, 46);
  return b;
}

function zipEndRecord(count, centralSize, centralOffset) {
  const b = new Uint8Array(22);
  const v = new DataView(b.buffer);
  v.setUint32(0, 0x06054b50, true);
  v.setUint16(8, count, true);
  v.setUint16(10, count, true);
  v.setUint32(12, centralSize, true);
  v.setUint32(16, centralOffset, true);
  return b;
}

function zipTotalSize(entries) {
  let total = 22;
  for (const e of entries) total += 30 + e.nameBytes.length + e.size + 16 + 46 + e.nameBytes.length;
  return total;
}

async function notifyZip(clientId, payload) {
  try {
    const client = clientId ? await self.clients.get(clientId) : null;
    if (client) client.postMessage({ type: 'ZIP_PROGRESS', ...payload });
  } catch {
    /* 탭이 닫혔으면 무시 */
  }
}

/** 받기 직전에 파일 주소를 새로 받는다 (서명 주소는 10분 만료) */
async function zipFetchEntry(apiUrl, entry, fetchImpl) {
  const res = await fetchImpl(`${apiUrl}/api/r2/download-urls`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ roomId: entry.roomId, fileNames: [entry.file] }),
  });
  if (!res.ok) throw new Error('ZIP_URL_FAILED');
  const data = await res.json();
  const hit = (data && Array.isArray(data.urls) ? data.urls : []).find((u) => u && u.fileName === entry.file);
  if (!hit || typeof hit.url !== 'string' || !/^https:\/\//.test(hit.url)) throw new Error('ZIP_URL_FAILED');
  const upstream = await fetchImpl(hit.url);
  if (!upstream.ok || !upstream.body) throw new Error('ZIP_DOWNLOAD_FAILED');
  return upstream.body.getReader();
}

/**
 * ZIP 바이트 스트림을 만든다. 서비스워커 응답과 테스트가 함께 쓴다.
 * onEvent({loaded}|{done}|{error}) 로 진행을 알린다.
 */
function createZipStream(job, { fetchImpl = fetch, now = new Date(), onEvent = () => {} } = {}) {
  const enc = new TextEncoder();
  const dos = zipDos(now);
  const entries = job.entries.map((e) => ({ ...e, nameBytes: enc.encode(e.name) }));
  const central = [];
  let index = 0;
  let offset = 0;
  let loaded = 0;
  let lastReport = 0;
  let reader = null;
  let crc = 0;
  let got = 0;
  let finished = false;

  const fail = (controller, code) => {
    if (finished) return;
    finished = true;
    onEvent({ error: code });
    controller.error(new Error(code));
    try { if (reader) reader.cancel(); } catch { /* ignore */ }
  };

  const push = (controller, bytes) => {
    controller.enqueue(bytes);
    loaded += bytes.length;
    if (loaded - lastReport >= 1024 * 1024) {
      lastReport = loaded;
      onEvent({ loaded });
    }
  };

  return new ReadableStream({
    async pull(controller) {
      if (finished) return;
      try {
        for (;;) {
          if (index >= entries.length) {
            const centralOffset = offset;
            let centralSize = 0;
            for (const c of central) { push(controller, c); centralSize += c.length; }
            push(controller, zipEndRecord(entries.length, centralSize, centralOffset));
            finished = true;
            controller.close();
            onEvent({ loaded, done: true });
            return;
          }
          const entry = entries[index];
          if (!reader) {
            reader = await zipFetchEntry(job.apiUrl, entry, fetchImpl);
            crc = 0;
            got = 0;
            push(controller, zipLocalHeader(entry.nameBytes, dos));
            return;
          }
          const { done, value } = await reader.read();
          if (done) {
            if (job.exact !== false && got !== entry.size) return fail(controller, 'ZIP_SIZE_MISMATCH');
            push(controller, zipDescriptor(crc, got));
            central.push(zipCentralHeader(entry.nameBytes, dos, crc, got, offset));
            offset += 30 + entry.nameBytes.length + got + 16;
            reader = null;
            index++;
            continue;
          }
          got += value.length;
          if (job.exact !== false && got > entry.size) return fail(controller, 'ZIP_SIZE_MISMATCH');
          crc = zipCrc32(value, crc);
          push(controller, value);
          return;
        }
      } catch (err) {
        fail(controller, err && /^ZIP_/.test(err.message) ? err.message : 'ZIP_DOWNLOAD_FAILED');
      }
    },
    cancel() {
      finished = true;
      onEvent({ error: 'ZIP_CANCELLED' });
      try { if (reader) reader.cancel(); } catch { /* ignore */ }
    },
  });
}

function zipContentDisposition(name) {
  const safe = String(name || 'download.zip').replace(/[\r\n"]/g, '_');
  return `attachment; filename="download.zip"; filename*=UTF-8''${encodeURIComponent(safe)}`;
}

async function handleZipDownload(token) {
  const job = zipJobs.get(token);
  zipJobs.delete(token); // 1회용
  if (!job || Date.now() - job.at > ZIP_JOB_TTL_MS) {
    return new Response('Not found', { status: 404 });
  }
  const enc = new TextEncoder();
  const total = zipTotalSize(job.entries.map((e) => ({ nameBytes: enc.encode(e.name), size: e.size })));
  const body = createZipStream(job, { onEvent: (ev) => notifyZip(job.clientId, { token, ...ev }) });
  const headers = {
    'Content-Type': 'application/zip',
    'Content-Disposition': zipContentDisposition(job.zipName),
    'Cache-Control': 'no-store',
  };
  // 크기가 추정값이면(QR 받기 화면) 길이를 미리 알리지 않는다. 틀린 길이는 다운로드를 깨뜨린다
  if (job.exact !== false) headers['Content-Length'] = String(total);
  return new Response(body, { status: 200, headers });
}

function validZipJob(data) {
  if (!data || typeof data.token !== 'string' || !/^[A-Za-z0-9]{8,64}$/.test(data.token)) return false;
  if (typeof data.apiUrl !== 'string' || !/^(https:\/\/[^/]+|http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?)$/.test(data.apiUrl)) return false;
  if (typeof data.zipName !== 'string' || data.zipName.length === 0 || data.zipName.length > 200) return false;
  if (!Array.isArray(data.entries) || data.entries.length < 1 || data.entries.length > 1000) return false;
  let total = 0;
  for (const e of data.entries) {
    if (!e || typeof e.roomId !== 'string' || !/^[A-Za-z0-9-]{1,100}$/.test(e.roomId)) return false;
    if (typeof e.file !== 'string' || e.file.length === 0 || e.file.length > 1024) return false;
    if (typeof e.name !== 'string' || e.name.length === 0 || e.name.length > 512 || /[\\/]/.test(e.name)) return false;
    if (!Number.isInteger(e.size) || e.size < 0) return false;
    total += e.size;
  }
  return total <= ZIP_MAX_BYTES;
}

// === 도착 알림 (Web Push) ===
// 서버가 보내는 페이로드: { v:1, title, body, tag, target }. 파일 이름·텍스트·보낸 사람 정보는 들어 있지 않다.
// target은 'ip'(같은 네트워크) 또는 비공개 방 ID. 방 ID는 주소(URL)에 넣지 않는다(분석 도구로 새지 않게).

let pendingPushTarget = null;

function cleanPushTarget(v) {
  return typeof v === 'string' && /^(ip|prv-(?:g-)?[0-9a-f]{24})$/.test(v) ? v : null;
}

function cleanPushText(v, fallback) {
  return typeof v === 'string' && v.length > 0 && v.length <= 200 ? v : fallback;
}

self.addEventListener('push', (event) => {
  let payload = null;
  try {
    payload = event.data ? event.data.json() : null;
  } catch {
    payload = null;
  }
  if (!payload || typeof payload !== 'object') payload = {};
  const ko = !!(self.navigator && /^ko/i.test(self.navigator.language || ''));
  const title = cleanPushText(payload.title, 'Clipboard Share');
  const body = cleanPushText(payload.body, ko ? '새 항목이 도착했어요' : 'Something new arrived');
  const tag = cleanPushText(payload.tag, 'cs-arrival');
  // 푸시를 받으면 반드시 알림을 보여 준다 (보여 주지 않으면 브라우저가 구독을 끊을 수 있다)
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      tag,
      renotify: true,
      icon: '/icon-192.png',
      data: { target: cleanPushTarget(payload.target) },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = cleanPushTarget(event.notification.data && event.notification.data.target);
  event.waitUntil(
    (async () => {
      const list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const open = list.find((c) => 'focus' in c);
      if (open) {
        try {
          await open.focus();
        } catch {
          /* 포커스를 못 줘도 메시지는 보낸다 */
        }
        open.postMessage({ type: 'PUSH_OPEN', target });
        return;
      }
      pendingPushTarget = target;
      await self.clients.openWindow('/?utm_source=push&utm_medium=notification');
    })()
  );
});

self.addEventListener('message', (event) => {
  const data = event.data;
  if (data && data.type === 'GET_SHARE_DATA') {
    const shared = pendingShareData;
    pendingShareData = null;
    event.ports[0].postMessage({ type: 'SHARE_DATA', data: shared });
    return;
  }

  if (data && data.type === 'GET_PUSH_TARGET') {
    const target = pendingPushTarget;
    pendingPushTarget = null;
    if (event.ports && event.ports[0]) event.ports[0].postMessage({ type: 'PUSH_TARGET', target });
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
    return;
  }

  if (data && data.type === 'ZIP_REGISTER') {
    const ok = validZipJob(data);
    if (ok) {
      const now = Date.now();
      for (const [t, job] of zipJobs) if (now - job.at > ZIP_JOB_TTL_MS) zipJobs.delete(t);
      zipJobs.set(data.token, {
        apiUrl: data.apiUrl,
        zipName: data.zipName,
        exact: data.exact !== false,
        entries: data.entries.map((e) => ({ roomId: e.roomId, file: e.file, name: e.name, size: e.size })),
        clientId: event.source && event.source.id,
        at: now,
      });
    }
    if (event.ports && event.ports[0]) event.ports[0].postMessage({ ok });
  }
});

// 테스트에서 레코드 복호기를 검증할 수 있게 노출한다 (서비스워커 동작에는 영향 없음)
self.__lockedTest = { createLockedDecryptor, lockedContentDisposition };
self.__zipTest = { createZipStream, zipTotalSize, validZipJob, zipContentDisposition, handleZipDownload, zipJobs };
