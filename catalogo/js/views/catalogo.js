import { cargarTodo, getFavs, toggleFav, getCarrusel, suscribirCambios } from '../core/almacen.js';
import { cargarAjustes, getWhatsapp } from '../core/ajustes.js';
import { iniciarCompras, agregar, iniciarPago } from './compras.js';
import { LIGAS, iconoLiga } from '../core/config.js';
import { fmtBs, imgFallback, avatarSVG } from '../core/utils.js';
import { getUsuario, esStaff } from '../core/auth.js';
import { normalizarImagen } from '../../semana2/03-fetch-lazyloading-dropbox/dropbox.js';
import { inicializarLazyLoading } from '../../semana2/03-fetch-lazyloading-dropbox/lazy-loading.js';
import { limpiarTexto as L } from '../../semana2/05-seguridad-xss-subida-imagen/seguridad-xss.js';
import { configurarDelegacionEventos as deleg } from '../../semana2/01-delegacion-eventos-hidratacion/delegacion-eventos.js';
import { toast } from '../../semana1/05-alertas-toast/alertas.js';
import { validarFormulario, validacionEnVivo, limpiarValidacion } from '../../semana1/04-validacion-formulario/validaciones.js';
import { filtrarProductos } from '../../semana1/02-filtro-catalogo/filtro-catalogo.js';
import { activarZoom } from '../../semana2/02-carrusel-zoom-animaciones/zoom.js';
import { observarReveal, chispas, animarContador } from '../../semana2/02-carrusel-zoom-animaciones/animaciones.js';
import { iniciarCarrusel } from '../../semana2/02-carrusel-zoom-animaciones/carrusel.js';
import { esLaptop } from '../../semana3/02-mobile-first-grid-flexbox/dispositivo.js';

const $ = id => document.getElementById(id);
const est = { liga: 'todas', q: '', orden: 'nuevo', disp: false, id: null, talla: null };
let productos = [], zoom = null, pag = 1, claveFiltro = '', iniciada = false, fotos = [], desuscribir = null;
const POR_PAG = 8;   // laptop: catálogo paginado (sin scroll infinito); celular/tablet: lista completa
const src = p => normalizarImagen(p.imagen) || imgFallback(p.titulo);

function tarjeta(p) {
    const fav = getFavs().includes(p.id);
    const rib = p.stock <= 0 ? '<span class="p-ribbon agot">AGOTADO</span>' : p.stock <= 3 ? '<span class="p-ribbon ult">ÚLTIMAS</span>' : (Date.now() - p.id < 6048e5 ? '<span class="p-ribbon nuevo">NUEVO</span>' : '');
    return `<div class="col-6 col-md-4 col-xl-3 reveal"><article class="p-card tilt" data-id="${p.id}">
      <div class="p-img js-zoom" role="button" tabindex="0" aria-label="Ver y ampliar ${L(p.titulo)}">${rib}${p.imagenes.length > 1 ? `<span class="p-fotos"><i class="fa-regular fa-images"></i> ${p.imagenes.length}</span>` : ''}<img loading="lazy" decoding="async" alt="${L(p.titulo)}" data-src="${L(src(p))}" data-fallback="${L(imgFallback(p.titulo))}">
        <div class="p-lupa"><i class="fa-solid fa-magnifying-glass-plus"></i> Ver y ampliar</div></div>
      <button type="button" class="p-fav js-fav ${fav ? 'on' : ''}" aria-label="Favorito: ${L(p.titulo)}" aria-pressed="${fav}"><i class="${fav ? 'fa-solid' : 'fa-regular'} fa-heart"></i></button>
      <div class="p-body js-zoom"><div class="p-liga">${iconoLiga(p.liga, 18)} ${L(LIGAS[p.liga]?.n || p.liga)} · ${L(p.temporada)}</div>
        <div class="p-title">${L(p.titulo)}</div><div>${p.tallas.map(t => `<span class="badge-talla">${L(t)}</span>`).join('')}</div>
        <div class="d-flex justify-content-between align-items-end mt-2"><span class="p-precio">${fmtBs(p.precio)}</span>
        <small class="t-m"><i class="fa-solid fa-cubes"></i> ${p.stock}</small></div></div></article></div>`;
}
const pintar = (id, lista, vacio) => {
    const c = $(id); if (!c) return;
    c.innerHTML = lista.length ? lista.map(tarjeta).join('') : `<div class="col-12 text-center t-m py-5"><i class="fa-solid fa-futbol fa-3x t-g mb-3"></i><h5>${vacio}</h5></div>`;
    inicializarLazyLoading(c); observarReveal(c);
};

