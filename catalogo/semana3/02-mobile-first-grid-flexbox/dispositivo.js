// Avance (Semana 3 · Mobile-first + Flexbox): reconoce el dispositivo y la orientación UNA sola vez
// y lo publica en <html data-dispositivo data-orientacion data-tactil>. Un solo index.html; el CSS reacomoda.
//   movil  : < 768 px           (barra inferior, o lateral si está girado)
//   tablet : 768 – 1199 px táctil
//   laptop : puntero fino (mouse) y >= 992 px  (cabecera superior, sin efectos de scroll)
export function detectarDispositivo() {
    const w = window.innerWidth;
    const fino = matchMedia('(hover: hover) and (pointer: fine)').matches;
    const dispositivo = (fino && w >= 992) ? 'laptop' : w < 768 ? 'movil' : 'tablet';
    const h = document.documentElement;
    h.dataset.dispositivo = dispositivo;
    h.dataset.orientacion = window.innerWidth >= window.innerHeight ? 'horizontal' : 'vertical';
    h.dataset.tactil = String(matchMedia('(pointer: coarse)').matches);
    return dispositivo;
}

export function iniciarDispositivo() {
    detectarDispositivo();
    let t;
    const f = () => { clearTimeout(t); t = setTimeout(() => { const antes = document.documentElement.dataset.dispositivo; const ahora = detectarDispositivo(); if (antes !== ahora) document.dispatchEvent(new CustomEvent('dispositivo:cambio', { detail: ahora })); }, 120); };
    addEventListener('resize', f); addEventListener('orientationchange', f);
}
export const esLaptop = () => document.documentElement.dataset.dispositivo === 'laptop';
