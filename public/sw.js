const CACHE='six-arts-shell-v10';
const SHELL=['/','/index.html','/app.js?v=20260911-10','/style.css?v=20260911-10','/base.css','/catalog.json','/manifest.webmanifest','/icon-192.png','/icon-512.png'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL).then(()=>self.skipWaiting())));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('six-arts-shell-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{const u=new URL(event.request.url);if(u.origin!==self.location.origin||event.request.method!=='GET'||u.pathname.startsWith('/api/'))return;
 event.respondWith((async()=>{try{const response=await fetch(event.request);if(response.ok){const cache=await caches.open(CACHE);await cache.put(event.request,response.clone());}return response;}catch{const cached=await caches.match(event.request);if(cached)return cached;if(event.request.mode==='navigate')return caches.match('/index.html');return new Response('Offline',{status:503});}})());
});
