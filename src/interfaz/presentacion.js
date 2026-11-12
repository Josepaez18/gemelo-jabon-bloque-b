// Modo presentación: pantalla completa, recorrido de cámara automático con narración
// y un tablero tipo sala de control. Las 7 escenas siguen los 7 pasos del Momento 3;
// sus textos están en src/config/presentacion.js.
// Teclas: ← → cambian de escena, Espacio pausa el recorrido, Esc sale.
import * as THREE from 'three';
import { PRESENTACION } from '../config/presentacion.js';
import { SUPUESTOS } from '../config/supuestos.js';
import { estaAbierto } from '../modelo/afluencia.js';
import { DISPENSADORES, PISOS, infoDispensador } from '../modelo/edificio.js';
import { esc, fecha, hora, numero } from './formato.js';

const A0 = Math.atan2(0.62, -1); // mismo ángulo que la vista inicial (lado de los baños)
const PORTADA_S = 3.4;
const ICONO =
  '<svg viewBox="0 0 32 32" aria-hidden="true"><defs><linearGradient id="gota-hud" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7dd3fc"/><stop offset="1" stop-color="#2563eb"/></linearGradient></defs><path d="M16 3c5 7 9 11.5 9 16.5A9 9 0 0 1 7 19.5C7 14.5 11 10 16 3z" fill="url(#gota-hud)"/><path d="M12 20a4 4 0 0 0 4 4" stroke="white" stroke-width="2" fill="none" stroke-linecap="round"/></svg>';

const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
const orbita = (c, radio, alto, ang) => v3(c.x + Math.sin(ang) * radio, c.y + alto, c.z + Math.cos(ang) * radio);
const corto = (texto) => texto.replace(/bano-bloque-b-(d\d+)/g, '$1');
// Solo toca el DOM si el valor cambió: cada escritura obliga al navegador a repintar sobre la maqueta.
const poner = (el, texto) => {
  if (el.textContent !== texto) el.textContent = texto;
};
const transformar = (el, valor) => {
  if (el.style.transform !== valor) el.style.transform = valor;
};

// El dispensador más urgente: el de menor nivel entre los que tienen dato.
function masCritico(sim) {
  let mejor = null;
  for (const d of DISPENSADORES) {
    const s = sim.receptor.estadoDe(d.id, sim.ahora);
    if (s.valor === null) continue;
    if (!mejor || s.valor < mejor.valor) mejor = { id: d.id, valor: s.valor };
  }
  return mejor?.id ?? DISPENSADORES[1].id;
}

function pisoAseo(sim) {
  const p = sim.aseo.personal[0];
  if (!p) return 1;
  const pos = sim.aseo.posicion(p, sim.tVisual);
  return Math.min(PISOS, Math.max(1, Math.round(pos.pisoF)));
}

// Paso 2 y 6 se miran de cerca: el dispensador de la pared y el medidor encima.
// El objetivo va cerca de la base del medidor: así queda en la mitad de arriba, libre de la narración.
function deCerca(id, s, ctx, { radio = 5.6, alto = 1.5, bajar = -0.15 } = {}) {
  const info = infoDispensador(id);
  const lado = info.genero === 'mujeres' ? -1 : 1;
  const t = ctx.escena.posicionMedidor(id).add(v3(-0.3 * lado, -bajar, 0));
  const ang = Math.atan2(lado, 0.55) + 0.4 * Math.sin(s * 0.28);
  return { pos: orbita(t, radio, alto, ang), target: t, rapidez: 1.6 };
}

// El dispensador del paso 2: el que va conectado a Wokwi (d2).
const ID_DATO = SUPUESTOS.envivo.idEnVivo;
// El del paso 6: uno que siempre está simulado, para poder activarle una falla.
const ID_FALLA = ID_DATO === 'bano-bloque-b-d3' ? 'bano-bloque-b-d5' : 'bano-bloque-b-d3';

