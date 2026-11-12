// Diálogo "Comparar 7 días": misma semilla, mismos usos, 3 estrategias.
import { compararEstrategias, inicioComparacion } from '../modelo/comparar.js';
import { INDICADORES } from '../modelo/simulacion.js';
import { diaHora, esc, numero } from './formato.js';

const DIAS = 7;
// Para estos indicadores, menos es mejor.
const MENOS_ES_MEJOR = new Set(['usosSinJabon', 'horasSinJabon', 'visitas', 'visitasInnecesarias']);

export class Comparador {
  constructor() {
    this.dlg = document.querySelector('#dlg-comparar');
    this.cuerpo = document.querySelector('#cmp-cuerpo');
    document.querySelector('#cmp-cerrar').addEventListener('click', () => this.dlg.close());
    this.dlg.addEventListener('click', (ev) => {
      if (ev.target === this.dlg) this.dlg.close();
    });
    this.trabajador = null;
  }

  async abrir(semilla) {
    this.dlg.showModal();
    this.cuerpo.innerHTML = `
      <p>Simulando 7 días (${DIAS * 24 * 360} pasos por estrategia) con la semilla <b>${semilla}</b>…</p>
      <div class="progreso" role="progressbar" aria-label="Avance"><i></i></div>`;
    const barra = this.cuerpo.querySelector('.progreso i');
    try {
      const resultados = await this.correr(semilla, (f) => (barra.style.width = `${Math.round(f * 100)}%`));
      this.pintar(resultados, semilla);
    } catch (err) {
      this.cuerpo.innerHTML = `<p>No se pudo completar la comparación: ${esc(err?.message ?? err)}</p>`;
    }
  }

  correr(semilla, alAvanzar) {
    this.trabajador?.terminate();
    try {
      const w = new Worker(new URL('./comparar.worker.js', import.meta.url), { type: 'module' });
      this.trabajador = w;
      return new Promise((ok, mal) => {
        w.onmessage = (ev) => {
          if (ev.data.tipo === 'progreso') alAvanzar(ev.data.f);
          else {
            ok(ev.data.resultados);
            w.terminate();
          }
        };
        w.onerror = (e) => {
          w.terminate();
          mal(e);
        };
        w.postMessage({ semilla, dias: DIAS });
      });
    } catch {
      // Sin Web Workers: se corre aquí mismo (la página se congela unos segundos).
      return new Promise((ok) => setTimeout(() => ok(compararEstrategias({ semilla, dias: DIAS, alAvanzar })), 30));
    }
  }

  pintar(resultados, semilla) {
    const mejor = {};
    const peor = {};
    for (const { clave } of INDICADORES) {
      if (!MENOS_ES_MEJOR.has(clave)) continue;
      const valores = resultados.map((r) => r[clave]);
      mejor[clave] = Math.min(...valores);
      peor[clave] = Math.max(...valores);
    }
    const usos = resultados.map((r) => r.usos);
    const mismos = usos.every((u) => u === usos[0]);
    const celda = (r, clave) => {
      const v = r[clave];
      const texto = clave === 'horasSinJabon' ? numero(v, 1) : numero(v);
      let clase = 'num';
      if (MENOS_ES_MEJOR.has(clave) && mejor[clave] !== peor[clave]) {
        if (v === mejor[clave]) clase += ' mejor';
        else if (v === peor[clave]) clase += ' peor';
      }
      return `<td class="${clase}">${texto}</td>`;
    };
    this.cuerpo.innerHTML = `
      <p>Semilla <b>${semilla}</b> · 7 días desde ${diaHora(inicioComparacion())} · sin fallas · ${resultados.length} estrategias con los mismos usos de jabón.</p>
      <p class="ok-usos" ${mismos ? '' : 'hidden'}>Las 3 estrategias reciben exactamente ${numero(usos[0])} usos.</p>
      <div class="tabla-comparar">
        <table class="tabla">
          <thead><tr><th>Estrategia</th>${INDICADORES.map((i) => `<th class="num">${i.nombre}</th>`).join('')}</tr></thead>
          <tbody>${resultados.map((r) => `<tr><th scope="row">${r.nombre}</th>${INDICADORES.map((i) => celda(r, i.clave)).join('')}</tr>`).join('')}</tbody>
        </table>
      </div>
      <p class="nota">✓ = mejor valor de la columna (menos es mejor). En rojo, el peor. Visita innecesaria: aseo llega y el nivel real está en 30 % o más. Horas sin jabón: tiempo con un dispensador vacío mientras el edificio está abierto, sumado entre los 12 baños.</p>`;
  }
}
