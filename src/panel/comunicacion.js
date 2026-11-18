// Vista "Comunicación": cómo viaja el dato (etapas con contadores), los mensajes que llegan al
// receptor uno por uno, el recorrido de un mensaje por R1–R8 y los rechazos por regla.
import { ESTRATEGIAS, SUPUESTOS } from '../config/supuestos.js';
import { temaDe } from '../modelo/contrato.js';
import { DISPENSADORES, infoDispensador } from '../modelo/edificio.js';
import { CADA_MS } from '../modelo/panel.js';
import { REGLAS } from '../modelo/receptor.js';
import { esc, fecha, hora, numero } from '../interfaz/formato.js';
import { $, R, bytes, camposHtml, efectoHtml, firmaHtml, leerJson, marcar, poner, quienDe, reglasHtml } from './comun.js';

const MAX_LISTA = 200;
const ORIGEN = {
  simulado: 'simulado',
  envivo: 'en vivo',
  intruso: 'intruso',
};
const ORIGEN_LARGO = {
  simulado: 'nodo simulado por el gemelo',
  envivo: 'ESP32 de Wokwi, por el broker MQTT real',
  intruso: 'un intruso con una clave inventada (falla «Aviso falso»). Esto lo sabe la simulación; el receptor solo ve que la firma no coincide',
};

export class VistaComunicacion {
  constructor() {
    this.mensajes = []; // los que llegaron, del más viejo al más nuevo
    this.ultimoN = 0;
    this.origen = null;
    this.omitidos = 0;
    this.pausa = false;
    this.filtro = { res: '', nodo: '' };
    this.elegido = null;
    this.armar();
  }

  armar() {
    const sel = $('#tr-nodo');
    sel.innerHTML =
      '<option value="">Todos</option>' +
      DISPENSADORES.map((d) => `<option value="${d.id}">${d.corto} · ${d.nombre}</option>`).join('') +
      '<option value="otros">Otros temas (sin dispensador)</option>';
    sel.addEventListener('change', () => {
      this.filtro.nodo = sel.value;
      this.pintarLista(true);
    });
    $('#tr-resultado').addEventListener('click', (ev) => {
      const b = ev.target.closest('button');
      if (!b) return;
      this.filtro.res = b.dataset.res;
      marcar($('#tr-resultado'), b);
      this.pintarLista(true);
    });
    $('#tr-pausa').addEventListener('click', () => this.setPausa(!this.pausa));
    $('#tr-lista').addEventListener('click', (ev) => {
      const b = ev.target.closest('button[data-n]');
      if (!b) return;
      this.elegir(Number(b.dataset.n));
    });
  }

  setPausa(si) {
    this.pausa = si;
    const b = $('#tr-pausa');
    b.setAttribute('aria-pressed', String(si));
    b.textContent = si ? 'Reanudar' : 'Pausar';
    if (!si) this.pintarLista(true);
    this.pintarNota();
  }

  filtrarPorNodo(id) {
    this.filtro.nodo = id;
    $('#tr-nodo').value = id;
    this.pintarLista(true);
  }

  // Se llama con cada foto, aunque la pestaña no esté a la vista: así no se pierde el historial.
  recibir(f, info) {
    const lista = f.trafico ?? [];
    const ultimo = lista.at(-1)?.n ?? 0;
    // Otro gemelo, o el mismo con la simulación reiniciada (semilla, modo en vivo): se empieza de cero.
    if (info.origen !== this.origen || ultimo < this.ultimoN) {
      this.origen = info.origen;
      this.mensajes = [];
      this.ultimoN = 0;
      this.omitidos = 0;
      this.elegido = null;
      this.reinicio = true;
    }
    const nuevos = lista.filter((m) => m.n > this.ultimoN);
    if (nuevos.length && this.ultimoN && nuevos[0].n > this.ultimoN + 1) this.omitidos += nuevos[0].n - this.ultimoN - 1;
    for (const m of nuevos) {
      m.datos = leerJson(m.carga);
      this.mensajes.push(m);
    }
    if (this.mensajes.length > MAX_LISTA) this.mensajes.splice(0, this.mensajes.length - MAX_LISTA);
    if (nuevos.length) this.ultimoN = nuevos.at(-1).n;
    this.f = f;
    this.info = info;
  }

  pintar(f) {
    this.f = f;
    this.pintarEtapas(f);
    this.pintarBarras(f);
    if (!this.pausa) this.pintarLista(this.reinicio);
    this.reinicio = false;
    this.pintarNota();
    if (this.elegido === null) this.pintarInspector(null);
  }

  // --- Etapas ---------------------------------------------------------------------

