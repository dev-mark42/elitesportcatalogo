// Avance (Semana 3 · Desarrollo ágil y Smoke Testing): auditoría rápida del DOM en vivo (sin recargar).
export function ejecutarSmokeTest(raiz = document) {
    const imgsSinAlt = raiz.querySelectorAll('img:not([alt]), img[alt=""]').length;
    const enlacesVacios = raiz.querySelectorAll('a[href=""], a:not([href])').length;
    const botones = raiz.querySelectorAll('button').length;
    const botonesSinTexto = [...raiz.querySelectorAll('button')].filter(b => !b.textContent.trim() && !b.getAttribute('aria-label') && !b.title).length;
    const ok = !imgsSinAlt && !enlacesVacios && !botonesSinTexto;
    return { ok, botones, imgsSinAlt, enlacesVacios, botonesSinTexto,
        texto: `Smoke Test ${ok ? 'OK' : 'con avisos'} · Botones: ${botones} | Imágenes sin alt: ${imgsSinAlt} | Enlaces vacíos: ${enlacesVacios} | Botones sin nombre: ${botonesSinTexto}` };
}
export function activarSmokeTest(boton, salida) {
    boton.addEventListener('click', () => { salida.textContent = ejecutarSmokeTest().texto; });
}
