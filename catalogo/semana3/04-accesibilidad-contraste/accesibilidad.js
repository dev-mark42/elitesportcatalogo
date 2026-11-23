// Avance (Semana 3 · Accesibilidad a11y y contraste WCAG): alterna el modo de alto contraste y lo recuerda.
export function iniciarAltoContraste(boton) {
    const aplicar = on => { document.body.classList.toggle('alto-contraste', on); boton?.setAttribute('aria-pressed', String(on)); };
    aplicar(localStorage.getItem('eliteAltoContraste') === '1');
    boton?.addEventListener('click', () => {
        const on = !document.body.classList.contains('alto-contraste');
        localStorage.setItem('eliteAltoContraste', on ? '1' : '0'); aplicar(on);
    });
}
