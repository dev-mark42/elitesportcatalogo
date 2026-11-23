// Service Worker de Elite Sport (un solo proyecto, raíz del repositorio; rutas relativas para GitHub Pages).
// HTML y JS/CSS propios: red primero con respaldo en caché (siempre ves lo último y funciona offline).
// Imágenes y recursos externos: caché primero.
const V = 'elite-sport-v7';
const SHELL = [
 "assets/data/productos.json",
 "assets/img/icon-192.png",
 "assets/img/icon-512.png",
 "assets/img/icon-maskable-512.png",
 "assets/img/ligas/argentina.png",
 "assets/img/ligas/bundesliga.png",
 "assets/img/ligas/laliga.png",
 "assets/img/ligas/premier.png",
 "assets/img/ligas/seriea.png",
 "assets/img/logo-128.png",
 "css/fondo.css",
 "css/login.css",
 "css/main.css",
 "css/panel.css",
 "css/spa.css",
 "css/tema.css",
 "index.html",
 "js/core/ajustes.js",
 "js/core/almacen.js",
 "js/core/auth.js",
 "js/core/avances.js",
 "js/core/bd.js",
 "js/core/bitacora.js",
 "js/core/config.js",
 "js/core/pedidos.js",
 "js/core/storage.js",
 "js/core/utils.js",
 "js/main.js",
 "js/views/admin.js",
 "js/views/catalogo.js",
 "js/views/compras.js",
 "js/views/login.js",
 "manifest.json",
 "pwa/pwa.js",
 "semana1/01-modo-oscuro/tema.js",
 "semana1/02-filtro-catalogo/filtro-catalogo.js",
 "semana1/03-menu-hamburguesa/menu-hamburguesa.js",
 "semana1/04-validacion-formulario/validaciones.js",
 "semana1/05-alertas-toast/alertas.js",
 "semana2/01-delegacion-eventos-hidratacion/delegacion-eventos.js",
 "semana2/01-delegacion-eventos-hidratacion/hidratacion.js",
 "semana2/02-carrusel-zoom-animaciones/animaciones.js",
 "semana2/02-carrusel-zoom-animaciones/carrusel.js",
 "semana2/02-carrusel-zoom-animaciones/zoom.js",
 "semana2/03-fetch-lazyloading-dropbox/dropbox.js",
 "semana2/03-fetch-lazyloading-dropbox/lazy-loading.js",
 "semana2/04-arquitectura-pwa-offline/offline.js",
 "semana2/05-seguridad-xss-subida-imagen/seguridad-xss.js",
 "semana2/05-seguridad-xss-subida-imagen/subida-imagen.js",
 "semana3/01-componentes-encapsulamiento/elite-tarjeta.js",
 "semana3/02-mobile-first-grid-flexbox/dispositivo.js",
 "semana3/02-mobile-first-grid-flexbox/responsivo.css",
 "semana3/03-cwv-bem-dompurify-sw/cwv.js",
 "semana3/03-cwv-bem-dompurify-sw/purify.es.mjs",
 "semana3/03-cwv-bem-dompurify-sw/sanitizar.js",
 "semana3/04-accesibilidad-contraste/accesibilidad.css",
 "semana3/04-accesibilidad-contraste/accesibilidad.js",
 "semana3/05-smoke-test-dom/smoke-test.js",
 "semana3/06-semantica-a11y-hmr/auditoria-semantica.js"
];
self.addEventListener('install', e => { e.waitUntil(caches.open(V).then(c => Promise.allSettled(['./'].concat(SHELL).map(u => c.add(u))))); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(k => Promise.all(k.filter(x => x !== V).map(x => caches.delete(x))))); self.clients.claim(); });
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url), mismo = u.origin === location.origin;
  if (u.hostname.endsWith('supabase.co')) return;            // la base de datos nunca se cachea
  if (!mismo || /\.(png|jpe?g|webp|svg|woff2?)$/i.test(u.pathname)) {   // imágenes y CDN: caché primero
    e.respondWith(caches.match(r).then(c => c || fetch(r).then(res => { if (res.ok || res.type === 'opaque') { const cp = res.clone(); caches.open(V).then(ch => ch.put(r, cp)); } return res; }).catch(() => c || Response.error())));
    return;
  }
  e.respondWith(fetch(r).then(res => { if (res.ok) { const cp = res.clone(); caches.open(V).then(ch => ch.put(r, cp)); } return res; })
    .catch(() => caches.match(r).then(c => c || (r.mode === 'navigate' ? caches.match('index.html') : Response.error()))));
});
