// Punto de entrada ÚNICO: un solo index.html con tres pantallas (acceso, tienda, panel admin).
// Enrutador por hash:  #/tienda/catalogo  ·  #/admin/ligas  ·  (sin sesión siempre se muestra el acceso)
import { iniciarDispositivo } from '../semana3/02-mobile-first-grid-flexbox/dispositivo.js';
import { inicializarTema } from '../semana1/01-modo-oscuro/tema.js';
import { inicializarAnimaciones } from '../semana2/02-carrusel-zoom-animaciones/animaciones.js';
import { iniciarHidratacion } from '../semana2/01-delegacion-eventos-hidratacion/hidratacion.js';
import { toast } from '../semana1/05-alertas-toast/alertas.js';
import { registrarPWA } from '../pwa/pwa.js';
import { iniciarAltoContraste } from '../semana3/04-accesibilidad-contraste/accesibilidad.js';
import { activarSmokeTest } from '../semana3/05-smoke-test-dom/smoke-test.js';
import { activarAuditoria } from '../semana3/06-semantica-a11y-hmr/auditoria-semantica.js';
import { medirCWV, veredicto } from '../semana3/03-cwv-bem-dompurify-sw/cwv.js';
import { getRol, validarSesion, logout } from './core/auth.js';
import { sb, bdActiva } from './core/bd.js';
import { sincronizarLigas } from './core/almacen.js';
import { cargarAjustes, aplicarMarca } from './core/ajustes.js';

const $ = id => document.getElementById(id);
const PANT = { login: $('pantalla-login'), tienda: $('pantalla-tienda'), admin: $('pantalla-admin') };
const CARGA = { login: () => import('./views/login.js'), tienda: () => import('./views/catalogo.js'), admin: () => import('./views/admin.js') };
const TITULO = { login: 'Elite Sport | Ingresar', tienda: 'Elite Sport | Tienda de camisetas de fútbol', admin: 'Admin | Elite Sport' };
const modulos = {};
let actual = null, ocupado = false;

function destino() {
    const [, p = '', v = ''] = location.hash.split('/'), rol = getRol();
    if (!rol) return { pant: 'login', vista: '' };
    if (rol === 'admin' || rol === 'empleado') return p === 'tienda' ? { pant: 'tienda', vista: v } : { pant: 'admin', vista: p === 'admin' ? v : '' };
    return { pant: 'tienda', vista: p === 'tienda' ? v : '' };
}

/** Quita modales, fondos oscuros y bloqueos de scroll que hayan quedado abiertos (p. ej. al cerrar sesión desde el modal de perfil). */
function liberarPantalla() {
    document.querySelectorAll('.modal.show').forEach(el => { try { bootstrap.Modal.getInstance(el)?.dispose(); } catch { /* ya cerrado */ } el.classList.remove('show'); el.style.display = 'none'; el.removeAttribute('aria-modal'); });
    document.querySelectorAll('.offcanvas.show').forEach(el => { try { bootstrap.Offcanvas.getInstance(el)?.dispose(); } catch { /* ya cerrado */ } el.classList.remove('show'); });
    document.querySelectorAll('.modal-backdrop, .offcanvas-backdrop, .wipe').forEach(el => el.remove());
    document.querySelector('#modalZoom')?.classList.remove('on');
    document.body.classList.remove('modal-open', 'no-scroll');
    document.body.style.removeProperty('overflow'); document.body.style.removeProperty('padding-right');
    document.documentElement.style.removeProperty('overflow');
}

