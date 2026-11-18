// De dónde salen los datos del panel. Mientras haya un gemelo abierto en este navegador, el panel
// no simula nada: solo recibe la foto que el gemelo publica por BroadcastChannel (contrato en
// src/modelo/panel.js). Si no hay gemelo, corre su propia simulación para no quedar en blanco.
import { CANAL, VENCE_MS, VERSION_CANAL, instantanea } from '../modelo/panel.js';
import { Simulacion } from '../modelo/simulacion.js';

export const VEL_PROPIA = 60;

// alFoto(foto, info) con cada foto nueva; alEstado(info) cuando cambia la fuente sin foto nueva.
// info: { tipo: 'buscando' | 'gemelo' | 'cerrado' | 'propia', origen, gemelos, versionAjena, fotos }
export function iniciarFuente({ alFoto, alEstado }) {
  const inicio = performance.now();
  const est = { tipo: 'buscando', origen: null, ultimaMs: -Infinity, gemelos: new Map(), versionAjena: null, propia: null, fotos: 0 };
  const info = () => ({ tipo: est.tipo, origen: est.origen, gemelos: est.gemelos.size, versionAjena: est.versionAjena, fotos: est.fotos });

  let canal = null;
  try {
    canal = new BroadcastChannel(CANAL);
    canal.onmessage = (ev) => {
      const m = ev.data;
      if (!m || typeof m !== 'object') return;
      const t = performance.now();

      if (m.tipo === 'adios') {
        est.gemelos.delete(m.origen);
        if (m.origen === est.origen) {
          // Se cerró o se está recargando: se espera VENCE_MS antes de simular por cuenta propia.
          est.tipo = 'cerrado';
          est.ultimaMs = Math.min(est.ultimaMs, t);
          alEstado(info());
        }
        return;
      }
      if (m.tipo !== 'foto') return;
      if (m.v !== VERSION_CANAL) {
        est.versionAjena = m.v ?? 'sin versión';
        alEstado(info());
        return;
      }
      est.gemelos.set(m.origen, t);
      // Con varios gemelos abiertos se sigue mostrando el mismo mientras publique.
      if (est.tipo === 'gemelo' && est.origen !== m.origen && t - est.ultimaMs < VENCE_MS) return;
      est.tipo = 'gemelo';
      est.origen = m.origen;
      est.ultimaMs = t;
      est.versionAjena = null;
      est.propia = null;
      est.fotos++;
      alFoto(m.foto, info());
    };
    canal.postMessage({ tipo: 'hola', v: VERSION_CANAL });
  } catch {
    // Sin BroadcastChannel: queda la simulación propia.
  }

  setInterval(() => {
    const t = performance.now();
    for (const [o, ms] of est.gemelos) if (t - ms > VENCE_MS) est.gemelos.delete(o);
    if (t - est.ultimaMs < VENCE_MS) return; // el gemelo sigue publicando
    if (t - inicio < VENCE_MS) return; // recién abierto: se le da tiempo al gemelo de contestar
    if (!est.propia) {
      est.propia = { sim: new Simulacion({}), antes: t };
      est.tipo = 'propia';
      est.origen = 'propia';
    }
    const p = est.propia;
    const dt = Math.min(2, (t - p.antes) / 1000);
    p.antes = t;
    p.sim.avanzar(dt * VEL_PROPIA);
    p.sim.vaciarEventos();
    est.fotos++;
    alFoto(instantanea(p.sim, { velocidad: VEL_PROPIA }), info());
  }, 500);
}
