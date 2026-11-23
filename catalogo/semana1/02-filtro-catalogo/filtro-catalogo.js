// Avance (Semana 1): filtro del catálogo. Función pura: recibe la lista y el estado de filtros y devuelve la lista filtrada y ordenada.
export function filtrarProductos(lista, { liga = 'todas', q = '', orden = 'nuevo', disp = false } = {}) {
    const texto = q.toLowerCase().trim();
    const r = lista.filter(p => (liga === 'todas' || p.liga === liga) && p.titulo.toLowerCase().includes(texto) && (!disp || p.stock > 0));
    if (orden === 'precio-asc') r.sort((a, b) => a.precio - b.precio);
    else if (orden === 'precio-desc') r.sort((a, b) => b.precio - a.precio);
    else r.sort((a, b) => b.id - a.id);
    return r;
}
