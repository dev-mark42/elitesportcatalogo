// Carrito, pago con QR (con espera en vivo) y "Mis pedidos" del cliente.
import { detalleCarrito, agregarAlCarrito, cambiarCantidad, quitarDelCarrito, vaciarCarrito, contarCarrito, crearPedido, seguirPedido, cancelarPedido, subirComprobante, misPedidos, obtenerPedido } from '../core/pedidos.js';
import { getAjustes, getWhatsapp } from '../core/ajustes.js';
import { fmtBs, imgFallback } from '../core/utils.js';
import { getUsuario, esInvitado } from '../core/auth.js';
import { normalizarImagen } from '../../semana2/03-fetch-lazyloading-dropbox/dropbox.js';
import { limpiarTexto as L } from '../../semana2/05-seguridad-xss-subida-imagen/seguridad-xss.js';
import { toast, confirmar } from '../../semana1/05-alertas-toast/alertas.js';
import { validarFormulario, validacionEnVivo } from '../../semana1/04-validacion-formulario/validaciones.js';
import { configurarDelegacionEventos as deleg } from '../../semana2/01-delegacion-eventos-hidratacion/delegacion-eventos.js';
import { chispas } from '../../semana2/02-carrusel-zoom-animaciones/animaciones.js';

const $ = id => document.getElementById(id);
const ESTADOS = { pendiente_pago: 'Esperando pago', pagado: 'Pagado', enviado: 'Enviado', entregado: 'Entregado', cancelado: 'Cancelado' };
export const etiquetaEstado = e => `<span class="est est-${L(e)}">${L(ESTADOS[e] || e)}</span>`;
const img = p => normalizarImagen(p.imagen) || imgFallback(p.titulo);
const modal = id => bootstrap.Modal.getOrCreateInstance($(id));
const REGLAS = { pgNombre: { req: 1, min: 3, max: 40 }, pgTel: { req: 1, regex: /^[67]\d{7}$/, msg: 'Celular boliviano de 8 dígitos (ej. 71234567)' }, pgNotas: { max: 200 } };

let detener = null, reloj = null, pedidoActivo = null, alPagar = () => {}, desdeCarrito = false;

/* ---------- Carrito ---------- */
export function pintarCarrito() {
    const d = detalleCarrito(), n = contarCarrito();
    document.querySelectorAll('.js-cart-count').forEach(b => { b.textContent = n; b.classList.toggle('d-none', !n); b.classList.add('bump'); setTimeout(() => b.classList.remove('bump'), 400); });
    $('carritoTotal').textContent = fmtBs(d.total);
    $('btnPagarCarrito').disabled = $('btnVaciarCarrito').disabled = !d.lineas.length;
    $('carritoLista').innerHTML = d.lineas.length ? d.lineas.map(l => `<div class="cart-l" data-i="${l.i}">
        <img src="${L(img(l.p))}" alt="${L(l.p.titulo)}" onerror="this.onerror=null;this.src='${L(imgFallback(l.p.titulo))}'">
        <div class="min-w-0"><b class="d-block text-truncate">${L(l.p.titulo)}</b><small class="t-m">Talla ${L(l.talla)} · ${fmtBs(l.p.precio)}</small>
          <div class="qty"><button type="button" class="js-menos" aria-label="Menos">−</button><b>${l.cant}</b><button type="button" class="js-mas" aria-label="Más">+</button></div></div>
        <div class="text-end"><b class="t-g d-block">${fmtBs(l.sub)}</b><button type="button" class="btn btn-sm btn-outline-danger mt-1 js-quitar" aria-label="Quitar"><i class="fa-solid fa-trash"></i></button></div></div>`).join('')
        : '<div class="cart-vacio"><i class="fa-solid fa-cart-shopping fa-3x t-g mb-3"></i><p>Tu carrito está vacío</p></div>';
}

export function agregar(p, talla) {
    const r = agregarAlCarrito(p.id, talla, 1);
    toast(r.ok ? `${p.titulo} (${talla}) agregado al carrito` : r.msg, r.ok ? 'ok' : 'warn');
    return r.ok;
}