function renderCarrusel() { iniciarCarrusel($('heroCarrusel'), getCarrusel()); }

function renderLigas() {
    const k = Object.keys(LIGAS);
    $('gridLigas').innerHTML = k.map(x => `<div class="col-6 col-md-4 col-lg reveal"><div class="cat-card" data-liga="${x}" role="button" tabindex="0" aria-label="Ver camisetas de ${L(LIGAS[x].n)}"><div class="lg">${iconoLiga(x, 60)}</div><h6>${LIGAS[x].n}</h6></div></div>`).join('')
      + `<div class="col-6 col-md-4 col-lg reveal"><div class="cat-card" data-liga="todas" role="button" tabindex="0" aria-label="Ver todo el catálogo"><div class="lg"><i class="fa-solid fa-trophy"></i></div><h6>Ver todo</h6></div></div>`;
    observarReveal($('gridLigas'));
}
function renderChips() {
    $('chipsLigas').innerHTML = [['todas', 'Todas'], ...Object.entries(LIGAS).map(([k, v]) => [k, v.n])]
      .map(([k, n]) => `<div class="chip ${est.liga === k ? 'active' : ''}" data-liga="${k}" role="button" tabindex="0" aria-pressed="${est.liga === k}">${n}</div>`).join('');
}
function renderCatalogo() {
    const l = filtrarProductos(productos, est), clave = JSON.stringify([est.liga, est.q, est.orden, est.disp]);
    if (clave !== claveFiltro) { claveFiltro = clave; pag = 1; }
    const lap = esLaptop(), total = Math.max(1, Math.ceil(l.length / POR_PAG));
    pag = Math.min(pag, total);
    $('contadorRes').textContent = `${l.length} producto${l.length === 1 ? '' : 's'}`;
    renderChips();
    pintar('contenedorCliente', lap ? l.slice((pag - 1) * POR_PAG, pag * POR_PAG) : l, 'No se encontraron productos');
    $('paginador').hidden = !(lap && total > 1);
    $('pgInfo').textContent = `Página ${pag} de ${total}`; $('pgPrev').disabled = pag <= 1; $('pgNext').disabled = pag >= total;
}
const renderFavs = () => { pintar('contenedorFavoritos', productos.filter(p => getFavs().includes(p.id)), 'Aún no tienes favoritos'); badges(); };
function badges() { const n = getFavs().length; document.querySelectorAll('.js-fav-count').forEach(b => { b.textContent = n; b.classList.toggle('d-none', !n); }); }

function renderHome() {
    pintar('contenedorDestacados', [...productos].sort((a, b) => b.id - a.id).slice(0, 4), 'Pronto nuevos productos');
    animarContador($('stProd'), productos.length); animarContador($('stLigas'), Object.keys(LIGAS).length);
    animarContador($('stOrig'), 100); animarContador($('stEnv'), 9);
}

function mostrarVista(v) {
    const pant = $('pantalla-tienda');
    if (!$('vista-' + v)) v = 'inicio';
    pant.querySelectorAll('.app-view').forEach(x => x.classList.remove('active'));
    $('vista-' + v).classList.add('active');
    pant.querySelectorAll('[data-vista]').forEach(a => a.classList.toggle('active', a.dataset.vista === v && (a.classList.contains('nav-pill') || !!a.closest('.bottom-nav'))));
    if (v === 'favoritos') renderFavs(); if (v === 'catalogo') renderCatalogo();
    window.scrollTo({ top: 0 }); observarReveal();
}
const cambiarVista = v => { if (location.hash === '#/tienda/' + v) mostrarVista(v); else location.hash = '#/tienda/' + v; };
window.cambiarVista = cambiarVista;
window.filtrarPorLiga = l => { est.liga = l; cambiarVista('catalogo'); };

