// Panel de control: página aparte del gemelo (panel.html), pensada para otra pestaña.
// Muestra los 12 nodos por piso con 4 comprobaciones cada uno. No simula nada mientras haya
// un gemelo abierto: solo dibuja la foto que el gemelo publica por BroadcastChannel.
// Si no hay gemelo abierto, corre su propia simulación para no quedar en blanco.
import '@fontsource-variable/inter';
import './panel.css';
import { ESTRATEGIAS } from '../config/supuestos.js';
import { CANAL, VENCE_MS, instantanea } from '../modelo/panel.js';
import { NOMBRE_ESTADO } from '../modelo/receptor.js';
import { Simulacion } from '../modelo/simulacion.js';
import { esc, fecha, hace, hora, numero } from '../interfaz/formato.js';

const $ = (s) => document.querySelector(s);
const SIMBOLO = { ok: '✓', aviso: '!', falla: '✕', pendiente: '·' };
const VEL_PROPIA = 60;

const estado = { foto: null, fuente: '', ultimaMs: 0, piso: null, ver: 'todos', abierto: null, propia: null };

function poner(el, html) {
  if (el.dataset.html !== html) {
    el.innerHTML = html;
    el.dataset.html = html;
  }
}

// --- De dónde salen los datos ---------------------------------------------------

let canal = null;
try {
  canal = new BroadcastChannel(CANAL);
  canal.onmessage = (ev) => {
    if (ev.data?.tipo !== 'foto') return;
    estado.propia = null; // llegó un gemelo: manda él
    estado.foto = ev.data.foto;
    estado.fuente = ev.data.foto.envivo ? 'envivo' : 'gemelo';
    estado.ultimaMs = performance.now();
    pintar();
  };
  canal.postMessage({ tipo: 'hola' });
} catch {
  // Sin BroadcastChannel: queda la simulación propia.
}

let antes = performance.now();
setInterval(() => {
  const t = performance.now();
  const dt = Math.min(2, (t - antes) / 1000);
  antes = t;
  if (t - estado.ultimaMs < VENCE_MS) return; // el gemelo sigue publicando
  if (!estado.propia) {
    if (t < VENCE_MS) return; // recién abierto: se le da tiempo al gemelo de contestar
    estado.propia = new Simulacion({});
    canal?.postMessage({ tipo: 'hola' });
  }
  estado.propia.avanzar(dt * VEL_PROPIA);
  estado.propia.vaciarEventos();
  estado.foto = instantanea(estado.propia, { velocidad: VEL_PROPIA });
  estado.fuente = 'propia';
  pintar();
}, 500);

// --- Dibujo ---------------------------------------------------------------------

function conNovedad(n) {
  return n.funcionamiento.clave !== 'normal';
}

function filaNodo(n, ahora) {
  const con = n.estado === 'esperando' ? ['espera', 'Esperando'] : n.vivo ? ['si', 'En línea'] : ['no', 'Sin dato'];
  const nivel =
    n.valor === null
      ? '<span class="pc-tenue">sin valor</span>'
      : `<div class="pc-nivel" data-estado="${n.vivo ? n.estado : 'sin_dato'}"><span class="barra"><i style="width:${Math.max(0, Math.min(100, n.valor))}%"></i><u></u></span><b>${n.valor} %</b></div>`;
  const comp = n.comprobaciones
    .map((c) => `<span data-r="${c.resultado}" title="${esc(c.nombre)}: ${esc(c.detalle)}">${c.nombre[0]}</span>`)
    .join('');
  const abierto = estado.abierto === n.id;
  let html = `<tr class="nodo" data-id="${n.id}" tabindex="0" aria-expanded="${abierto}">
    <td class="pc-id"><b>${n.corto}</b>${n.origen === 'envivo' ? '<span class="pc-envivo">EN VIVO</span>' : ''}<small>${n.genero === 'mujeres' ? 'Baño de mujeres' : 'Baño de hombres'}</small></td>
    <td><span class="pc-con" data-con="${con[0]}"><i></i>${con[1]}</span></td>
    <td>${nivel}</td>
    <td><span class="pc-chip" data-estado="${n.funcionamiento.clave}">${n.funcionamiento.texto}</span></td>
    <td><span class="pc-comp">${comp}</span></td>
    <td>${n.ultimoAutenticoMs === null ? '<span class="pc-tenue">nunca</span>' : hace(n.ultimoAutenticoMs, ahora)}</td>
    <td class="pc-msj">${numero(n.aceptados)} <span class="pc-tenue">/</span> <span class="${n.rechazados ? 'mal' : 'pc-tenue'}">${numero(n.rechazados)}</span></td>
  </tr>`;
  if (abierto) html += filaDetalle(n, ahora);
  return html;
}