/* ---------- Pago ---------- */
function cuerpo(html) { $('pgCuerpo').innerHTML = html; }
function parar() { detener?.(); detener = null; clearInterval(reloj); reloj = null; }

export async function iniciarPago(detalle, { carrito = false } = {}) {
    if (!detalle.lineas.length) return toast('Tu carrito está vacío', 'warn');
    if (detalle.lineas.some(l => l.cant > l.p.stock)) return toast('Algún producto ya no tiene stock suficiente. Revisa tu carrito.', 'warn');
    bootstrap.Offcanvas.getInstance($('panelCarrito'))?.hide();
    desdeCarrito = carrito; parar();
    $('pgTitulo').textContent = 'Datos del pedido';
    cuerpo(`<form id="formPago" data-total="${detalle.total}" novalidate>
      <div class="mb-3">${detalle.lineas.map(l => `<div class="d-flex justify-content-between small py-1"><span>${l.cant} × ${L(l.p.titulo)} (${L(l.talla)})</span><b>${fmtBs(l.sub)}</b></div>`).join('')}
        <div class="d-flex justify-content-between fs-5 border-top pt-2 mt-2" style="border-color:var(--border)!important"><span>Total</span><b class="t-g">${fmtBs(detalle.total)}</b></div></div>
      <div class="mb-3"><label class="form-label" for="pgNombre">Tu nombre</label><input id="pgNombre" class="form-control campo" value="${L(getUsuario().nombre)}" autocomplete="name"></div>
      <div class="mb-3"><label class="form-label" for="pgTel">Celular de contacto</label><input id="pgTel" class="form-control campo" inputmode="numeric" maxlength="8" placeholder="71234567" autocomplete="tel"></div>
      <div class="mb-3"><label class="form-label" for="pgEntrega">Tipo de entrega</label><select id="pgEntrega" class="form-select campo"><option value="local">Recojo en tienda / entrega en La Paz</option><option value="departamento">Envío a otro departamento</option></select></div>
      <div class="mb-3" id="pgDepartamentoWrap" hidden><label class="form-label" for="pgDepartamento">Departamento de destino</label><select id="pgDepartamento" class="form-select campo"><option value="">Selecciona</option><option>Santa Cruz</option><option>Cochabamba</option><option>Oruro</option><option>Potosí</option><option>Tarija</option><option>Chuquisaca</option><option>Beni</option><option>Pando</option></select></div>
      <div class="mb-3"><label class="form-label" for="pgMetodo">Método de pago</label><select id="pgMetodo" class="form-select campo"><option value="qr">QR / transferencia bancaria</option><option value="tarjeta">Tarjeta (coordinar confirmación)</option><option value="mixto">Mixto: QR + efectivo</option><option value="efectivo">Efectivo al recoger</option></select><small class="t-m" id="pgMetodoAyuda">El pago se verifica antes de confirmar tu pedido.</small><div id="pgMixtoWrap" class="mt-2" hidden><label class="form-label" for="pgMontoQr">Monto que pagarás por QR (Bs)</label><input id="pgMontoQr" class="form-control campo" type="number" min="0.01" step="0.01" inputmode="decimal"><small id="pgSaldoMixto" class="t-m"></small></div></div>
      <div class="mb-3"><label class="form-label" for="pgNotas">Dirección o notas de entrega</label><textarea id="pgNotas" class="form-control campo" rows="2" maxlength="200"></textarea></div>
      <button type="submit" class="btn btn-neon w-100 py-3"><i class="fa-solid fa-bag-shopping me-2"></i>CONFIRMAR COMPRA</button></form>`);
    const f = $('formPago'); validacionEnVivo(f, REGLAS);
    f.addEventListener('submit', async e => {
        e.preventDefault(); if (!validarFormulario(f, REGLAS, toast)) return;
        const b = f.querySelector('button[type=submit]'); b.disabled = true; b.textContent = 'Creando pedido…';
        const entregaTipo = $('pgEntrega').value, metodo = $('pgMetodo').value;
        const departamento = $('pgDepartamento')?.value || '';
        const montoQrManual = Number($('pgMontoQr')?.value || 0);
        if (metodo === 'mixto' && !(montoQrManual > 0 && montoQrManual < detalle.total)) { b.disabled = false; return toast('Indica un monto QR mayor a 0 y menor al total.', 'warn'); }
        if (entregaTipo === 'departamento' && !departamento) { b.disabled = false; return toast('Selecciona el departamento de envío.', 'warn'); }
        if (entregaTipo === 'departamento' && ['efectivo','mixto'].includes(metodo)) { b.disabled = false; return toast('El envío fuera de La Paz requiere QR, transferencia o tarjeta.', 'warn'); }
        const r = await crearPedido({ lineas: detalle.lineas, total: detalle.total, nombre: $('pgNombre').value.trim(), telefono: $('pgTel').value.trim(), notas: $('pgNotas').value.trim(), metodo, entregaTipo, departamento, montoQrManual });
        if (!r.ok) { b.disabled = false; b.textContent = 'CONFIRMAR COMPRA'; return toast(r.msg, 'error'); }
        if (['qr','mixto'].includes(metodo)) esperarPago(r.pedido);
        else if (metodo === 'tarjeta') { pedidoActivo = r.pedido; mostrarPendienteTarjeta(r.pedido); }
        else { pedidoActivo = r.pedido; mostrarEfectivo(r.pedido); }
    });
    $('pgEntrega').addEventListener('change', actualizarOpcionesPago);
    $('pgMetodo').addEventListener('change', actualizarOpcionesPago);
    $('pgMontoQr')?.addEventListener('input', actualizarSaldoMixto);
    actualizarOpcionesPago();
    modal('modalPago').show();
}

