// Avance (Semana 3 · DOMPurify): limpia HTML no confiable. `soloTexto` elimina TODAS las etiquetas.
import DOMPurify from './purify.es.mjs';
export const sanitizarHTML = html => DOMPurify.sanitize(String(html ?? ''), { USE_PROFILES: { html: true } });
export const soloTexto = html => DOMPurify.sanitize(String(html ?? ''), { ALLOWED_TAGS: [], ALLOWED_ATTR: [] }).trim();