function filaDetalle(n, ahora) {
  const lista = n.comprobaciones
    .map((c) => `<li data-r="${c.resultado}"><span>${SIMBOLO[c.resultado]}</span><b>${esc(c.nombre)}</b><span>${esc(c.detalle)}</span></li>`)
    .join('');
  const r = n.ultimoResultado;
  const resultado = !r ? 'Sin lecturas todavía.' : r.aceptado ? `Aceptado: ${r.valor} % (${hace(r.ms, ahora)}).` : `Rechazado por ${esc(r.regla)}: ${esc(r.detalle)} (${hace(r.ms, ahora)}).`;
  const fallas = n.fallas.length ? `<p><b>Falla simulada activa:</b> ${n.fallas.map(esc).join(', ')}.</p>` : '';
  const valido = n.valor === null ? '' : `<p>Último valor válido: <b>${n.valor} %</b> (${NOMBRE_ESTADO[n.estado] ?? n.estado}), ${hace(n.ultimoValidoMs, ahora)}.${n.recargaConfirmada ? ' Recarga confirmada en curso.' : ''}</p>`;
  return `<tr class="pc-detalle"><td colspan="7"><div class="cols">
    <div><h3>Verificación de ${n.corto} · ${esc(n.nombre)}</h3><ul class="pc-lista">${lista}</ul>${fallas}</div>
    <div><h3>Último mensaje auténtico</h3><code>${n.ultimaCarga ? esc(n.ultimaCarga) : 'Todavía no llega ninguno.'}</code><p>${resultado}</p>${valido}
      <p class="pc-tenue">Origen: ${n.origen === 'envivo' ? 'ESP32 de Wokwi, en vivo por MQTT' : 'nodo simulado por el gemelo'} · id <code style="display:inline;padding:1px 5px">${n.id}</code></p></div>
  </div></td></tr>`;
}