async function mostrar() {
    if (ocupado) return; ocupado = true;
    try {
        const d = destino();
        if (d.pant !== actual) {
            liberarPantalla();
            Object.entries(PANT).forEach(([k, el]) => { el.hidden = k !== d.pant; });
            actual = d.pant; document.title = TITULO[d.pant];
            if (!modulos[d.pant]) modulos[d.pant] = (await CARGA[d.pant]()).default();
            const m = await modulos[d.pant]; await m?.entrar?.();
            window.scrollTo(0, 0);
        }
        const m = await modulos[d.pant];
        if (d.pant === 'login') { if (location.hash) history.replaceState(null, '', location.pathname + location.search); }
        else if (!location.hash.startsWith('#/' + d.pant)) history.replaceState(null, '', '#/' + d.pant);
        if (d.pant !== 'login') m?.mostrarVista?.(d.vista || (d.pant === 'tienda' ? 'inicio' : ''));
    } catch (e) { console.error(e); toast('Ocurrió un error al cargar la pantalla', 'error'); }
    finally { ocupado = false; }
}

function iniciarCalidad() {
    const fab = $('btnCalidad'), panel = $('panelCalidad');
    fab.addEventListener('click', () => { const abrir = panel.hidden; panel.hidden = !abrir; fab.setAttribute('aria-expanded', String(abrir)); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !panel.hidden) { panel.hidden = true; fab.setAttribute('aria-expanded', 'false'); fab.focus(); } });
    iniciarAltoContraste($('btnSimularContraste'));
    const lig = $('btnLigero'), pintarLig = () => { const on = document.body.classList.contains('ligero'); lig.setAttribute('aria-pressed', String(on)); lig.textContent = on ? 'Modo ligero: ACTIVADO' : 'Modo ligero: desactivado'; };
    lig.addEventListener('click', () => { const on = !document.body.classList.contains('ligero'); document.body.classList.toggle('ligero', on); localStorage.setItem('eliteLigero', on ? '1' : '0'); pintarLig(); });
    pintarLig();
    activarAuditoria($('btnAuditarA11Y'), $('reporteA11Y'));
    activarSmokeTest($('btnSmokeTest'), $('salidaAudit'));
    const disp = () => { $('infoDispositivo').textContent = `${document.documentElement.dataset.dispositivo} (${document.documentElement.dataset.orientacion})`; };
    disp(); document.addEventListener('dispositivo:cambio', disp); addEventListener('orientationchange', () => setTimeout(disp, 200));
    medirCWV(m => {
        $('cwvLCP').textContent = m.LCP == null ? '…' : `${m.LCP} ms · ${veredicto.LCP(m.LCP)}`;
        $('cwvCLS').textContent = `${m.CLS} · ${veredicto.CLS(m.CLS)}`;
        $('cwvINP').textContent = m.INP == null ? '…' : `${m.INP} ms · ${veredicto.INP(m.INP)}`;
    });
}

async function arrancar() {
    iniciarDispositivo();
    // Modo ligero: en celular/tablet se apagan los efectos pesados (se puede cambiar en el botón de accesibilidad)
    const pref = localStorage.getItem('eliteLigero');
    document.body.classList.toggle('ligero', pref === null ? document.documentElement.dataset.dispositivo !== 'laptop' : pref === '1');
    window.logout = () => { liberarPantalla(); return logout(); };
    sincronizarLigas();
    inicializarTema(); inicializarAnimaciones(); registrarPWA(); iniciarCalidad();
    let ultimoAviso = 0;
    document.addEventListener('bd:error', e => { if (Date.now() - ultimoAviso > 4000) { ultimoAviso = Date.now(); toast(e.detail, 'warn'); } });
    // Accesibilidad por teclado: Enter / Espacio activan los elementos con role="button"
    document.addEventListener('keydown', e => {
        const el = e.target.closest?.('[role="button"]');
        if (el && (e.key === 'Enter' || e.key === ' ') && !e.target.matches('input,textarea,select,button,a')) { e.preventDefault(); el.click(); }
    });
    aplicarMarca();
    await sb().then(() => { $('infoBD').textContent = bdActiva() ? 'Supabase' : 'sin conexión'; });
    await cargarAjustes().catch(() => {});
    await validarSesion();
    addEventListener('hashchange', mostrar);
    document.addEventListener('auth:cambio', () => { actual = null; history.replaceState(null, '', location.pathname + location.search); mostrar(); });
    await mostrar();
    iniciarHidratacion();
}
arrancar();
