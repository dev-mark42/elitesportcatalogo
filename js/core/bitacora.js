// Bitácora de eventos: cada acción importante queda registrada (solo el ADMIN puede leerla).
import { sb } from './bd.js';

const leer = k => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };

export async function registrarEvento(accion, detalle = '') {
    try {
        const c = await sb(); if (!c) return;
        const { data: { session } } = await c.auth.getSession(), u = leer('eliteUsuario') || {};
        await c.from('bitacora').insert({
            usuario_id: session?.user.id ?? null, usuario_email: u.email || session?.user.email || null,
            rol: localStorage.getItem('eliteRol') || 'anon', accion, detalle: String(detalle).slice(0, 400)
        });
    } catch { /* la bitácora nunca debe romper la app */ }
}

export async function listarBitacora(limite = 300) {
    const c = await sb(); if (!c) return { data: [], error: { message: 'Sin conexión' } };
    return c.from('bitacora').select('*').order('creado', { ascending: false }).limit(limite);
}
