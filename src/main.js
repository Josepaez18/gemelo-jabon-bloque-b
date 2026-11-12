import '@fontsource-variable/inter';
import './estilos.css';
import './presentacion.css';
import { App } from './interfaz/app.js';

// Si algo falla, se dice en pantalla en vez de dejar la página congelada.
function mostrarError(texto) {
  if (/ResizeObserver/.test(texto)) return; // aviso inofensivo del navegador
  let el = document.querySelector('.error-arranque');
  if (!el) {
    el = document.createElement('div');
    el.className = 'error-arranque';
    el.setAttribute('role', 'alert');
    document.body.appendChild(el);
  }
  el.textContent = `Algo falló: ${texto}. Recarga la página; si se repite, copia este mensaje.`;
}
window.addEventListener('error', (e) => mostrarError(e.message || String(e.error)));
window.addEventListener('unhandledrejection', (e) => mostrarError(e.reason?.message ?? String(e.reason)));

try {
  window.gemelo = new App();
} catch (err) {
  console.error(err);
  mostrarError(err?.message ?? String(err));
}
