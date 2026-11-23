// Avance (Semana 2): estado de conexión + inspección de la caché del Service Worker.
export const estaOnline = () => navigator.onLine;

export function vigilarConexion(alCambiar) {
    const f = () => alCambiar(navigator.onLine);
    addEventListener('online', f); addEventListener('offline', f);
    return () => { removeEventListener('online', f); removeEventListener('offline', f); };
}

export async function listarCache() {
    if (!('caches' in window)) return [];
    const salida = [];
    for (const nombre of await caches.keys()) {
        const c = await caches.open(nombre);
        salida.push({ cache: nombre, archivos: (await c.keys()).length });
    }
    return salida;
}
