// Roles y sesión: "cliente" y "admin". Todo con Supabase Auth (correo + contraseña); el rol vive en la tabla `perfiles`.
import { ADMIN_EMAIL_DOMINIO } from './config.js';
import { sb } from './bd.js';
import { limpiarFavsLocales } from './almacen.js';
import { registrarEvento } from './bitacora.js';

const KR = 'eliteRol', KU = 'eliteUsuario';
const leer = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const avisar = () => document.dispatchEvent(new CustomEvent('auth:cambio'));
const SIN_BD = { ok: false, msg: 'No hay conexión con la base de datos. Revisa tu internet e intenta de nuevo.' };

export const getRol = () => localStorage.getItem(KR);
export const getUsuario = () => leer(KU, { nombre: 'Invitado', email: '' });
export const esInvitado = () => !!getUsuario().invitado;
export const esStaff = () => ['admin', 'empleado'].includes(getRol());   // empleado: catálogo y pedidos · admin: negocio (ventas, bitácora, usuarios, marca)

function iniciar(rol, usuario) {
    localStorage.setItem(KR, rol); localStorage.setItem(KU, JSON.stringify(usuario));
    return { ok: true, rol };   // la pantalla cambia cuando login.js dispara 'auth:cambio' (tras la animación)
}
const TRAD = [['Invalid login credentials', 'Correo o contraseña incorrectos'], ['already registered', 'Ese correo ya está registrado'],
    ['Email not confirmed', 'Confirma tu correo antes de entrar'], ['at least 6', 'La contraseña debe tener mínimo 6 caracteres'],
    ['rate limit', 'Demasiados intentos. Espera un momento'], ['Failed to fetch', 'Sin conexión con el servidor'],
    ['Invalid API key', 'La clave de Supabase no es válida (revisa SUPABASE_KEY)']];
const traducir = m => (TRAD.find(([x]) => (m || '').includes(x)) || [0, m || 'Error inesperado'])[1];

/** Lee el perfil (nombre y rol). Si la tabla no existe devuelve `error` para avisar que falta ejecutar schema.sql. */
async function perfilDe(c, user) {
    const { data, error } = await c.from('perfiles').select('nombre,rol').eq('id', user.id).maybeSingle();
    if (error) return { error: error.message };
    return { nombre: data?.nombre || user.user_metadata?.nombre || user.email, rol: data?.rol || 'cliente' };
}

export async function registrar({ nombre, email, tel, pass }) {
    email = email.trim().toLowerCase(); nombre = nombre.trim();
    const c = await sb(); if (!c) return SIN_BD;
    const { data, error } = await c.auth.signUp({ email, password: pass, options: { data: { nombre, telefono: tel } } });
    if (error) return { ok: false, msg: traducir(error.message) };
    // Supabase no avisa si el correo ya existe: devuelve un usuario sin identidades
    if (data.user && data.user.identities && !data.user.identities.length) return { ok: false, msg: 'Ese correo ya está registrado' };
    if (!data.session) return { ok: true, pendiente: true, msg: 'Cuenta creada. Revisa tu correo para confirmarla y luego ingresa.' };
    registrarEvento('registro', email);
    return iniciar('cliente', { nombre, email });
}

export async function loginCliente(email, pass) {
    email = email.trim().toLowerCase();
    const c = await sb(); if (!c) return SIN_BD;
    const { data, error } = await c.auth.signInWithPassword({ email, password: pass });
    if (error) { registrarEvento('login_fallido', email); return { ok: false, msg: traducir(error.message) }; }
    const p = await perfilDe(c, data.user);
    if (p.error) { await c.auth.signOut(); return { ok: false, msg: 'Error de base de datos: ' + p.error + ' (¿ejecutaste supabase/schema.sql?)' }; }
    iniciar(p.rol, { nombre: p.nombre, email }); registrarEvento('login', `${email} (${p.rol})`);
    return { ok: true, rol: p.rol };
}

/** Zona de control: entran administrador y empleado (el cliente es rechazado). */
export async function loginAdmin(user, pass) {
    const u = user.trim().toLowerCase(), c = await sb(); if (!c) return SIN_BD;
    const email = u.includes('@') ? u : u + ADMIN_EMAIL_DOMINIO;
    const { data, error } = await c.auth.signInWithPassword({ email, password: pass });
    if (error) { registrarEvento('login_fallido', email + ' (zona de control)'); return { ok: false, msg: traducir(error.message) }; }
    const p = await perfilDe(c, data.user);
    if (p.error) { await c.auth.signOut(); return { ok: false, msg: 'Error de base de datos: ' + p.error + ' (¿ejecutaste supabase/schema.sql?)' }; }
    if (!['admin', 'empleado'].includes(p.rol)) { registrarEvento('acceso_denegado', email); await c.auth.signOut(); return { ok: false, msg: 'Esta cuenta no tiene permisos de administrador ni de empleado' }; }
    iniciar(p.rol, { nombre: p.nombre, email }); registrarEvento('login', `${email} (${p.rol})`);
    return { ok: true, rol: p.rol };
}

export const entrarInvitado = () => iniciar('cliente', { nombre: 'Invitado', email: '', invitado: true });

/** Al abrir la app: comprueba que la sesión guardada siga vigente en Supabase (y que el rol no haya cambiado). */
export async function validarSesion() {
    if (!getRol() || esInvitado()) return !!getRol();
    const c = await sb(); if (!c) return true;   // sin internet: se conserva la sesión guardada
    const { data: { session } } = await c.auth.getSession();
    if (!session) { localStorage.removeItem(KR); localStorage.removeItem(KU); return false; }
    const p = await perfilDe(c, session.user);
    if (!p.error && p.rol !== getRol()) localStorage.setItem(KR, p.rol);
    return true;
}

const espera = (p, ms) => Promise.race([p, new Promise(r => setTimeout(r, ms))]);

/** Cierra sesión SIN colgarse: la sesión local se borra siempre, aunque la red falle o tarde. */
export async function logout() {
    const c = await sb();
    if (c) {
        await espera(registrarEvento('logout', getUsuario().email || ''), 900);
        try { await espera(c.auth.signOut({ scope: 'local' }), 1500); } catch { /* sin red: no importa */ }
    }
    limpiarFavsLocales();
    localStorage.removeItem(KR); localStorage.removeItem(KU);
    avisar();
}
