// Panel con dos roles:
//   EMPLEADO → inventario (fotos múltiples), ligas, carrusel, estadísticas del inventario, pedidos y pagos.
//   ADMIN    → ventas, pedidos, bitácora, usuarios y roles, marca y tienda, pagos (QR), avances, sistema. (No toca el catálogo.)
import { cargarTodo, getProductos, setProductos, getCarrusel, setCarrusel, getLigas, setLigas, restablecerDemo, suscribirCambios } from '../core/almacen.js';
import { LIGAS, iconoLiga } from '../core/config.js';
import { fmtBs, imgFallback, descargar, csv } from '../core/utils.js';
import { sb, bdActiva, probarBD } from '../core/bd.js';
import { getUsuario, getRol } from '../core/auth.js';
import { cargarAjustes, getAjustes, guardarAjuste } from '../core/ajustes.js';
import { subirArchivo } from '../core/storage.js';
import { registrarEvento, listarBitacora } from '../core/bitacora.js';
import { listarPedidos, actualizarPedido, listarPagosRecibidos } from '../core/pedidos.js';
import { AVANCES } from '../core/avances.js';
import { etiquetaEstado } from './compras.js';
import { normalizarImagen } from '../../semana2/03-fetch-lazyloading-dropbox/dropbox.js';
import { inicializarLazyLoading } from '../../semana2/03-fetch-lazyloading-dropbox/lazy-loading.js';
import { limpiarTexto as L } from '../../semana2/05-seguridad-xss-subida-imagen/seguridad-xss.js';
import { activarDropzone } from '../../semana2/05-seguridad-xss-subida-imagen/subida-imagen.js';
import { configurarDelegacionEventos as deleg } from '../../semana2/01-delegacion-eventos-hidratacion/delegacion-eventos.js';
import { toast, confirmar } from '../../semana1/05-alertas-toast/alertas.js';
import { validarFormulario, validacionEnVivo, limpiarValidacion } from '../../semana1/04-validacion-formulario/validaciones.js';
import { montarMenu } from '../../semana1/03-menu-hamburguesa/menu-hamburguesa.js';
import { observarReveal, animarContador } from '../../semana2/02-carrusel-zoom-animaciones/animaciones.js';
import { soloTexto } from '../../semana3/03-cwv-bem-dompurify-sw/sanitizar.js';
import '../../semana3/01-componentes-encapsulamiento/elite-tarjeta.js';

const $ = id => document.getElementById(id);
const PERMISOS = { ventas: ['admin'], pedidos: ['admin', 'empleado'], inventario: ['empleado'], ligas: ['empleado'], carrusel: ['empleado'], estadisticas: ['empleado'],
    bitacora: ['admin'], usuarios: ['admin'], marca: ['admin'], pagos: ['admin'], avances: ['admin'], config: ['admin'] };
const src = p => normalizarImagen(p.imagen) || imgFallback(p.titulo);
let editId = null, editLiga = null, imgLiga = null, imgSlide = null, galeria = [], vistaActual = '', temporizador = null, bitDatos = [], pedDatos = [], desuscribir = null;
const reglas = { prodTitulo: { req: 1, min: 3, max: 60 }, prodPrecio: { req: 1, numMin: 1, numMax: 9999 }, prodStock: { req: 1, numMin: 0, numMax: 9999 } };
const reglasL = { lNombre: { req: 1, min: 2, max: 30 } }, reglasC = { cTitulo: { req: 1, min: 3, max: 40 } };
const reglasM = { mNombre: { req: 1, min: 2, max: 30 }, tWhatsapp: { regex: /^\d{8,15}$/, msg: 'Solo números con código de país (ej. 59171234567)' } };
const reglasP = { pMinutos: { req: 1, numMin: 5, numMax: 120 } };
const slug = t => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '') || 'liga' + Date.now();
const prev = (el, u, vacio = 'Vista previa') => { el.innerHTML = u ? `<img src="${L(u)}" alt="Vista previa de la imagen" onerror="this.parentElement.textContent='No se pudo cargar la imagen'">` : vacio; };
const fecha = f => new Date(f).toLocaleString('es-BO', { dateStyle: 'short', timeStyle: 'short' });
const rol = () => getRol();

/** Sube un archivo a Supabase Storage y devuelve la URL pública (se ve igual en todos los equipos). */
async function subirA(file, carpeta, opt) {
    try { toast('Subiendo imagen…', 'info'); const u = await subirArchivo(file, carpeta, opt); toast('Imagen subida'); return u; }
    catch (e) { toast(e.message, 'error'); return null; }
}

