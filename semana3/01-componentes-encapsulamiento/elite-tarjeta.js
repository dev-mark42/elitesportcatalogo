// Avance (Semana 3 · Componentes y encapsulamiento): Web Component <elite-tarjeta> con Shadow DOM.
// Sus estilos NO se filtran hacia afuera ni reciben estilos de la página. Metodología BEM: .tarjeta__titulo, .tarjeta--agotado.
// Uso: <elite-tarjeta titulo="Camiseta" precio="Bs. 350" liga="La Liga" stock="5" imagen="https://..."></elite-tarjeta>
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

class EliteTarjeta extends HTMLElement {
    static get observedAttributes() { return ['titulo', 'precio', 'liga', 'stock', 'imagen']; }
    constructor() { super(); this.attachShadow({ mode: 'open' }); }
    connectedCallback() { this.render(); }
    attributeChangedCallback() { if (this.isConnected) this.render(); }
    render() {
        const g = n => this.getAttribute(n) || '';
        const stock = Number(g('stock')), agotado = g('stock') !== '' && stock <= 0;
        const img = g('imagen');
        this.shadowRoot.innerHTML = `
        <style>
          :host{display:block;font-family:system-ui,sans-serif;color:#f4fff8}
          .tarjeta{background:#0c140f;border:1px solid rgba(255,255,255,.12);border-radius:16px;overflow:hidden;max-width:320px}
          .tarjeta--agotado{opacity:.65}
          .tarjeta__media{aspect-ratio:4/3;background:#071109 center/cover;display:grid;place-items:center;font-size:2.4rem}
          .tarjeta__media img{width:100%;height:100%;object-fit:cover}
          .tarjeta__cuerpo{padding:14px}
          .tarjeta__liga{font-size:.75rem;color:#00ff66;text-transform:uppercase;font-weight:700}
          .tarjeta__titulo{margin:4px 0 8px;font-size:1.05rem}
          .tarjeta__pie{display:flex;justify-content:space-between;align-items:center}
          .tarjeta__precio{font-weight:800;font-size:1.2rem;color:#00ff66}
          .tarjeta__estado{font-size:.75rem;padding:3px 10px;border-radius:99px;background:#00ff6622;color:#00ff66}
          .tarjeta__estado--agotado{background:#ef233c33;color:#ff6b7d}
        </style>
        <article class="tarjeta ${agotado ? 'tarjeta--agotado' : ''}">
          <div class="tarjeta__media">${img ? `<img src="${esc(img)}" alt="${esc(g('titulo'))}" loading="lazy">` : '<span aria-hidden="true">⚽</span>'}</div>
          <div class="tarjeta__cuerpo">
            <div class="tarjeta__liga">${esc(g('liga'))}</div>
            <h3 class="tarjeta__titulo">${esc(g('titulo') || 'Nuevo producto')}</h3>
            <div class="tarjeta__pie"><span class="tarjeta__precio">${esc(g('precio'))}</span>
              <span class="tarjeta__estado ${agotado ? 'tarjeta__estado--agotado' : ''}">${agotado ? 'Agotado' : g('stock') === '' ? '' : stock + ' disponibles'}</span></div>
          </div>
        </article>`;
    }
}
if (!customElements.get('elite-tarjeta')) customElements.define('elite-tarjeta', EliteTarjeta);
export { EliteTarjeta };