function pintar() {
  const f = estado.foto;
  if (!f) return;
  $('#pc-hora').textContent = hora(f.ms);
  $('#pc-dia').textContent = fecha(f.ms);

  const fuente = $('#pc-fuente');
  fuente.dataset.fuente = estado.fuente;
  fuente.lastElementChild.textContent = {
    gemelo: `Conectado al gemelo · simulación ${f.velocidad ? `×${f.velocidad}` : 'en pausa'}`,
    envivo: 'Conectado al gemelo · modo en vivo (hora real)',
    propia: `Simulación propia del panel ×${VEL_PROPIA}`,
  }[estado.fuente];
  const aviso = $('#pc-aviso');
  aviso.hidden = estado.fuente !== 'propia';
  if (!aviso.hidden) aviso.innerHTML = 'No hay un gemelo abierto en este navegador, así que el panel corre su propia simulación. Abre <a href="index.html" target="gemelo-3d">el gemelo</a> en otra pestaña y el panel pasa a mostrar sus datos.';

  const r = f.resumen;
  const kpi = (valor, nombre, color) => `<div class="pc-kpi" style="--c:var(${color})"><b>${valor}</b><span>${nombre}</span></div>`;
  poner(
    $('#pc-kpis'),
    kpi(`${r.enLinea}/${r.total}`, 'Nodos en línea', r.enLinea === r.total ? '--normal' : '--vacio') +
      kpi(r.normal, 'Normal (≥ 30 %)', '--normal') +
      kpi(r.bajo, 'Bajo (5–29 %)', '--bajo') +
      kpi(r.vacio, 'Vacío (< 5 %)', '--vacio') +
      kpi(r.sinDato, 'Sin dato', '--sin-dato') +
      kpi(r.revisar, 'Por revisar', '--revisar') +
      kpi(numero(r.aceptados), 'Mensajes aceptados', '--acento') +
      kpi(numero(r.rechazados), 'Mensajes rechazados', r.rechazados ? '--vacio' : '--borde-fuerte'),
  );

  if (!$('#pc-piso').children.length) {
    $('#pc-piso').innerHTML =
      '<button type="button" data-piso="" aria-pressed="true">Todos</button>' +
      Array.from({ length: f.pisos }, (_, i) => `<button type="button" data-piso="${i + 1}" aria-pressed="false">${i + 1}</button>`).join('');
  }

  const cabecera = '<thead><tr><th class="c-nodo">Nodo</th><th class="c-con">Conexión</th><th class="c-nivel">Nivel</th><th class="c-fun">Funcionamiento</th><th class="c-ver">Verificación</th><th class="c-ult">Último mensaje</th><th class="c-msj">Acept. / rech.</th></tr></thead>';
  let html = '';
  for (let p = 1; p <= f.pisos; p++) {
    if (estado.piso && estado.piso !== p) continue;
    const todos = f.nodos.filter((n) => n.piso === p);
    const nodos = estado.ver === 'novedad' ? todos.filter(conNovedad) : todos;
    if (!nodos.length) continue;
    const novedades = todos.filter(conNovedad).length;
    html += `<article class="pc-piso"><header><h2>Piso ${p}</h2><span>${todos.filter((n) => n.vivo).length}/${todos.length} en línea</span>
      <span class="novedad" data-n="${novedades}">${novedades ? `${novedades} con novedad` : 'sin novedad'}</span></header>
      <table class="pc-tabla">${cabecera}<tbody>${nodos.map((n) => filaNodo(n, f.ms)).join('')}</tbody></table></article>`;
  }
  poner($('#pc-pisos'), html || '<p class="pc-vacio">Ningún nodo con novedad: los que se muestran con este filtro funcionan y tienen jabón suficiente.</p>');

  poner($('#pc-aseo'), `<b>${esc(ESTRATEGIAS[f.estrategia]?.nombre ?? f.estrategia)}.</b> ${f.aseo.map((a) => `${esc(a.nombre)}: ${esc(a.texto)}`).join(' · ') || 'Sin personal en turno.'}`);
  poner(
    $('#pc-eventos'),
    f.eventos.length
      ? f.eventos.map((e) => `<li class="${e.tipo}"><span class="t">${hora(e.ms)}</span><span>${esc(e.texto)}</span></li>`).join('')
      : '<li><span class="t">—</span><span>Todavía no hay eventos.</span></li>',
  );
}

// --- Controles ------------------------------------------------------------------

function marcar(grupo, boton) {
  for (const b of grupo.children) b.setAttribute('aria-pressed', String(b === boton));
}
$('#pc-piso').addEventListener('click', (ev) => {
  const b = ev.target.closest('button');
  if (!b) return;
  estado.piso = b.dataset.piso ? Number(b.dataset.piso) : null;
  marcar($('#pc-piso'), b);
  pintar();
});
$('#pc-ver').addEventListener('click', (ev) => {
  const b = ev.target.closest('button');
  if (!b) return;
  estado.ver = b.dataset.ver;
  marcar($('#pc-ver'), b);
  pintar();
});
function alternar(ev) {
  const fila = ev.target.closest('tr.nodo');
  if (!fila) return;
  estado.abierto = estado.abierto === fila.dataset.id ? null : fila.dataset.id;
  pintar();
}
$('#pc-pisos').addEventListener('click', alternar);
$('#pc-pisos').addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter' || ev.key === ' ') {
    ev.preventDefault();
    alternar(ev);
  }
});