/* =================== EMPLEADO · inventario =================== */
function selects() {
    const o = Object.entries(LIGAS).map(([k, v]) => `<option value="${L(k)}">${L(v.n)}</option>`).join('');
    const a = $('prodLiga').value, b = $('adminLiga').value;
    $('prodLiga').innerHTML = o; $('adminLiga').innerHTML = '<option value="todas">Todas las ligas</option>' + o;
    if (LIGAS[a]) $('prodLiga').value = a; if (b === 'todas' || LIGAS[b]) $('adminLiga').value = b;
}
function inventario() {
    const q = $('adminBuscar').value.toLowerCase().trim(), lg = $('adminLiga').value;
    const l = getProductos().filter(p => p.titulo.toLowerCase().includes(q) && (lg === 'todas' || p.liga === lg));
    $('totalInv').textContent = `(${l.length})`;
    $('contenedorAdmin').innerHTML = l.length ? l.map(p => `<div class="col-md-6 col-xxl-4 mb-4 reveal"><div class="glass-card p-3 h-100" data-id="${p.id}">
      <div class="d-flex justify-content-between mb-2"><span class="small fw-bold text-uppercase d-flex gap-2 align-items-center">${iconoLiga(p.liga, 22)} ${L(LIGAS[p.liga]?.n || p.liga)}</span><small class="t-m">${L(p.fechaCreacion || '')}</small></div>
      <div class="p-img js-ver rounded-3 mb-3" role="button" tabindex="0" aria-label="Ver detalle de ${L(p.titulo)}" style="aspect-ratio:4/3">${p.imagenes.length > 1 ? `<span class="p-fotos"><i class="fa-regular fa-images"></i> ${p.imagenes.length}</span>` : ''}<img loading="lazy" decoding="async" data-src="${L(src(p))}" data-fallback="${L(imgFallback(p.titulo))}" alt="${L(p.titulo)}"><div class="p-lupa">Ver detalle</div></div>
      <h6 class="fw-bold text-truncate mb-1">${L(p.titulo)}</h6><p class="t-m small text-truncate mb-2">${L(p.descripcion || 'Sin descripción')}</p>
      <div class="mb-2">${p.tallas.map(t => `<span class="badge-talla">${L(t)}</span>`).join('')}</div>
      <div class="d-flex justify-content-between align-items-center border-top pt-2 mb-3" style="border-color:var(--border)!important"><span class="p-precio">${fmtBs(p.precio)}</span>
        <span class="stock-ctl d-flex align-items-center gap-2"><button type="button" class="js-menos" aria-label="Menos stock">−</button><b class="${p.stock > 5 ? 't-g' : 'text-danger'}">${p.stock}</b><button type="button" class="js-mas" aria-label="Más stock">+</button></span></div>
      <div class="d-flex gap-2"><button type="button" class="btn btn-ghost btn-sm w-100 js-edit"><i class="fa-solid fa-pen"></i> Editar</button><button type="button" class="btn btn-outline-danger btn-sm w-100 js-del"><i class="fa-solid fa-trash"></i> Eliminar</button></div></div></div>`).join('')
      : '<div class="col-12 text-center t-m py-5"><i class="fa-solid fa-box-open fa-3x t-g mb-3"></i><h5>No hay productos. Crea el primero.</h5></div>';
    inicializarLazyLoading($('contenedorAdmin')); observarReveal($('contenedorAdmin'));
}

function pintarGaleria() {
    const n = galeria.length;
    $('galeriaForm').innerHTML = galeria.map((g, i) => `<div class="gal-item ${g.sube ? 'sube' : ''}" data-i="${i}">
      <div class="gal-thumb">${g.url && normalizarImagen(g.url) ? `<img src="${L(normalizarImagen(g.url))}" alt="Foto ${i + 1} del producto">` : (g.sube ? 'Subiendo…' : 'Sin foto')}</div>
      <div><input class="form-control campo js-gurl mb-1" placeholder="Enlace de Dropbox / https" value="${L(g.url)}" aria-label="Enlace de la foto ${i + 1}" autocomplete="off">
        <input class="form-control campo js-gdesc" placeholder="Descripción (ej. Vista frontal)" maxlength="80" value="${L(g.desc)}" aria-label="Descripción de la foto ${i + 1}">${i === 0 ? '<span class="gal-principal">FOTO PRINCIPAL</span>' : ''}</div>
      <div class="gal-acc"><button type="button" class="js-gup" ${i === 0 ? 'disabled' : ''} aria-label="Subir posición"><i class="fa-solid fa-arrow-up"></i></button><button type="button" class="js-gdown" ${i === n - 1 ? 'disabled' : ''} aria-label="Bajar posición"><i class="fa-solid fa-arrow-down"></i></button><button type="button" class="js-gdel" aria-label="Quitar foto"><i class="fa-solid fa-trash"></i></button></div></div>`).join('')
      || '<p class="t-m small mb-0">Aún no hay fotos. Agrega un enlace de Dropbox o sube desde tu equipo.</p>';
    tarjetaVivo();
}
function tarjetaVivo() {
    const t = $('prodTarjeta'); if (!t) return;
    t.setAttribute('titulo', $('prodTitulo').value || 'Nuevo producto'); t.setAttribute('precio', $('prodPrecio').value ? fmtBs($('prodPrecio').value) : '');
    t.setAttribute('stock', $('prodStock').value); t.setAttribute('liga', LIGAS[$('prodLiga').value]?.n || '');
    t.setAttribute('imagen', normalizarImagen(galeria.find(g => g.url)?.url || '') || '');
}
function reset() {
    editId = null; galeria = []; $('formProducto').reset(); limpiarValidacion($('formProducto')); pintarGaleria();
    $('tituloForm').innerHTML = '<i class="fa-solid fa-plus-circle"></i> Nuevo producto'; $('btnGuardar').textContent = 'GUARDAR PRODUCTO'; $('btnCancelar').classList.add('d-none');
}

