// Avance: Subida de imágenes desde el equipo (arrastrar/soltar o elegir archivo). Redimensiona y guarda como data URL.
export function leerImagen(file, { max = 900, tipo = 'image/jpeg', q = .82 } = {}) {
    return new Promise((res, rej) => {
        if (!file || !file.type.startsWith('image/')) return rej(new Error('El archivo debe ser una imagen'));
        if (file.size > 8e6) return rej(new Error('La imagen supera los 8 MB'));
        const r = new FileReader();
        r.onerror = () => rej(new Error('No se pudo leer el archivo'));
        r.onload = () => {
            if (file.type === 'image/svg+xml') return res(r.result);
            const im = new Image();
            im.onload = () => {
                const k = Math.min(1, max / Math.max(im.width, im.height)), c = document.createElement('canvas');
                c.width = Math.round(im.width * k); c.height = Math.round(im.height * k);
                c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
                res(c.toDataURL(tipo, q));
            };
            im.onerror = () => rej(new Error('Imagen no válida'));
            im.src = r.result;
        };
        r.readAsDataURL(file);
    });
}

export function activarDropzone(zona, input, alElegir) {
    if (!zona || !input) return;
    zona.addEventListener('click', () => input.click());
    ['dragenter', 'dragover'].forEach(ev => zona.addEventListener(ev, e => { e.preventDefault(); zona.classList.add('arrastrando'); }));
    ['dragleave', 'drop'].forEach(ev => zona.addEventListener(ev, e => { e.preventDefault(); zona.classList.remove('arrastrando'); }));
    zona.addEventListener('drop', e => { const f = e.dataTransfer.files[0]; if (f) alElegir(f); });
    input.addEventListener('change', () => { if (input.files[0]) alElegir(input.files[0]); input.value = ''; });
}
