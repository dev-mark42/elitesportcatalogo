// Avance (Semana 3 · Semántica HTML5 y HMR): inspecciona las etiquetas semánticas y actualiza el diagnóstico en vivo, sin recargar.
// Nota: HMR (Hot Module Replacement) es del entorno de desarrollo (Vite/Webpack); aquí se simula el "actualizar sin recargar".
export function auditarSemantica(raiz = document) {
    const zonas = raiz.querySelectorAll('header, nav, main, article, footer').length;
    const secciones = raiz.querySelectorAll('section').length;
    const sinAlt = raiz.querySelectorAll('img:not([alt])').length;
    const divsBoton = raiz.querySelectorAll('div[onclick], span[onclick]').length;
    const h1 = raiz.querySelectorAll('h1').length;
    return { zonas, secciones, sinAlt, divsBoton, h1,
        texto: `Auditoría en vivo: ${zonas} etiquetas semánticas HTML5 detectadas (+${secciones} section) | Imágenes sin alt: ${sinAlt} | div/span clicables: ${divsBoton} | h1: ${h1}.` };
}
export function activarAuditoria(boton, salida) {
    boton.addEventListener('click', () => { salida.textContent = auditarSemantica().texto; });
}