/* ---------- Ligas / carrusel / estadísticas ---------- */
function ligasAdmin() {
    const prods = getProductos();
    $('listaLigas').innerHTML = Object.entries(LIGAS).map(([k, v]) => `<div class="liga-item" data-k="${L(k)}"><div class="liga-logo">${iconoLiga(k, 40)}</div>
      <div class="flex-grow-1"><b>${L(v.n)}</b><div class="small t-m">${prods.filter(p => p.liga === k).length} productos</div></div>
      <button type="button" class="btn btn-ghost btn-sm js-ledit" aria-label="Editar liga ${L(v.n)}"><i class="fa-solid fa-pen"></i></button><button type="button" class="btn btn-outline-danger btn-sm js-ldel" aria-label="Eliminar liga ${L(v.n)}"><i class="fa-solid fa-trash"></i></button></div>`).join('')
      || '<p class="t-m mb-0">No hay ligas registradas.</p>';
}
function resetLiga() {
    editLiga = null; imgLiga = null; $('formLiga').reset(); limpiarValidacion($('formLiga')); prev($('lPreview'), '');
    $('tituloLiga').textContent = 'Nueva liga'; $('btnLiga').textContent = 'Guardar liga'; $('btnLigaCancel').classList.add('d-none');
}
function estadisticas() {
    const l = getProductos(), uni = l.reduce((a, p) => a + p.stock, 0), val = l.reduce((a, p) => a + p.stock * p.precio, 0);
    animarContador($('sProd'), l.length); animarContador($('sUni'), uni); animarContador($('sVal'), val); animarContador($('sBajo'), l.filter(p => p.stock <= 5).length);
    const max = Math.max(1, ...Object.keys(LIGAS).map(k => l.filter(p => p.liga === k).length));
    $('barrasLigas').innerHTML = Object.entries(LIGAS).map(([k, v]) => { const n = l.filter(p => p.liga === k).length;
      return `<div class="mb-3"><div class="d-flex justify-content-between small mb-1"><span>${iconoLiga(k, 18)} ${L(v.n)}</span><b>${n}</b></div><div class="barra"><i data-w="${n / max * 100}"></i></div></div>`; }).join('');
    setTimeout(() => document.querySelectorAll('#barrasLigas i').forEach(i => i.style.width = i.dataset.w + '%'), 80);
    const bajos = l.filter(p => p.stock <= 5);
    $('listaBajo').innerHTML = bajos.length ? bajos.map(p => `<li class="d-flex justify-content-between py-2 border-bottom" style="border-color:var(--border)!important"><span>${L(p.titulo)}</span><b class="text-danger">${p.stock}</b></li>`).join('') : '<li class="t-m">Todo el stock está saludable.</li>';
}
function carrusel() {
    $('listaCarrusel').innerHTML = getCarrusel().map((c, i) => { const u = normalizarImagen(c.img);
      return `<div class="d-flex gap-3 align-items-center py-2 border-bottom" style="border-color:var(--border)!important">
      <div class="rounded-3 flex-none" style="width:80px;height:50px;background:#04361a ${u ? `center/cover url('${L(u)}')` : ''}"></div>
      <div class="flex-grow-1"><b>${L(c.titulo)}</b><div class="small t-m">${L(c.badge || '')}</div></div><button type="button" class="btn btn-outline-danger btn-sm js-delslide" data-i="${i}" aria-label="Eliminar slide"><i class="fa-solid fa-trash"></i></button></div>`; }).join('');
}

/* =================== PEDIDOS (empleado y admin) =================== */
const ACCIONES = {
    pendiente_pago: p => `<button type="button" class="btn btn-neon btn-sm js-confirmar" title="Confirmar que recibí el pago"><i class="fa-solid fa-check"></i> Confirmar pago</button><button type="button" class="btn btn-outline-danger btn-sm js-cancelar" aria-label="Cancelar pedido"><i class="fa-solid fa-xmark"></i></button>`,
    pagado: () => '<button type="button" class="btn btn-ghost btn-sm js-enviar"><i class="fa-solid fa-truck"></i> Marcar enviado</button>',
    enviado: () => '<button type="button" class="btn btn-ghost btn-sm js-entregar"><i class="fa-solid fa-box-open"></i> Marcar entregado</button>'
};
async function pedidos() {
    const { data, error } = await listarPedidos();
    if (error) { $('pedInfo').textContent = 'No se pudieron leer los pedidos: ' + error.message; return; }
    pedDatos = data || []; pintarPedidos();
}
function pintarPedidos() {
    const f = $('pedFiltro').value, q = $('pedBuscar').value.toLowerCase().trim();
    const l = pedDatos.filter(p => (f === 'todos' || p.estado === f) && (!q || String(p.id) === q.replace('#', '') || (p.cliente_nombre || '').toLowerCase().includes(q) || (p.cliente_email || '').toLowerCase().includes(q)));
    $('pedInfo').textContent = `${l.length} pedido${l.length === 1 ? '' : 's'} · ${pedDatos.filter(p => p.estado === 'pendiente_pago').length} esperando pago`;
    $('tablaPedidos').innerHTML = l.length ? l.map(p => `<tr data-id="${p.id}"><td><b>#${p.id}</b></td><td class="small">${fecha(p.creado)}</td>
      <td>${L(p.cliente_nombre || '—')}<div class="small t-m">${L(p.telefono || '')}</div></td>
      <td class="small">${(p.items || []).map(i => `${i.cant}× ${L(i.titulo)} (${L(i.talla)})`).join('<br>')}${p.notas ? `<div class="t-m mt-1">${L(p.notas)}</div>` : ''}</td>
      <td><b class="t-g">${fmtBs(p.estado === 'pendiente_pago' ? p.monto_unico : p.monto_unico || p.total)}</b>${p.referencia ? `<div class="small t-m">Ref. ${L(p.referencia)}</div>` : ''}${p.confirmado_por ? `<div class="small t-m">${L(p.confirmado_por)}</div>` : ''}</td>
      <td>${etiquetaEstado(p.estado)}${p.comprobante ? `<div><a href="${L(p.comprobante)}" target="_blank" rel="noopener"><img class="comp-mini mt-1" src="${L(p.comprobante)}" alt="Comprobante del pedido ${p.id}"></a></div>` : ''}</td>
      <td><div class="acc-btns">${(ACCIONES[p.estado] || (() => ''))(p)}</div></td></tr>`).join('') : '<tr><td colspan="7" class="t-m text-center py-4">No hay pedidos con ese filtro.</td></tr>';
}
async function cambiarEstado(id, patch, evento, msg) {
    const r = await actualizarPedido(id, patch, evento);
    toast(r.error ? 'No se pudo actualizar: ' + r.error.message : msg, r.error ? 'error' : 'ok'); await pedidos();
}

