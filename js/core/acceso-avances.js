// Acceso discreto: 6 pulsaciones avisan; la séptima abre el índice de avances.
let pulsaciones = 0, reinicio = null;
document.addEventListener('click', event => {
  const logo = event.target.closest('.js-logo');
  if (!logo) return;
  pulsaciones++;
  clearTimeout(reinicio);
  if (pulsaciones === 6) {
    alert('Estás a un toque de abrir los avances del proyecto.');
  } else if (pulsaciones >= 7) {
    pulsaciones = 0;
    location.href = './avances.html';
    return;
  }
  reinicio = setTimeout(() => { pulsaciones = 0; }, 5000);
}, { passive: true });
