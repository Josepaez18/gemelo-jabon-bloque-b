// Interfaz: une la simulación (modelo), la escena 3D y el modo en vivo.
import { ESTRATEGIAS, SUPUESTOS } from '../config/supuestos.js';
import { conectar } from '../envivo/mqtt.js';
import { Escena } from '../escena/escena.js';
import { estaAbierto } from '../modelo/afluencia.js';
import { infoDispensador } from '../modelo/edificio.js';
import { CADA_MS, CANAL, instantanea } from '../modelo/panel.js';
import { Simulacion } from '../modelo/simulacion.js';
import { Comparador } from './comparar.js';
import { Detalle } from './detalle.js';
import { Presentacion } from './presentacion.js';
import { Vista2D } from './vista2d.js';
import { esc, fecha, hace, hora } from './formato.js';
import * as paneles from './paneles.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

export class App {
  constructor() {
    this.velocidad = 60;
    this.semilla = SUPUESTOS.semilla;
    this.estrategia = 'sensores';
    this.filtro = 'todo';
    this.pestana = 'resumen';
    this.envivo = null;
    this.sim = this.crearSim();

    const alSeleccionar = (id) => this.abrirDetalle(id);
    try {
      this.escena = new Escena($('#vista'), { alSeleccionar });
    } catch (error) {
      // Sin WebGL (aceleración por hardware apagada, driver bloqueado…): todo sigue, menos el 3D.
      console.error(error);
      this.escena = new Vista2D($('#vista'), { alSeleccionar, error });
    }
    this.detalle = new Detalle({
      alCerrar: () => this.cerrarDetalle(),
      alFalla: (id, falla, activa) => this.sim.setFalla(id, falla, activa),
      alConfirmar: (id) => this.sim.receptor.confirmarRecarga(id, Date.now()),
      alRevisado: (id) => this.sim.receptor.marcarRevisado(id, Date.now(), true),
    });
    this.comparador = new Comparador();
    this.presentacion = new Presentacion(this);

    this.iniciarTema();
    this.iniciarControles();
    this.medirBarra();
    paneles.pintarSupuestos();
    if (SUPUESTOS.modeloGlb) this.cargarGlb(SUPUESTOS.modeloGlb);

    this.ultimo = performance.now();
    this.ultimoPanel = 0;
    this.iniciarPanel();
    requestAnimationFrame((t) => this.cuadro(t));
  }

  // --- Panel de control (panel.html, en otra pestaña) -----------------------------

  // El gemelo publica una foto del estado dos veces por segundo. Con la pestaña oculta el
  // navegador pausa las animaciones, así que un worker marca el paso y la simulación no se detiene.
  iniciarPanel() {
    this.ultimaFoto = 0;
    this.ultimoOculto = performance.now();
    try {
      this.canal = new BroadcastChannel(CANAL);
      this.canal.onmessage = (ev) => {
        if (ev.data?.tipo === 'hola') this.publicarFoto(true);
      };
      const latido = new Worker(new URL('./latido.worker.js', import.meta.url), { type: 'module' });
      latido.onmessage = () => this.tic();
    } catch (err) {
      // Navegador sin BroadcastChannel o sin workers: el gemelo funciona igual, sin panel aparte.
      console.warn('Panel de control no disponible:', err);
    }
  }

  tic() {
    const t = performance.now();
    const dt = Math.min(1.5, Math.max(0, (t - this.ultimoOculto) / 1000));
    this.ultimoOculto = t;
    if (!document.hidden) return;
    if (this.envivo) this.sim.avanzarHasta(Date.now());
    else if (this.velocidad > 0) this.sim.avanzar(dt * this.velocidad);
    this.sim.vaciarEventos(); // nadie los dibuja mientras la pestaña está oculta
    this.publicarFoto(true);
  }

  publicarFoto(ya = false) {
    if (!this.canal) return;
    const t = performance.now();
    if (!ya && t - this.ultimaFoto < CADA_MS) return;
    this.ultimaFoto = t;
    this.canal.postMessage({ tipo: 'foto', foto: instantanea(this.sim, { envivo: this.envivo, velocidad: this.envivo ? 1 : this.velocidad }) });
  }

  crearSim() {
    return new Simulacion({ semilla: this.semilla, estrategia: this.estrategia });
  }

  // --- Bucle principal ----------------------------------------------------------

