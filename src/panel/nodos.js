// Vista "Nodos": los 12 dispensadores por piso, con conexión, nivel, funcionamiento y las
// 4 comprobaciones (C F D N). Las filas se arman una vez y luego solo cambia su contenido:
// así no se pierde el foco del teclado ni el texto seleccionado del JSON.
import { ESTRATEGIAS } from '../config/supuestos.js';
import { DISPENSADORES, PISOS } from '../modelo/edificio.js';
import { NOMBRE_ESTADO } from '../modelo/receptor.js';
import { esc, hace, hora, numero } from '../interfaz/formato.js';
import { $, $$, NOMBRE_RESULTADO, SIMBOLO, marcar, poner } from './comun.js';

// [clase, encabezado, encabezado corto para el celular]
const COLUMNAS = [
  ['c-nodo', 'Nodo'],
  ['c-con', 'Conexión'],
  ['c-nivel', 'Nivel'],
  ['c-fun', 'Funcionamiento', 'Estado'],
  ['c-ver', 'Verificación', '', '<span class="letras" aria-hidden="true">C F D N</span>'],
  ['c-ult', 'Último mensaje'],
  ['c-msj', 'Acept. / rech.'],
];
const encabezado = ([c, largo, corto, extra = '']) =>
  `<th scope="col" class="${c}"><span${corto !== undefined ? ' class="largo"' : ''}>${largo}</span>${corto ? `<span class="corto" aria-hidden="true">${corto}</span>` : ''}${extra}</th>`;

const conNovedad = (n) => n.funcionamiento.clave !== 'normal' || n.comprobaciones.some((c) => c.resultado === 'aviso' || c.resultado === 'falla');

export class VistaNodos {
  constructor({ alVerTrafico }) {
    this.piso = null;
    this.ver = 'todos';
    this.abierto = null;
    this.alVerTrafico = alVerTrafico;
    this.armar();
  }

