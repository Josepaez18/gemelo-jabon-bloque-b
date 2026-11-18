// Panel de control: página aparte del gemelo (panel.html), pensada para otra pestaña.
//   Nodos:            los 12 nodos por piso, con 4 comprobaciones cada uno.
//   Comunicación:     cómo viaja el dato y cada mensaje que llega al receptor, regla por regla.
//   Contrato del dato: capa de red, capa de negocio, canal gemelo ↔ panel y un probador.
// No simula nada mientras haya un gemelo abierto: dibuja la foto que el gemelo publica (fuente.js).
import '@fontsource-variable/inter';
import './panel.css';
import { fecha, hora } from '../interfaz/formato.js';
import { $, $$ } from './comun.js';
import { VistaComunicacion } from './comunicacion.js';
import { VistaContrato } from './contrato.js';
import { VEL_PROPIA, iniciarFuente } from './fuente.js';
import { VistaNodos } from './nodos.js';

const PESTANAS = ['nodos', 'comunicacion', 'contrato'];
const estado = { foto: null, info: { tipo: 'buscando', gemelos: 0 }, pestana: 'nodos' };

const comunicacion = new VistaComunicacion();
const vistas = {
  nodos: new VistaNodos({
    alVerTrafico: (id) => {
      comunicacion.filtrarPorNodo(id);
      setPestana('comunicacion', true);
    },
  }),
  comunicacion,
  contrato: new VistaContrato(),
};

// --- Pestañas (también por la dirección: panel.html#contrato) ---------------------------

function setPestana(nombre, enfocar = false) {
  if (!PESTANAS.includes(nombre)) nombre = 'nodos';
  estado.pestana = nombre;
  for (const t of $$('.pc-pestanas [role=tab]')) {
    const si = t.id === `t-${nombre}`;
    t.setAttribute('aria-selected', String(si));
    t.tabIndex = si ? 0 : -1;
    if (si && enfocar) t.focus();
  }
  for (const p of $$('.pc-pagina')) p.hidden = p.id !== `p-${nombre}`;
  if (location.hash.slice(1) !== nombre) history.replaceState(null, '', `#${nombre}`);
  pintar();
}

const tabs = $$('.pc-pestanas [role=tab]');
tabs.forEach((tab, i) => {
  tab.addEventListener('click', () => setPestana(tab.id.slice(2)));
  tab.addEventListener('keydown', (ev) => {
    const d = ev.key === 'ArrowRight' ? 1 : ev.key === 'ArrowLeft' ? -1 : 0;
    if (!d) return;
    ev.preventDefault();
    setPestana(tabs[(i + d + tabs.length) % tabs.length].id.slice(2), true);
  });
});
window.addEventListener('hashchange', () => {
  const h = location.hash.slice(1);
  if (PESTANAS.includes(h)) setPestana(h);
});

// --- Cabecera y avisos -----------------------------------------------------------------

function pintarCabecera() {
  const f = estado.foto;
  const i = estado.info;
  if (f) {
    $('#pc-hora').textContent = hora(f.ms);
    $('#pc-dia').textContent = fecha(f.ms);
  }
  const tipo = i.tipo === 'gemelo' && f?.envivo ? 'envivo' : i.tipo;
  const fuente = $('#pc-fuente');
  fuente.dataset.fuente = tipo;
  const varios = i.gemelos > 1 ? ` · ${i.gemelos} gemelos abiertos, se muestra uno` : '';
  fuente.lastElementChild.textContent = {
    buscando: 'Buscando el gemelo…',
    gemelo: `Conectado al gemelo · ${f?.velocidad ? `×${f.velocidad}` : 'en pausa'}${varios}`,
    envivo: `Conectado al gemelo · en vivo, hora real (${f?.envivo?.estado ?? ''})${varios}`,
    cerrado: 'El gemelo se cerró o se está recargando…',
    propia: `Simulación propia del panel ×${VEL_PROPIA}`,
  }[tipo];

  const aviso = $('#pc-aviso');
  let html = '';
  if (i.versionAjena !== null && i.versionAjena !== undefined) {
    html = `Hay un gemelo abierto con otra versión del contrato del panel (${i.versionAjena}). Recarga las dos pestañas para que hablen el mismo idioma.`;
  } else if (i.tipo === 'propia') {
    html =
      'No hay un gemelo abierto en este navegador, así que el panel corre su propia simulación (sin fallas ni modo en vivo). Abre <a href="index.html" target="gemelo-3d">el gemelo</a> en otra pestaña y el panel pasa a mostrar sus datos.';
  }
  aviso.hidden = !html;
  if (html && aviso.innerHTML !== html) aviso.innerHTML = html;
}

function pintar() {
  pintarCabecera();
  if (document.hidden || !estado.foto) return;
  vistas[estado.pestana].pintar(estado.foto, estado.info);
}

iniciarFuente({
  alFoto(foto, info) {
    estado.foto = foto;
    estado.info = info;
    comunicacion.recibir(foto, info); // el tráfico se acumula aunque se mire otra pestaña
    pintar();
  },
  alEstado(info) {
    estado.info = info;
    pintarCabecera();
  },
});

document.addEventListener('visibilitychange', pintar);
// Si se cambia el tema en el gemelo, el panel lo sigue.
window.addEventListener('storage', (ev) => {
  if (ev.key !== 'gemelo-tema') return;
  if (ev.newValue === 'claro' || ev.newValue === 'oscuro') document.documentElement.dataset.theme = ev.newValue;
  else delete document.documentElement.dataset.theme;
});

setPestana(location.hash.slice(1) || 'nodos');
