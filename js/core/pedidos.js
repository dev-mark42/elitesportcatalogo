// Carrito (en el dispositivo) y pedidos (en Supabase) con pago por QR validado.
import { sb } from './bd.js';
import { getProductos } from './almacen.js';
import { getAjustes } from './ajustes.js';
import { subirArchivo } from './storage.js';
import { registrarEvento } from './bitacora.js';
import { precioDe } from './utils.js';

const KC = 'eliteCarrito';
const r2 = n => Math.round(n * 100) / 100;

/* ---------- Carrito ---------- */
export const getCarrito = () => { try { return JSON.parse(localStorage.getItem(KC)) || []; } catch { return []; } };
const setCarrito = c => { localStorage.setItem(KC, JSON.stringify(c)); document.dispatchEvent(new CustomEvent('carrito:cambio')); };
export function agregarAlCarrito(id, talla, cant = 1) {
    const p = getProductos().find(x => x.id === id);
    if (!p || p.stock <= 0) return { ok: false, msg: 'Producto agotado' };
    const c = getCarrito(), l = c.find(x => x.id === id && x.talla === talla), ya = l ? l.cant : 0;
    if (ya + cant > p.stock) return { ok: false, msg: `Solo quedan ${p.stock} unidades` };
    l ? l.cant += cant : c.push({ id, talla, cant });
    setCarrito(c); return { ok: true };
}
export function cambiarCantidad(i, delta) {
    const c = getCarrito(), l = c[i]; if (!l) return { ok: false };
    const p = getProductos().find(x => x.id === l.id);
    if (delta > 0 && p && l.cant + delta > p.stock) return { ok: false, msg: `Solo quedan ${p.stock} unidades` };
    l.cant += delta; if (l.cant <= 0) c.splice(i, 1);
    setCarrito(c); return { ok: true };
}
export const quitarDelCarrito = i => { const c = getCarrito(); c.splice(i, 1); setCarrito(c); };
export const vaciarCarrito = () => setCarrito([]);
export const contarCarrito = () => getCarrito().reduce((a, l) => a + l.cant, 0);

/** Une el carrito con los productos reales (precio y stock vigentes). */
export function detalleCarrito() {
    const prods = getProductos();
    const lineas = getCarrito().map((l, i) => { const p = prods.find(x => x.id === l.id); return p ? { i, p, talla: l.talla, cant: l.cant, sub: r2(precioDe(p) * l.cant) } : null; }).filter(Boolean);
    return { lineas, total: r2(lineas.reduce((a, l) => a + l.sub, 0)), unidades: lineas.reduce((a, l) => a + l.cant, 0) };
}

/* ---------- Pedidos ---------- */
export async function crearPedido({ lineas, total, nombre, telefono, notas }) {
    const c = await sb(); if (!c) return { ok: false, msg: 'Sin conexión con la base de datos' };
    const { data: { session } } = await c.auth.getSession();
    if (!session) return { ok: false, msg: 'Inicia sesión para pagar' };
    const items = lineas.map(l => ({ id: l.p.id, titulo: l.p.titulo, talla: l.talla, cant: l.cant, precio: precioDe(l.p), imagen: l.p.imagen || '' }));
    const { pago } = getAjustes();
    try { await c.rpc('expirar_pedidos'); } catch { /* opcional */ }
    for (let intento = 0; intento < 12; intento++) {
        // monto único = total + centavos (cada pedido pendiente tiene un monto distinto para conciliar el pago automáticamente)
        const extra = (pago.centavos || intento > 0) ? (1 + Math.floor(Math.random() * 99)) / 100 : 0;
        const fila = { usuario_id: session.user.id, cliente_nombre: nombre, cliente_email: session.user.email, telefono, notas, items, total, monto_unico: r2(total + extra), estado: 'pendiente_pago', metodo: 'qr' };
        const { data, error } = await c.from('pedidos').insert(fila).select().single();
        if (!error) { registrarEvento('pedido_creado', `Pedido #${data.id} · Bs ${fila.monto_unico}`); return { ok: true, pedido: data }; }
        if (error.code !== '23505') return { ok: false, msg: 'No se pudo crear el pedido: ' + error.message };
    }
    return { ok: false, msg: 'Hay muchos pedidos pendientes. Intenta de nuevo en un minuto.' };
}

export async function obtenerPedido(id) {
    const c = await sb(); if (!c) return null;
    const { data } = await c.from('pedidos').select('*').eq('id', id).maybeSingle();
    return data;
}

/** Avisa al instante cuando cambia el pedido (Realtime) y, por seguridad, revisa cada 4 s. Devuelve la función para dejar de escuchar. */
export async function seguirPedido(id, alCambiar) {
    const c = await sb(); if (!c) return () => {};
    let ultimo = '', ch = null;
    const revisar = async () => { const p = await obtenerPedido(id); if (p && p.estado !== ultimo) { ultimo = p.estado; alCambiar(p); } };
    try { ch = c.channel('pedido-' + id).on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'pedidos', filter: `id=eq.${id}` }, revisar).subscribe(); } catch { /* sin realtime */ }
    const t = setInterval(revisar, 4000); revisar();
    return () => { clearInterval(t); try { ch && c.removeChannel(ch); } catch { /* ya cerrado */ } };
}

export async function cancelarPedido(id) {
    const c = await sb(); if (!c) return false;
    const { error } = await c.from('pedidos').update({ estado: 'cancelado' }).eq('id', id);
    if (!error) registrarEvento('pedido_cancelado', `Pedido #${id}`);
    return !error;
}
export async function subirComprobante(id, file, referencia = '') {
    const url = await subirArchivo(file, 'comprobantes', { max: 1400 });
    const c = await sb();
    const { error } = await c.from('pedidos').update({ comprobante: url, referencia }).eq('id', id);
    if (error) throw new Error(error.message);
    registrarEvento('comprobante_subido', `Pedido #${id}`);
    return url;
}
export async function misPedidos() {
    const c = await sb(); if (!c) return [];
    const { data: { session } } = await c.auth.getSession(); if (!session) return [];
    const { data } = await c.from('pedidos').select('*').eq('usuario_id', session.user.id).order('creado', { ascending: false }).limit(30);
    return data || [];
}
export async function listarPedidos() {
    const c = await sb(); if (!c) return { data: [], error: { message: 'Sin conexión' } };
    return c.from('pedidos').select('*').order('creado', { ascending: false }).limit(500);
}
export async function actualizarPedido(id, patch, evento) {
    const c = await sb(); if (!c) return { error: { message: 'Sin conexión' } };
    const r = await c.from('pedidos').update(patch).eq('id', id);
    if (!r.error && evento) registrarEvento(evento, `Pedido #${id}`);
    return r;
}
export async function listarPagosRecibidos() {
    const c = await sb(); if (!c) return { data: [] };
    return c.from('pagos_recibidos').select('*').order('creado', { ascending: false }).limit(15);
}