// ===== Zoom / detalle =====
function pintarFavBtn() {
    const on = getFavs().includes(est.id), b = $('btnFavorito');
    b.innerHTML = `<i class="${on ? 'fa-solid' : 'fa-regular'} fa-heart"></i> ${on ? 'En favoritos' : 'Añadir a favoritos'}`;
    b.classList.toggle('btn-danger', on); b.classList.toggle('btn-outline-danger', !on);
}
const galeriaDe = p => { const g = p.imagenes.map(i => ({ url: normalizarImagen(i.url), desc: i.desc })).filter(i => i.url); return g.length ? g : [{ url: imgFallback(p.titulo), desc: '' }]; };
function mostrarFoto(i) {
    const p = productos.find(x => x.id === est.id); if (!p || !fotos[i]) return;
    const im = $('zoomImg'); im.alt = fotos[i].desc || p.titulo; im.onerror = () => { im.onerror = null; im.src = imgFallback(p.titulo); };
    im.src = fotos[i].url; zoom?.reset();
    $('zoomCaption').textContent = fotos[i].desc || '';
    document.querySelectorAll('#zoomThumbs .zm-thumb').forEach((b, k) => { b.classList.toggle('on', k === i); b.setAttribute('aria-selected', k === i); });
    est.foto = i;
}
function abrir(id) {
    const p = productos.find(x => x.id === id); if (!p) return;
    est.id = id; est.talla = null; fotos = galeriaDe(p);
    $('zoomThumbs').innerHTML = fotos.length > 1 ? fotos.map((f, k) => `<button type="button" class="zm-thumb" role="tab" data-i="${k}" aria-label="Foto ${k + 1} de ${fotos.length}"><img src="${L(f.url)}" alt="Foto ${k + 1} de ${L(p.titulo)}" loading="lazy" onerror="this.onerror=null;this.src='${L(imgFallback(p.titulo))}'"></button>`).join('') : '';
    mostrarFoto(0);
    $('zoomLiga').innerHTML = `${iconoLiga(p.liga, 24)} ${L(LIGAS[p.liga]?.n || p.liga)}`;
    $('zoomTitulo').textContent = p.titulo; $('zoomTemporada').textContent = 'Temporada ' + p.temporada;
    $('zoomPrecio').textContent = fmtBs(p.precio); $('zoomDesc').textContent = p.descripcion || 'Camiseta de alta calidad.';
    $('zoomStock').innerHTML = p.stock <= 0 ? '<span class="text-danger fw-bold">Agotado</span>' : `<span class="t-g fw-bold">${p.stock} disponibles</span>`;
    $('zoomTallas').innerHTML = p.tallas.map(t => `<button type="button" class="talla-opt" data-t="${L(t)}">${L(t)}</button>`).join(' ');
    $('btnComprar').disabled = $('btnPagarQR').disabled = $('btnAgregar').disabled = p.stock <= 0; pintarFavBtn();
    $('modalZoom').classList.add('on'); document.body.classList.add('no-scroll');
}
function pedirTalla() {
    if (est.talla) return true;
    toast('Selecciona una talla primero', 'warn'); $('zoomTallas').classList.add('shake'); setTimeout(() => $('zoomTallas').classList.remove('shake'), 500); return false;
}
window.cerrarZoom = () => { $('modalZoom').classList.remove('on'); document.body.classList.remove('no-scroll'); zoom?.reset(); };
window.contactarWhatsApp = () => {
    const p = productos.find(x => x.id === est.id); if (!p) return;
    if (!pedirTalla()) return;
    window.open(`https://wa.me/${getWhatsapp()}?text=${encodeURIComponent(`Hola Elite Sport, me interesa: ${p.titulo} (${p.temporada}) - Talla ${est.talla} - ${fmtBs(p.precio)}`)}`, '_blank');
};
window.compartir = async () => {
    const p = productos.find(x => x.id === est.id); const d = { title: p.titulo, text: `${p.titulo} - ${fmtBs(p.precio)} en Elite Sport`, url: location.href };
    try { navigator.share ? await navigator.share(d) : (await navigator.clipboard.writeText(`${d.text} ${d.url}`), toast('Enlace copiado', 'info')); } catch { /* cancelado */ }
};
function favorito(id, e) {
    const on = toggleFav(id);
    document.querySelectorAll(`[data-id="${id}"] .js-fav`).forEach(b => { b.classList.toggle('on', on); b.innerHTML = `<i class="${on ? 'fa-solid' : 'fa-regular'} fa-heart"></i>`; });
    if (on && e) chispas(e.clientX || innerWidth / 2, e.clientY || innerHeight / 2);
    toast(on ? 'Añadido a favoritos' : 'Quitado de favoritos', on ? 'ok' : 'info');
    badges(); if ($('vista-favoritos').classList.contains('active')) renderFavs(); if (est.id === id) pintarFavBtn();
}