  cuadro(t) {
    // El siguiente cuadro se pide primero: un error en este no congela la página.
    requestAnimationFrame((tt) => this.cuadro(tt));
    const dt = Math.min(0.1, Math.max(0, (t - this.ultimo) / 1000));
    this.ultimo = t;
    try {
      const vel = this.envivo ? 1 : this.presentacion.activa ? this.presentacion.velocidad(this.sim) : this.velocidad;
      if (this.envivo) this.sim.avanzarHasta(Date.now());
      else if (vel > 0) this.sim.avanzar(dt * vel);
      const eventos = this.sim.vaciarEventos();
      this.escena.cuadro(this.sim, dt, vel, eventos);
      if (t - this.ultimoPanel > 250) {
        this.ultimoPanel = t;
        this.actualizarPaneles();
      }
    } catch (err) {
      if (!this.errorReportado) {
        this.errorReportado = true;
        setTimeout(() => {
          throw err;
        });
      }
    }
  }

  actualizarPaneles() {
    const sim = this.sim;
    const ms = sim.tVisual;
    $('#reloj-dia').textContent = fecha(ms);
    $('#reloj-hora').textContent = hora(ms);
    const abierto = estaAbierto(ms);
    const chip = $('#reloj-abierto');
    chip.textContent = this.envivo ? 'Hora real' : abierto ? 'Abierto' : 'Cerrado';
    chip.className = `chip${this.envivo ? ' envivo' : abierto ? ' abierto' : ''}`;

    paneles.pintarListaAseo(sim);
    if (this.pestana === 'resumen') {
      paneles.pintarIndicadores(sim);
      paneles.pintarPersonal(sim);
      this.pintarEnVivo();
    }
    if (this.pestana === 'registro') paneles.pintarRegistro(sim, this.filtro);
    this.detalle.actualizar(sim);
    this.presentacion.pintar(sim);
    this.publicarFoto();
  }

  // --- Controles ----------------------------------------------------------------

  iniciarControles() {
    $$('#velocidades button').forEach((b) => b.addEventListener('click', () => this.setVelocidad(Number(b.dataset.vel))));

    const sel = $('#estrategia');
    sel.innerHTML = Object.entries(ESTRATEGIAS).map(([k, e]) => `<option value="${k}">${e.nombre}</option>`).join('');
    sel.value = this.estrategia;
    sel.addEventListener('change', () => {
      this.estrategia = sel.value;
      this.sim.setEstrategia(sel.value);
    });

    $('#btn-presentar').addEventListener('click', () => this.presentacion.entrar());
    $('#btn-envivo').addEventListener('click', () => this.alternarEnVivo());
    $('#btn-tema').addEventListener('click', () => this.setTema(this.tema === 'oscuro' ? 'claro' : 'oscuro', true));

    $$('#selector-piso button').forEach((b) =>
      b.addEventListener('click', () => {
        const piso = b.dataset.piso ? Number(b.dataset.piso) : null;
        this.marcarPiso(piso);
        this.escena.setVista({ piso });
      }),
    );
    $('#btn-separar').addEventListener('click', (ev) => {
      const si = ev.currentTarget.getAttribute('aria-pressed') !== 'true';
      ev.currentTarget.setAttribute('aria-pressed', String(si));
      this.escena.setVista({ separar: si });
    });
    $('#btn-ciclo').addEventListener('click', (ev) => {
      const si = ev.currentTarget.getAttribute('aria-pressed') !== 'true';
      ev.currentTarget.setAttribute('aria-pressed', String(si));
      ev.currentTarget.title = si ? 'La luz sigue la hora simulada' : 'Luz fija de media mañana';
      this.escena.setCiclo(si);
    });
    $('#btn-inicial').addEventListener('click', () => {
      this.marcarPiso(null);
      $('#btn-separar').setAttribute('aria-pressed', 'false');
      this.escena.vistaInicial();
    });

    const tabs = $$('.pestanas [role=tab]');
    tabs.forEach((tab, i) => {
      tab.addEventListener('click', () => this.setPestana(tab.id.slice(2)));
      tab.addEventListener('keydown', (ev) => {
        const d = ev.key === 'ArrowRight' ? 1 : ev.key === 'ArrowLeft' ? -1 : 0;
        if (!d) return;
        const otro = tabs[(i + d + tabs.length) % tabs.length];
        otro.focus();
        this.setPestana(otro.id.slice(2));
      });
    });

    $$('.chip-filtro').forEach((b) =>
      b.addEventListener('click', () => {
        this.filtro = b.dataset.filtro;
        $$('.chip-filtro').forEach((o) => o.setAttribute('aria-pressed', String(o === b)));
        paneles.pintarRegistro(this.sim, this.filtro);
      }),
    );

    $('#lista-aseo').addEventListener('click', (ev) => {
      const b = ev.target.closest('.item-aseo');
      if (b) this.abrirDetalle(b.dataset.id);
    });

    $('#btn-comparar').addEventListener('click', () => this.comparador.abrir(this.semilla));

    const semilla = $('#semilla');
    semilla.value = this.semilla;
    $('#btn-reiniciar').addEventListener('click', () => {
      const n = Number.parseInt(semilla.value, 10);
      this.semilla = Number.isFinite(n) ? n : SUPUESTOS.semilla;
      semilla.value = this.semilla;
      this.reiniciar();
    });

    $('#archivo-glb').addEventListener('change', (ev) => {
      const archivo = ev.target.files?.[0];
      if (archivo) this.cargarGlb(archivo);
    });
  }

