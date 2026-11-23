// PWA: registro del Service Worker (sw.js en la raíz), botón "Instalar app" y aviso online/offline.
// Un solo proyecto adaptable: la PWA envuelve el mismo index.html (no hay versión aparte para celular).
import { toast } from '../semana1/05-alertas-toast/alertas.js';
import { vigilarConexion } from '../semana2/04-arquitectura-pwa-offline/offline.js';

let evt = null;
const botones = () => document.querySelectorAll('.js-instalar, #btnInstalarPWA');
const esIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
const instalada = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

export function registrarPWA() {
    if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
        navigator.serviceWorker.register('./sw.js').then(reg => {
            reg.addEventListener('updatefound', () => {
                const n = reg.installing;
                n?.addEventListener('statechange', () => { if (n.state === 'installed' && navigator.serviceWorker.controller) toast('Hay una versión nueva. Recarga para actualizar.', 'info'); });
            });
        }).catch(() => {});
    }
    document.body.classList.toggle('pwa-instalada', instalada());
    window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); evt = e; botones().forEach(b => b.classList.remove('d-none')); });
    window.addEventListener('appinstalled', () => botones().forEach(b => b.classList.add('d-none')));
    if (esIOS() && !instalada()) botones().forEach(b => b.classList.remove('d-none'));
    window.instalarApp = async () => {
        if (!evt) return toast(esIOS() ? 'Toca Compartir y elige «Agregar a pantalla de inicio»' : 'Usa «Instalar aplicación» en el menú de tu navegador', 'info');
        evt.prompt(); await evt.userChoice; evt = null;
        botones().forEach(b => b.classList.add('d-none'));
    };
    vigilarConexion(on => toast(on ? '¡Conexión recuperada!' : 'Sin conexión: modo offline activado', on ? 'ok' : 'warn'));
}