// ===== Perfil =====
window.ocultarModal = id => bootstrap.Modal.getInstance($(id))?.hide();
window.cambiarFotoPerfil = ev => {
    const f = ev.target.files[0]; if (!f) return;
    if (!f.type.startsWith('image/') || f.size > 1.5e6) return toast('Elige una imagen de máximo 1.5 MB', 'error');
    const r = new FileReader(); r.onload = () => { $('perfilFoto').src = r.result; try { localStorage.setItem('eliteFoto', r.result); } catch {} toast('Foto actualizada'); }; r.readAsDataURL(f);
};

// ===== Contacto =====
const reglasC = { cNombre: { req: 1, min: 3, max: 40 }, cTel: { req: 1, regex: /^[67]\d{7}$/, msg: 'Celular boliviano de 8 dígitos (ej. 71234567)' }, cMsg: { req: 1, min: 10, max: 300 } };

function refrescarPerfil() {
    const f = localStorage.getItem('eliteFoto'), u = getUsuario();
    $('perfilNombre').textContent = u.nombre; $('perfilEmail').textContent = u.email || 'Sesión de invitado';
    $('perfilFoto').src = f || avatarSVG(u.nombre);
    $('btnVolverPanel').classList.toggle('d-none', !esStaff());
}

export default async function iniciarTienda() {
    if (iniciada) return;
    iniciada = true;
    zoom = activarZoom({ wrap: $('zmWrap'), img: $('zoomImg'), lens: $('zmLens'), pane: $('zmPane'), hint: $('zmHint') });

    $('pantalla-tienda').addEventListener('click', e => { const a = e.target.closest('[data-vista]'); if (a) { e.preventDefault(); cambiarVista(a.dataset.vista); } });
    $('btnVolverPanel').addEventListener('click', () => { ocultarModal('modalPerfil'); location.hash = '#/admin'; });
    $('pgPrev').addEventListener('click', () => { pag--; renderCatalogo(); });
    $('pgNext').addEventListener('click', () => { pag++; renderCatalogo(); });
    document.addEventListener('dispositivo:cambio', () => { if (iniciada && $('vista-catalogo').classList.contains('active')) renderCatalogo(); });
    for (const c of ['#contenedorCliente', '#contenedorFavoritos', '#contenedorDestacados']) {
        deleg(c, '.js-fav', 'click', (e, t) => { e.stopPropagation(); favorito(+t.closest('[data-id]').dataset.id, e); });
        deleg(c, '.js-zoom', 'click', (e, t) => abrir(+t.closest('[data-id]').dataset.id));
    }
    deleg('#gridLigas', '[data-liga]', 'click', (e, t) => filtrarPorLiga(t.dataset.liga));
    deleg('#chipsLigas', '[data-liga]', 'click', (e, t) => { est.liga = t.dataset.liga; renderCatalogo(); });
    deleg('#zoomTallas', '.talla-opt', 'click', (e, t) => { est.talla = t.dataset.t; document.querySelectorAll('.talla-opt').forEach(x => x.classList.toggle('sel', x === t)); });
    $('modalZoom').addEventListener('click', e => { if (e.target.id === 'modalZoom') cerrarZoom(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') cerrarZoom(); });
    $('btnFavorito').onclick = e => favorito(est.id, e);
    deleg('#zoomThumbs', '.zm-thumb', 'click', (e, t) => mostrarFoto(+t.dataset.i));
    document.addEventListener('keydown', e => { if (!$('modalZoom').classList.contains('on') || fotos.length < 2) return; if (e.key === 'ArrowRight') mostrarFoto((est.foto + 1) % fotos.length); if (e.key === 'ArrowLeft') mostrarFoto((est.foto - 1 + fotos.length) % fotos.length); });
    $('btnAgregar').onclick = () => { if (!pedirTalla()) return; const p = productos.find(x => x.id === est.id); if (agregar(p, est.talla)) { const b = $('btnAgregar'); b.classList.add('bump'); setTimeout(() => b.classList.remove('bump'), 400); } };
    $('btnPagarQR').onclick = () => { if (!pedirTalla()) return; const p = productos.find(x => x.id === est.id); cerrarZoom(); iniciarPago({ lineas: [{ p, talla: est.talla, cant: 1, sub: p.precio }], total: p.precio, unidades: 1 }); };
    iniciarCompras({ alPagarCb: async () => { productos = await cargarTodo(); renderCatalogo(); renderHome(); } });

    const buscar = e => { est.q = e.target.value.toLowerCase().trim(); document.querySelectorAll('.js-buscar').forEach(i => i !== e.target && (i.value = e.target.value)); if (!$('vista-catalogo').classList.contains('active')) cambiarVista('catalogo'); else renderCatalogo(); };
    document.querySelectorAll('.js-buscar').forEach(i => i.addEventListener('input', buscar));
    $('filtroOrden').onchange = e => { est.orden = e.target.value; renderCatalogo(); };
    $('soloDisp').onchange = e => { est.disp = e.target.checked; renderCatalogo(); };

    const fc = $('formContacto'); validacionEnVivo(fc, reglasC);
    fc.addEventListener('submit', e => {
        e.preventDefault(); if (!validarFormulario(fc, reglasC, toast)) return;
        window.open(`https://wa.me/${getWhatsapp()}?text=${encodeURIComponent(`Hola, soy ${$('cNombre').value} (${$('cTel').value}). ${$('cMsg').value}`)}`, '_blank');
        fc.reset(); limpiarValidacion(fc); toast('¡Mensaje listo! Te atenderemos pronto');
    });
    return {
        mostrarVista,
        async entrar() {   // cada vez que se muestra la tienda: datos frescos (Supabase o local) y perfil del usuario actual
            productos = await cargarTodo(); await cargarAjustes();
            Object.assign(est, { liga: 'todas', q: '', orden: 'nuevo', disp: false }); pag = 1;
            document.querySelectorAll('.js-buscar').forEach(i => { i.value = ''; }); $('filtroOrden').value = 'nuevo'; $('soloDisp').checked = false;
            refrescarPerfil(); renderCarrusel(); renderLigas(); renderHome(); renderCatalogo(); renderFavs();
            toast(`¡Bienvenido, ${getUsuario().nombre.split(' ')[0]}!`, 'info');
            desuscribir?.(); desuscribir = await suscribirCambios(async () => { productos = await cargarTodo(); await cargarAjustes(); renderLigas(); renderHome(); renderCatalogo(); renderFavs(); renderCarrusel(); });
        }
    };
}
