// 산촌일기 오프라인 실행용 서비스 워커
// 게임 파일을 바꿔 다시 올릴 때 아래 버전 숫자를 1 올려 주세요.
const VER = 'sanchon-v25';
const CORE = ['./', 'index.html', 'manifest.webmanifest', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png', 'splash.jpg',
  'firebase-app-compat.js', 'firebase-auth-compat.js', 'firebase-firestore-compat.js', 'firebase-database-compat.js', 'sanchon-cloud.js'];
// 여기 적힌 곳만 저장해 둠 (Firebase 서버 통신은 건드리지 않음)
const CACHE_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VER).then(c => c.addAll(CORE.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VER).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin && !CACHE_HOSTS.includes(url.hostname)) return;
  // 게임 화면: 인터넷이 되면 최신 파일, 안 되면 저장해 둔 파일
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req.url, { cache: 'no-store', credentials: 'same-origin' }).then(r => { const c = r.clone(); caches.open(VER).then(ca => ca.put('index.html', c)); return r; })
      .catch(() => caches.match('index.html')));
    return;
  }
  // 아이콘·글꼴 등: 저장해 둔 것을 먼저 쓰고, 뒤에서 새로 받아 둠
  e.respondWith(caches.match(req).then(hit => {
    const net = fetch(req).then(r => { if (r && (r.ok || r.type === 'opaque')) { const c = r.clone(); caches.open(VER).then(ca => ca.put(req, c)); } return r; }).catch(() => hit);
    return hit || net;
  }));
});