  setVelocidad(v) {
    this.velocidad = v;
    $$('#velocidades button').forEach((b) => b.setAttribute('aria-pressed', String(Number(b.dataset.vel) === v)));
  }

  marcarPiso(piso) {
    $$('#selector-piso button').forEach((b) => b.setAttribute('aria-pressed', String((b.dataset.piso ? Number(b.dataset.piso) : null) === piso)));
  }

  setPestana(nombre) {
    this.pestana = nombre;
    $$('.pestanas [role=tab]').forEach((t) => {
      const si = t.id === `t-${nombre}`;
      t.setAttribute('aria-selected', String(si));
      t.tabIndex = si ? 0 : -1;
    });
    $$('.pagina').forEach((p) => (p.hidden = p.id !== `p-${nombre}`));
    if (nombre === 'supuestos') paneles.pintarAfluencia();
    this.actualizarPaneles();
  }

  reiniciar() {
    const vivo = !!this.envivo;
    if (vivo) this.detenerEnVivo();
    this.sim = this.crearSim();
    this.escena.limpiarPersonas();
    if (this.detalle.id) this.detalle.abrir(this.detalle.id, this.sim);
    if (vivo) this.alternarEnVivo();
  }

  abrirDetalle(id) {
    this.escena.seleccionar(id);
    this.detalle.abrir(id, this.sim);
  }

  cerrarDetalle() {
    this.escena.seleccionar(null);
    this.detalle.cerrar();
  }

  medirBarra() {
    const barra = $('.barra');
    const fijar = () => document.documentElement.style.setProperty('--alto-barra', `${barra.offsetHeight}px`);
    new ResizeObserver(fijar).observe(barra);
    fijar();
  }

  // --- Tema -----------------------------------------------------------------------

  iniciarTema() {
    const guardado = document.documentElement.dataset.theme;
    const oscuro = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
    this.setTema(guardado === 'claro' || guardado === 'oscuro' ? guardado : oscuro ? 'oscuro' : 'claro', false);
  }