  pintarEtapas(f) {
    const r = f.resumen;
    const red = f.red;
    const d = SUPUESTOS.dispositivo;
    const ev = f.envivo;
    const host = new URL(SUPUESTOS.envivo.url.replace(/^wss?:/, 'https:')).hostname;
    const conexion = ev
      ? `${infoDispensador(ev.id).corto} llega de verdad por <b>${esc(host)}</b> (${esc(ev.estado)}); los otros 11 se simulan.`
      : 'En simulación, el gemelo entrega cada mensaje al receptor tal como lo haría el broker.';
    const etapas = [
      {
        titulo: 'Nodo · ESP32-C3 + HC-SR04',
        texto: `Mide cada ${d.lecturaCadaS} s. Publica si el nivel cambia ${d.cambioMinimo} puntos o más, y un latido cada ${d.latidoS / 60} min (${d.latidoBajoS} s bajo ${d.umbralLatidoBajo} %).`,
        dato: `${r.enLinea}/${r.total} en línea`,
      },
      {
        titulo: 'Red · Wi-Fi + broker MQTT',
        texto: `Tema <code>${esc(R.temaBase)}/&lt;id&gt;</code>, QoS 0. ${conexion}`,
        dato: `${numero(red.recibidos)} mensajes`,
      },
      {
        titulo: 'Receptor · capa de red (R1–R3)',
        texto: '¿Es auténtico? JSON legible, 7 campos, id registrado, tema y firma HMAC.',
        dato: `${numero(red.rechazosRed)} rechazados`,
        nota: 'no se atribuyen a ningún nodo',
        mal: red.rechazosRed > 0,
      },
      {
        titulo: 'Receptor · capa de negocio (R4–R8)',
        texto: '¿El dato tiene sentido? Variable y unidad, hora, rango, que no suba solo ni caiga a 0 de golpe.',
        dato: `${numero(red.aceptados)} aceptados`,
        nota: `${numero(red.rechazosNegocio)} rechazados → revisar`,
        mal: red.rechazosNegocio > 0,
      },
      {
        titulo: 'Estado de cada nodo',
        texto: `Normal ≥ ${R.umbralBajo} %, bajo, vacío < ${R.umbralVacio} % o sin dato (3 latidos sin mensajes auténticos, nunca 0 %).`,
        dato: `${r.normal} normal · ${r.bajo} bajo · ${r.vacio} vacío`,
        nota: `${r.sinDato} sin dato · ${r.revisar} por revisar`,
      },
      {
        titulo: 'Decisión · lista de aseo',
        texto: `${esc(ESTRATEGIAS[f.estrategia]?.nombre ?? f.estrategia)}. Primero recargar (vacíos primero), luego revisar y luego sin dato.`,
        dato: `${f.aseo.recargar.length} recargar · ${f.aseo.revisar.length} revisar`,
        nota: `${f.aseo.sinDato.length} sin dato · ${f.aseo.sinNovedad} sin novedad`,
      },
      {
        titulo: 'Panel de control',
        texto: `El gemelo publica una foto cada ${CADA_MS} ms por BroadcastChannel; esta pestaña solo la dibuja.`,
        dato: this.info?.tipo === 'propia' ? 'simulación propia' : `${numero(this.info?.fotos ?? 0)} fotos`,
      },
    ];
    poner(
      $('#pc-etapas'),
      etapas
        .map(
          (e, i) => `<li${e.mal ? ' class="mal"' : ''}><span class="num" aria-hidden="true">${i + 1}</span><h3>${e.titulo}</h3><p>${e.texto}</p>
            <p class="dato"><b>${e.dato}</b>${e.nota ? `<span>${e.nota}</span>` : ''}</p></li>`,
        )
        .join(''),
    );
  }

  // --- Rechazos por regla -------------------------------------------------------------

  pintarBarras(f) {
    const red = f.red;
    const max = Math.max(1, ...REGLAS.map((x) => red.porRegla[x.regla] ?? 0));
    const rech = red.recibidos - red.aceptados;
    poner(
      $('#pc-reglas-total'),
      red.recibidos
        ? `${numero(red.recibidos)} mensajes recibidos: ${numero(red.aceptados)} aceptados y ${numero(rech)} rechazados (${numero((100 * rech) / red.recibidos, 1)} %). Cada rechazo se cuenta en la primera regla que falló.`
        : 'Todavía no llega ningún mensaje.',
    );
    poner(
      $('#pc-barras'),
      REGLAS.map((x) => {
        const n = red.porRegla[x.regla] ?? 0;
        return `<li><b>${x.regla}</b><span class="capa" data-capa="${x.capa}">${x.capa}</span><span class="desc">${esc(x.comprueba(R))}</span>
          <span class="barra" aria-hidden="true"><i style="width:${(100 * n) / max}%"></i></span><span class="n">${numero(n)}</span></li>`;
      }).join(''),
    );
  }

  // --- Lista de mensajes --------------------------------------------------------------

  pasa(m) {
    const { res, nodo } = this.filtro;
    if (res === 'ok' && !m.aceptado) return false;
    if (res === 'no' && m.aceptado) return false;
    if (nodo === 'otros') return !DISPENSADORES.some((d) => m.tema === temaDe(d.id, R.temaBase));
    if (nodo) return m.id === nodo || m.tema === temaDe(nodo, R.temaBase);
    return true;
  }