  armar() {
    $('#pc-piso').innerHTML =
      '<button type="button" data-piso="" aria-pressed="true">Todos</button>' +
      Array.from({ length: PISOS }, (_, i) => `<button type="button" data-piso="${i + 1}" aria-pressed="false">${i + 1}</button>`).join('');

    const cabecera = `<thead><tr>${COLUMNAS.map(encabezado).join('')}</tr></thead>`;
    let html = '';
    for (let p = 1; p <= PISOS; p++) {
      const filas = DISPENSADORES.filter((d) => d.piso === p)
        .map(
          (d) => `<tr class="nodo" data-id="${d.id}" tabindex="0" aria-expanded="false" aria-controls="det-${d.corto}"></tr>
          <tr class="pc-detalle" id="det-${d.corto}" hidden><td colspan="${COLUMNAS.length}"><div class="cols">
            <div><h3 class="d-titulo"></h3><ul class="pc-lista d-lista"></ul><p class="d-fallas"></p></div>
            <div><h3>Último mensaje auténtico</h3><code class="pc-json d-carga"></code><p class="d-resultado"></p><p class="d-valido"></p>
              <p class="d-origen pc-tenue"></p>
              <p><button type="button" class="pc-enlace" data-trafico="${d.id}">Ver los mensajes de ${d.corto} en Comunicación →</button></p></div>
          </div></td></tr>`,
        )
        .join('');
      html += `<article class="pc-piso" data-piso="${p}"><header><h2>Piso ${p}</h2><span class="d-linea"></span><span class="novedad"></span></header>
        <table class="pc-tabla"><caption class="sr">Nodos del piso ${p}</caption>${cabecera}<tbody>${filas}</tbody></table></article>`;
    }
    $('#pc-pisos').innerHTML = html;

    $('#pc-piso').addEventListener('click', (ev) => {
      const b = ev.target.closest('button');
      if (!b) return;
      this.piso = b.dataset.piso ? Number(b.dataset.piso) : null;
      marcar($('#pc-piso'), b);
      this.pintar(this.foto);
    });
    $('#pc-ver').addEventListener('click', (ev) => {
      const b = ev.target.closest('button');
      if (!b) return;
      this.ver = b.dataset.ver;
      marcar($('#pc-ver'), b);
      this.pintar(this.foto);
    });
    const alternar = (fila) => {
      this.abierto = this.abierto === fila.dataset.id ? null : fila.dataset.id;
      this.pintar(this.foto);
    };
    $('#pc-pisos').addEventListener('click', (ev) => {
      const ir = ev.target.closest('[data-trafico]');
      if (ir) return this.alVerTrafico(ir.dataset.trafico);
      const fila = ev.target.closest('tr.nodo');
      if (fila) alternar(fila);
    });
    $('#pc-pisos').addEventListener('keydown', (ev) => {
      const fila = ev.target.closest('tr.nodo');
      if (!fila || ev.target !== fila) return;
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        alternar(fila);
      } else if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
        // Flechas: de un nodo visible al siguiente, aunque estén en pisos distintos.
        ev.preventDefault();
        const filas = $$('tr.nodo', $('#pc-pisos')).filter((f) => !f.hidden && !f.closest('article').hidden);
        filas[filas.indexOf(fila) + (ev.key === 'ArrowDown' ? 1 : -1)]?.focus();
      }
    });
  }

  abrir(id) {
    this.abierto = id;
    this.pintar(this.foto);
    $(`tr.nodo[data-id="${id}"]`)?.scrollIntoView({ block: 'center' });
  }

  pintar(f) {
    this.foto = f;
    if (!f) return;
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

    let visibles = 0;
    for (const art of $$('.pc-piso', $('#pc-pisos'))) {
      const p = Number(art.dataset.piso);
      const todos = f.nodos.filter((n) => n.piso === p);
      const novedades = todos.filter(conNovedad).length;
      poner($('.d-linea', art), `${todos.filter((n) => n.vivo).length}/${todos.length} en línea`);
      const nov = $('.novedad', art);
      nov.dataset.n = novedades;
      poner(nov, novedades ? `${novedades} con novedad` : 'sin novedad');
      let enPiso = 0;
      for (const n of todos) {
        const fila = $(`tr.nodo[data-id="${n.id}"]`, art);
        const det = fila.nextElementSibling;
        const abierto = this.abierto === n.id;
        fila.hidden = this.ver === 'novedad' && !conNovedad(n) && !abierto;
        fila.setAttribute('aria-expanded', String(abierto));
        det.hidden = !abierto || fila.hidden;
        if (!fila.hidden) {
          enPiso++;
          poner(fila, this.celdas(n, f.ms));
        }
        if (abierto) this.pintarDetalle(det, n, f.ms);
      }
      art.hidden = (this.piso && this.piso !== p) || !enPiso;
      if (!art.hidden) visibles++;
    }
    $('#pc-sin-novedad').hidden = visibles > 0;

    poner($('#pc-aseo'), `<b>${esc(ESTRATEGIAS[f.estrategia]?.nombre ?? f.estrategia)}.</b> ${f.aseo.personal.map((a) => `${esc(a.nombre)}: ${esc(a.texto)}`).join(' · ') || 'Sin personal en turno.'}`);
    poner(
      $('#pc-eventos'),
      f.eventos.length
        ? f.eventos.map((e) => `<li class="${e.tipo}"><span class="t">${hora(e.ms)}</span><span>${esc(e.texto)}</span></li>`).join('')
        : '<li><span class="t">—</span><span>Todavía no hay eventos.</span></li>',
    );
  }

  celdas(n, ahora) {
    const con = n.estado === 'esperando' ? ['espera', 'Esperando'] : n.vivo ? ['si', 'En línea'] : ['no', 'Sin dato'];
    const nivel =
      n.valor === null
        ? '<span class="pc-tenue">sin valor</span>'
        : `<div class="pc-nivel" data-estado="${n.vivo ? n.estado : 'sin_dato'}"><span class="barra" aria-hidden="true"><i style="width:${Math.max(0, Math.min(100, n.valor))}%"></i><u></u></span><b>${n.valor} %</b></div>`;
    const comp = n.comprobaciones
      .map((c) => {
        const texto = `${c.nombre}: ${NOMBRE_RESULTADO[c.resultado]}. ${c.detalle}`;
        return `<span data-r="${c.resultado}" role="img" aria-label="${esc(texto)}" title="${esc(texto)}"><b>${c.nombre[0]}</b><i>${SIMBOLO[c.resultado]}</i></span>`;
      })
      .join('');
    return `<td class="c-nodo pc-id"><b>${n.corto}</b>${n.origen === 'envivo' ? '<span class="pc-envivo">EN VIVO</span>' : ''}<small><span class="largo">Baño de </span>${n.genero}</small></td>
      <td class="c-con"><span class="pc-con" data-con="${con[0]}"><i></i>${con[1]}</span></td>
      <td class="c-nivel">${nivel}</td>
      <td class="c-fun"><span class="pc-chip" data-estado="${n.funcionamiento.clave}">${n.funcionamiento.texto}</span></td>
      <td class="c-ver"><span class="pc-comp">${comp}</span></td>
      <td class="c-ult">${n.ultimoAutenticoMs === null ? '<span class="pc-tenue">nunca</span>' : hace(n.ultimoAutenticoMs, ahora)}</td>
      <td class="c-msj">${numero(n.aceptados)} <span class="pc-tenue">/</span> <span class="${n.rechazados ? 'mal' : 'pc-tenue'}">${numero(n.rechazados)}</span></td>`;
  }

  pintarDetalle(det, n, ahora) {
    poner($('.d-titulo', det), `Verificación de ${n.corto} · ${esc(n.nombre)}`);
    poner(
      $('.d-lista', det),
      n.comprobaciones
        .map((c) => `<li data-r="${c.resultado}"><span aria-hidden="true">${SIMBOLO[c.resultado]}</span><b>${esc(c.nombre)}</b><span>${esc(c.detalle)}</span></li>`)
        .join(''),
    );
    poner($('.d-fallas', det), n.fallas.length ? `<b>Falla simulada activa:</b> ${n.fallas.map(esc).join(', ')}.` : '');
    poner($('.d-carga', det), n.ultimaCarga ? esc(n.ultimaCarga) : 'Todavía no llega ninguno.');
    const r = n.ultimoResultado;
    poner(
      $('.d-resultado', det),
      !r ? 'Sin lecturas todavía.' : r.aceptado ? `Aceptado: ${r.valor} % (${hace(r.ms, ahora)}).` : `Rechazado por ${esc(r.regla)}: ${esc(r.detalle)} (${hace(r.ms, ahora)}).`,
    );
    poner(
      $('.d-valido', det),
      n.valor === null
        ? ''
        : `Último valor válido: <b>${n.valor} %</b> (${NOMBRE_ESTADO[n.estado] ?? n.estado}), ${hace(n.ultimoValidoMs, ahora)}.${n.recargaConfirmada ? ` Recarga confirmada en curso (vence ${hace(ahora, n.recargaHastaMs).replace('hace', 'en')}).` : ''}`,
    );
    poner(
      $('.d-origen', det),
      `Origen: ${n.origen === 'envivo' ? 'ESP32 de Wokwi, en vivo por MQTT' : 'nodo simulado por el gemelo'} · tema <code>${esc(n.tema)}</code>`,
    );
  }
}
