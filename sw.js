// Service Worker cho SILVER DIGITAL
// Phiên bản cache - tăng số này khi bạn cập nhật trang web
const CACHE_NAME = 'silver-digital-v1';

// Danh sách file cần cache khi cài đặt
const PRECACHE_URLS = [
    './',
    './index.html',
    'https://unpkg.com/html5-qrcode',
    'https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js'
];

// Cài đặt Service Worker - cache các file quan trọng ngay lập tức
self.addEventListener('install', function(event) {
    event.waitUntil(
        caches.open(CACHE_NAME).then(function(cache) {
            console.log('[SW] Đang cache các file...');
            // Cache từng file, bỏ qua nếu có lỗi (không chặn cài đặt)
            return Promise.allSettled(
                PRECACHE_URLS.map(url =>
                    cache.add(url).catch(err => {
                        console.warn('[SW] Không thể cache:', url, err);
                    })
                )
            );
        }).then(() => self.skipWaiting())
    );
});

// Kích hoạt - xóa cache cũ
self.addEventListener('activate', function(event) {
    event.waitUntil(
        caches.keys().then(function(cacheNames) {
            return Promise.all(
                cacheNames
                    .filter(name => name !== CACHE_NAME)
                    .map(name => {
                        console.log('[SW] Xóa cache cũ:', name);
                        return caches.delete(name);
                    })
            );
        }).then(() => self.clients.claim())
    );
});

// Xử lý các request
self.addEventListener('fetch', function(event) {
    const url = new URL(event.request.url);

    // Bỏ qua các request không phải GET
    if (event.request.method !== 'GET') return;

    // Các domain cần mạng thực — không cache (AI API, email, model downloads)
    const networkOnlyHosts = [
        'openrouter.ai',
        'api.emailjs.com',
        'emailjs.com',
        '1.1.1.1',                  // kiểm tra mạng
        'huggingface.co',           // Transformers.js model downloads
        'cdn-lfs.huggingface.co',   // model file chunks
        'cdn-lfs-us-1.huggingface.co'
    ];
    // Các path CDN của Transformers.js — cho qua mạng để tải model về IndexedDB
    const networkOnlyPaths = [
        '/npm/@xenova/transformers',
        '/npm/@huggingface/transformers'
    ];
    if (networkOnlyHosts.some(host => url.hostname.includes(host)) ||
        networkOnlyPaths.some(p => url.pathname.includes(p))) {
        event.respondWith(
            fetch(event.request).catch(() => {
                return new Response(
                    JSON.stringify({ error: 'Không có mạng. Vui lòng kết nối WiFi để dùng tính năng này.' }),
                    { status: 503, headers: { 'Content-Type': 'application/json' } }
                );
            })
        );
        return;
    }

    // Tất cả các file khác: cache trước, nếu không có thì tải từ mạng
    event.respondWith(
        caches.match(event.request).then(function(cachedResponse) {
            if (cachedResponse) {
                // Có trong cache - trả về ngay, đồng thời cập nhật cache nền
                const fetchUpdate = fetch(event.request).then(function(networkResponse) {
                    if (networkResponse && networkResponse.status === 200) {
                        caches.open(CACHE_NAME).then(cache => {
                            cache.put(event.request, networkResponse.clone());
                        });
                    }
                    return networkResponse;
                }).catch(() => {});
                return cachedResponse;
            }

            // Chưa có trong cache - tải từ mạng và lưu vào cache
            return fetch(event.request).then(function(networkResponse) {
                if (!networkResponse || networkResponse.status !== 200 || networkResponse.type === 'error') {
                    return networkResponse;
                }
                const responseToCache = networkResponse.clone();
                caches.open(CACHE_NAME).then(function(cache) {
                    cache.put(event.request, responseToCache);
                });
                return networkResponse;
            }).catch(function() {
                // Không có mạng và không có cache
                return new Response(
                    '<html><body style="font-family:Arial;text-align:center;padding:40px;"><h2>📶 Không có mạng</h2><p>Vui lòng kết nối WiFi và thử lại.</p><button onclick="location.reload()">Thử lại</button></body></html>',
                    { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
                );
            });
        })
    );
});