  setTema(tema, guardar) {
    this.tema = tema;
    document.documentElement.dataset.theme = tema;
    $('#btn-tema').setAttribute('aria-label', tema === 'oscuro' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro');
    this.escena?.setTema(tema);
    if (guardar) {
      try {
        localStorage.setItem('gemelo-tema', tema);
      } catch {
        // Sin almacenamiento (modo privado): el tema dura lo que dure la página.
      }
    }
    if (this.pestana === 'supuestos') paneles.pintarAfluencia();
  }

  // --- Modelo .glb ------------------------------------------------------------------

  async cargarGlb(fuente) {
    const estado = $('#estado-glb');
    estado.textContent = 'Cargando modelo…';
    try {
      const r = await this.escena.cargarGlb(fuente);
      estado.textContent = r.separable
        ? `Modelo cargado: ${r.pisos} pisos reconocidos (piso-1 … piso-6).`
        : 'Modelo cargado. No trae nodos piso-1 … piso-6: la vista por piso y la vista explotada solo mueven medidores, personas y aseo.';
    } catch (err) {
      estado.textContent = `No se pudo cargar el modelo: ${err?.message ?? err}`;
    }
  }

  // --- Modo en vivo -----------------------------------------------------------------

  alternarEnVivo() {
    if (this.envivo) return this.detenerEnVivo();
    const c = SUPUESTOS.envivo;
    this.envivo = { estado: 'conectando', detalle: '', recibidos: 0, ignorados: 0, ultimo: null };
    this.sim.activarEnVivo(c.idEnVivo, SUPUESTOS.receptor.envivo, Date.now());
    this.escena.limpiarPersonas();
    this.envivo.conexion = conectar({
      url: c.url,
      suscripcion: c.suscripcion,
      alMensaje: (tema, carga) => this.mensajeEnVivo(tema, carga),
      alEstado: (e) => {
        if (!this.envivo) return;
        this.envivo.estado = e.tipo;
        this.envivo.detalle = e.detalle ?? '';
      },
    });
    $('#btn-envivo').setAttribute('aria-pressed', 'true');
    $$('#velocidades button').forEach((b) => (b.disabled = true));
    const info = infoDispensador(c.idEnVivo);
    const aviso = $('#aviso-envivo');
    aviso.hidden = false;
    aviso.innerHTML = `<b>En vivo:</b> ${info.corto} (${info.nombre}) muestra lo que publica el ESP32 de Wokwi. Reloj en hora real; sin dato a los ${SUPUESTOS.receptor.envivo.sinDatoS} s y confirmación de recarga de ${SUPUESTOS.receptor.envivo.confirmacionRecargaS / 60} min.`;
    this.abrirDetalle(c.idEnVivo);
  }

  esIgnorado(tema, carga) {
    const ids = SUPUESTOS.envivo.ignorar;
    if (ids.some((id) => tema === `${SUPUESTOS.receptor.temaBase}/${id}`)) return true;
    try {
      const d = JSON.parse(carga);
      return !!d && typeof d === 'object' && ids.includes(d.id);
    } catch {
      return false;
    }
  }

  mensajeEnVivo(tema, carga) {
    const ev = this.envivo;
    if (!ev) return;
    if (this.esIgnorado(tema, carga)) {
      ev.ignorados++;
      return;
    }
    ev.recibidos++;
    const ahora = Date.now();
    const r = this.sim.entregar(tema, carga, ahora, { envivo: true });
    ev.ultimo = { tema, carga, ms: ahora, r };
  }

  detenerEnVivo() {
    this.envivo?.conexion?.cerrar();
    this.envivo = null;
    this.sim.desactivarEnVivo();
    $('#btn-envivo').setAttribute('aria-pressed', 'false');
    $('#btn-envivo').classList.remove('conectado');
    $$('#velocidades button').forEach((b) => (b.disabled = false));
    $('#aviso-envivo').hidden = true;
    this.pintarEnVivo();
  }

  pintarEnVivo() {
    const ev = this.envivo;
    const c = SUPUESTOS.envivo;
    const estado = $('#estado-envivo');
    const datos = $('#datos-envivo');
    $('#btn-envivo').classList.toggle('conectado', ev?.estado === 'conectado');
    if (!ev) {
      estado.innerHTML = `Desconectado. Al conectar, <code>${c.idEnVivo}</code> deja de simularse y muestra lo que publica el ESP32 en <code>${c.suscripcion}</code>.`;
      datos.hidden = true;
      return;
    }
    const host = new URL(c.url.replace(/^wss?:/, 'https:')).hostname;
    const textos = {
      conectando: `Conectando a ${host}…`,
      conectado: `Conectado a ${host} · suscrito a ${c.suscripcion}`,
      desconectado: `Sin conexión con ${host}; se reintenta solo.`,
      error: `Error de conexión: ${ev.detalle}`,
    };
    estado.textContent = textos[ev.estado] ?? ev.estado;
    const u = ev.ultimo;
    const resultado = !u ? '—' : u.r.aceptado ? `ACEPTADO (${u.r.valor} %)` : `RECHAZADO: ${u.r.detalle}`;
    const html = `
      <dt>Recibidos</dt><dd>${ev.recibidos}</dd>
      <dt>Ignorados</dt><dd>${ev.ignorados} (${c.ignorar.join(', ')})</dd>
      <dt>Último</dt><dd>${u ? `${hace(u.ms, Date.now())} · ${esc(u.tema)}` : 'todavía nada'}</dd>
      <dt>Resultado</dt><dd>${esc(resultado)}</dd>
      ${u ? `<dt>Carga</dt><dd><code>${esc(u.carga.slice(0, 260))}</code></dd>` : ''}`;
    if (datos.dataset.html !== html) {
      datos.innerHTML = html;
      datos.dataset.html = html;
    }
    datos.hidden = false;
  }
}
