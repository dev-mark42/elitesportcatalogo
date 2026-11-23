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
const ESTADOS = { pendiente_pago: 'Esperando pago', pago_parcial: 'QR pagado · saldo en efectivo', coordinacion: 'Coordinar por WhatsApp', pagado: 'Pagado', enviado: 'Enviado', entregado: 'Entregado', cancelado: 'Cancelado' };
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
    if (detalle.lineas.some(l => !Number.isInteger(l.cant) || l.cant < 1 || l.cant > l.p.stock)) return toast('Algún producto ya no tiene stock suficiente. Revisa tu carrito.', 'warn');
    if (esInvitado()) {
        if (await confirmar('Para comprar o coordinar un pedido necesitas iniciar sesión. Puedes seguir explorando el catálogo como invitado.', { titulo: 'Inicia sesión', icono: '', ok: 'Ir al ingreso', cancelar: 'Seguir viendo' })) window.logout();
        return;
    }
    if (!navigator.onLine) return toast('Estás sin internet. Puedes seguir viendo el catálogo, pero no crear pedidos ni pagar hasta recuperar la conexión.', 'warn');
    bootstrap.Offcanvas.getInstance($('panelCarrito'))?.hide();
    desdeCarrito = carrito; parar();
    $('pgTitulo').textContent = 'Tu pedido';
    cuerpo(`<form id="formPago" novalidate>
      <div class="mb-3">${detalle.lineas.map(l => `<div class="d-flex justify-content-between small py-1"><span>${l.cant} × ${L(l.p.titulo)} (${L(l.talla)})</span><b>${fmtBs(l.sub)}</b></div>`).join('')}
        <div class="d-flex justify-content-between fs-5 border-top pt-2 mt-2" style="border-color:var(--border)!important"><span>Total</span><b class="t-g">${fmtBs(detalle.total)}</b></div></div>
      <div class="mb-3"><label class="form-label" for="pgNombre">Tu nombre</label><input id="pgNombre" class="form-control campo" value="${L(getUsuario().nombre)}" autocomplete="name" maxlength="40" required></div>
      <div class="mb-3"><label class="form-label" for="pgTel">Celular de contacto</label><input id="pgTel" class="form-control campo" inputmode="numeric" maxlength="8" placeholder="Tu celular" autocomplete="tel" required></div>
      <div class="mb-3"><label class="form-label" for="pgEntrega">Entrega</label><select id="pgEntrega" class="form-select campo"><option value="local">Entrega / recojo local</option><option value="departamento">Envío a otro departamento</option></select></div>
      <div class="mb-3" id="pgDeptWrap" hidden><label class="form-label" for="pgDept">Departamento de destino</label><select id="pgDept" class="form-select campo"><option value="">Selecciona el departamento</option><option>La Paz</option><option>Santa Cruz</option><option>Cochabamba</option><option>Oruro</option><option>Potosí</option><option>Chuquisaca</option><option>Tarija</option><option>Beni</option><option>Pando</option></select></div>
      <div class="mb-3"><label class="form-label" for="pgNotas">Dirección o notas (opcional)</label><textarea id="pgNotas" class="form-control campo" rows="2" maxlength="200"></textarea></div>
      <fieldset class="mb-3"><legend class="form-label">Cómo deseas pagar o coordinar</legend>
        <label class="d-flex gap-2 align-items-start p-2 rounded border mb-2"><input type="radio" name="pgMetodo" value="qr" checked><span><b>Pago completo por QR</b><small class="d-block t-m">La confirmación se valida contra el pago recibido o por revisión del comprobante</small></span></label>
        <label class="d-flex gap-2 align-items-start p-2 rounded border mb-2" id="pgCashOpt"><input type="radio" name="pgMetodo" value="efectivo"><span><b>Efectivo</b><small class="d-block t-m">Disponible únicamente para entrega local</small></span></label>
        <label class="d-flex gap-2 align-items-start p-2 rounded border mb-2" id="pgMixedOpt"><input type="radio" name="pgMetodo" value="mixto"><span><b>Pago mixto</b><small class="d-block t-m">Una parte por QR y el saldo en efectivo (entrega local)</small></span></label>
        <label class="d-flex gap-2 align-items-start p-2 rounded border"><input type="radio" name="pgMetodo" value="whatsapp"><span><b>Coordinar por WhatsApp</b><small class="d-block t-m">Confirma disponibilidad, entrega y forma de pago con el equipo</small></span></label>
      </fieldset>
      <div class="row g-2 mb-3" id="pgMixtoWrap" hidden><div class="col-6"><label class="form-label" for="pgMontoQr">Parte QR (Bs)</label><input id="pgMontoQr" class="form-control campo" type="number" min="1" step="0.01" value="${Math.max(1, Math.floor(detalle.total/2))}"></div><div class="col-6"><label class="form-label" for="pgMontoCash">Parte efectivo (Bs)</label><input id="pgMontoCash" class="form-control campo" type="number" readonly value="${(detalle.total-Math.max(1,Math.floor(detalle.total/2))).toFixed(2)}"></div></div>
      <p class="small t-m" id="pgAvisoOffline" role="status">Necesitas conexión para registrar el pedido y confirmar cualquier pago. El catálogo sí funciona sin internet.</p>
      <button type="submit" class="btn btn-neon w-100 py-3" id="pgCrear"><i class="fa-solid fa-shield-halved me-2"></i>CONTINUAR</button>
    </form>`);
    const f = $('formPago'); validacionEnVivo(f, REGLAS);
    const metodo = () => f.querySelector('input[name="pgMetodo"]:checked')?.value || 'qr';
    const actualizar = () => {
        const envio = $('pgEntrega').value === 'departamento';
        $('pgDeptWrap').hidden = !envio;
        $('pgCashOpt').hidden = envio; $('pgMixedOpt').hidden = envio;
        if (envio && ['efectivo','mixto'].includes(metodo())) f.querySelector('input[name="pgMetodo"][value="qr"]').checked = true;
        $('pgMixtoWrap').hidden = metodo() !== 'mixto';
        $('pgDept').required = envio;
        $('pgAvisoOffline').textContent = envio ? 'Para envíos a otro departamento solo se acepta QR completo o coordinación por WhatsApp.' : 'Sin internet puedes consultar el catálogo, pero no registrar pedidos ni confirmar pagos.';
    };
    f.addEventListener('change', e => {
        if (e.target.name === 'pgMetodo' || e.target.id === 'pgEntrega') actualizar();
    });
    $('pgMontoQr').addEventListener('input', () => {
        const q = Number($('pgMontoQr').value);
        $('pgMontoCash').value = Number.isFinite(q) ? Math.max(0, detalle.total-q).toFixed(2) : '';
    });
    f.addEventListener('submit', async e => {
        e.preventDefault();
        if (!navigator.onLine) return toast('Sin internet: no se ha creado ningún pedido ni se ha realizado ningún pago.', 'warn');
        if (!validarFormulario(f, REGLAS, toast)) return;
        const m = metodo(), entrega = $('pgEntrega').value, depto = $('pgDept').value;
        const qr = Number($('pgMontoQr').value), cash = Number($('pgMontoCash').value);
        if (entrega === 'departamento' && !depto) return toast('Selecciona el departamento de destino.', 'warn');
        if (m === 'mixto' && (!Number.isFinite(qr) || !Number.isFinite(cash) || qr <= 0 || qr >= detalle.total || cash <= 0 || Math.round((qr+cash)*100) !== Math.round(detalle.total*100))) return toast('La suma de QR y efectivo debe ser exactamente el total.', 'warn');
        const b = $('pgCrear'); b.disabled = true; b.textContent = 'Registrando pedido…';
        const r = await crearPedido({
            lineas: detalle.lineas, total: detalle.total, nombre: $('pgNombre').value.trim(),
            telefono: $('pgTel').value.trim(), notas: $('pgNotas').value.trim(),
            metodo: m, entrega, departamento: depto, montoQr: m === 'mixto' ? qr : detalle.total,
            montoEfectivo: m === 'mixto' ? cash : (m === 'efectivo' ? detalle.total : 0)
        });
        if (!r.ok) { b.disabled = false; b.textContent = 'CONTINUAR'; return toast(r.msg, 'error'); }
        if (desdeCarrito) { vaciarCarrito(); desdeCarrito = false; }
        if (r.coordinacion) {
            const resumen = detalle.lineas.map(l => `${l.cant} x ${l.p.titulo} talla ${l.talla}`).join('\n');
            const mensaje = encodeURIComponent(`Hola, deseo coordinar el pedido #${r.pedido.id} de Elite Sport.\n${resumen}\nTotal: Bs ${detalle.total.toFixed(2)}\nEntrega: ${entrega}${depto ? ' · '+depto : ''}`);
            cuerpo(`<div class="text-center py-3"><h4>Pedido registrado para coordinación</h4><p class="t-m">No se ha cobrado nada. Envía el resumen por WhatsApp para confirmar disponibilidad y entrega.</p><a class="btn btn-success w-100" target="_blank" rel="noopener noreferrer" href="https://wa.me/${getWhatsapp()}?text=${mensaje}"><i class="fa-brands fa-whatsapp me-2"></i>Continuar por WhatsApp</a><button type="button" class="btn btn-ghost w-100 mt-2" id="pgListo">Cerrar</button></div>`);
            pedidoActivo = r.pedido; return;
        }
        if (m === 'efectivo') {
            cuerpo(`<div class="text-center py-3"><h4>Pedido #${r.pedido.id} registrado</h4><p class="t-m">Pago en efectivo pendiente de cobro al momento de la entrega local. No se ha realizado ningún cobro en línea.</p><button type="button" class="btn btn-neon w-100" id="pgListo">Entendido</button></div>`);
            pedidoActivo = r.pedido; return;
        }
        esperarPago(r.pedido);
    });
    actualizar();
    modal('modalPago').show();
}

