// Avance (Semana 1): menú hamburguesa. Una sola plantilla <template> alimenta el menú fijo (laptop) y el desplegable (celular).
export function montarMenu(idPlantilla, idsDestino) {
    const tpl = document.getElementById(idPlantilla);
    if (!tpl) return;
    idsDestino.forEach(id => { const d = document.getElementById(id); if (d && !d.children.length) d.appendChild(tpl.content.cloneNode(true)); });
}

// Versión sin Bootstrap (usada en la demo independiente): alterna una clase y actualiza aria-expanded.
export function activarHamburguesa(boton, menu) {
    boton.setAttribute('aria-expanded', 'false');
    boton.addEventListener('click', () => {
        const abierto = menu.classList.toggle('abierto');
        boton.setAttribute('aria-expanded', String(abierto));
    });
}
