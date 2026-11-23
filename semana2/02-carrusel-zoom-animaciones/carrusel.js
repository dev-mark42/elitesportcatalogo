// Avance: Carrusel moderno (texto animado palabra por palabra, imagen en diagonal con parallax,
// miniaturas, barra de progreso, swipe táctil y teclado). Sin dependencias.
import { normalizarImagen } from '../03-fetch-lazyloading-dropbox/dropbox.js';
import { limpiarTexto as L } from '../05-seguridad-xss-subida-imagen/seguridad-xss.js';

export function iniciarCarrusel(cont, slides, { intervalo = 6000 } = {}) {
    if (!cont || !slides.length) return;
    const n = slides.length, reducir = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const pal = t => { const w = L(t).split(' '); return w.map((x, k) => `<span class="w"><b style="--i:${k}">${k === w.length - 1 && w.length > 1 ? `<em>${x}</em>` : x}</b></span>`).join(' '); };
    const urls = slides.map(s => normalizarImagen(s.img));
    cont.innerHTML = `<div class="hero2" tabindex="0" role="region" aria-roledescription="carrusel" aria-label="Promociones">
      <div class="h2-amb">${urls.map((u, k) => `<i class="${k ? '' : 'on'}" ${u ? `style="background-image:url('${L(u)}')"` : ''}></i>`).join('')}</div>
      ${slides.map((s, k) => `<article class="h2-slide ${k ? '' : 'on'}" aria-hidden="${k ? 'true' : 'false'}">
        <div class="h2-text"><span class="h2-badge">${L(s.badge || 'ELITE SPORT')}</span><h2 class="h2-title">${pal(s.titulo || '')}</h2>
          <p class="h2-p">${L(s.texto || '')}</p><div class="h2-cta"><button type="button" class="btn btn-neon px-4 py-2" data-vista="catalogo">Ver catálogo <i class="fa-solid fa-arrow-right ms-2"></i></button></div></div>
        <div class="h2-media ${urls[k] ? '' : 'vacio'}">${urls[k] ? `<img ${k ? 'loading="lazy" ' : ''}decoding="async" src="${L(urls[k])}" alt="${L(s.titulo)}" onerror="this.remove()">` : '<i class="fa-solid fa-futbol"></i>'}</div></article>`).join('')}
      ${n > 1 ? `<div class="h2-ui"><button class="h2-btn" data-d="-1" aria-label="Anterior"><i class="fa-solid fa-arrow-left"></i></button>
        <button class="h2-btn" data-d="1" aria-label="Siguiente"><i class="fa-solid fa-arrow-right"></i></button><span class="h2-cnt"><b>01</b><small> / ${String(n).padStart(2, '0')}</small></span></div>
        <div class="h2-thumbs">${urls.map((u, k) => `<button class="h2-th ${k ? '' : 'on'}" data-i="${k}" aria-label="Ir al slide ${k + 1}">${u ? `<img loading="lazy" src="${L(u)}" alt="Miniatura: ${L(slides[k].titulo || 'slide ' + (k + 1))}" onerror="this.remove()">` : '<i class="fa-solid fa-futbol"></i>'}</button>`).join('')}</div>
        <div class="h2-prog"><i></i></div>` : ''}</div>`;

    const hero = cont.querySelector('.hero2'), $$ = s => [...hero.querySelectorAll(s)];
    const prog = hero.querySelector('.h2-prog i'), cnt = hero.querySelector('.h2-cnt b');
    let i = 0;
    function ir(k) {
        i = (k + n) % n;
        $$('.h2-slide').forEach((e, j) => { e.classList.toggle('on', j === i); e.setAttribute('aria-hidden', j === i ? 'false' : 'true'); });
        $$('.h2-amb i').forEach((e, j) => e.classList.toggle('on', j === i));
        $$('.h2-th').forEach((e, j) => e.classList.toggle('on', j === i));
        if (cnt) cnt.textContent = String(i + 1).padStart(2, '0');
        if (prog && !reducir) { prog.classList.remove('run'); void prog.offsetWidth; prog.style.setProperty('--dur', intervalo + 'ms'); prog.classList.add('run'); }
    }
    if (n > 1) {
        hero.addEventListener('click', e => {
            const b = e.target.closest('[data-d],[data-i]'); if (!b) return;
            ir(b.dataset.d ? i + +b.dataset.d : +b.dataset.i);
        });
        prog && prog.addEventListener('animationend', () => ir(i + 1));
        hero.addEventListener('keydown', e => { if (e.key === 'ArrowLeft') ir(i - 1); if (e.key === 'ArrowRight') ir(i + 1); });
        let x0 = 0;
        hero.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; hero.classList.add('pausa'); }, { passive: true });
        hero.addEventListener('touchend', e => { hero.classList.remove('pausa'); const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 50) ir(i + (dx < 0 ? 1 : -1)); });
        ir(0);
    }
    if (matchMedia('(hover: hover)').matches) hero.addEventListener('mousemove', e => {
        const r = hero.getBoundingClientRect();
        hero.style.setProperty('--px', ((e.clientX - r.left) / r.width - .5) * 2);
        hero.style.setProperty('--py', ((e.clientY - r.top) / r.height - .5) * 2);
    });
}