export function esperarPago(pedido) {
    parar(); pedidoActivo = pedido;
    const { pago } = getAjustes(), qr = normalizarImagen(pago.qr), fin = pedido.vence_en ? new Date(pedido.vence_en).getTime() : new Date(pedido.creado).getTime() + (Number(pago.minutos) || 30) * 60000;
    $('pgTitulo').textContent = `Pedido #${pedido.id}`;
    cuerpo(`<div class="text-center mb-3"><small class="t-m d-block">Paga exactamente por QR</small><div class="pg-monto" id="pgMonto">${fmtBs(pedido.monto_unico)}</div>${Number(pedido.monto_efectivo)>0 ? `<p class="small t-m">Saldo en efectivo al entregar: ${fmtBs(pedido.monto_efectivo)}</p>` : ''}
        <button type="button" class="btn btn-ghost btn-sm mt-2" id="pgCopiar"><i class="fa-regular fa-copy me-1"></i>Copiar monto</button></div>
      ${qr ? `<img class="pg-qr mb-3" src="${L(qr)}" alt="Código QR para pagar el pedido ${pedido.id}">` : '<div class="alert alert-warning small">El negocio aún no configuró su QR. Escríbenos por WhatsApp para pagar.</div>'}
      <p class="small text-center t-m mb-2">${pago.titular ? `<b>${L(pago.titular)}</b>${pago.banco ? ' · ' + L(pago.banco) : ''}<br>` : ''}${L(pago.instrucciones)}</p>
      <p class="small text-center mb-3 text-warning"><i class="fa-solid fa-circle-info me-1"></i>El monto incluye centavos únicos para identificar tu pago automáticamente.</p>
      <div class="pg-estado mb-3" id="pgEstado" role="status" aria-live="polite"><span class="pg-spin"></span><span>Esperando tu pago… <b id="pgReloj"></b></span></div>
      <div class="mb-3"><label class="form-label" for="pgRef">¿Ya pagaste y no se confirma? Sube tu comprobante</label>
        <input id="pgRef" class="form-control campo mb-2" placeholder="N.º de transacción (opcional)" maxlength="40"><input type="file" id="pgComp" accept="image/*" class="form-control campo"></div>
      <div class="d-grid gap-2"><a class="btn btn-ghost" target="_blank" rel="noopener" href="https://wa.me/${getWhatsapp()}?text=${encodeURIComponent(`Hola, hice el pedido #${pedido.id} por Bs ${pedido.monto_unico}.`)}"><i class="fa-brands fa-whatsapp me-2"></i>Escribir por WhatsApp</a>
        <button type="button" class="btn btn-outline-danger" id="pgCancelar">Cancelar pedido</button></div>`);
    const tic = () => { const s = Math.max(0, Math.round((fin - Date.now()) / 1000)); const r = $('pgReloj'); if (r) r.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; if (s <= 0) expirar(); };
    const expirar = async () => { parar(); await cancelarPedido(pedido.id); cuerpoFinal('x', 'Tiempo agotado', 'El pedido venció sin recibir el pago. Puedes generar uno nuevo.'); };
    reloj = setInterval(tic, 1000); tic();
    seguirPedido(pedido.id, p => {
        if (p.estado === 'pagado') pagado(p); else if (p.estado === 'pago_parcial') { parar(); if (desdeCarrito) { vaciarCarrito(); desdeCarrito = false; } cuerpoFinal('ok', 'Parte QR confirmada', `Pedido #${p.id}: la parte QR fue validada. Saldo en efectivo: ${fmtBs(p.monto_efectivo)} al entregar.`); } else if (p.estado === 'cancelado') { parar(); cuerpoFinal('x', 'Pedido cancelado', 'Este pedido fue cancelado.'); }
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
    cuerpoFinal('ok', '¡Pago confirmado!', `Tu pedido #${p.id} por ${fmtBs(p.monto_unico)} fue verificado. Te contactaremos para la entrega.`);
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
      <div class="d-flex justify-content-between align-items-center"><b class="t-g">${fmtBs(p.estado === 'pendiente_pago' ? p.monto_unico : p.total)}</b>
      ${p.estado === 'pendiente_pago' ? '<button type="button" class="btn btn-neon btn-sm js-continuar">Continuar pago</button>' : ''}</div></div>`).join('')
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
        const file = e.target.files[0];
        if (!navigator.onLine) { e.target.value = ''; return toast('Sin internet: no se puede enviar el comprobante.', 'warn'); }
        if (!['image/jpeg','image/png','image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
            e.target.value = ''; return toast('Sube una imagen JPG, PNG o WEBP de máximo 5 MB.', 'warn');
        }
        try { toast('Subiendo comprobante…', 'info'); await subirComprobante(pedidoActivo.id, file, $('pgRef').value.trim()); $('pgEstado').innerHTML = '<i class="fa-solid fa-hourglass-half t-g"></i><span>Comprobante recibido. El personal debe contrastarlo con el movimiento bancario antes de confirmar el pago.</span>'; toast('Comprobante enviado para revisión'); }
        catch (err) { toast(err.message, 'error'); }
    });
    $('pgCerrar').onclick = () => { parar(); modal('modalPago').hide(); if (pedidoActivo) toast('Tu pedido sigue pendiente. Puedes continuar desde «Mis pedidos».', 'info'); };
}
