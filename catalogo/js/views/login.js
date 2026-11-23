// js/views/login.js
import { registrar, loginCliente, loginAdmin, entrarInvitado, getRol } from '../core/auth.js';
import { toast } from '../../semana1/05-alertas-toast/alertas.js';
import { validarFormulario, validacionEnVivo, validarCampo, limpiarValidacion } from '../../semana1/04-validacion-formulario/validaciones.js';
import { configurarDelegacionEventos as deleg } from '../../semana2/01-delegacion-eventos-hidratacion/delegacion-eventos.js';

const $ = id => document.getElementById(id);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const rL = { lEmail: { req: 1, regex: EMAIL, msg: 'Correo no válido' }, lPass: { req: 1, min: 6 } };
const rR = { rNombre: { req: 1, min: 3, max: 40, regex: /^[A-Za-zÁ-ÿ' ]+$/, msg: 'Solo letras y espacios' }, rEmail: { req: 1, regex: EMAIL, msg: 'Correo no válido' },
    rTel: { regex: /^[67]\d{7}$/, msg: 'Celular boliviano de 8 dígitos' }, rPass: { req: 1, min: 6, max: 40 } };
const rA = { aUser: { req: 1, min: 3 }, aPass: { req: 1, min: 4 } };
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const coincide = () => ({ req: 1, regex: new RegExp('^' + esc($('rPass').value) + '$'), msg: 'Las contraseñas no coinciden' });

function entrar(rol) {
    toast(rol === 'admin' ? 'Acceso concedido' : 'Bienvenido a Elite Sport', 'ok');
    const w = Object.assign(document.createElement('div'), { className: 'wipe' });
    document.body.appendChild(w);
    setTimeout(() => { document.dispatchEvent(new CustomEvent('auth:cambio')); setTimeout(() => w.remove(), 700); }, 600);
}

async function enviar(form, reglas, accion) {
    if (!validarFormulario(form, reglas, toast)) return;
    const b = form.querySelector('.lg-cta'), t = b.textContent; b.disabled = true; b.textContent = 'Cargando...';
    let r;
    try { r = await accion(); }
    catch (e) { r = { ok: false, msg: 'Error de conexión. Intenta de nuevo.' }; }
    b.textContent = t;

    if (r.ok && r.pendiente) { b.disabled = false; toast(r.msg, 'info'); document.querySelector('.lg-tab').click(); return; }
    if (r.ok) {
        // loginCliente/loginAdmin ya verificaron Auth y el rol. No repetir llamadas
        // a getUser()/perfiles: evita solicitudes duplicadas y falsos bloqueos.
        b.disabled = true;
        entrar(r.rol || 'cliente');
    } else {
        b.disabled = false;
        toast(r.msg, 'error');
        form.classList.remove('shake'); void form.offsetWidth; form.classList.add('shake');
    }
}

export default function iniciarLogin() {
    deleg('.lg-tabs', '.lg-tab', 'click', (e, t) => {
        document.querySelectorAll('.lg-tab').forEach(x => { x.classList.toggle('on', x === t); x.setAttribute('aria-selected', x === t); });
        document.querySelectorAll('.lg-form').forEach(f => f.classList.toggle('on', f.id === t.dataset.f));
    });
    deleg('.lg-in', '.js-eye', 'click', (e, t) => {
        const i = t.parentElement.querySelector('input'), ver = i.type === 'password';
        i.type = ver ? 'text' : 'password'; t.querySelector('i').className = ver ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye';
        t.setAttribute('aria-label', ver ? 'Ocultar contraseña' : 'Mostrar contraseña');
    });
    validacionEnVivo($('fLogin'), rL); validacionEnVivo($('fReg'), rR); validacionEnVivo($('fAdmin'), rA);
    $('rPass2').addEventListener('input', () => validarCampo($('rPass2'), coincide()));
    $('rPass').addEventListener('input', e => {
        const v = e.target.value, p = [v.length >= 6, v.length >= 10, /[A-Z]/.test(v) && /[a-z]/.test(v), /\d/.test(v) && /[^A-Za-z0-9]/.test(v)].filter(Boolean).length;
        const b = $('fuerza'); b.style.width = p * 25 + '%'; b.style.background = ['#ef233c', '#ef233c', '#ff9f1c', '#9be564', '#00ff66'][p];
        if ($('rPass2').value) validarCampo($('rPass2'), coincide());
    });
    $('fLogin').addEventListener('submit', e => { e.preventDefault(); enviar(e.target, rL, () => loginCliente($('lEmail').value, $('lPass').value)); });
    $('fReg').addEventListener('submit', e => {
        e.preventDefault();
        enviar(e.target, { ...rR, rPass2: coincide() }, () => registrar({ nombre: $('rNombre').value, email: $('rEmail').value, tel: $('rTel').value.trim(), pass: $('rPass').value }));
    });
    $('fAdmin').addEventListener('submit', e => { e.preventDefault(); enviar(e.target, rA, () => loginAdmin($('aUser').value, $('aPass').value)); });
    $('btnInvitado').addEventListener('click', () => { entrarInvitado(); entrar('cliente'); });
    $('cont').remove();

    return {
        entrar() {
            ['fLogin', 'fReg', 'fAdmin'].forEach(id => { $(id).reset(); limpiarValidacion($(id)); });
            $('fuerza').style.width = '0';
        }
    };
}
