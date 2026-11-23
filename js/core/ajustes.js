// Ajustes personalizables (marca, tienda, pagos). Se guardan en la tabla `ajustes` (el ADMIN los edita) y se aplican en todas las pantallas.
import { sb, avisarError } from './bd.js';
import { WHATSAPP } from './config.js';
import { normalizarImagen } from '../../semana2/03-fetch-lazyloading-dropbox/dropbox.js';
import { limpiarTexto as L } from '../../semana2/05-seguridad-xss-subida-imagen/seguridad-xss.js';

const K = 'eliteAjustes';
export const DEF = {
    marca: { nombre: 'ELITE SPORT', logo: '', balon: '', acento: '' },
    tienda: { whatsapp: '', ciudad: 'La Paz, Bolivia', horario: 'Lun a Sáb · 9:00 a 20:00' },
    pago: { qr: '', titular: '', banco: '', instrucciones: 'Escanea el QR con la app de tu banco y paga el monto EXACTO que ves arriba.', minutos: 30, centavos: true }
};
const leer = () => { try { return JSON.parse(localStorage.getItem(K)) || {}; } catch { return {}; } };
export const getAjustes = () => { const g = leer(); return Object.fromEntries(Object.keys(DEF).map(k => [k, { ...DEF[k], ...(g[k] || {}) }])); };
export const getWhatsapp = () => (getAjustes().tienda.whatsapp || WHATSAPP).replace(/\D/g, '');

export async function cargarAjustes() {
    const c = await sb();
    if (c) {
        const { data, error } = await c.from('ajustes').select('*');
        if (!error && data?.length) localStorage.setItem(K, JSON.stringify(Object.fromEntries(data.map(r => [r.clave, r.valor]))));
    }
    aplicarMarca();
    return getAjustes();
}

export async function guardarAjuste(clave, valor) {
    const todo = { ...leer(), [clave]: { ...getAjustes()[clave], ...valor } };
    localStorage.setItem(K, JSON.stringify(todo));
    aplicarMarca();
    const c = await sb(); if (!c) return { error: { message: 'Sin conexión con la base de datos' } };
    const r = await c.from('ajustes').upsert({ clave, valor: todo[clave], actualizado: new Date().toISOString() });
    if (r.error) avisarError('No se pudo guardar el ajuste: ' + r.error.message);
    return r;
}

/** Aplica logo, nombre, balón y color de acento en toda la página. */
export function aplicarMarca() {
    const { marca, tienda } = getAjustes();
    const logo = normalizarImagen(marca.logo) || 'assets/img/logo-128.png';
    document.querySelectorAll('img.js-logo').forEach(i => { if (i.getAttribute('src') !== logo) i.src = logo; });
    const fav = document.querySelector('link[rel="icon"]'); if (fav && marca.logo) fav.href = logo;
    const [a, ...r] = (marca.nombre || 'ELITE SPORT').trim().split(/\s+/);
    document.querySelectorAll('.js-marca').forEach(e => { e.innerHTML = r.length ? `${L(a)} <span class="t-g">${L(r.join(' '))}</span>` : L(a); });
    const bal = normalizarImagen(marca.balon);
    document.querySelectorAll('.bg-roll, #splash > svg').forEach(e => { e.dataset.svg ??= e.outerHTML; });
    const roll = document.querySelector('.bg-roll');
    if (roll) roll.innerHTML = bal ? `<img src="${L(bal)}" width="44" height="44" alt="Balón" style="object-fit:contain">` : (roll.dataset.svgInterno ??= roll.innerHTML);
    let st = document.getElementById('estiloMarca');
    if (!st) { st = document.createElement('style'); st.id = 'estiloMarca'; document.head.appendChild(st); }
    st.textContent = /^#[0-9a-f]{6}$/i.test(marca.acento || '') ? `:root,body,body.modo-claro{--g:${marca.acento};--gtxt:${marca.acento}}` : '';
    document.querySelectorAll('.js-ciudad').forEach(e => { e.textContent = tienda.ciudad; });
    document.querySelectorAll('.js-horario').forEach(e => { e.textContent = tienda.horario; });
    document.querySelectorAll('a[href^="https://wa.me/"]').forEach(a => { a.href = 'https://wa.me/' + getWhatsapp(); });
    const t = document.getElementById('telTienda'); if (t) { const n = getWhatsapp(); t.textContent = '+' + n.slice(0, 3) + ' ' + n.slice(3); }
}
