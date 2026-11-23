// Configuración global de Elite Sport
import { normalizarImagen } from '../../semana2/03-fetch-lazyloading-dropbox/dropbox.js';
import { limpiarTexto as L } from '../../semana2/05-seguridad-xss-subida-imagen/seguridad-xss.js';

export const WHATSAPP = '5916072154';          // código de país + número (ej. 591 + 8 dígitos)
export const ADMIN_EMAIL_DOMINIO = '@elitesport.com';   // "admin" se completa a admin@elitesport.com

/* ---------- Supabase (la app funciona SOLO con base de datos) ----------
   Project Settings → API: Project URL y publishable/anon key (son públicas; la seguridad la dan las políticas RLS). */
export const SUPABASE_URL = 'https://mogyzqznpcpwsuzcujyj.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_3WMaNpvU3F-DJCB4yDEvBA_XVpH88qr';
export function credencialesBD() {
    let o = {};
    try { o = JSON.parse(localStorage.getItem('eliteSupabase')) || {}; } catch { /* sin datos */ }
    const key = (SUPABASE_KEY || o.key || '').trim();
    let url = (SUPABASE_URL || o.url || '').trim();
    try { url = new URL(url).origin; } catch { return null; }   // acepta también ".../rest/v1/" y quita rutas sobrantes
    return /^https:\/\/[a-z0-9-]+\.supabase\.(co|in)$/i.test(url) && key.length > 20 ? { url, key } : null;
}

// Ligas por defecto. El admin puede agregar/editar/eliminar y subir logos (panel Ligas).
export const LIGAS_DEFECTO = {
    laliga:     { n: 'La Liga',        logo: 'assets/img/ligas/laliga.png' },
    premier:    { n: 'Premier League', logo: 'assets/img/ligas/premier.png' },
    seriea:     { n: 'Serie A',        logo: 'assets/img/ligas/seriea.png' },
    bundesliga: { n: 'Bundesliga',     logo: 'assets/img/ligas/bundesliga.png' },
    argentina:  { n: 'Liga Argentina', logo: 'assets/img/ligas/argentina.png' }
};

// Objeto vivo: se rellena al arrancar (almacen.sincronizarLigas)
export const LIGAS = {};
export function aplicarLigas(o) { Object.keys(LIGAS).forEach(k => delete LIGAS[k]); Object.assign(LIGAS, o); }

// Logo de la liga; si no existe o falla, muestra un icono de balón
export function iconoLiga(k, px = 20) {
    const l = LIGAS[k], u = l ? normalizarImagen(l.logo) : '';
    const falla = `onerror="this.replaceWith(Object.assign(document.createElement('i'),{className:'fa-solid fa-futbol liga-ico',style:'font-size:${px * .85}px'}))"`;
    return u ? `<img class="liga-ico" src="${L(u)}" width="${px}" height="${px}" alt="Logo de ${L(l.n)}" ${falla}>`
             : `<i class="fa-solid fa-futbol liga-ico" style="font-size:${px * .85}px"></i>`;
}

export const CARRUSEL_DEFECTO = [
    { img: 'https://images.unsplash.com/photo-1522778119026-d647f0596c20?q=80&w=1600&auto=format&fit=crop', badge: 'NUEVA COLECCIÓN', titulo: 'Temporada 2026/27', texto: 'Siente la pasión del fútbol con la mejor calidad.' },
    { img: 'https://images.unsplash.com/photo-1518609878373-06d740f60d8b?q=80&w=1600&auto=format&fit=crop', badge: 'OFERTA', titulo: 'Hasta 30% Off', texto: 'Solo por tiempo limitado en camisetas seleccionadas.' },
    { img: '', badge: 'ENVÍOS', titulo: 'Llegamos a todo Bolivia', texto: 'Compra por WhatsApp y recibe en tu puerta.' }
];
