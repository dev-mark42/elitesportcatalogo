// Capa de datos: lectura SÍNCRONA desde caché local (rápida y offline) + sincronización con Supabase en segundo plano.
// Con Supabase configurado: la verdad está en la base de datos; localStorage es solo un espejo.
// Sin Supabase: todo queda en localStorage (modo local).
import { CARRUSEL_DEFECTO, LIGAS_DEFECTO, aplicarLigas } from './config.js';
import { sb, bdActiva, avisarError } from './bd.js';

const K = { p: 'eliteProductos', f: 'eliteFavoritos', c: 'eliteCarrusel', l: 'eliteLigas' };
const leer = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch { return d; } };
const guardar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };

const imgsDe = p => {
    const l = (Array.isArray(p.imagenes) ? p.imagenes : []).map(i => typeof i === 'string' ? { url: i, desc: '' } : { url: String(i?.url || ''), desc: String(i?.desc || '') }).filter(i => i.url);
    if (!l.length && p.imagen) l.push({ url: p.imagen, desc: '' });
    return l.slice(0, 8);
};
const normalizar = p => ({
    ...p, imagenes: imgsDe(p), imagen: imgsDe(p)[0]?.url || '', id: Number(p.id) || Date.now() + Math.floor(Math.random() * 1000),
    precio: Number(p.precio) || 0, stock: Number(p.stock) || 0,
    tallas: Array.isArray(p.tallas) && p.tallas.length ? p.tallas : ['S', 'M'],
    liga: p.liga || 'laliga', temporada: p.temporada || '2025/26'
});
const aFila = p => ({ id: p.id, titulo: p.titulo, precio: p.precio, stock: p.stock, liga: p.liga, temporada: p.temporada, tallas: p.tallas, imagen: p.imagen || '', imagenes: imgsDe(p), descripcion: p.descripcion || '', fecha_creacion: p.fechaCreacion || null });
const deFila = r => normalizar({ id: r.id, titulo: r.titulo, precio: r.precio, stock: r.stock, liga: r.liga, temporada: r.temporada, tallas: r.tallas, imagen: r.imagen, imagenes: r.imagenes, descripcion: r.descripcion, fechaCreacion: r.fecha_creacion });

/* ---------- Cola de escritura a Supabase (mantiene el orden y avisa si falla) ---------- */
let cola = Promise.resolve();
const encolar = fn => { cola = cola.then(async () => { if (!bdActiva()) return; try { await fn(await sb()); } catch (e) { avisarError('Supabase: ' + (e.message || e)); } }); return cola; };
const chk = r => { if (r.error) throw r.error; };

/* ---------- Productos ---------- */
export async function cargarProductos() {
    const c = await sb();
    if (c) {
        const { data, error } = await c.from('productos').select('*').order('id', { ascending: false });
        if (error) avisarError('Supabase: ' + error.message);
        else if (data?.length) { const l = data.map(deFila); guardar(K.p, l); return l; }
    }
    let l = leer(K.p, null);
    if (l === null) {
        try { l = await (await fetch('assets/data/productos.json')).json(); } catch { l = []; }
        l = l.map(normalizar); guardar(K.p, l);
    }
    return l.map(normalizar);
}
export const getProductos = () => leer(K.p, []).map(normalizar);
export const setProductos = l => {   // devuelve false si el almacenamiento está lleno
    const antes = getProductos(), ok = guardar(K.p, l);
    if (ok && bdActiva()) {
        const prev = new Map(antes.map(p => [p.id, JSON.stringify(p)])), ids = new Set(l.map(p => p.id));
        const cambios = l.filter(p => prev.get(p.id) !== JSON.stringify(p)).map(aFila), borrar = antes.filter(p => !ids.has(p.id)).map(p => p.id);
        if (cambios.length || borrar.length) encolar(async c => {
            if (cambios.length) chk(await c.from('productos').upsert(cambios));
            if (borrar.length) chk(await c.from('productos').delete().in('id', borrar));
        });
    }
    return ok;
};

/* ---------- Favoritos (por usuario en Supabase, espejo local) ---------- */
export const getFavs = () => leer(K.f, []);
export function toggleFav(id) {
    const f = getFavs(), i = f.indexOf(id), on = i === -1;
    on ? f.push(id) : f.splice(i, 1);
    guardar(K.f, f);
    encolar(async c => {
        const { data: { session } } = await c.auth.getSession(); if (!session) return;
        const u = session.user.id;
        chk(on ? await c.from('favoritos').upsert({ usuario_id: u, producto_id: id }) : await c.from('favoritos').delete().match({ usuario_id: u, producto_id: id }));
    });
    return on;
}
export const limpiarFavsLocales = () => localStorage.removeItem(K.f);
async function cargarFavs() {
    const c = await sb(); if (!c) return;
    const { data: { session } } = await c.auth.getSession(); if (!session) return;
    const { data, error } = await c.from('favoritos').select('producto_id').eq('usuario_id', session.user.id);
    if (!error && data) guardar(K.f, data.map(r => Number(r.producto_id)));
}

