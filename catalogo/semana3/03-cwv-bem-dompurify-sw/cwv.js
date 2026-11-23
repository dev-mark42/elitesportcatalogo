// Avance (Semana 3 · Core Web Vitals): mide LCP, CLS, FCP e INP aproximado con PerformanceObserver.
export function medirCWV(alActualizar) {
    const m = { LCP: null, CLS: 0, FCP: null, INP: null };
    const emitir = () => alActualizar({ ...m });
    const obs = (tipo, fn, extra = {}) => { try { new PerformanceObserver(l => { l.getEntries().forEach(fn); emitir(); }).observe({ type: tipo, buffered: true, ...extra }); } catch { /* no soportado */ } };
    obs('largest-contentful-paint', e => { m.LCP = Math.round(e.startTime); });
    obs('paint', e => { if (e.name === 'first-contentful-paint') m.FCP = Math.round(e.startTime); });
    obs('layout-shift', e => { if (!e.hadRecentInput) m.CLS = +(m.CLS + e.value).toFixed(3); });
    obs('event', e => { if (e.interactionId) m.INP = Math.max(m.INP || 0, Math.round(e.duration)); }, { durationThreshold: 40 });
    emitir();
}
export const veredicto = { LCP: v => v == null ? '…' : v <= 2500 ? 'Bueno' : v <= 4000 ? 'Mejorable' : 'Malo', CLS: v => v <= 0.1 ? 'Bueno' : v <= 0.25 ? 'Mejorable' : 'Malo', INP: v => v == null ? '…' : v <= 200 ? 'Bueno' : v <= 500 ? 'Mejorable' : 'Malo' };
