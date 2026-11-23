// Subida de imágenes a Supabase Storage (bucket público "imagenes"). Devuelve la URL pública que se guarda en la BD,
// por eso lo que subes desde el celular se ve igual en la laptop (y en cualquier otro equipo).
import { sb } from './bd.js';
import { leerImagen } from '../../semana2/05-seguridad-xss-subida-imagen/subida-imagen.js';

const EXT = { 'image/png': 'png', 'image/webp': 'webp', 'image/svg+xml': 'svg', 'image/gif': 'gif' };

/** Sube un Blob/File o un data:URL y devuelve la URL pública. */
export async function subirImagen(origen, carpeta = 'productos') {
    if (!navigator.onLine) throw new Error('Sin internet: no se puede subir contenido.');
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


/** Sube vídeo del carrusel sin pasar por el redimensionador de imágenes. */
export async function subirVideo(file, carpeta = 'carrusel/videos') {
    if (!navigator.onLine) throw new Error('Sin internet: no se puede subir el vídeo.');
    if (!(file instanceof File)) throw new Error('Selecciona un archivo de vídeo.');
    const tipos = { 'video/mp4': 'mp4', 'video/webm': 'webm' };
    if (!tipos[file.type]) throw new Error('Formato no permitido. Usa MP4 o WEBM.');
    if (file.size > 30 * 1024 * 1024) throw new Error('El vídeo supera el límite de 30 MB.');
    const c = await sb();
    if (!c) throw new Error('Sin conexión con la base de datos.');
    const ruta = `${carpeta}/${Date.now()}-${crypto.randomUUID()}.${tipos[file.type]}`;
    const { error } = await c.storage.from('imagenes').upload(ruta, file, {
        contentType: file.type, cacheControl: '3600', upsert: false
    });
    if (error) throw new Error(error.message?.includes('row-level') ? 'Tu rol no tiene permiso para subir vídeos.' : error.message);
    return c.storage.from('imagenes').getPublicUrl(ruta).data.publicUrl;
}