/* ---------- Carrusel ---------- */
export const getCarrusel = () => { const c = leer(K.c, null); return c && c.length ? c : CARRUSEL_DEFECTO; };
const filasCarrusel = c => c.map((s, i) => ({ orden: i, img: s.img || '', badge: s.badge || '', titulo: s.titulo || '', texto: s.texto || '' }));
export const setCarrusel = c => {
    const ok = guardar(K.c, c);
    if (ok && bdActiva()) encolar(async cl => {
        chk(await cl.from('carrusel').delete().gte('orden', 0));
        if (c.length) chk(await cl.from('carrusel').insert(filasCarrusel(c)));
    });
    return ok;
};
async function cargarCarrusel() {
    const c = await sb(); if (!c) return;
    const { data, error } = await c.from('carrusel').select('*').order('orden');
    if (!error && data?.length) guardar(K.c, data.map(r => ({ img: r.img, badge: r.badge, titulo: r.titulo, texto: r.texto })));
}

/* ---------- Ligas ---------- */
export const getLigas = () => { const l = leer(K.l, null); return l && Object.keys(l).length ? l : LIGAS_DEFECTO; };
export const setLigas = l => {
    const antes = getLigas(), ok = guardar(K.l, l);
    if (ok) aplicarLigas(l);
    if (ok && bdActiva()) {
        const cambios = Object.entries(l).filter(([k, v]) => JSON.stringify(antes[k]) !== JSON.stringify(v)).map(([k, v], i) => ({ clave: k, nombre: v.n, logo: v.logo || '', orden: i }));
        const borrar = Object.keys(antes).filter(k => !(k in l));
        encolar(async c => {
            if (cambios.length) chk(await c.from('ligas').upsert(cambios));
            if (borrar.length) chk(await c.from('ligas').delete().in('clave', borrar));
        });
    }
    return ok;
};
export const sincronizarLigas = () => aplicarLigas(getLigas());
async function cargarLigas() {
    const c = await sb(); if (!c) return;
    const { data, error } = await c.from('ligas').select('*').order('orden');
    if (!error && data?.length) guardar(K.l, Object.fromEntries(data.map(r => [r.clave, { n: r.nombre, logo: r.logo }])));
}

/* ---------- Carga completa (se llama al entrar a la tienda o al panel) ---------- */
export async function cargarTodo() {
    await sb();
    await Promise.all([cargarLigas(), cargarCarrusel(), cargarFavs()]);
    sincronizarLigas();
    return cargarProductos();
}

/** Sube a Supabase todo lo que hay en este navegador (útil la primera vez, desde el panel admin). */
export async function sincronizarTodo() {
    const c = await sb(); if (!c) return { ok: false, msg: 'Supabase no está configurado.' };
    try {
        const lg = Object.entries(getLigas()).map(([k, v], i) => ({ clave: k, nombre: v.n, logo: v.logo || '', orden: i }));
        chk(await c.from('ligas').upsert(lg));
        const pr = getProductos().map(aFila); if (pr.length) chk(await c.from('productos').upsert(pr));
        chk(await c.from('carrusel').delete().gte('orden', 0));
        const cr = filasCarrusel(getCarrusel()); if (cr.length) chk(await c.from('carrusel').insert(cr));
        return { ok: true, msg: `Sincronizado: ${lg.length} ligas, ${pr.length} productos y ${cr.length} slides.` };
    } catch (e) { return { ok: false, msg: e.message || String(e) }; }
}

export function restablecerDemo() { Object.values(K).forEach(k => localStorage.removeItem(k)); }

/** Tiempo real: cuando alguien cambie productos, ligas, carrusel o ajustes en OTRO equipo, se llama a `alCambiar` (con retraso para agrupar cambios). */
let canalCambios = null;
export async function suscribirCambios(alCambiar) {
    const c = await sb(); if (!c || !c.channel) return () => {};
    try { if (canalCambios) c.removeChannel(canalCambios); } catch { /* sin canal */ }
    let t; const f = () => { clearTimeout(t); t = setTimeout(alCambiar, 700); };
    canalCambios = c.channel('cambios-catalogo');
    ['productos', 'ligas', 'carrusel', 'ajustes'].forEach(tb => canalCambios.on('postgres_changes', { event: '*', schema: 'public', table: tb }, f));
    canalCambios.subscribe();
    return () => { clearTimeout(t); try { c.removeChannel(canalCambios); } catch { /* ya cerrado */ } canalCambios = null; };
}
