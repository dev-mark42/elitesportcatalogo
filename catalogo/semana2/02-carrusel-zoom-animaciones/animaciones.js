// Avance: Animaciones y efectos (fondo de estadio SVG, haces de luz, polvo luminoso, reveal, tilt, ripple, contadores)
let io = null;
export const BALON_SVG = (px = 44) => `<svg viewBox="0 0 100 100" width="${px}" height="${px}" aria-hidden="true"><circle cx="50" cy="50" r="46" fill="#fff" stroke="#0b0b0b" stroke-width="3"/><polygon points="50,30 69,44 62,66 38,66 31,44" fill="#0b0b0b"/><path d="M50 30V6M69 44l24-8M62 66l14 20M38 66L24 86M31 44L7 36" stroke="#0b0b0b" stroke-width="3" stroke-linecap="round"/></svg>`;

function crearFondo() {
    if (document.querySelector('.bg-stadium')) return;
    const f = document.createElement('div');
    f.innerHTML = `<div class="bg-stadium"></div>
      <svg class="bg-pitch" viewBox="0 0 1050 680" preserveAspectRatio="xMidYMid slice" fill="none" aria-hidden="true">
        <g class="ln" stroke-width="3"><rect x="25" y="25" width="1000" height="630"/><path d="M525 25V655"/><circle cx="525" cy="340" r="91"/>
        <rect x="25" y="160" width="165" height="360"/><rect x="860" y="160" width="165" height="360"/><rect x="25" y="255" width="55" height="170"/><rect x="970" y="255" width="55" height="170"/></g>
        <circle class="pulso" cx="525" cy="340" r="91"/></svg>
      <div class="bg-beams"><i></i><i></i></div><div class="bg-vignette"></div><div class="bg-dust"></div>
      <div class="bg-roll">${BALON_SVG(44)}</div>
      <div id="splash">${BALON_SVG(90)}<p>ELITE SPORT</p><div class="sbar"><i></i></div></div><div class="scroll-bar"></div>`;
    while (f.firstChild) document.body.prepend(f.lastChild);
    const dust = document.querySelector('.bg-dust');
    for (let i = 0, n = document.body.classList.contains('ligero') ? 0 : 26; i < n; i++) {
        const s = document.createElement('i'), t = 3 + Math.random() * 6;
        s.style.cssText = `left:${Math.random() * 100}%;width:${t}px;height:${t}px;animation-duration:${10 + Math.random() * 16}s;animation-delay:${-Math.random() * 20}s`;
        dust.appendChild(s);
    }
    const barra = document.querySelector('.scroll-bar');
    if (document.documentElement.dataset.dispositivo !== 'laptop') addEventListener('scroll', () => {
        const h = document.documentElement.scrollHeight - innerHeight;
        barra.style.width = (h > 0 ? scrollY / h * 100 : 0) + '%';
    }, { passive: true });
}

export function observarReveal(raiz = document) {
    const els = raiz.querySelectorAll('.reveal:not(.visible)');
    // Laptop: sin animaciones ligadas al scroll (todo visible al instante)
    if (!('IntersectionObserver' in window) || document.documentElement.dataset.dispositivo === 'laptop' || document.body.classList.contains('ligero')) { els.forEach(e => e.classList.add('visible')); return; }
    if (!io) io = new IntersectionObserver((en, o) => en.forEach(e => {
        if (e.isIntersecting) { e.target.classList.add('visible'); o.unobserve(e.target); }
    }), { threshold: .08 });
    els.forEach((e, i) => { e.style.transitionDelay = Math.min(i % 8, 7) * 60 + 'ms'; io.observe(e); });
}

// Chispas de celebración (antes balones)
export function chispas(x, y, n = 14) {
    const cols = ['#00ff66', '#00c853', '#ffffff', '#b6ffd2'];
    for (let i = 0; i < n; i++) {
        const b = document.createElement('span');
        b.className = 'chispa';
        b.style.cssText = `left:${x}px;top:${y}px;--c:${cols[i % cols.length]};border-radius:${i % 2 ? '50%' : '2px'};--dx:${Math.random() * 240 - 120}px;--dy:${-50 - Math.random() * 160}px`;
        document.body.appendChild(b);
        setTimeout(() => b.remove(), 900);
    }
}

export function animarContador(el, fin, dur = 1200) {
    if (!el) return;
    const sufijo = el.dataset.suffix || '', t0 = performance.now();
    (function paso(t) {
        const p = Math.min((t - t0) / dur, 1);
        el.textContent = Math.round(fin * (1 - Math.pow(1 - p, 3))).toLocaleString('es-BO') + sufijo;
        if (p < 1) requestAnimationFrame(paso);
    })(t0);
}

export function inicializarAnimaciones() {
    crearFondo();
    observarReveal();
    // Teclado virtual: lleva el campo enfocado al centro para que no quede tapado
    document.addEventListener('focusin', e => {
        if (matchMedia('(pointer:coarse)').matches && e.target.matches('input,textarea,select')) setTimeout(() => e.target.scrollIntoView({ block: 'center', behavior: 'smooth' }), 300);
    });
    document.addEventListener('click', e => {
        const b = e.target.closest('.btn,.chip,.nav-pill,.lg-tab');
        if (!b) return;
        const r = b.getBoundingClientRect(), s = Math.max(r.width, r.height);
        const o = document.createElement('span');
        o.className = 'ripple';
        o.style.cssText = `width:${s}px;height:${s}px;left:${e.clientX - r.left - s / 2}px;top:${e.clientY - r.top - s / 2}px`;
        b.appendChild(o); setTimeout(() => o.remove(), 600);
    });
    if (window.matchMedia('(hover: hover)').matches) {
        document.addEventListener('mousemove', e => {
            const c = e.target.closest?.('.tilt'); if (!c) return;
            const r = c.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
            c.style.setProperty('--ry', (x - .5) * 10 + 'deg'); c.style.setProperty('--rx', -(y - .5) * 10 + 'deg');
            c.style.setProperty('--mx', x * 100 + '%'); c.style.setProperty('--my', y * 100 + '%');
        });
        document.addEventListener('mouseout', e => {
            const c = e.target.closest?.('.tilt');
            if (c && !c.contains(e.relatedTarget)) { c.style.setProperty('--rx', '0deg'); c.style.setProperty('--ry', '0deg'); }
        });
    }
}