/* =================== ADMIN · ventas =================== */
const VENDIDO = ['pagado', 'enviado', 'entregado'];
async function ventas() {
    const { data, error } = await listarPedidos();
    if (error) return toast('No se pudieron leer los pedidos: ' + error.message, 'error');
    const dias = +$('ventasRango').value, desde = dias ? Date.now() - dias * 864e5 : 0;
    const l = (data || []).filter(p => new Date(p.creado).getTime() >= desde), vend = l.filter(p => VENDIDO.includes(p.estado));
    const total = vend.reduce((a, p) => a + Number(p.monto_unico || p.total), 0);
    animarContador($('kVentas'), Math.round(total)); animarContador($('kPagados'), vend.length);
    animarContador($('kPend'), l.filter(p => p.estado === 'pendiente_pago').length); animarContador($('kTicket'), vend.length ? Math.round(total / vend.length) : 0);
    const n = Math.min(dias || 14, 30), hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    const col = Array.from({ length: n }, (_, k) => { const d = new Date(hoy - (n - 1 - k) * 864e5), fin = d.getTime() + 864e5;
        return { d, v: vend.filter(p => { const t = new Date(p.pagado_en || p.creado).getTime(); return t >= d.getTime() && t < fin; }).reduce((a, p) => a + Number(p.monto_unico || p.total), 0) }; });
    const mx = Math.max(1, ...col.map(c => c.v));
    $('chartVentas').innerHTML = col.map(c => `<div class="col-d" title="${c.d.toLocaleDateString('es-BO')}: ${fmtBs(c.v)}"><b>${c.v ? Math.round(c.v) : ''}</b><i style="height:${c.v / mx * 85}%"></i><small>${n > 14 ? '' : c.d.getDate() + '/' + (c.d.getMonth() + 1)}</small></div>`).join('');
    const top = {}; vend.forEach(p => (p.items || []).forEach(i => { top[i.titulo] = (top[i.titulo] || 0) + i.cant; }));
    const t = Object.entries(top).sort((a, b) => b[1] - a[1]).slice(0, 6);
    $('topProductos').innerHTML = t.length ? t.map(([n, c], k) => `<li class="d-flex justify-content-between py-2 border-bottom" style="border-color:var(--border)!important"><span>${k + 1}. ${L(n)}</span><b class="t-g">${c} u.</b></li>`).join('') : '<li class="t-m">Aún no hay ventas en este rango.</li>';
}

/* =================== ADMIN · bitácora =================== */
async function bitacora() {
    const { data, error } = await listarBitacora(400);
    if (error) { $('bitInfo').textContent = 'No se pudo leer la bitácora: ' + error.message; return; }
    bitDatos = data || [];
    const sel = $('bitFiltro'), a = sel.value;
    sel.innerHTML = '<option value="">Todas las acciones</option>' + [...new Set(bitDatos.map(e => e.accion))].sort().map(x => `<option value="${L(x)}">${L(x)}</option>`).join(''); sel.value = a;
    pintarBitacora();
}
const filtrarBit = () => { const f = $('bitFiltro').value, q = $('bitBuscar').value.toLowerCase().trim(); return bitDatos.filter(e => (!f || e.accion === f) && (!q || `${e.usuario_email} ${e.detalle}`.toLowerCase().includes(q))); };
function pintarBitacora() {
    const l = filtrarBit(); $('bitInfo').textContent = `${l.length} evento${l.length === 1 ? '' : 's'} (últimos ${bitDatos.length})`;
    $('tablaBitacora').innerHTML = l.map(e => `<tr><td class="small text-nowrap">${fecha(e.creado)}</td><td class="text-break">${L(e.usuario_email || 'anónimo')}</td><td><span class="badge-talla">${L(e.rol || '')}</span></td><td><b>${L(e.accion)}</b></td><td class="small t-m text-break">${L(e.detalle || '')}</td></tr>`).join('') || '<tr><td colspan="5" class="t-m text-center py-4">Sin eventos.</td></tr>';
}

/* =================== ADMIN · usuarios =================== */
async function usuarios() {
    const c = await sb(), tb = $('tablaUsuarios'); if (!c) { $('usuariosInfo').textContent = 'Sin conexión con la base de datos.'; return; }
    const { data, error } = await c.from('perfiles').select('*').order('creado', { ascending: false });
    if (error) { $('usuariosInfo').textContent = 'No se pudo leer la tabla perfiles: ' + error.message; tb.innerHTML = ''; return; }
    const { data: { session } } = await c.auth.getSession(), yo = session?.user.id;
    const ROLES = [['cliente', 'Cliente'], ['empleado', 'Empleado'], ['admin', 'Administrador'], ['sistema', 'Sistema (app de pagos)']];
    $('usuariosInfo').textContent = `${data.length} usuario${data.length === 1 ? '' : 's'}.`;
    tb.innerHTML = data.map(u => `<tr><td>${L(u.nombre || '—')}</td><td class="text-break">${L(u.email || '—')}</td><td>${u.id === yo ? `<span class="badge-talla">${L(u.rol)} (tú)</span>`
      : `<select class="form-select form-select-sm campo js-rol" data-id="${L(u.id)}" data-email="${L(u.email || '')}" aria-label="Rol de ${L(u.nombre || u.email)}">${ROLES.map(([v, n]) => `<option value="${v}" ${u.rol === v ? 'selected' : ''}>${n}</option>`).join('')}</select>`}</td><td class="small t-m">${new Date(u.creado).toLocaleDateString('es-BO')}</td></tr>`).join('');
}

