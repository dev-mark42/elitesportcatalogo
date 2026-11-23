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
export async function crearPedido({
    lineas, total, nombre, telefono, notas,
    metodo = 'qr', entrega = 'local', departamento = '',
    montoQr = total, montoEfectivo = 0
}) {
    if (!navigator.onLine) return { ok: false, msg: 'Sin internet: no se creó el pedido ni se realizó ningún pago.' };
    const c = await sb(); if (!c) return { ok: false, msg: 'Sin conexión con la base de datos' };
    const { data: { session } } = await c.auth.getSession();
    if (!session) return { ok: false, msg: 'Inicia sesión para pagar' };
    const items = lineas.map(l => ({ id: l.p.id, titulo: l.p.titulo, talla: l.talla, cant: l.cant, precio: precioDe(l.p), imagen: l.p.imagen || '' }));
    const { pago } = getAjustes();
    if (!['qr', 'efectivo', 'mixto', 'whatsapp'].includes(metodo)) return { ok: false, msg: 'Método de pago no válido.' };
    if (!['local', 'departamento'].includes(entrega)) return { ok: false, msg: 'Tipo de entrega no válido.' };
    if (entrega === 'departamento' && metodo === 'efectivo') return { ok: false, msg: 'Para envíos a otro departamento solo se acepta pago QR o coordinación por WhatsApp.' };
    if (metodo === 'mixto' && (entrega !== 'local' || !(montoQr > 0) || !(montoEfectivo > 0) || r2(montoQr + montoEfectivo) !== r2(total))) return { ok: false, msg: 'El pago mixto debe sumar exactamente el total y solo está disponible para entrega local.' };
    if (metodo === 'qr' && (!(montoQr > 0) || r2(montoQr) !== r2(total))) return { ok: false, msg: 'El monto QR debe coincidir con el total.' };
    if (metodo === 'efectivo' && entrega !== 'local') return { ok: false, msg: 'El efectivo solo está disponible para entrega local.' };
    if (metodo === 'whatsapp') {
        const estado = 'coordinacion';
        const fila = { usuario_id: session.user.id, cliente_nombre: nombre, cliente_email: session.user.email, telefono, notas, items, total, estado, metodo, entrega_tipo: entrega, departamento: departamento || null, monto_qr: 0, monto_efectivo: 0 };
        const { data, error } = await c.from('pedidos').insert(fila).select().single();
        if (error) return { ok: false, msg: 'No se pudo registrar la coordinación: ' + error.message };
        registrarEvento('pedido_whatsapp', `Pedido #${data.id}`);
        return { ok: true, pedido: data, coordinacion: true };
    }
    try { await c.rpc('expirar_pedidos'); } catch { /* la expiración también se ejecuta en servidor */ }
    // Un identificador de pago aleatorio evita depender de reintentos ciegos contra el índice único.
    const qrBase = metodo === 'mixto' ? r2(montoQr) : r2(total);
    const extra = metodo === 'efectivo' ? 0 : (pago.centavos === false ? 0 : (1 + Math.floor(Math.random() * 99)) / 100);
    const montoUnico = metodo === 'efectivo' ? null : r2(qrBase + extra);
    const efectivoFinal = metodo === 'mixto' ? r2(total - montoUnico) : (metodo === 'efectivo' ? r2(total) : 0);
    if (efectivoFinal < 0) return { ok: false, msg: 'Ajusta el monto QR para dejar un saldo positivo en efectivo.' };
    const fila = {
        usuario_id: session.user.id, cliente_nombre: nombre, cliente_email: session.user.email,
        telefono, notas, items, total, monto_unico: montoUnico,
        monto_qr: montoUnico || 0, monto_efectivo: efectivoFinal,
        estado: 'pendiente_pago', metodo, entrega_tipo: entrega, departamento: departamento || null,
        vence_en: metodo === 'efectivo' ? null : new Date(Date.now() + (Number(pago.minutos) || 30) * 60000).toISOString()
    };
    const { data, error } = await c.from('pedidos').insert(fila).select().single();
    if (error) return { ok: false, msg: error.code === '23505' ? 'Se generó un monto repetido. Espera unos segundos e inténtalo una sola vez.' : 'No se pudo crear el pedido. Verifica tu conexión e inténtalo nuevamente.' };
    registrarEvento('pedido_creado', `Pedido #${data.id} · Bs ${fila.monto_unico}`);
    return { ok: true, pedido: data };
}

export async function obtenerPedido(id) {
    const c = await sb(); if (!c) return null;
    const { data } = await c.from('pedidos').select('*').eq('id', id).maybeSingle();
    return data;
}

/** Avisa al instante cuando cambia el pedido (Realtime) y, por seguridad, revisa cada 4 s. Devuelve la función para dejar de escuchar. */
export async function seguirPedido(id, alCambiar) {
    const c = await sb(); if (!c) return () => {};
    let ultimo = '', ch = null, consultando = false;
    const revisar = async () => {
        if (consultando || !navigator.onLine) return;
        consultando = true;
        try { const p = await obtenerPedido(id); if (p && p.estado !== ultimo) { ultimo = p.estado; alCambiar(p); } }
        finally { consultando = false; }
    };
    try { ch = c.channel('pedido-' + id).on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'pedidos', filter: `id=eq.${id}` }, revisar).subscribe(); } catch { /* sin realtime */ }
    const t = setInterval(revisar, 12000); revisar();
    return () => { clearInterval(t); try { ch && c.removeChannel(ch); } catch { /* ya cerrado */ } };
}

export async function cancelarPedido(id) {
    if (!navigator.onLine) return false;
    const c = await sb(); if (!c) return false;
    const { error } = await c.rpc('cancelar_pedido_propio', { p_pedido_id: id });
    if (!error) registrarEvento('pedido_cancelado', `Pedido #${id}`);
    return !error;
}
export async function subirComprobante(id, file, referencia = '') {
    if (!navigator.onLine) throw new Error('Necesitas internet para enviar el comprobante.');
    const c = await sb(); if (!c) throw new Error('Sin conexión con la base de datos.');
    const { data: { session } } = await c.auth.getSession();
    if (!session?.user?.id) throw new Error('Inicia sesión para enviar el comprobante.');
    const url = await subirArchivo(file, `comprobantes/${session.user.id}`, { max: 1400 });
    const { error } = await c.rpc('registrar_comprobante_pedido', {
        p_pedido_id: id, p_url: url, p_referencia: String(referencia || '').slice(0, 40)
    });
    if (error) throw new Error(error.message || 'No se pudo registrar el comprobante.');
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
    if (!navigator.onLine) return { error: { message: 'Sin internet: no se modificó el pedido.' } };
    const c = await sb(); if (!c) return { error: { message: 'Sin conexión' } };
    const r = await c.from('pedidos').update(patch).eq('id', id);
    if (!r.error && evento) registrarEvento(evento, `Pedido #${id}`);
    return r;
}
export async function listarPagosRecibidos() {
    const c = await sb(); if (!c) return { data: [] };
    return c.from('pagos_recibidos').select('*').order('creado', { ascending: false }).limit(15);
}