function fichaDato(ctx) {
  const info = infoDispensador(ID_DATO);
  const s = ctx.sim.receptor.estadoDe(ID_DATO, ctx.sim.ahora);
  let j = null;
  try {
    j = JSON.parse(s.ultimaCarga);
  } catch {
    // Todavía no llega ningún mensaje.
  }
  if (!j) return '<p>Esperando el primer mensaje…</p>';
  const origen = ctx.sim.idEnVivo === ID_DATO ? 'ESP32 simulado en Wokwi, en vivo' : 'simulado por el gemelo';
  const json = JSON.stringify({ ...j, firma: `${String(j.firma).slice(0, 16)}…` }).replace(/,"/g, ', "');
  return `<dl>
      <div><dt>Aparato</dt><dd>ESP32-C3 + HC-SR04 · ${esc(info.corto)}, ${esc(info.nombre)}</dd></div>
      <div><dt>Valor</dt><dd>${esc(String(j.valor))} %</dd></div>
      <div><dt>Hora</dt><dd>${esc(String(j.momento).replace('T', ' '))}</dd></div>
      <div><dt>Origen</dt><dd>${origen}</dd></div>
    </dl><code>${esc(json)}</code>`;
}

function columnasViaje() {
  const c = SUPUESTOS.envivo;
  const columnas = [
    {
      titulo: 'Recorrido',
      items: [`ESP32 → Wi-Fi → ${new URL(c.url.replace(/^wss?:/, 'https:')).hostname}`, `Tema ${SUPUESTOS.receptor.temaBase}/<id>`, `El gemelo se suscribe a ${c.suscripcion}`],
    },
  ];
  if (PRESENTACION.correccionesMomento2.length) columnas.push({ titulo: 'Corregido desde el Momento 2', items: PRESENTACION.correccionesMomento2 });
  return columnas;
}

function columnasGuardar() {
  const r = SUPUESTOS.receptor;
  return [
    { titulo: 'Dónde se guarda', items: ['En el gemelo, en la memoria del navegador: último valor válido, historial y registro de eventos.'] },
    { titulo: 'Límite', items: [`≥ ${r.umbralBajo} % normal`, `${r.umbralVacio}–${r.umbralBajo - 1} % bajo`, `< ${r.umbralVacio} % vacío`] },
    { titulo: 'Estado seguro', items: [`${r.latidosSinDato} latidos sin mensaje = «sin dato», nunca 0 %.`] },
  ];
}

function columnasDecision(sim) {
  const l = sim.receptor.listaAseo(sim.ahora);
  const lista = (arr, conValor) =>
    arr
      .slice(0, 4)
      .map((s) => (conValor && s.valor !== null ? `${corto(s.id)} (${s.valor} %)` : corto(s.id)))
      .join(', ');
  const items = [];
  if (l.recargar.length) items.push(`Recargar: ${lista(l.recargar, true)}`);
  if (l.revisar.length) items.push(`Revisar: ${lista(l.revisar)}`);
  if (l.sinDato.length) items.push(`Sin dato: ${lista(l.sinDato)}`);
  if (!items.length) items.push('Nada pendiente: los 12 están en normal.');
  const p = sim.aseo.personal[0];
  return [
    { titulo: 'Lista de aseo ahora', items },
    { titulo: 'Qué hace aseo ahora', items: [p ? p.texto : 'Sin personal en turno.'] },
  ];
}

// Paso 6: en vivo, algo tapa el sensor (obstrucción) y empieza a medir un nivel imposible.
function textoFalla(ctx) {
  const id = ID_FALLA;
  const c = corto(id);
  const s = ctx.sim.receptor.estadoDe(id, ctx.sim.ahora);
  const rechazado = s.rechazados > ctx.rechazadosAntes && s.ultimoResultado?.regla === 'R6';
  if (!rechazado) return `Prueba en vivo: algo tapa el sensor de ${c} y empieza a medir un nivel imposible.`;
  let medido = '';
  try {
    medido = ` ${JSON.parse(s.ultimaCarga).valor} %`;
  } catch {
    // Sin carga legible: se omite el valor.
  }
  const valor = s.valor === null ? 'sin dato' : `${s.valor} %`;
  return `El sensor de ${c} marcó${medido}, un nivel imposible: R6 lo rechaza. ${c} queda en «revisar» y aseo sigue usando su último valor válido, ${valor}.`;
}

// Escenas del recorrido, una por paso del Momento 3. camara(s, ctx) recibe los segundos desde que empezó.
const P = PRESENTACION.pasos;
const ESCENAS = [
  {
    paso: P.idea,
    dur: 16,
    vista: () => ({ piso: null, separar: false }),
    // El objetivo va bajo: así el edificio queda en la franja libre entre la cabecera y la narración.
    camara: (s) => ({ pos: orbita(v3(0, 6, 0), 82, 24, A0 + s * 0.05), target: v3(0, 6, 0) }),
    columnas: () => P.idea.columnas,
  },
  {
    paso: P.dato,
    dur: 17,
    vista: () => ({ piso: infoDispensador(ID_DATO).piso, separar: false }),
    foco: () => ID_DATO,
    camara: (s, ctx) => deCerca(ID_DATO, s, ctx, { radio: 5, alto: 1.9, bajar: 0.25 }),
    ficha: fichaDato,
  },
  {
    paso: P.viaje,
    clave: 'mqtt', // solo en esta escena se ve la etiqueta del broker
    dur: 16,
    vista: () => ({ piso: null, separar: false }),
    camara: (s, ctx) => {
      const b = ctx.escena.posicionBroker(v3(0, 0, 0));
      const target = b.clone().add(v3(0, -4.5, 0));
      return { pos: orbita(b, 30, 2.5, A0 - 0.35 + s * 0.04), target };
    },
    columnas: columnasViaje,
  },
  {
    paso: P.guardar,
    dur: 16,
    preparar: (ctx) => (ctx.critico = masCritico(ctx.sim)),
    vista: (ctx) => ({ piso: infoDispensador(ctx.critico).piso, separar: false }),
    camara: (s, ctx) => {
      const c = v3(0, ctx.escena.yBase(infoDispensador(ctx.critico).piso) - 2.5, -0.5);
      return { pos: orbita(c, 22, 27, A0 + 0.35 * Math.sin(s * 0.2)), target: c };
    },
    columnas: columnasGuardar,
  },
  {
    paso: P.decision,
    dur: 16,
    preparar: (ctx) => (ctx.pisoAseo = pisoAseo(ctx.sim)),
    vista: (ctx) => ({ piso: ctx.pisoAseo, separar: false }),
    camara: (s, ctx) => {
      const n = pisoAseo(ctx.sim);
      if (n !== ctx.pisoAseo) {
        ctx.pisoAseo = n;
        ctx.escena.setVista({ piso: n, separar: false, mover: false });
      }
      const t = ctx.escena.posicionAseo(0) ?? v3(0, ctx.escena.yBase(n), 0);
      t.y -= 1;
      return { pos: orbita(t, 12, 9, A0 + s * 0.07), target: t, rapidez: 1.4 };
    },
    columnas: (ctx) => columnasDecision(ctx.sim),
  },
  {
    paso: P.falla,
    dur: 20,
    vista: () => ({ piso: infoDispensador(ID_FALLA).piso, separar: false }),
    foco: () => ID_FALLA,
    alEntrar: (ctx) => {
      const d = ctx.sim.dispensador(ID_FALLA).dispositivo;
      ctx.fallaPrevia = d.fallas.obstruccion;
      ctx.rechazadosAntes = ctx.sim.receptor.estadoDe(ID_FALLA, ctx.sim.ahora).rechazados;
      ctx.sim.setFalla(ID_FALLA, 'obstruccion', true);
    },
    // Al salir de la escena el sensor vuelve a medir bien (si la falla no estaba puesta de antes).
    alSalir: (ctx) => {
      if (!ctx.fallaPrevia) ctx.sim.setFalla(ID_FALLA, 'obstruccion', false);
    },
    camara: (s, ctx) => deCerca(ID_FALLA, s, ctx),
    texto: textoFalla,
    columnas: () => P.falla.columnas,
  },
  {
    paso: P.seguridad,
    dur: 22,
    vista: () => ({ piso: null, separar: false }),
    camara: (s) => ({ pos: orbita(v3(0, 3, 2), 84, 26, A0 + Math.PI - 0.5 + s * 0.04), target: v3(0, 3, 2) }),
    columnas: () => P.seguridad.columnas,
    ficha: () => (PRESENTACION.enlace ? `<p class="hud-enlace">${esc(PRESENTACION.enlace)}</p>` : ''),
  },
];

export class Presentacion {
  constructor(app) {
    this.app = app;
    this.activa = false;
    this.pausa = false;
    this.indice = 0;
    this.reloj = 0;
    this.ctx = {};
    this.crearHud();
    this.alTecla = (ev) => this.tecla(ev);
    document.addEventListener('fullscreenchange', () => {
      if (!document.fullscreenElement && this.pantallaCompleta && this.activa) this.salir();
      this.pantallaCompleta = !!document.fullscreenElement;
    });
  }

  crearHud() {
    const hud = (this.hud = document.createElement('div'));
    hud.className = 'hud';
    hud.hidden = true;
    const filas = [];
    for (let n = PISOS; n >= 1; n--) {
      const celdas = DISPENSADORES.filter((d) => d.piso === n)
        .map(
          (d) => `<button type="button" class="hud-celda" data-id="${d.id}" title="${d.nombre}">
            <span class="c-id">${d.corto}<small>${d.genero === 'mujeres' ? 'M' : 'H'}</small></span>
            <span class="c-barra"><i></i></span><span class="c-val">—</span></button>`,
        )
        .join('');
      filas.push(`<div class="hud-fila"><span class="hud-piso">P${n}</span>${celdas}</div>`);
    }
    hud.innerHTML = `
      <header class="hud-cabecera">
        <div class="hud-marca">${ICONO}<div><h1>Gemelo digital · Bloque B</h1><p>Monitoreo IoT del nivel de jabón · Ingeniería de Sistemas UCC</p></div></div>
        <div class="hud-kpis" id="hud-kpis"></div>
        <div class="hud-reloj">
          <span class="hud-modo"><i></i><b id="hud-modo">Simulación</b></span>
          <strong id="hud-hora">06:00</strong><span id="hud-dia"></span>
        </div>
      </header>
      <aside class="hud-tablero hud-caja">
        <h2>Dispensadores <span id="hud-enlinea"></span></h2>
        <div class="hud-rejilla">${filas.join('')}</div>
        <div class="hud-conteo" id="hud-conteo"></div>
      </aside>
      <aside class="hud-eventos hud-caja">
        <h2>Eventos del receptor</h2>
        <div class="hud-mensajes"><div><b id="hud-ok">0</b><span>aceptados</span></div><div class="mal"><b id="hud-mal">0</b><span>rechazados</span></div></div>
        <ol id="hud-lista"></ol>
      </aside>
      <section class="hud-relato" aria-live="polite">
        <span class="hud-paso" id="hud-paso"></span>
        <h2 id="hud-titulo"></h2>
        <p id="hud-texto"></p>
        <div class="hud-columnas" id="hud-columnas"></div>
        <div class="hud-ficha" id="hud-ficha"></div>
        <div class="hud-progreso"><i id="hud-barra"></i></div>
      </section>
      <div class="hud-controles">
        <button type="button" data-accion="anterior" aria-label="Escena anterior"><svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg></button>
        <button type="button" data-accion="pausa" aria-label="Pausar recorrido"><svg class="i-pausa" viewBox="0 0 24 24"><path d="M9 6v12M15 6v12"/></svg><svg class="i-play" viewBox="0 0 24 24"><path d="M8 5l11 7-11 7z"/></svg></button>
        <button type="button" data-accion="siguiente" aria-label="Escena siguiente"><svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg></button>
        <button type="button" data-accion="salir" aria-label="Salir de la presentación"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button>
        <span class="hud-teclas"><kbd>◀</kbd><kbd>▶</kbd> escenas <kbd>Espacio</kbd> pausa <kbd>Esc</kbd> salir</span>
      </div>
      <div class="hud-portada" id="hud-portada">
        ${ICONO}
        <h1>Gemelo digital</h1>
        <p>Bloque B · Nivel de jabón con IoT</p>
        <span>Internet de las Cosas · Ingeniería de Sistemas UCC</span>
      </div>`;
    document.querySelector('#vista').appendChild(hud);
    const $ = (s) => hud.querySelector(s);
    this.el = {
      kpis: $('#hud-kpis'), modo: $('#hud-modo'), hora: $('#hud-hora'), dia: $('#hud-dia'), enlinea: $('#hud-enlinea'),
      conteo: $('#hud-conteo'), ok: $('#hud-ok'), mal: $('#hud-mal'), lista: $('#hud-lista'), paso: $('#hud-paso'),
      titulo: $('#hud-titulo'), texto: $('#hud-texto'), barra: $('#hud-barra'), portada: $('#hud-portada'), relato: hud.querySelector('.hud-relato'),
      columnas: $('#hud-columnas'), ficha: $('#hud-ficha'),
    };
    this.celdas = new Map([...hud.querySelectorAll('.hud-celda')].map((b) => [b.dataset.id, b]));
    hud.addEventListener('click', (ev) => {
      const celda = ev.target.closest('.hud-celda');
      if (celda) this.app.abrirDetalle(celda.dataset.id);
      const accion = ev.target.closest('[data-accion]')?.dataset.accion;
      if (accion === 'anterior') this.ir(this.indice - 1);
      if (accion === 'siguiente') this.ir(this.indice + 1);
      if (accion === 'pausa') this.alternarPausa();
      if (accion === 'salir') this.salir();
    });
    // Los controles se esconden si el mouse no se mueve, como en un reproductor de video.
    document.addEventListener('pointermove', () => {
      if (!this.activa) return;
      document.documentElement.classList.remove('quieto');
      clearTimeout(this.tQuieto);
      this.tQuieto = setTimeout(() => document.documentElement.classList.add('quieto'), 2600);
    });
  }

  get tieneCamara() {
    return typeof this.app.escena.setAuto === 'function';
  }

  // Más rápido de noche (edificio cerrado) para no aburrir al público.
  velocidad(sim) {
    return estaAbierto(sim.tVisual) ? 600 : 3600;
  }

  async entrar() {
    if (this.activa) return;
    const app = this.app;
    const escena = app.escena;
    this.activa = true;
    this.pausa = false;
    this.ultimoTick = performance.now();
    this.reloj = -PORTADA_S;
    this.indice = 0;
    this.ctx = { app, escena, sim: app.sim };
    this.previo = { tema: app.tema };
    app.cerrarDetalle();
    document.documentElement.classList.add('presentando');
    this.hud.hidden = false;
    this.hud.classList.remove('pausado');
    this.el.portada.classList.add('visible');
    clearTimeout(this.tPortada);
    this.tPortada = setTimeout(() => this.el.portada.classList.remove('visible'), PORTADA_S * 1000 - 900);
    app.setTema('oscuro', false);
    document.addEventListener('keydown', this.alTecla);
    try {
      await document.documentElement.requestFullscreen?.({ navigationUI: 'hide' });
    } catch {
      // Sin permiso para pantalla completa: la presentación sigue dentro de la ventana.
    }
    if (!this.activa) return; // salió mientras se pedía la pantalla completa
    if (this.tieneCamara) {
      escena.setVista({ piso: null, separar: false, mover: false });
      escena.iniciarIntro();
      escena.setEscaner(9, 0.65);
      escena.setAuto((t) => this.camara(t));
    }
    this.aplicar(0);
    this.reloj = -PORTADA_S;
    this.ultimoTick = performance.now();
    this.pintar(app.sim);
  }

  salir() {
    if (!this.activa) return;
    const app = this.app;
    const escena = app.escena;
    this.activa = false;
    if (this.escenaActiva) ESCENAS[this.indice].alSalir?.(this.ctx);
    this.escenaActiva = false;
    clearTimeout(this.tPortada);
    this.el.portada.classList.remove('visible');
    document.removeEventListener('keydown', this.alTecla);
    document.documentElement.classList.remove('presentando', 'quieto');
    delete document.documentElement.dataset.escena;
    this.hud.hidden = true;
    if (this.tieneCamara) {
      escena.setAuto(null);
      escena.setEscaner(16, 0.45);
    }
    escena.seleccionar(app.detalle.id ?? null);
    app.setTema(this.previo.tema, false);
    app.marcarPiso(null);
    document.querySelector('#btn-separar').setAttribute('aria-pressed', 'false');
    escena.vistaInicial();
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }

  tecla(ev) {
    if (ev.target.closest?.('input, select, textarea')) return;
    const acciones = {
      Escape: () => this.salir(),
      ArrowRight: () => this.ir(this.indice + 1),
      ArrowLeft: () => this.ir(this.indice - 1),
      ' ': () => this.alternarPausa(),
    };
    const fn = acciones[ev.key];
    if (fn) {
      ev.preventDefault();
      fn();
    }
  }

  alternarPausa() {
    this.pausa = !this.pausa;
    this.hud.classList.toggle('pausado', this.pausa);
    this.hud.querySelector('[data-accion="pausa"]').setAttribute('aria-label', this.pausa ? 'Seguir el recorrido' : 'Pausar recorrido');
  }

  ir(i) {
    this.aplicar((i + ESCENAS.length) % ESCENAS.length);
    this.reloj = 0;
  }

  aplicar(i) {
    const ctx = this.ctx;
    ctx.sim = this.app.sim;
    if (this.escenaActiva) ESCENAS[this.indice].alSalir?.(ctx);
    this.escenaActiva = true;
    if (i === 0) ctx.critico = null;
    this.indice = i;
    const e = ESCENAS[i];
    e.preparar?.(ctx);
    e.alEntrar?.(ctx);
    if (this.tieneCamara) {
      ctx.escena.setVista({ ...e.vista(ctx), mover: false });
      ctx.escena.seleccionar(e.foco?.(ctx) ?? this.app.detalle.id ?? null);
    }
    this.foco = e.foco?.(ctx) ?? null;
    document.documentElement.dataset.escena = e.clave ?? '';
    this.el.paso.textContent = `Paso ${i + 1} de ${ESCENAS.length}`;
    this.el.titulo.textContent = e.paso.titulo;
    this.pintarRelato(e);
    // Reinicia la animación de entrada del texto.
    this.el.relato.classList.remove('entra');
    void this.el.relato.offsetWidth;
    this.el.relato.classList.add('entra');
  }

  // Texto, columnas y ficha de la escena; las partes con datos del momento se refrescan en cada pintar().
  pintarRelato(e) {
    const ctx = this.ctx;
    poner(this.el.texto, e.texto?.(ctx) ?? e.paso.texto ?? '');
    const columnas = e.columnas?.(ctx) ?? [];
    const html = columnas
      .map((c) => `<div><h3>${esc(c.titulo)}</h3><ul>${c.items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>`)
      .join('');
    if (this.el.columnas.dataset.html !== html) {
      this.el.columnas.innerHTML = html;
      this.el.columnas.dataset.html = html;
      this.el.columnas.dataset.n = String(columnas.length);
    }
    const ficha = e.ficha?.(ctx) ?? '';
    if (this.el.ficha.dataset.html !== ficha) {
      this.el.ficha.innerHTML = ficha;
      this.el.ficha.dataset.html = ficha;
    }
    this.el.relato.classList.toggle('ancho', columnas.length > 1);
  }

  // Segundos desde que empezó la escena, con precisión de cuadro.
  segundosEscena() {
    return this.pausa ? this.reloj : this.reloj + Math.min(0.5, (performance.now() - this.ultimoTick) / 1000);
  }

  camara() {
    const e = ESCENAS[this.indice];
    this.ctx.sim = this.app.sim;
    return e.camara(Math.max(0, this.segundosEscena()), this.ctx);
  }

  // Lo llama la app cuatro veces por segundo.
  pintar(sim) {
    if (!this.activa) return;
    const ahora = performance.now();
    // Tope por llamada: si el equipo se traba un momento, la escena no se salta.
    if (!this.pausa) this.reloj += Math.min(0.5, (ahora - this.ultimoTick) / 1000);
    this.ultimoTick = ahora;
    this.ctx.sim = sim;
    const e = ESCENAS[this.indice];
    if (this.reloj >= e.dur) this.ir(this.indice + 1);
    transformar(this.el.barra, `scaleX(${Math.max(0, Math.min(1, this.reloj / ESCENAS[this.indice].dur)).toFixed(3)})`);
    this.pintarRelato(ESCENAS[this.indice]);

    const ms = sim.tVisual;
    poner(this.el.hora, hora(ms, false));
    poner(this.el.dia, fecha(ms));
    poner(this.el.modo, this.app.envivo ? 'En vivo · hora real' : `Simulación ×${this.velocidad(sim)}`);

    // Indicadores.
    const t = sim.totales();
    let aceptados = 0;
    let rechazados = sim.receptor.noAtribuidos ?? 0;
    for (const s of sim.receptor.estados.values()) {
      aceptados += s.aceptados;
      rechazados += s.rechazados;
    }
    const kpis = [
      ['Usos', numero(t.usos), ''],
      ['Usos sin jabón', numero(t.usosSinJabon), t.usosSinJabon > 0 ? 'alerta' : 'bien'],
      ['Recargas', numero(t.recargas), ''],
      ['Mensajes validados', numero(aceptados + rechazados), ''],
    ];
    const htmlKpis = kpis.map(([n, val, c]) => `<div class="hud-kpi ${c}"><b>${val}</b><span>${n}</span></div>`).join('');
    if (this.el.kpis.dataset.html !== htmlKpis) {
      this.el.kpis.innerHTML = htmlKpis;
      this.el.kpis.dataset.html = htmlKpis;
    }
    poner(this.el.ok, numero(aceptados));
    poner(this.el.mal, numero(rechazados));

    // Tablero de dispensadores.
    const cuenta = { normal: 0, bajo: 0, vacio: 0, sin_dato: 0, esperando: 0 };
    let enLinea = 0;
    for (const [id, b] of this.celdas) {
      const s = sim.receptor.estadoDe(id, sim.ahora);
      cuenta[s.estado]++;
      if (s.vivo) enLinea++;
      const sinValor = s.estado === 'sin_dato' || s.estado === 'esperando';
      b.dataset.estado = s.estado;
      b.classList.toggle('revisar', s.revisar);
      b.classList.toggle('foco', id === this.foco);
      transformar(b.querySelector('.c-barra i'), `scaleX(${(sinValor ? 0 : s.valor ?? 0) / 100})`);
      poner(b.querySelector('.c-val'), sinValor ? '—' : `${s.valor}%`);
    }
    poner(this.el.enlinea, `${enLinea}/12 en línea`);
    const chips = [
      ['normal', 'Normal'],
      ['bajo', 'Bajo'],
      ['vacio', 'Vacío'],
      ['sin_dato', 'Sin dato'],
    ];
    const htmlConteo = chips.map(([k, n]) => `<span data-estado="${k}"><i></i>${cuenta[k] + (k === 'sin_dato' ? cuenta.esperando : 0)} ${n}</span>`).join('');
    if (this.el.conteo.dataset.html !== htmlConteo) {
      this.el.conteo.innerHTML = htmlConteo;
      this.el.conteo.dataset.html = htmlConteo;
    }

    // Últimos eventos que vale la pena contar (sin los aceptados, que son la mayoría).
    // Solo se anima la entrada de los nuevos.
    const eventos = sim.receptor.eventos;
    const elegidos = [];
    for (let i = eventos.length - 1; i >= 0 && elegidos.length < 5; i--) if (eventos[i].tipo !== 'ok') elegidos.push(eventos[i]);
    const clave = elegidos.map((ev) => ev.n).join(',');
    if (this.el.lista.dataset.clave !== clave) {
      const visto = Number(this.el.lista.dataset.max ?? 0);
      this.el.lista.dataset.clave = clave;
      this.el.lista.dataset.max = String(elegidos[0]?.n ?? visto);
      this.el.lista.innerHTML = elegidos.length
        ? elegidos
            .map((ev) => {
              const texto = corto(ev.texto);
              const nuevo = ev.n > visto ? ' nuevo' : '';
              return `<li class="${ev.tipo}${nuevo}"><time>${hora(ev.ms, false)}</time><span>${esc(texto.length > 92 ? `${texto.slice(0, 90)}…` : texto)}</span></li>`;
            })
            .join('')
        : '<li class="nada"><span>Sin novedades: todos los mensajes pasan las 8 reglas.</span></li>';
    }
  }
}
