// Subida de imágenes a Supabase Storage (bucket público "imagenes"). Devuelve la URL pública que se guarda en la BD,
// por eso lo que subes desde el celular se ve igual en la laptop (y en cualquier otro equipo).
import { sb } from './bd.js';
import { leerImagen } from '../../semana2/05-seguridad-xss-subida-imagen/subida-imagen.js';

const EXT = { 'image/png': 'png', 'image/webp': 'webp', 'image/svg+xml': 'svg', 'image/gif': 'gif' };

/** Sube un Blob/File o un data:URL y devuelve la URL pública. */
export async function subirImagen(origen, carpeta = 'productos') {
    const c = await sb();
    if (!c) throw new Error('Sin conexión con la base de datos');
    const blob = typeof origen === 'string' ? await (await fetch(origen)).blob() : origen;
    const ruta = `${carpeta}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${EXT[blob.type] || 'jpg'}`;
    const { error } = await c.storage.from('imagenes').upload(ruta, blob, { contentType: blob.type || 'image/jpeg', cacheControl: '31536000' });
    if (error) throw new Error(error.message?.includes('row-level') ? 'Tu rol no tiene permiso para subir imágenes' : error.message);
    return c.storage.from('imagenes').getPublicUrl(ruta).data.publicUrl;
}

/** Atajo: redimensiona en el navegador (liviano) y sube. opt = { max, tipo, q } */
export async function subirArchivo(file, carpeta, opt = {}) {
    const data = await leerImagen(file, opt);
    return subirImagen(data, carpeta);
}