function actualizarOpcionesPago() {
    const envio = $('pgEntrega')?.value === 'departamento';
    $('pgDepartamentoWrap').hidden = !envio;
    const efectivo = $('pgMetodo').querySelector('option[value="efectivo"]');
    const mixto = $('pgMetodo').querySelector('option[value="mixto"]');
    efectivo.disabled = mixto.disabled = envio;
    if (envio && ['efectivo','mixto'].includes($('pgMetodo').value)) $('pgMetodo').value = 'qr';
    $('pgMixtoWrap').hidden = $('pgMetodo').value !== 'mixto';
    actualizarSaldoMixto();
    $('pgMetodoAyuda').textContent = envio ? 'Para envíos interdepartamentales solo se acepta QR, transferencia o tarjeta.' : 'El pago se verifica antes de confirmar tu pedido.';
}
function actualizarSaldoMixto() {
    const campo = $('pgMontoQr'), saldo = $('pgSaldoMixto');
    if (!campo || !saldo) return;
    const total = Number($('formPago')?.dataset.total || 0), qr = Number(campo.value || 0);
    saldo.textContent = qr > 0 && qr < total ? `Saldo en efectivo: Bs ${(total - qr).toFixed(2)}` : `El monto QR debe ser mayor a 0 y menor que Bs ${total.toFixed(2)}.`;
}
function mostrarPendienteTarjeta(p) {
    $('pgTitulo').textContent = `Compra #${p.id}`;
    cuerpo(`<div class="text-center py-3"><i class="fa-regular fa-credit-card fa-3x t-g mb-3"></i><h4>Solicitud registrada</h4><p class="t-m">La opción tarjeta requiere coordinación con el negocio; no se ha realizado ningún cobro automático.</p><p><b>${fmtBs(p.total)}</b></p><a class="btn btn-neon w-100" target="_blank" rel="noopener" href="https://wa.me/${getWhatsapp()}?text=${encodeURIComponent(`Hola, quiero coordinar el pago con tarjeta de mi compra #${p.id} por ${fmtBs(p.total)}.`)}">Coordinar por WhatsApp</a><button class="btn btn-ghost w-100 mt-2" id="pgListo">Cerrar</button></div>`);
}
function mostrarEfectivo(p) {
    $('pgTitulo').textContent = `Compra #${p.id}`;
    cuerpo(`<div class="text-center py-3"><i class="fa-solid fa-store fa-3x t-g mb-3"></i><h4>Pedido reservado</h4><p class="t-m">Paga en efectivo al recoger tu compra en La Paz. El administrador confirmará el cobro.</p><p><b>${fmtBs(p.total)}</b></p><button class="btn btn-neon w-100" id="pgListo">Entendido</button></div>`);
}

export function esperarPago(pedido) {
    parar(); pedidoActivo = pedido;
    const { pago } = getAjustes(), qr = normalizarImagen(pago.qr), fin = new Date(pedido.creado).getTime() + (Number(pago.minutos) || 30) * 60000;
    $('pgTitulo').textContent = `Pedido #${pedido.id}`;
    cuerpo(`<div class="text-center mb-3"><small class="t-m d-block">Paga exactamente</small><div class="pg-monto" id="pgMonto">${fmtBs(pedido.monto_unico)}</div>
        <button type="button" class="btn btn-ghost btn-sm mt-2" id="pgCopiar"><i class="fa-regular fa-copy me-1"></i>Copiar monto</button></div>
      ${qr ? `<img class="pg-qr mb-3" src="${L(qr)}" alt="Código QR para pagar el pedido ${pedido.id}">` : '<div class="alert alert-warning small">El negocio aún no configuró su QR. Escríbenos por WhatsApp para pagar.</div>'}
      <p class="small text-center t-m mb-2">${pago.titular ? `<b>${L(pago.titular)}</b>${pago.banco ? ' · ' + L(pago.banco) : ''}<br>` : ''}${L(pago.instrucciones)}</p>
      <p class="small text-center mb-3 text-warning"><i class="fa-solid fa-circle-info me-1"></i>El comprobante será revisado por el administrador. No se confirma solo con la captura.</p>
      <div class="pg-estado mb-3" id="pgEstado" role="status" aria-live="polite"><span class="pg-spin"></span><span>Esperando tu pago… <b id="pgReloj"></b></span></div>
      <div class="mb-3"><label class="form-label" for="pgRef">¿Ya pagaste y no se confirma? Sube tu comprobante</label>
        <input id="pgRef" class="form-control campo mb-2" placeholder="N.º de transacción (opcional)" maxlength="40"><input type="file" id="pgComp" accept="image/*" class="form-control campo"></div>
      <div class="d-grid gap-2"><a class="btn btn-ghost" target="_blank" rel="noopener" href="https://wa.me/${getWhatsapp()}?text=${encodeURIComponent(`Hola, hice el pedido #${pedido.id} por Bs ${pedido.monto_unico}.`)}"><i class="fa-brands fa-whatsapp me-2"></i>Escribir por WhatsApp</a>
        <button type="button" class="btn btn-outline-danger" id="pgCancelar">Cancelar pedido</button></div>`);
    const tic = () => { const s = Math.max(0, Math.round((fin - Date.now()) / 1000)); const r = $('pgReloj'); if (r) r.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; if (s <= 0) expirar(); };
    const expirar = async () => { parar(); await cancelarPedido(pedido.id); cuerpoFinal('x', 'Tiempo agotado', 'El pedido venció sin recibir el pago. Puedes generar uno nuevo.'); };
    reloj = setInterval(tic, 1000); tic();
    seguirPedido(pedido.id, p => {
        if (p.estado === 'pagado') pagado(p); else if (p.estado === 'pago_parcial') { clearInterval(reloj); reloj = null; const estado = $('pgEstado'); if (estado) estado.innerHTML = `<i class="fa-solid fa-circle-check t-g"></i><span>QR confirmado. Falta pagar ${fmtBs(p.monto_efectivo)} en efectivo al recoger.</span>`; } else if (p.estado === 'cancelado') { parar(); cuerpoFinal('x', 'Pedido cancelado', 'Este pedido fue cancelado.'); }
    }).then(d => { detener = d; });
    modal('modalPago').show();
}

function cuerpoFinal(tipo, titulo, texto) {
    pedidoActivo = null;
    $('pgTitulo').textContent = titulo;
    cuerpo(`<div class="pg-ok py-3"><div class="check" style="${tipo === 'x' ? 'background:#ef233c;color:#fff' : ''}"><i class="fa-solid ${tipo === 'x' ? 'fa-xmark' : 'fa-check'}"></i></div><h4 class="display-font">${L(titulo)}</h4><p class="t-m">${L(texto)}</p><button type="button" class="btn btn-neon w-100" id="pgListo">Listo</button></div>`);
}
function pagado(p) {
    parar();
    if (desdeCarrito) vaciarCarrito();
    cuerpoFinal('ok', '¡Pago confirmado!', `Tu pedido #${p.id} por ${fmtBs(p.total)} fue verificado. Ya puedes consultar el recibo en Mis compras.`);
    const wa = `https://wa.me/${getWhatsapp()}?text=${encodeURIComponent(`Hola, comparto el recibo de mi compra #${p.id}. Total: ${fmtBs(p.total)}. Estado: ${p.estado}.`)}`;
    $('pgCuerpo').insertAdjacentHTML('beforeend', `<a class="btn btn-ghost w-100 mt-2" target="_blank" rel="noopener" href="${wa}"><i class="fa-brands fa-whatsapp me-2"></i>Enviar recibo por WhatsApp</a>`);
    chispas(innerWidth / 2, innerHeight / 3, 30); toast('¡Pago confirmado! Gracias por tu compra', 'ok');
    alPagar();
}

/* ---------- Mis pedidos ---------- */
export async function abrirMisPedidos() {
    $('misPedidosLista').innerHTML = '<p class="t-m text-center py-4">Cargando…</p>'; modal('modalPedidos').show();
    const l = await misPedidos();
    $('misPedidosLista').innerHTML = l.length ? l.map(p => `<div class="ped-card" data-id="${p.id}"><div class="d-flex justify-content-between align-items-center mb-1"><b>Pedido #${p.id}</b>${etiquetaEstado(p.estado)}</div>
      <small class="t-m d-block mb-2">${new Date(p.creado).toLocaleString('es-BO')}</small>
      <div class="small mb-2">${(p.items || []).map(i => `${i.cant} × ${L(i.titulo)} (${L(i.talla)})`).join('<br>')}</div>
      <div class="d-flex justify-content-between align-items-center gap-2"><b class="t-g">${fmtBs(p.estado === 'pendiente_pago' && p.metodo === 'qr' ? p.monto_unico : p.total)}</b>
      <div class="d-flex gap-1">${p.estado === 'pendiente_pago' && p.metodo === 'qr' ? '<button type="button" class="btn btn-neon btn-sm js-continuar">Continuar</button>' : ''}<button type="button" class="btn btn-ghost btn-sm js-recibo">Recibo</button></div></div></div>`).join('')
      : '<p class="t-m text-center py-4">Todavía no tienes pedidos.</p>';
}

export function iniciarCompras({ alPagarCb } = {}) {
    alPagar = alPagarCb || (() => {});
    document.addEventListener('carrito:cambio', pintarCarrito); pintarCarrito();
    deleg('#carritoLista', '.js-mas,.js-menos,.js-quitar', 'click', (e, t) => {
        const i = +t.closest('[data-i]').dataset.i;
        if (t.classList.contains('js-quitar')) quitarDelCarrito(i);
        else { const r = cambiarCantidad(i, t.classList.contains('js-mas') ? 1 : -1); if (r.msg) toast(r.msg, 'warn'); }
    });
    $('btnVaciarCarrito').onclick = async () => { if (await confirmar('Se quitarán todos los productos del carrito.', { titulo: 'Vaciar carrito', icono: '', ok: 'Vaciar' })) vaciarCarrito(); };
    $('btnPagarCarrito').onclick = () => iniciarPago(detalleCarrito(), { carrito: true });
    $('btnMisPedidos').onclick = () => { bootstrap.Modal.getInstance($('modalPerfil'))?.hide(); abrirMisPedidos(); };
    deleg('#misPedidosLista', '.js-recibo', 'click', async (e, t) => {
        const p = await obtenerPedido(+t.closest('[data-id]').dataset.id);
        if (!p) return toast('No se pudo cargar el recibo.', 'error');
        const mensaje = `RECIBO ELITE SPORT\nPedido #${p.id}\nFecha: ${new Date(p.creado).toLocaleString('es-BO')}\nTotal: ${fmtBs(p.total)}\nEstado: ${p.estado}\n${(p.items||[]).map(x=>`${x.cant} x ${x.titulo} (${x.talla})`).join('\n')}`;
        const url = `https://wa.me/${getWhatsapp()}?text=${encodeURIComponent(mensaje)}`;
        bootstrap.Modal.getInstance($('modalPedidos'))?.hide();
        $('pgTitulo').textContent = `Recibo · Compra #${p.id}`;
        cuerpo(`<article class="receipt"><div class="text-center mb-3"><img src="assets/img/logo-128.png" width="54" height="54" alt="Elite Sport"><h3 class="display-font mt-2">ELITE SPORT</h3><p class="t-m small">Comprobante de compra</p></div><div class="d-flex justify-content-between"><b>Pedido #${p.id}</b>${etiquetaEstado(p.estado)}</div><p class="small t-m">${new Date(p.creado).toLocaleString('es-BO')}</p><hr><div>${(p.items||[]).map(x=>`<div class="d-flex justify-content-between gap-2 py-2 border-bottom"><span>${x.cant} × ${L(x.titulo)} · ${L(x.talla)}</span><b>${fmtBs(Number(x.precio)*Number(x.cant))}</b></div>`).join('')}</div><div class="d-flex justify-content-between fs-5 mt-3"><b>Total</b><b class="t-g">${fmtBs(p.total)}</b></div><p class="small t-m mt-3">Método: ${L(p.metodo)} · Entrega: ${L(p.entrega_tipo)}${p.departamento ? ' · '+L(p.departamento) : ''}</p><a class="btn btn-neon w-100 mt-2" target="_blank" rel="noopener" href="${url}"><i class="fa-brands fa-whatsapp me-2"></i>Compartir recibo por WhatsApp</a><button class="btn btn-ghost w-100 mt-2" type="button" onclick="window.print()">Imprimir / Guardar PDF</button></article>`);
        modal('modalPago').show();
    });
    deleg('#misPedidosLista', '.js-continuar', 'click', async (e, t) => {
        const p = await obtenerPedido(+t.closest('[data-id]').dataset.id);
        if (!p || p.estado !== 'pendiente_pago') return toast('Este pedido ya no está pendiente', 'info');
        bootstrap.Modal.getInstance($('modalPedidos'))?.hide(); desdeCarrito = false; esperarPago(p);
    });
    // cuerpo del modal de pago (delegación: los botones se crean según la etapa)
    $('modalPago').addEventListener('click', async e => {
        if (e.target.closest('#pgListo')) { parar(); modal('modalPago').hide(); }
        if (e.target.closest('#pgCopiar')) { try { await navigator.clipboard.writeText(String(pedidoActivo.monto_unico)); toast('Monto copiado'); } catch { toast('Copia el monto a mano: ' + pedidoActivo.monto_unico, 'info'); } }
        if (e.target.closest('#pgCancelar')) {
            if (await confirmar('Se liberará el monto reservado.', { titulo: 'Cancelar pedido', icono: '', ok: 'Cancelar pedido', cancelar: 'Volver' })) { parar(); await cancelarPedido(pedidoActivo.id); modal('modalPago').hide(); toast('Pedido cancelado', 'info'); }
        }
    });
    $('modalPago').addEventListener('change', async e => {
        if (e.target.id !== 'pgComp' || !e.target.files[0]) return;
        try { toast('Subiendo comprobante…', 'info'); await subirComprobante(pedidoActivo.id, e.target.files[0], $('pgRef').value.trim()); $('pgEstado').innerHTML = '<i class="fa-solid fa-hourglass-half t-g"></i><span>Comprobante enviado. Un empleado lo verificará en breve.</span>'; toast('Comprobante enviado'); }
        catch (err) { toast(err.message, 'error'); }
    });
    $('pgCerrar').onclick = () => { parar(); modal('modalPago').hide(); if (pedidoActivo) toast('Tu pedido sigue pendiente. Puedes continuar desde «Mis pedidos».', 'info'); };
}
