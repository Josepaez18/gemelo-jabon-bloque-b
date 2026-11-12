// Panel de detalle de un baño: estado del receptor, nivel real, historial, fallas y acciones.
import { temaDe } from '../modelo/contrato.js';
import { FALLAS } from '../modelo/dispositivo.js';
import { infoDispensador } from '../modelo/edificio.js';
import { NOMBRE_ESTADO } from '../modelo/receptor.js';
import { diaHora, duracion, esc, hace, hora, numero } from './formato.js';
import { graficaNivel } from './graficas.js';

const $ = (s, raiz = document) => raiz.querySelector(s);

export class Detalle {
  constructor({ alCerrar, alFalla, alConfirmar, alRevisado }) {
    this.el = $('#detalle');
    this.cuerpo = $('#det-cuerpo');
    this.id = null;
    this.alFalla = alFalla;
    this.alConfirmar = alConfirmar;
    this.alRevisado = alRevisado;
    $('#det-cerrar').addEventListener('click', () => alCerrar());
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && this.id && !document.querySelector('dialog[open]')) alCerrar();
    });
    this.ultimoGrafico = 0;
  }

  abrir(id, sim) {
    this.id = id;
    const info = infoDispensador(id);
    $('#det-sup').textContent = id;
    $('#det-titulo').textContent = info.nombre;
    this.cuerpo.innerHTML = `
      <div class="grande">
        <div class="mini-medidor" aria-hidden="true"><i class="r"></i><i class="u"></i></div>
        <span class="numero" id="det-numero"></span>
        <div class="chips" id="det-chips"></div>
      </div>
      <div class="tarjeta" id="det-acciones" hidden>
        <h2>Acciones en el receptor</h2>
        <p>Este baño muestra lo que manda el ESP32 de Wokwi. Confirma la recarga antes de subir el nivel en Wokwi, o R7 la rechaza.</p>
        <div class="acciones">
          <button type="button" class="btn primario" id="det-confirmar">Confirmar recarga</button>
          <button type="button" class="btn" id="det-revisado">Marcar revisado</button>
        </div>
      </div>
      <dl class="datos" id="det-datos"></dl>
      <div class="tarjeta">
        <h2 id="det-titulo-grafica">Historial</h2>
        <div class="leyenda-grafica" id="det-leyenda"></div>
        <div class="grafica" id="det-grafica"></div>
      </div>
      <div class="tarjeta">
        <h2>Fallas simuladas</h2>
        <div class="fallas" id="det-fallas">
          ${Object.entries(FALLAS)
            .map(
              ([clave, f]) => `<label class="interruptor">
                <input type="checkbox" data-falla="${clave}" />
                <span>${f.nombre}</span>
                <span class="regla">${f.regla}</span>
              </label>`,
            )
            .join('')}
        </div>
        <p class="nota" id="det-nota-fallas">Las fallas cambian lo que mide o envía este ESP32. El receptor no lo sabe: solo ve los mensajes.</p>
      </div>
      <div class="tarjeta">
        <h2>Indicadores de este baño</h2>
        <dl class="datos" id="det-ind"></dl>
      </div>
      <div class="tarjeta">
        <h2>Último mensaje auténtico</h2>
        <pre class="json" id="det-json"></pre>
      </div>
      <div class="tarjeta">
        <h2>Eventos de este baño</h2>
        <ul class="mini-registro" id="det-eventos"></ul>
      </div>`;
    this.cuerpo.querySelectorAll('[data-falla]').forEach((cb) =>
      cb.addEventListener('change', () => this.alFalla(this.id, cb.dataset.falla, cb.checked)),
    );
    $('#det-confirmar', this.cuerpo).addEventListener('click', () => this.alConfirmar(this.id));
    $('#det-revisado', this.cuerpo).addEventListener('click', () => this.alRevisado(this.id));
    this.el.hidden = false;
    this.ultimoGrafico = 0;
    this.actualizar(sim, true);
  }

  cerrar() {
    this.id = null;
    this.el.hidden = true;
    this.cuerpo.innerHTML = '';
  }

  actualizar(sim, forzar = false) {
    if (!this.id) return;
    const id = this.id;
    const ahora = sim.ahora;
    const s = sim.receptor.estadoDe(id, ahora);
    const d = sim.dispensador(id);
    const enVivo = id === sim.idEnVivo;
    const c = this.cuerpo;

    const mini = $('.mini-medidor', c);
    mini.style.setProperty('--c', `var(--${s.estado === 'sin_dato' ? 'sin-dato' : s.estado})`);
    $('.r', mini).style.height = `${s.valor ?? 0}%`;
    $('#det-numero', c).textContent = s.valor === null ? '—' : `${s.valor} %`;
    let chips = `<span class="chip-estado" data-estado="${s.estado}">${NOMBRE_ESTADO[s.estado]}</span>`;
    if (s.revisar) chips += '<span class="chip-estado" data-estado="revisar">⚠ revisar</span>';
    if (enVivo) chips += '<span class="chip-estado" data-estado="envivo">en vivo · Wokwi</span>';
    if (s.recargaConfirmada) chips += '<span class="chip-estado">recarga confirmada</span>';
    const elChips = $('#det-chips', c);
    if (elChips.innerHTML !== chips) elChips.innerHTML = chips;

    $('#det-acciones', c).hidden = !enVivo;

    const res = s.ultimoResultado;
    const resultado = !res ? '—' : res.aceptado ? `ACEPTADO · ${hace(res.ms, ahora)}` : `RECHAZADO · ${hace(res.ms, ahora)}`;
    const filas = [
      ['Último válido (receptor)', s.valor === null ? '—' : `${s.valor} % · ${hace(s.ultimoValidoMs, ahora)}`],
      ['Nivel real', enVivo ? 'lo mide el ESP32 de Wokwi' : `${numero(sim.nivelReal(d), 1)} % · ${numero(d.ml)} ml`],
      ['Última lectura del ESP32', enVivo ? '—' : d.dispositivo.fallas.sinEnergia ? 'sin energía' : `${d.dispositivo.ultimaLectura ?? '—'} %`],
      ['Último mensaje auténtico', resultado],
      ...(res && !res.aceptado && res.detalle !== s.motivoRevisar ? [['Motivo', res.detalle]] : []),
      ['Revisar', s.revisar ? `sí: ${s.motivoRevisar}` : 'no'],
      ['Mensajes', `${s.aceptados} aceptados · ${s.rechazados} rechazados`],
      ['Sin dato tras', duracion(s.sinDatoMs)],
      ['Recarga confirmada', s.recargaConfirmada ? `sí, hasta ${hora(s.recargaHastaMs)}` : 'no'],
      ['Tema MQTT', temaDe(id)],
    ];
    const htmlDatos = filas.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('');
    const elDatos = $('#det-datos', c);
    if (elDatos.innerHTML !== htmlDatos) elDatos.innerHTML = htmlDatos;

    const ind = d.ind;
    const htmlInd = enVivo
      ? '<dt>En vivo</dt><dd>los usos de este baño no se simulan</dd>'
      : [
          ['Usos', numero(ind.usos)],
          ['Usos sin jabón', numero(ind.usosSinJabon)],
          ['Horas sin jabón', numero(ind.segundosSinJabon / 3600, 1)],
          ['Visitas de aseo', `${ind.visitas} (${ind.visitasInnecesarias} innecesarias)`],
          ['Recargas', numero(ind.recargas)],
        ].map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
    const elInd = $('#det-ind', c);
    if (elInd.innerHTML !== htmlInd) elInd.innerHTML = htmlInd;

    // Fallas: reflejan el dispositivo; en vivo se simulan en Wokwi, no aquí.
    c.querySelectorAll('[data-falla]').forEach((cb) => {
      cb.disabled = enVivo;
      if (document.activeElement !== cb) cb.checked = !enVivo && d.dispositivo.fallas[cb.dataset.falla];
    });
    $('#det-nota-fallas', c).textContent = enVivo
      ? 'En vivo las fallas se provocan en Wokwi (por ejemplo, moviendo la distancia del HC-SR04).'
      : 'Las fallas cambian lo que mide o envía este ESP32. El receptor no lo sabe: solo ve los mensajes.';

    const json = $('#det-json', c);
    const textoJson = s.ultimaCarga ?? 'Todavía no llega un mensaje auténtico.';
    if (json.textContent !== textoJson) json.textContent = textoJson;

    const eventos = sim.receptor.eventos.filter((e) => e.id === id).slice(-10).reverse();
    const htmlEv = eventos.length
      ? eventos.map((e) => `<li class="${e.tipo}">${diaHora(e.ms)} ${esc(e.texto)}</li>`).join('')
      : '<li>Sin eventos todavía.</li>';
    const elEv = $('#det-eventos', c);
    if (elEv.innerHTML !== htmlEv) elEv.innerHTML = htmlEv;

    // La gráfica se redibuja como mucho una vez por segundo.
    const t = performance.now();
    if (forzar || t - this.ultimoGrafico > 1000) {
      this.ultimoGrafico = t;
      this.pintarGrafica(sim, id, enVivo);
    }
  }

  pintarGrafica(sim, id, enVivo) {
    const c = this.cuerpo;
    const ventana = sim.idEnVivo ? 30 * 60000 : 24 * 3600000;
    const hasta = sim.tVisual;
    const desde = hasta - ventana;
    const e = sim.receptor.estados.get(id);
    const d = sim.dispensador(id);
    const series = [];
    if (!enVivo) {
      const real = [...d.historialReal, { ms: sim.ahora, v: sim.nivelReal(d) }];
      series.push({ nombre: 'Nivel real (simulado)', clase: 'serie-1', puntos: real, escalon: false });
    }
    series.push({ nombre: 'Último válido (receptor)', clase: 'serie-2', puntos: e.historial, escalon: true, hastaMs: hasta });
    $('#det-titulo-grafica', c).textContent = sim.idEnVivo ? 'Historial · últimos 30 min' : 'Historial · últimas 24 h';
    $('#det-leyenda', c).innerHTML =
      series.map((s) => `<span><i class="${s.clase}"></i>${s.nombre}</span>`).join('') + '<span><i class="umbral"></i>Umbral 30 %</span>';
    graficaNivel($('#det-grafica', c), {
      series,
      desde,
      hasta,
      formatoTiempo: (ms, largo) => (largo ? diaHora(ms) : hora(ms, false)),
    });
  }
}
