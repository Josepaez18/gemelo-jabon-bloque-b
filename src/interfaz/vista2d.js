// Vista de respaldo cuando el navegador no puede crear un contexto WebGL.
// Tiene la misma interfaz que Escena, así la app sigue funcionando sin la maqueta 3D.
import { DISPENSADORES, PISOS } from '../modelo/edificio.js';
import { NOMBRE_ESTADO } from '../modelo/receptor.js';
import { esc } from './formato.js';

export class Vista2D {
  constructor(contenedor, { alSeleccionar, error }) {
    this.alSeleccionar = alSeleccionar;
    this.piso = null;
    this.seleccion = null;
    this.raiz = document.createElement('div');
    this.raiz.className = 'vista-2d';
    const filas = [];
    for (let n = PISOS; n >= 1; n--) {
      const banos = DISPENSADORES.filter((d) => d.piso === n)
        .map(
          (d) => `<button type="button" class="bano-2d" data-id="${d.id}">
            <span class="b2-nombre"><b>${d.corto}</b> ${d.genero === 'mujeres' ? 'Mujeres' : 'Hombres'}</span>
            <span class="b2-barra"><i></i><u></u></span>
            <span class="b2-valor"></span>
          </button>`,
        )
        .join('');
      filas.push(`<div class="piso-2d" data-piso="${n}"><span class="p2-nombre">Piso ${n}</span>${banos}</div>`);
    }
    this.raiz.innerHTML = `
      <div class="aviso-2d" role="status">
        <b>Vista simplificada:</b> este navegador no pudo iniciar WebGL, así que no se dibuja la maqueta 3D.
        Todo lo demás funciona. Para ver el 3D, activa la aceleración por hardware
        (en Edge: <code>edge://settings/system</code>; en Chrome: <code>chrome://settings/system</code>) y recarga.
        <small>${esc(error?.message ?? error ?? '')}</small>
      </div>
      <div class="pisos-2d">${filas.join('')}</div>`;
    contenedor.appendChild(this.raiz);
    contenedor.classList.add('sin-3d');
    this.raiz.addEventListener('click', (ev) => {
      const b = ev.target.closest('.bano-2d');
      if (b) this.alSeleccionar?.(b.dataset.id);
    });
    this.tarjetas = new Map([...this.raiz.querySelectorAll('.bano-2d')].map((b) => [b.dataset.id, b]));
    this.previo = new Map();
  }

  cuadro(sim) {
    for (const [id, b] of this.tarjetas) {
      const s = sim.receptor.estadoDe(id, sim.ahora);
      const enVivo = id === sim.idEnVivo;
      const clave = `${s.estado}|${s.valor}|${s.revisar}|${enVivo}`;
      if (this.previo.get(id) === clave) continue;
      this.previo.set(id, clave);
      b.dataset.estado = s.estado;
      b.classList.toggle('revisar', s.revisar);
      b.classList.toggle('envivo', enVivo);
      b.querySelector('.b2-barra i').style.width = `${s.valor ?? 0}%`;
      const valor = s.estado === 'esperando' || s.estado === 'sin_dato' ? NOMBRE_ESTADO[s.estado] : `${s.valor} %`;
      b.querySelector('.b2-valor').textContent = `${valor}${s.revisar ? ' ⚠' : ''}${enVivo ? ' · en vivo' : ''}`;
    }
  }

  setTema() {}

  setCiclo() {}

  setVista({ piso = this.piso } = {}) {
    this.piso = piso;
    this.raiz.querySelectorAll('.piso-2d').forEach((f) => (f.hidden = piso !== null && Number(f.dataset.piso) !== piso));
  }

  vistaInicial() {
    this.setVista({ piso: null });
  }

  seleccionar(id) {
    this.tarjetas.get(this.seleccion)?.classList.remove('activo');
    this.seleccion = id;
    this.tarjetas.get(id)?.classList.add('activo');
  }

  limpiarPersonas() {}

  async cargarGlb() {
    throw new Error('el modelo .glb necesita WebGL');
  }
}