/* =================== ADMIN · marca, pagos, avances, sistema =================== */
function cargarMarca() {
    const { marca, tienda } = getAjustes();
    $('mNombre').value = marca.nombre; $('mLogoUrl').value = marca.logo; prev($('mLogoPrev'), normalizarImagen(marca.logo), 'Logo por defecto');
    $('mBalonUrl').value = marca.balon; prev($('mBalonPrev'), normalizarImagen(marca.balon), 'Balón por defecto');
    $('mAcento').value = /^#[0-9a-f]{6}$/i.test(marca.acento) ? marca.acento : '#00ff66';
    $('tWhatsapp').value = tienda.whatsapp; $('tCiudad').value = tienda.ciudad; $('tHorario').value = tienda.horario;
}
function cargarPagos() {
    const { pago } = getAjustes();
    $('pQrUrl').value = pago.qr; prev($('pQrPrev'), normalizarImagen(pago.qr), 'Aún no hay QR'); $('pTitular').value = pago.titular; $('pBanco').value = pago.banco;
    $('pInstr').value = pago.instrucciones; $('pMinutos').value = pago.minutos; $('pCentavos').checked = !!pago.centavos;
    pagosRecibidos();
}
async function pagosRecibidos() {
    const { data } = await listarPagosRecibidos();
    $('listaPagosRecibidos').innerHTML = (data || []).length ? data.map(p => `<div class="d-flex justify-content-between py-2 border-bottom" style="border-color:var(--border)!important"><span>${fmtBs(p.monto)} <span class="t-m">${L(p.remitente || '')}</span><br><small class="t-m">${fecha(p.creado)}</small></span><span>${p.pedido_id ? `<span class="est est-pagado">Pedido #${p.pedido_id}</span>` : '<span class="est est-pendiente_pago">Sin pedido</span>'}</span></div>`).join('') : '<p class="t-m mb-0">Todavía no llegaron pagos de la app de notificaciones.</p>';
}
function avances() {
    const base = new URL('.', location.href).href.replace(/#.*$/, ''); $('avBase').textContent = base;
    $('gridAvances').innerHTML = AVANCES.map(s => `<div class="av-sem"><h5>Semana ${s.semana}</h5><div class="av-grid">${s.items.map(([c, t, d]) => `<a class="av-card" href="semana${s.semana}/${c}/index.html" target="_blank" rel="noopener"><b>${L(t)}</b><small>${L(d)}</small><br><code>semana${s.semana}/${c}/</code></a>`).join('')}</div></div>`).join('');
}
function sistema() {
    const ok = bdActiva();
    $('estadoBD').innerHTML = ok ? '<i class="fa-solid fa-circle-check t-g"></i> Conectado a Supabase: todo se guarda en la nube y se comparte entre equipos.' : '<i class="fa-solid fa-triangle-exclamation text-warning"></i> Sin conexión con Supabase (revisa internet y las credenciales de js/core/config.js).';
    $('infoBD').textContent = ok ? 'Supabase' : 'sin conexión';
    $('sesNombre').textContent = getUsuario().nombre; $('sesRol').textContent = `${getUsuario().email} · rol: ${rol()}`;
}

/* =================== Vistas =================== */
const CARGAS = { ventas, pedidos, inventario, ligas: ligasAdmin, carrusel, estadisticas, bitacora, usuarios, marca: cargarMarca, pagos: cargarPagos, avances, config: sistema };
function mostrarVista(v) {
    const pant = $('pantalla-admin');
    if (!v || !PERMISOS[v]?.includes(rol())) v = rol() === 'admin' ? 'ventas' : 'inventario';
    vistaActual = v; clearInterval(temporizador); temporizador = null;
    pant.querySelectorAll('.app-view').forEach(x => x.classList.toggle('active', x.id === 'vista-' + v));
    pant.querySelectorAll('[data-vista]').forEach(a => a.classList.toggle('active', a.dataset.vista === v));
    bootstrap.Offcanvas.getInstance($('menuLateral'))?.hide();
    CARGAS[v]?.();
    if (v === 'pedidos') temporizador = setInterval(pedidos, 8000);   // los pagos aparecen solos
    window.scrollTo({ top: 0 });
}
const cambiarVistaAdmin = v => { if (location.hash === '#/admin/' + v) mostrarVista(v); else location.hash = '#/admin/' + v; };
function filtrarMenu() {
    document.querySelectorAll('#sideDesk [data-roles], #sideMov [data-roles]').forEach(a => { a.hidden = !a.dataset.roles.split(' ').includes(rol()); });
    $('panelRol').textContent = rol() === 'admin' ? 'ADMIN' : 'EMPLEADO';
}

export default async function iniciarAdmin() {
    montarMenu('tplMenu', ['sideDesk', 'sideMov']);
    $('pantalla-admin').addEventListener('click', e => { const a = e.target.closest('[data-vista]'); if (a) { e.preventDefault(); cambiarVistaAdmin(a.dataset.vista); } });
    $('formProducto').addEventListener('input', tarjetaVivo);
    $('adminBuscar').oninput = inventario; $('adminLiga').onchange = inventario;

    /* ---- Producto con varias fotos ---- */
    const f = $('formProducto'); validacionEnVivo(f, reglas);
    deleg('#galeriaForm', '.js-gurl', 'input', (e, t) => { galeria[+t.closest('[data-i]').dataset.i].url = t.value; });
    deleg('#galeriaForm', '.js-gurl', 'change', () => pintarGaleria());
    deleg('#galeriaForm', '.js-gdesc', 'input', (e, t) => { galeria[+t.closest('[data-i]').dataset.i].desc = t.value; });
    deleg('#galeriaForm', '.js-gup,.js-gdown,.js-gdel', 'click', (e, t) => {
        const i = +t.closest('[data-i]').dataset.i;
        if (t.classList.contains('js-gdel')) galeria.splice(i, 1);
        else { const j = t.classList.contains('js-gup') ? i - 1 : i + 1; [galeria[i], galeria[j]] = [galeria[j], galeria[i]]; }
        pintarGaleria();
    });
    $('btnAddUrl').onclick = () => { if (galeria.length >= 8) return toast('Máximo 8 fotos por producto', 'warn'); galeria.push({ url: '', desc: '' }); pintarGaleria(); [...document.querySelectorAll('.js-gurl')].pop()?.focus(); };
    $('btnAddFile').onclick = () => $('galArchivos').click();
    $('galArchivos').onchange = async e => {
        for (const file of [...e.target.files]) {
            if (galeria.length >= 8) { toast('Máximo 8 fotos por producto', 'warn'); break; }
            const it = { url: '', desc: '', sube: true }; galeria.push(it); pintarGaleria();
            const u = await subirA(file, 'productos', { max: 1400, q: .85 });
            if (u) { it.url = u; delete it.sube; } else galeria.splice(galeria.indexOf(it), 1);
            pintarGaleria();
        }
        e.target.value = '';
    };
    $('btnCancelar').onclick = reset;
    f.addEventListener('submit', e => {
        e.preventDefault(); if (!validarFormulario(f, reglas, toast)) return;
        const tallas = [...document.querySelectorAll('.talla-check:checked')].map(c => c.value);
        if (!tallas.length) return toast('Selecciona al menos una talla', 'warn');
        if (galeria.some(g => g.sube)) return toast('Espera a que terminen de subir las fotos', 'warn');
        const fotos = galeria.filter(g => g.url.trim()), mala = fotos.find(g => !normalizarImagen(g.url));
        if (mala) return toast('Una de las fotos tiene un enlace no válido (usa https://)', 'error');
        const imagenes = fotos.map(g => ({ url: g.url.trim(), desc: soloTexto(g.desc) }));
        const d = { titulo: $('prodTitulo').value.trim(), precio: +$('prodPrecio').value, stock: +$('prodStock').value, liga: $('prodLiga').value, temporada: $('prodTemporada').value, descripcion: soloTexto($('prodDesc').value), tallas, imagenes, imagen: imagenes[0]?.url || '' };
        const l = getProductos();
        if (editId) { const i = l.findIndex(p => p.id === editId); l[i] = { ...l[i], ...d }; } else l.unshift({ id: Date.now(), ...d, fechaCreacion: new Date().toLocaleDateString('es-BO') });
        if (!setProductos(l)) return toast('No se pudo guardar en este equipo (almacenamiento lleno)', 'error');
        registrarEvento(editId ? 'producto_editado' : 'producto_creado', `${d.titulo} · ${imagenes.length} foto(s)`);
        toast(editId ? 'Producto actualizado' : 'Producto registrado exitosamente'); reset(); inventario();
    });
    deleg('#contenedorAdmin', '.js-del', 'click', async (e, t) => {
        const id = +t.closest('[data-id]').dataset.id, p = getProductos().find(x => x.id === id);
        if (await confirmar('Esta acción no se puede deshacer.', { titulo: 'Eliminar producto', icono: '', ok: 'Eliminar' })) { setProductos(getProductos().filter(x => x.id !== id)); registrarEvento('producto_eliminado', p?.titulo); inventario(); toast('Producto eliminado', 'info'); }
    });
    deleg('#contenedorAdmin', '.js-mas,.js-menos', 'click', (e, t) => {
        const id = +t.closest('[data-id]').dataset.id, l = getProductos(), p = l.find(x => x.id === id);
        p.stock = Math.max(0, p.stock + (t.classList.contains('js-mas') ? 1 : -1)); setProductos(l); registrarEvento('stock_ajustado', `${p.titulo}: ${p.stock}`); inventario();
    });
    deleg('#contenedorAdmin', '.js-edit', 'click', (e, t) => {
        const p = getProductos().find(x => x.id === +t.closest('[data-id]').dataset.id); editId = p.id;
        $('prodTitulo').value = p.titulo; $('prodPrecio').value = p.precio; $('prodStock').value = p.stock; $('prodLiga').value = p.liga; $('prodTemporada').value = p.temporada; $('prodDesc').value = p.descripcion || '';
        galeria = p.imagenes.map(i => ({ ...i })); pintarGaleria();
        document.querySelectorAll('.talla-check').forEach(c => c.checked = p.tallas.includes(c.value));
        $('tituloForm').innerHTML = '<i class="fa-solid fa-pen"></i> Editando producto'; $('btnGuardar').textContent = 'ACTUALIZAR PRODUCTO'; $('btnCancelar').classList.remove('d-none');
        window.scrollTo({ top: 0 }); toast('Modo edición activado', 'info');
    });
    deleg('#contenedorAdmin', '.js-ver', 'click', (e, t) => {
        const p = getProductos().find(x => x.id === +t.closest('[data-id]').dataset.id);
        $('imgAdminGrande').alt = p.titulo; $('imgAdminGrande').src = src(p); $('modalTitulo').textContent = p.titulo; $('modalPrecio').textContent = fmtBs(p.precio); $('modalDesc').textContent = p.descripcion || 'Sin descripción';
        $('modalLiga').innerHTML = iconoLiga(p.liga, 26) + ' ' + L(LIGAS[p.liga]?.n || p.liga); $('modalTallas').innerHTML = p.tallas.map(x => `<span class="badge-talla fs-6">${L(x)}</span>`).join('');
        new bootstrap.Modal($('modalImagenAdmin')).show();
    });

    /* ---- Ligas ---- */
    const fl = $('formLiga'); validacionEnVivo(fl, reglasL);
    activarDropzone($('zonaLiga'), $('lArchivo'), async file => { const u = await subirA(file, 'ligas', { max: 320, tipo: 'image/png' }); if (u) { imgLiga = u; $('lUrl').value = u; prev($('lPreview'), u); } });
    $('lUrl').addEventListener('input', e => { imgLiga = null; prev($('lPreview'), normalizarImagen(e.target.value)); });
    $('btnLigaCancel').onclick = resetLiga;
    fl.addEventListener('submit', e => {
        e.preventDefault(); if (!validarFormulario(fl, reglasL, toast)) return;
        const url = $('lUrl').value.trim(), nombre = $('lNombre').value.trim();
        if (url && !normalizarImagen(url)) return toast('El enlace del logo no es válido', 'error');
        const ligas = { ...getLigas() }, key = editLiga || slug(nombre);
        if (!editLiga && ligas[key]) return toast('Esa liga ya existe', 'warn');
        ligas[key] = { n: nombre, logo: imgLiga || url || (editLiga ? ligas[key].logo : '') };
        if (!setLigas(ligas)) return toast('No se pudo guardar la liga', 'error');
        registrarEvento(editLiga ? 'liga_editada' : 'liga_creada', nombre); toast(editLiga ? 'Liga actualizada' : 'Liga agregada'); resetLiga(); selects(); ligasAdmin();
    });
    deleg('#listaLigas', '.js-ledit', 'click', (e, t) => {
        const k = t.closest('[data-k]').dataset.k; editLiga = k; imgLiga = null;
        $('lNombre').value = LIGAS[k].n; $('lUrl').value = LIGAS[k].logo || ''; prev($('lPreview'), normalizarImagen(LIGAS[k].logo));
        $('tituloLiga').textContent = 'Editando liga'; $('btnLiga').textContent = 'Actualizar liga'; $('btnLigaCancel').classList.remove('d-none');
        window.scrollTo({ top: 0 }); toast('Sube un logo nuevo o deja el actual', 'info');
    });
    deleg('#listaLigas', '.js-ldel', 'click', async (e, t) => {
        const k = t.closest('[data-k]').dataset.k;
        if (getProductos().some(p => p.liga === k)) return toast('Hay productos en esta liga. Cámbialos o elimínalos primero', 'warn');
        if (Object.keys(LIGAS).length <= 1) return toast('Debe quedar al menos una liga', 'warn');
        if (await confirmar(`Se eliminará la liga "${LIGAS[k].n}".`, { titulo: 'Eliminar liga', icono: '', ok: 'Eliminar' })) {
            const n = LIGAS[k].n, ligas = { ...getLigas() }; delete ligas[k]; setLigas(ligas); registrarEvento('liga_eliminada', n); selects(); ligasAdmin(); toast('Liga eliminada', 'info');
        }
    });

    /* ---- Carrusel ---- */
    const fc = $('formCarrusel'); validacionEnVivo(fc, reglasC);
    activarDropzone($('zonaSlide'), $('cArchivo'), async file => { const u = await subirA(file, 'carrusel', { max: 1600, q: .8 }); if (u) { imgSlide = u; $('cUrl').value = u; prev($('cPreview'), u); } });
    $('cUrl').addEventListener('input', e => { imgSlide = null; prev($('cPreview'), normalizarImagen(e.target.value)); });
    fc.addEventListener('submit', e => {
        e.preventDefault(); if (!validarFormulario(fc, reglasC, toast)) return;
        const url = $('cUrl').value.trim(); if (url && !normalizarImagen(url)) return toast('Enlace de imagen no válido', 'error');
        const c = getCarrusel().slice(); c.push({ img: imgSlide || url, titulo: $('cTitulo').value.trim(), badge: $('cBadge').value.trim(), texto: $('cTexto').value.trim() });
        setCarrusel(c); registrarEvento('slide_creado', $('cTitulo').value.trim());
        imgSlide = null; fc.reset(); limpiarValidacion(fc); prev($('cPreview'), ''); carrusel(); toast('Slide agregado al carrusel');
    });
    deleg('#listaCarrusel', '.js-delslide', 'click', (e, t) => { const c = getCarrusel().slice(); if (c.length <= 1) return toast('Debe quedar al menos un slide', 'warn'); const [x] = c.splice(+t.dataset.i, 1); setCarrusel(c); registrarEvento('slide_eliminado', x.titulo); carrusel(); toast('Slide eliminado', 'info'); });

    /* ---- Pedidos ---- */
    $('pedFiltro').onchange = pintarPedidos; $('pedBuscar').oninput = pintarPedidos; $('btnRecargarPedidos').onclick = pedidos;
    const idDe = t => +t.closest('[data-id]').dataset.id;
    deleg('#tablaPedidos', '.js-confirmar', 'click', async (e, t) => {
        const id = idDe(t), p = pedDatos.find(x => x.id === id);
        if (await confirmar(`¿Recibiste el pago de ${fmtBs(p.monto_unico)} del pedido #${id}? Se descontará el stock.`, { titulo: 'Confirmar pago', icono: '', ok: 'Sí, confirmar' }))
            cambiarEstado(id, { estado: 'pagado', pagado_en: new Date().toISOString(), confirmado_por: `manual (${getUsuario().email})` }, 'pago_confirmado_manual', 'Pago confirmado');
    });
    deleg('#tablaPedidos', '.js-enviar', 'click', (e, t) => cambiarEstado(idDe(t), { estado: 'enviado' }, 'pedido_enviado', 'Pedido marcado como enviado'));
    deleg('#tablaPedidos', '.js-entregar', 'click', (e, t) => cambiarEstado(idDe(t), { estado: 'entregado' }, 'pedido_entregado', 'Pedido entregado'));
    deleg('#tablaPedidos', '.js-cancelar', 'click', async (e, t) => { if (await confirmar('Se liberará el monto reservado.', { titulo: 'Cancelar pedido', icono: '', ok: 'Cancelar pedido', cancelar: 'Volver' })) cambiarEstado(idDe(t), { estado: 'cancelado' }, 'pedido_cancelado', 'Pedido cancelado'); });

    /* ---- Ventas / bitácora / usuarios ---- */
    $('ventasRango').onchange = ventas; $('btnRecargarVentas').onclick = ventas;
    $('bitFiltro').onchange = pintarBitacora; $('bitBuscar').oninput = pintarBitacora; $('btnRecargarBit').onclick = bitacora;
    $('btnCsvBit').onclick = () => { descargar('bitacora-elite.csv', csv([['Fecha', 'Usuario', 'Rol', 'Acción', 'Detalle'], ...filtrarBit().map(e => [fecha(e.creado), e.usuario_email, e.rol, e.accion, e.detalle])])); toast('Bitácora exportada'); };
    $('btnRecargarUsuarios').onclick = usuarios;
    deleg('#tablaUsuarios', '.js-rol', 'change', async (e, t) => {
        const c = await sb(); if (!c) return;
        const { error } = await c.from('perfiles').update({ rol: t.value }).eq('id', t.dataset.id);
        if (!error) registrarEvento('rol_cambiado', `${t.dataset.email} → ${t.value}`);
        toast(error ? 'No se pudo cambiar el rol: ' + error.message : 'Rol actualizado', error ? 'error' : 'ok');
    });

    /* ---- Marca y tienda ---- */
    const fm = $('formMarca'); validacionEnVivo(fm, reglasM);
    const subirMarca = (zona, input, urlId, prevId, carpeta, opt) => activarDropzone($(zona), $(input), async file => { const u = await subirA(file, carpeta, opt); if (u) { $(urlId).value = u; prev($(prevId), u); } });
    subirMarca('zonaLogo', 'mLogoArchivo', 'mLogoUrl', 'mLogoPrev', 'marca', { max: 512, tipo: 'image/png' });
    subirMarca('zonaBalon', 'mBalonArchivo', 'mBalonUrl', 'mBalonPrev', 'marca', { max: 256, tipo: 'image/png' });
    $('mLogoUrl').addEventListener('input', e => prev($('mLogoPrev'), normalizarImagen(e.target.value), 'Logo por defecto'));
    $('mBalonUrl').addEventListener('input', e => prev($('mBalonPrev'), normalizarImagen(e.target.value), 'Balón por defecto'));
    $('btnQuitarAcento').onclick = async () => { $('mAcento').value = '#00ff66'; await guardarAjuste('marca', { acento: '' }); toast('Color original restaurado', 'info'); };
    $('mAcento').addEventListener('input', e => { document.documentElement.style.setProperty('--g', e.target.value); });
    fm.addEventListener('submit', async e => {
        e.preventDefault(); if (!validarFormulario(fm, reglasM, toast)) return;
        for (const id of ['mLogoUrl', 'mBalonUrl']) if ($(id).value.trim() && !normalizarImagen($(id).value)) return toast('Un enlace de imagen no es válido', 'error');
        const acento = $('mAcento').value.toLowerCase() === '#00ff66' && !getAjustes().marca.acento ? '' : $('mAcento').value;
        const r1 = await guardarAjuste('marca', { nombre: $('mNombre').value.trim().toUpperCase(), logo: $('mLogoUrl').value.trim(), balon: $('mBalonUrl').value.trim(), acento });
        const r2 = await guardarAjuste('tienda', { whatsapp: $('tWhatsapp').value.trim(), ciudad: $('tCiudad').value.trim(), horario: $('tHorario').value.trim() });
        document.documentElement.style.removeProperty('--g');
        const err = r1.error || r2.error; if (!err) registrarEvento('marca_actualizada', $('mNombre').value);
        toast(err ? 'No se pudo guardar: ' + err.message : 'Marca y tienda actualizadas en todos los equipos', err ? 'error' : 'ok');
    });

    /* ---- Pagos ---- */
    const fp = $('formPagos'); validacionEnVivo(fp, reglasP);
    activarDropzone($('zonaQr'), $('pQrArchivo'), async file => { const u = await subirA(file, 'qr', { max: 900, tipo: 'image/png' }); if (u) { $('pQrUrl').value = u; prev($('pQrPrev'), u); } });
    $('pQrUrl').addEventListener('input', e => prev($('pQrPrev'), normalizarImagen(e.target.value), 'Aún no hay QR'));
    $('btnRecargarPagos').onclick = pagosRecibidos;
    fp.addEventListener('submit', async e => {
        e.preventDefault(); if (!validarFormulario(fp, reglasP, toast)) return;
        if ($('pQrUrl').value.trim() && !normalizarImagen($('pQrUrl').value)) return toast('El enlace del QR no es válido', 'error');
        const r = await guardarAjuste('pago', { qr: $('pQrUrl').value.trim(), titular: soloTexto($('pTitular').value), banco: soloTexto($('pBanco').value), instrucciones: soloTexto($('pInstr').value), minutos: +$('pMinutos').value, centavos: $('pCentavos').checked });
        if (!r.error) registrarEvento('pagos_configurados', 'QR / instrucciones');
        toast(r.error ? 'No se pudo guardar: ' + r.error.message : 'Configuración de pagos guardada', r.error ? 'error' : 'ok');
    });

    /* ---- Sistema ---- */
    $('btnExportar').onclick = () => { descargar('productos-elite.json', JSON.stringify(getProductos(), null, 2)); toast('Inventario exportado'); };
    $('btnExportarPedidos').onclick = async () => {
        const { data } = await listarPedidos();
        descargar('pedidos-elite.csv', csv([['#', 'Fecha', 'Cliente', 'Correo', 'Teléfono', 'Detalle', 'Total', 'Monto pagado', 'Estado'], ...(data || []).map(p => [p.id, fecha(p.creado), p.cliente_nombre, p.cliente_email, p.telefono, (p.items || []).map(i => `${i.cant}x ${i.titulo} (${i.talla})`).join(' | '), p.total, p.monto_unico, p.estado])]));
        registrarEvento('exportacion', 'pedidos CSV'); toast('Pedidos exportados');
    };
    $('btnProbarBD').onclick = async () => { const r = await probarBD(); toast(r.msg, r.ok ? 'ok' : 'error'); sistema(); };
    $('btnReset').onclick = async () => { if (await confirmar('Se borra la copia guardada en ESTE equipo (la base de datos no se toca).', { titulo: 'Limpiar caché', icono: '', ok: 'Limpiar' })) { restablecerDemo(); localStorage.removeItem('eliteAjustes'); localStorage.removeItem('eliteCarrito'); location.reload(); } };

    return {
        mostrarVista,
        async entrar() {
            await cargarTodo(); await cargarAjustes(); filtrarMenu(); selects(); reset(); tarjetaVivo();
            toast(`Panel ${rol() === 'admin' ? 'de administración' : 'de empleado'} listo, ${getUsuario().nombre.split(' ')[0]}`, 'info');
            desuscribir?.(); desuscribir = await suscribirCambios(async () => { await cargarTodo(); await cargarAjustes(); if (['inventario', 'ligas', 'carrusel', 'estadisticas'].includes(vistaActual)) { selects(); CARGAS[vistaActual](); } });
        }
    };
}