  filaHtml(m) {
    const valor = m.datos && Number.isFinite(m.datos.valor) ? `${m.datos.valor} %` : '—';
    const res = m.aceptado ? '<span class="pc-res" data-r="ok">✓ Aceptado</span>' : `<span class="pc-res" data-r="falla">✕ ${esc(m.regla)}</span>`;
    return `<li><button type="button" data-n="${m.n}" aria-pressed="${m.n === this.elegido?.n}">
      <span class="t">${hora(m.ms)}</span><span class="quien">${esc(quienDe(m.tema))}</span><span class="val">${valor}</span>${res}
      <span class="org" data-origen="${m.origen}">${ORIGEN[m.origen] ?? esc(m.origen)}</span></button></li>`;
  }

  // Los mensajes nuevos se agregan arriba sin tocar los que ya están, para que un clic no se
  // pierda si llega una foto justo en ese momento.
  pintarLista(todo = false) {
    const ol = $('#tr-lista');
    const visibles = this.mensajes.filter((m) => this.pasa(m));
    const arriba = Number(ol.firstElementChild?.querySelector('[data-n]')?.dataset.n ?? 0);
    if (todo || !ol.firstElementChild) {
      ol.innerHTML = visibles.length
        ? visibles.slice(-80).reverse().map((m) => this.filaHtml(m)).join('')
        : '<li class="pc-vacio">Ningún mensaje con este filtro todavía.</li>';
      return;
    }
    const nuevos = visibles.filter((m) => m.n > arriba);
    if (!nuevos.length) return;
    if (ol.firstElementChild.classList.contains('pc-vacio')) ol.innerHTML = '';
    ol.insertAdjacentHTML('afterbegin', nuevos.slice(-80).reverse().map((m) => this.filaHtml(m)).join(''));
    while (ol.children.length > 80) ol.lastElementChild.remove();
  }

  pintarNota() {
    const partes = [];
    if (this.pausa) {
      const nuevos = this.mensajes.filter((m) => this.pasa(m) && m.n > Number($('#tr-lista [data-n]')?.dataset.n ?? 0)).length;
      partes.push(`En pausa${nuevos ? `: ${nuevos} mensajes nuevos esperando` : ''}.`);
    }
    if (this.omitidos) partes.push(`A esta velocidad llegan más mensajes de los que caben en cada foto: ${numero(this.omitidos)} no alcanzaron a mostrarse (sí se cuentan arriba).`);
    poner($('#tr-nota'), partes.join(' '));
  }

  elegir(n) {
    const m = this.mensajes.find((x) => x.n === n);
    if (!m) return;
    this.elegido = m;
    for (const b of $('#tr-lista').querySelectorAll('button[data-n]')) b.setAttribute('aria-pressed', String(Number(b.dataset.n) === n));
    if (!this.pausa) this.setPausa(true); // para leer con calma: la lista no se mueve
    this.pintarInspector(m);
    if (window.matchMedia('(max-width: 1100px)').matches) $('#tr-inspector').scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  // --- Recorrido de un mensaje ------------------------------------------------------

  pintarInspector(m) {
    const el = $('#tr-inspector');
    if (!m) {
      poner(
        el,
        '<h2>Recorrido de un mensaje</h2><p class="pc-tenue">Elige un mensaje de la lista para ver cómo llegó, qué dice su JSON, si la firma coincide, qué reglas pasó y qué hizo el receptor con él. Al elegirlo, la lista se pausa.</p>',
      );
      return;
    }
    const r = { aceptado: m.aceptado, regla: m.regla, detalle: m.detalle, id: m.id, valor: m.valor };
    poner(
      el,
      `<h2>Recorrido del mensaje #${numero(m.n)}</h2>
      <dl class="pc-dl">
        <dt>Llegó</dt><dd>${fecha(m.ms)}, ${hora(m.ms)} (reloj del receptor)</dd>
        <dt>Tema</dt><dd><code>${esc(m.tema)}</code></dd>
        <dt>Tamaño</dt><dd>${numero(bytes(m.carga))} bytes${m.largo > m.carga.length ? ` (se guardaron los primeros ${m.carga.length} de ${numero(m.largo)} caracteres)` : ''}</dd>
        <dt>Origen</dt><dd>${esc(ORIGEN_LARGO[m.origen] ?? m.origen)}</dd>
      </dl>
      <h3><span class="paso">1</span>Carga, tal como llegó</h3>
      <code class="pc-json">${esc(m.carga)}</code>
      <h3><span class="paso">2</span>Campos del contrato</h3>
      ${camposHtml(m.datos)}
      <h3><span class="paso">3</span>Firma</h3>
      ${firmaHtml(m.datos, r)}
      <h3><span class="paso">4</span>Reglas, en orden</h3>
      ${reglasHtml(r)}
      <h3><span class="paso">5</span>Qué hace el receptor</h3>
      ${efectoHtml(r, m.tema)}`,
    );
  }
}
